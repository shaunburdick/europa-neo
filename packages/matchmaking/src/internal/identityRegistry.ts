/**
 * In-memory guest identity registry — Feature 010 (T-005)
 *
 * Owns every `GuestPlayerIdentity` and the reserved-handle map that
 * enforces FR-005 uniqueness. Plan.md §1: the registry is the
 * server-side authority behind the lobby facade (T-007); identity is
 * resolved from THIS registry, while client-supplied claims remain advisory
 * input (spec v1.1 amendment); server authority is unchanged.
 *
 * State is process memory only (FR-015): two `Map`s keyed by branded
 * ids / normalized handle keys, mirroring feature 006's store
 * discipline. No persistence, no timers.
 *
 * Concurrency model (plan.md §2): every mutation runs synchronously
 * through its critical section on the Node event loop and RECHECKS
 * current state immediately before assignment — two conflicting
 * `setHandle` calls are serialized, and exactly one wins (`NFR-002`;
 * pinned by ≥10-way race tests). No locks or callbacks exist at this
 * layer.
 *
 * Grace discipline (spec Clarifications v1.0): disconnecting starts
 * the reconnect grace window; the identity AND its handle stay
 * reserved until the same claimant returns or grace expires. Expiry
 * uses the networking `ReconnectRegistry` convention
 * (`nowMs - disconnectedAtMs >= graceMs`) and is evaluated LAZILY on
 * read/write paths plus an explicit {@linkcode IdentityRegistry.releaseExpired}
 * sweep for hosts — no timer-driven simulation (constitution Principle II;
 * same no-timers ruling as feature 006's GC).
 *
 * Close semantics (plan.md §4): `close()` drops all identities,
 * handle reservations included; the instance is unusable afterwards
 * (loud invariant failure, mirroring `createMatchmaker`). Idempotent.
 *
 * Pure module: no clock reads, no randomness — both arrive via the
 * injected `now` / `randomId` dependencies (constitution Principle II).
 */

import type { PlayerId } from '@europa/core';
import { DEFAULT_PLAYER_ID_MAX_ATTEMPTS, PlayerIdCollisionError, parseGuestPlayerId } from '@europa/core';
import type { Result } from '../contracts/lobby-api';
import type { GuestIdentityClaim, GuestPlayerId, IdentityState, LobbyError } from '../contracts/lobby-types';
import { randomUUID } from '../crypto';
import { allocateGuestPlayerId } from '../idGen';

import { createGuestPlayerIdentity, type GuestPlayerIdentity } from './guestPlayerIdentity';
import { makeLobbyError, normalizeHandleKey, validateHandle } from './handleValidation';

// ----------------------------------------------------------------------------
// Tunables
// ----------------------------------------------------------------------------

/**
 * Default reconnect grace window in ms. Mirrors networking's
 * `ServerConfig.reconnectGraceMs` default (60_000) so a self-hosted
 * lobby reserves handles exactly as long as networking reserves seats.
 * Declared here because `src/constants.ts` remains the feature-006
 * tunable home; callers constructing the facade pass their configured
 * value through {@linkcode IdentityRegistryDeps.graceMs}.
 */
export const IDENTITY_GRACE_MS_DEFAULT = 60_000;

// ----------------------------------------------------------------------------
// Public surface
// ----------------------------------------------------------------------------

