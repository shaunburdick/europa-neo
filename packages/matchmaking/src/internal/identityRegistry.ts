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

import type { Result } from '../contracts/lobby-api';
import type { GuestIdentityClaim, GuestPlayerId, IdentityState, LobbyError } from '../contracts/lobby-types';
import { randomUUID } from '../crypto';

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
    /** Injected opaque-id generator (deterministic in tests). */
    readonly randomId?: () => string;
    /** Injected wall-clock provider in epoch ms (deterministic in tests). */
    readonly now?: () => number;
    /** Reconnect grace window in ms (see {@linkcode IDENTITY_GRACE_MS_DEFAULT}). */
    readonly graceMs?: number;
}

/**
 * Outcome of {@linkcode IdentityRegistry.restoreIdentity}: the
 * (always-fresh-or-restored) identity plus whether an existing record
 * was resumed. Establishment cannot fail (US1 AC-1), so there is no
 * error arm — stale/forged/unknown/expired claims silently mint fresh.
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
     * (US1 AC-3). A claim matching a held identity within grace
     * reactivates it (same id, same server-held handle); any absent,
     * expired, or forged claim silently yields a FRESH identity. The
     * claim's `handle` field is advisory and never overrides the
     * server record. Runs the expiry sweep first, so an expired
     * claimant frees its handle before the lookup.
     */
    restoreIdentity(claim: GuestIdentityClaim | undefined): IdentityRestoreOutcome;

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
     * suitable delivery seam. Server state remains authoritative, and bearer
     * session/reconnect tokens remain protected separately.
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
    const randomId = deps.randomId ?? (() => randomUUID());
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

    /** Mint, register, and return a fresh unnamed identity (shared by create/restore). */
    function mintIdentity(): GuestPlayerIdentity {
        const id = randomId() as GuestPlayerId;
        if (identities.has(id)) {
            // Loud failure beats a silent duplicate: with the default
            // generator collisions are impossible; with an injected
            // test generator they mean the fixture is miswired.
            throw new Error('identityRegistry: guest player id collision');
        }
        const record = createGuestPlayerIdentity({ id, nowMs: now() });
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
            if (claimedId !== undefined) {
                const existing = identities.get(claimedId);
                if (existing !== undefined) {
                    existing.status = 'active';
                    existing.disconnectedAtMs = null;
                    return { identity: existing, restored: true };
                }
            }
            // Unknown/stale/forged/expired claim: establishment cannot
            // fail — mint fresh and ignore the claim entirely. The
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