/** Injectable dependencies; every field defaults for production use. */
export interface IdentityRegistryDeps {
    /**
     * Deterministic CANONICAL-id factory (tests only). When supplied, each
     * call must return a valid 12-character canonical id; invalid values
     * fail closed via the canonical validator, and a repeated value is a
     * collision retried within {@linkcode maxIdAttempts}. When omitted,
     * production allocation uses the shared `@europa/core` CSPRNG generator
     * with active-set rejection sampling.
     */
    readonly randomId?: () => string;
    /**
     * Owner-only resume-secret factory (spec 006 FR-018, issue #146).
     * Defaults to `randomUUID()` from `crypto.ts` — a UUIDv4 is 122 bits
     * of CSPRNG entropy, format-consistent with every other bearer token
     * here (`SessionToken` uses the same source). Tests inject a
     * deterministic counter sequence.
     */
    readonly randomSecret?: () => string;
    /**
     * Bounded candidate-retry budget for id allocation (both the injected
     * factory and the CSPRNG path). Defaults to
     * `DEFAULT_PLAYER_ID_MAX_ATTEMPTS`.
     */
    readonly maxIdAttempts?: number;
    /** Injected wall-clock provider in epoch ms (deterministic in tests). */
    readonly now?: () => number;
    /** Reconnect grace window in ms (see {@linkcode IDENTITY_GRACE_MS_DEFAULT}). */
    readonly graceMs?: number;
}

/**
 * Outcome of {@linkcode IdentityRegistry.restoreIdentity}: the
 * (always-fresh-or-restored) identity plus whether an existing record
 * was resumed. Establishment cannot fail (US1 AC-1), so there is no
 * error arm — stale/forged/unknown/expired/secret-less claims silently
 * mint fresh. On a successful restore the returned record already holds
 * the ROTATED successor secret (read it with
 * {@linkcode IdentityRegistry.resumeSecretOf} for delivery).
 */
export interface IdentityRestoreOutcome {
    /** The caller's identity going forward (restored or freshly minted). */
    readonly identity: GuestPlayerIdentity;
    /** `true` when an existing identity was resumed within grace. */
    readonly restored: boolean;
}

/** Counter snapshot for tests, logging, and facade metrics. */
export interface IdentityRegistryStats {
    /** Identities currently held (active + grace). */
    readonly identities: number;
    /** Reserved normalized-handle keys (active + grace owners). */
    readonly reservedHandles: number;
}

/**
 * Server-owned registry of ephemeral guest identities (plan.md §1).
 * One instance per process. All methods are synchronous — actions are
 * serialized by the Node event loop and each mutation rechecks state
 * immediately before assignment.
 */
export interface IdentityRegistry {
    /**
     * Mint a fresh unnamed identity (FR-002; US1 AC-1). Atomic: the id
     * is generated and inserted in one synchronous section.
     */
    createIdentity(): GuestPlayerIdentity;

    /**
     * Resolve a browser's resume claim into the caller's identity
     * (US1 AC-3; spec 006 FR-018, issue #146). The claim's
     * `resumeSecret` — never its id — is the proof of possession: a
     * claim whose secret matches a held record either reactivates it
     * from grace or (D2) supersedes an ACTIVE holder, and the record's
     * secret is REGENERATED before it is returned, so a captured secret
     * is single-epoch (D3). Ordering on success is verify → reactivate →
     * rotate → deliver (plan AD-1); if the delivery is lost the client's
     * next claim fails verification and mints fresh — accepted churn,
     * never a lockout.
     *
     * Any other claim — absent, id-only, stale, forged, unknown, or
     * expired — is advisory and silently yields a FRESH identity, so a
     * bare id can never evict an active holder or start a grace-window
     * takeover (spec 004 FR-027, spec 010 FR-041). The claim's `handle`
     * field is advisory and never overrides the server record.
     *
     * Runs the expiry sweep first, so an expired claimant frees its
     * handle before the lookup.
     */
    restoreIdentity(claim: GuestIdentityClaim | undefined): IdentityRestoreOutcome;

    /**
     * Grace → active transition for SERVER-INTERNAL callers that have
     * ALREADY verified a bearer credential upstream — today exactly one:
     * `lobbyService.onSeatReconnected`, whose authority is the seat
     * credential the transport checked before the handler runs (plan
     * AD-2). This is deliberately NOT a claim path: it takes no secret
     * because the caller has already proved possession by other means,
     * and it is unreachable from any client-presented payload. Clients
     * reach restoration only through {@linkcode restoreIdentity}.
     *
     * @returns `true` when the identity existed in grace and is now
     *   active; `false` for an unknown id or one already active.
     * @throws When the registry is closed.
     */
    reactivate(id: GuestPlayerId): boolean;

    /**
     * Internal-only read of an identity's current resume secret, used
     * solely to compose it into the directed ESTABLISHMENT identity
     * event (plan AD-11). Never returned through
     * {@linkcode projectIdentity} or any other projection, and never
     * safe to log.
     *
     * @returns The current secret, or `undefined` for unknown ids.
     * @throws When the registry is closed.
     */
    resumeSecretOf(id: GuestPlayerId): string | undefined;

    /**
     * Validate and atomically reserve a handle for the identity
     * (FR-004/FR-005; rename = second call, FR-019). Uniqueness is
     * checked against the reserved-handle map immediately before
     * assignment, excluding the caller's own current key (case-only
     * renames succeed). On success the previous key is freed and the
     * accepted trimmed display handle is stored verbatim.
     *
     * @returns The accepted display handle, or `handle_invalid` /
     *   `handle_taken` errors as values.
     * @throws When the registry is closed or `id` is unknown — both
     *   are caller invariant breaches, not recoverable failures.
     */
    setHandle(id: GuestPlayerId, rawHandle: string): Result<string, LobbyError>;

    /**
     * Whether a held identity is currently in its reconnect grace window
     * (disconnected but not yet expired/released). Used by the facade to
     * decide whether a reconnect should reactivate an identity without
     * minting a stray replacement. Unknown ids are `false`.
     *
     * @throws When the registry is closed.
     */
    isInGrace(id: GuestPlayerId): boolean;

    /**
     * Mark the identity disconnected, starting (or restarting) its
     * grace window. The handle stays reserved throughout grace.
     *
     * @throws When the registry is closed or `id` is unknown.
     */
    disconnect(id: GuestPlayerId): void;

    /**
     * Release an identity immediately (normal disconnect cleanup):
     * deletes the record and frees its handle key so another active
     * user can claim it without waiting for grace. Idempotent —
     * releasing an unknown (already-swept) id is a no-op.
     *
     * @throws When the registry is closed.
     */
    release(id: GuestPlayerId): void;

    /**
     * Release every identity whose grace window has expired.
     *
     * @returns How many identities were released.
     * @throws When the registry is closed.
     */
    releaseExpired(): number;

    /**
     * Project an identity into the safe wire shape (`IdentityState`:
     * accepted handle + literal `hasIdentity`). Identity IDs are non-secret
     * correlation metadata, not credentials; the facade may attach the ID at a
     * suitable delivery seam. It can identify the ephemeral lobby identity,
     * but does not grant a match seat, order, reconnect-token, or fog-view
     * authority. Server state remains authoritative, and bearer session/
     * reconnect tokens remain protected separately.
     *
     * @returns The frozen projection, or `undefined` for unknown ids.
     * @throws When the registry is closed.
     */
    projectIdentity(id: GuestPlayerId): IdentityState | undefined;

    /**
     * Counter snapshot (tests/logging); never projected to clients.
     */
    stats(): IdentityRegistryStats;

    /**
     * Shut down: drop ALL identities and handle reservations
     * (plan.md §4). Idempotent; every other method throws afterwards.
     */
    close(): void;
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------

/**
 * Create an empty in-memory identity registry.
 *
 * @param deps - Optional injectable `randomId` / `now` / `graceMs`
 *   (all default: crypto UUIDs, wall clock, 60 s grace).
 * @returns A frozen-shape {@linkcode IdentityRegistry} backed by two
 *   private `Map`s (identities by `GuestPlayerId`, reserved handles by
 *   normalized key → owner id).
 */
export function createIdentityRegistry(deps: IdentityRegistryDeps = {}): IdentityRegistry {
    const injectedIdFactory = deps.randomId;
    const injectedSecretFactory = deps.randomSecret;
    const maxIdAttempts = deps.maxIdAttempts ?? DEFAULT_PLAYER_ID_MAX_ATTEMPTS;
    const now = deps.now ?? Date.now;
    const graceMs = deps.graceMs ?? IDENTITY_GRACE_MS_DEFAULT;

    /** Every held identity, active or in grace, by non-secret correlation id. */
    const identities = new Map<GuestPlayerId, GuestPlayerIdentity>();
    /** Reserved normalized handle key → owning identity id. */
    const handleOwners = new Map<string, GuestPlayerId>();

    let closed = false;

    /** Invariant guard: the registry is unusable after `close()`. */
    function assertOpen(): void {
        if (closed) {
            throw new Error('identityRegistry: instance is closed');
        }
    }

    /** Invariant guard for operations that require a known identity. */
    function requireIdentity(id: GuestPlayerId): GuestPlayerIdentity {
        const record = identities.get(id);
        if (record === undefined) {
            throw new Error('identityRegistry: unknown guest player id');
        }
        return record;
    }

    /** Grace-expiry test using networking's `>=` boundary convention. */
    function isGraceExpired(record: GuestPlayerIdentity): boolean {
        return (
            record.status === 'grace' && record.disconnectedAtMs !== null && now() - record.disconnectedAtMs >= graceMs
        );
    }

    /** Delete one record and free its handle key (owner-checked). */
    function releaseRecord(record: GuestPlayerIdentity): void {
        if (record.handleKey !== null && handleOwners.get(record.handleKey) === record.id) {
            handleOwners.delete(record.handleKey);
        }
        identities.delete(record.id);
    }

    /** Lazy sweep: release every past-grace identity (Map-safe during iteration). */
    function sweepExpired(): number {
        let released = 0;
        for (const record of identities.values()) {
            if (isGraceExpired(record)) {
                releaseRecord(record);
                released += 1;
            }
        }
        return released;
    }

    /**
     * Allocate one canonical universal identity (issue #74, T024/T037).
     *
     * Production uses the shared `@europa/core` CSPRNG generator with the
     * registry's live ACTIVE-set as the rejection predicate and a bounded
     * retry budget; exhaustion fails closed (never a duplicate). The
     * deterministic test seam validates every injected value through the
     * canonical parser (so numeric/legacy fixtures fail loudly) and applies
     * the same bounded retry.
     *
     * @returns A fresh canonical `GuestPlayerId` not currently held.
     * @throws {InvalidPlayerIdError} When the injected factory returns a
     *   non-canonical value.
     * @throws {PlayerIdCollisionError} When the retry budget is exhausted.
     */
    function allocateIdentityId(): GuestPlayerId {
        if (injectedIdFactory !== undefined) {
            for (let attempt = 0; attempt < maxIdAttempts; attempt++) {
                const candidate = parseGuestPlayerId(injectedIdFactory());
                if (!identities.has(candidate)) {
                    return candidate;
                }
            }
            throw new PlayerIdCollisionError(maxIdAttempts);
        }
        return allocateGuestPlayerId({
            isActive: (candidate: PlayerId) => identities.has(parseGuestPlayerId(candidate)),
            maxAttempts: maxIdAttempts,
        });
    }

    /** Mint one owner-only resume secret (injected seam; default Web Crypto UUID). */
    function mintSecret(): string {
        return (injectedSecretFactory ?? randomUUID)();
    }

    /** Mint, register, and return a fresh unnamed identity (shared by create/restore). */
    function mintIdentity(): GuestPlayerIdentity {
        const id = allocateIdentityId();
        const record = createGuestPlayerIdentity({ id, nowMs: now(), resumeSecret: mintSecret() });
        identities.set(record.id, record);
        return record;
    }

    return Object.freeze({
        createIdentity(): GuestPlayerIdentity {
            assertOpen();
            return mintIdentity();
        },

        restoreIdentity(claim: GuestIdentityClaim | undefined): IdentityRestoreOutcome {
            assertOpen();
            sweepExpired();
            const claimedId = claim?.guestPlayerId;
            const presentedSecret = claim?.resumeSecret;
            if (claimedId !== undefined && typeof presentedSecret === 'string') {
                const existing = identities.get(claimedId);
                // Credential check (spec 004 FR-027, spec 006 FR-018,
                // issue #146): the id alone is advisory correlation data and
                // reaches NOTHING — a missing, stale, or wrong secret falls
                // through to the mint-fresh arm below, in grace or active.
                // Possession of the CURRENT secret is what authorizes the
                // takeover, whether the record is waiting in grace (the
                // owner's reload) or still ACTIVE on a connection the close
                // has not reached yet (D2 single-seat re-claim).
                if (existing !== undefined && presentedSecret === existing.resumeSecret) {
                    if (existing.status === 'grace') {
                        existing.status = 'active';
                        existing.disconnectedAtMs = null;
                    }
                    // Rotate BEFORE returning (verify → reactivate → rotate →
                    // deliver, plan AD-1): the caller reads the successor via
                    // `resumeSecretOf` on the same tick, and the delivered
                    // value is single-epoch — a replayed capture never
                    // verifies twice (D3).
                    existing.resumeSecret = mintSecret();
                    return { identity: existing, restored: true };
                }
            }
            // Unknown/stale/forged/secret-less/expired claim: establishment
            // cannot fail — mint fresh and ignore the claim entirely. The
            // claim's handle field is advisory and never consulted.
            return { identity: mintIdentity(), restored: false };
        },

        setHandle(id: GuestPlayerId, rawHandle: string): Result<string, LobbyError> {
            assertOpen();
            sweepExpired();
            const record = requireIdentity(id);
            const validated = validateHandle(rawHandle);
            if (!validated.ok) {
                return validated;
            }
            const key = normalizeHandleKey(validated.data);
            const owner = handleOwners.get(key);
            if (owner !== undefined && owner !== id) {
                return {
                    ok: false,
                    error: makeLobbyError(
                        'handle_taken',
                        'That handle is already in use by another active player. Choose a different one.',
                    ),
                };
            }
            // Atomic re-key (single synchronous section): free the old
            // key unless it IS the new key (case-only rename), then
            // commit both fields together.
            if (record.handleKey !== null && record.handleKey !== key && handleOwners.get(record.handleKey) === id) {
                handleOwners.delete(record.handleKey);
            }
            record.handle = validated.data;
            record.handleKey = key;
            handleOwners.set(key, id);
            return { ok: true, data: validated.data };
        },

        isInGrace(id: GuestPlayerId): boolean {
            assertOpen();
            const record = identities.get(id);
            return record !== undefined && record.status === 'grace';
        },

        reactivate(id: GuestPlayerId): boolean {
            assertOpen();
            const record = identities.get(id);
            if (record === undefined || record.status !== 'grace') {
                return false;
            }
            record.status = 'active';
            record.disconnectedAtMs = null;
            return true;
        },

        resumeSecretOf(id: GuestPlayerId): string | undefined {
            assertOpen();
            return identities.get(id)?.resumeSecret;
        },

        disconnect(id: GuestPlayerId): void {
            assertOpen();
            const record = requireIdentity(id);
            record.status = 'grace';
            record.disconnectedAtMs = now();
        },

        release(id: GuestPlayerId): void {
            assertOpen();
            const record = identities.get(id);
            if (record !== undefined) {
                releaseRecord(record);
            }
        },

        releaseExpired(): number {
            assertOpen();
            return sweepExpired();
        },

        projectIdentity(id: GuestPlayerId): IdentityState | undefined {
            assertOpen();
            const record = identities.get(id);
            if (record === undefined) {
                return undefined;
            }
            // Structurally secret-free: the object is built from selected
            // fields, never spread from the record, so the owner-only
            // `resumeSecret` cannot reach any projection (spec 004 FR-026).
            return Object.freeze({ handle: record.handle, hasIdentity: true });
        },

        stats(): IdentityRegistryStats {
            assertOpen();
            return { identities: identities.size, reservedHandles: handleOwners.size };
        },

        close(): void {
            closed = true;
            identities.clear();
            handleOwners.clear();
        },
    });
}
