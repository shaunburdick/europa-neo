/**
 * Local-storage persistence for the browser lobby claim — feature 010 (T-012).
 *
 * FR-003/FR-042: the browser stores the guest player ID, the owner-only
 * resume secret delivered beside it, and the last accepted handle under a
 * namespaced key so a reload can restore the active `GuestPlayerIdentity`.
 * This module is the ONLY place the console's lobby client touches storage,
 * and it is deliberately paranoid at every boundary:
 *
 *   - The stored value is a bearer-credential set (id + resume secret), not
 *     an account and not a session/reconnect token. The server honors a
 *     presented claim only while its own registry still holds that identity
 *     AND the presented secret matches; unknown/stale/secret-less claims
 *     silently mint a fresh identity server-side (matchmaking
 *     `restoreIdentity`).
 *   - Corrupted or wrong-shaped JSON is tolerated (`loadStoredClaim`
 *     returns `null`, never throws) — a cleared or half-written store
 *     must never break landing. A record whose `resumeSecret` is MISSING
 *     (a legacy v1 row written before issue #146) loads as `null`: a
 *     valid "cannot restore" state, not corruption. A record whose
 *     `resumeSecret` is present but the WRONG TYPE is treated as tampered
 *     and rejected outright.
 *   - Storage itself may be unavailable (private browsing, disabled,
 *     quota pressure): every accessor swallows the failure and the
 *     caller degrades to an in-memory-only session
 *     ({@link resolveLobbyStorage} returns `null`,
 *     {@link saveStoredClaim} returns `false`).
 *
 * Boundary (spec FR-024 / NFR-003 / FR-042): none of these three values
 * is ever placed in URLs, query strings, logs, or error messages — those
 * surfaces do not need them, and the resume secret is a bearer
 * credential. The persisted payload is exactly the
 * `{ guestPlayerIdClaim, resumeSecret, handle }` triple that
 * `specs/010-public-lobby-match-browser/data-model.md` §4 specifies (the
 * claim field is named `guestPlayerId` in code), and
 * {@linkcode loadStoredClaim} projects down to that shape so a tampered
 * or future-format record cannot smuggle extra keys into the client.
 */

import { isGuestPlayerId } from '@europa/core';
import type { GuestPlayerId } from '@europa/matchmaking';

/**
 * Namespaced local-storage key holding the serialized
 * {@link StoredLobbyClaim}. Versioned suffix (`v1`) so a future shape
 * change can migrate instead of misreading old payloads.
 */
export const LOBBY_STORAGE_KEY = 'europa:lobby:identity:v1';

/** Fallback marker substituted for a redacted secret in text output. */
export const REDACTION_MARKER = '[redacted]';

/**
 * The persisted claim — data-model.md §4's
 * `{ guestPlayerIdClaim, resumeSecret, handle }` triple, with the claim
 * field named `guestPlayerId` in code. `guestPlayerId` is `null` until
 * the SERVER issues the universal identity (issue #74: the browser never
 * mints one); after the directed `identity` event delivers it, the
 * client adopts and persists it here. `resumeSecret` is the owner-only
 * credential delivered alongside the id by establishment-path events
 * (spec 010 FR-040): `null` until one arrives, and cleared together
 * with the id by `invalidateClaim`. `handle` is the last SERVER-accepted
 * display handle (`null` until the visitor picks a valid one). The id
 * and handle are advisory input on restore — the server record always
 * wins — and the secret is what proves possession of it.
 */
export interface StoredLobbyClaim {
    /** Server-issued universal identity, or `null` before first delivery. */
    readonly guestPlayerId: GuestPlayerId | null;
    /**
     * Owner-only restore proof delivered by the establishment event, or
     * `null` before the first delivery — and for legacy v1 records that
     * predate issue #146, which therefore cannot restore (mint-fresh,
     * exactly today's degradation).
     */
    readonly resumeSecret: string | null;
    /** Last server-accepted display handle, or `null` before one is chosen. */
    readonly handle: string | null;
}

/**
 * Structural subset of the DOM `Storage` API the lobby client needs.
 * Declared locally so tests can inject in-memory fakes and so the
 * client never depends on `window` being defined (SSR/dev harnesses).
 */
export interface LobbyStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

/**
 * On-disk shape of one parsed claim record. Differs from
 * {@link StoredLobbyClaim} in exactly one way: `resumeSecret` is
 * OPTIONAL, because rows written before issue #146 predate the field.
 *
 * The identity is validated with the canonical
 * {@link isGuestPlayerId} validator (issue #74) — never a
 * `length > 0` proxy. `null` is the legitimate pre-allocation state and
 * is accepted; any other non-canonical value (including `undefined`,
 * numbers, or wrong-length strings) is rejected so corrupted or
 * tampered storage is treated as a first visit. The secret follows the
 * same rule in reverse: absent or `null` is the legitimate
 * cannot-restore state, a string is a credential, anything else is
 * tampering.
 *
 * @param value Parsed JSON value.
 * @returns `true` when the value is a well-formed stored claim.
 */
function isStoredLobbyClaim(value: unknown): value is Partial<StoredLobbyClaim> {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value as Partial<StoredLobbyClaim>;
    const { guestPlayerId, resumeSecret, handle } = candidate;
    const identityValid = guestPlayerId === null || isGuestPlayerId(guestPlayerId);
    const handleValid = handle === null || typeof handle === 'string';
    const secretValid = resumeSecret === undefined || resumeSecret === null || typeof resumeSecret === 'string';
    return identityValid && handleValid && secretValid;
}

/**
 * Probe the platform `localStorage` and return it as a
 * {@linkcode LobbyStorage}, or `null` when unavailable (private mode,
 * security settings, non-browser harness). A write/read round-trip on
 * the probe key verifies the API is not merely present but actually
 * usable — Safari's private mode historically exposed the object while
 * throwing on use.
 *
 * The probe key is removed afterwards; failures during cleanup are
 * ignored (the round-trip already proved writability).
 */
export function resolveLobbyStorage(): LobbyStorage | null {
    try {
        const storage = globalThis.localStorage;
        if (storage === undefined || storage === null) {
            return null;
        }
        const probeKey = `${LOBBY_STORAGE_KEY}:probe`;
        const probeValue = 'ok';
        storage.setItem(probeKey, probeValue);
        const readBack = storage.getItem(probeKey);
        storage.removeItem(probeKey);
        return readBack === probeValue ? storage : null;
    } catch {
        // SecurityError / QuotaExceededError / cross-origin restriction:
        // persistence is a enhancement, never a requirement (FR-003's
        // storage "MUST NOT be treated as an account").
        return null;
    }
}

/**
 * Load the previously persisted claim, or `null` when absent,
 * unreadable, corrupted, or wrong-shaped. Never throws.
 *
 * @param storage Storage backing (already resolved; may be `null`, in
 *   which case there is nothing to load).
 */
export function loadStoredClaim(storage: LobbyStorage | null): StoredLobbyClaim | null {
    if (storage === null) {
        return null;
    }
    let raw: string | null;
    try {
        raw = storage.getItem(LOBBY_STORAGE_KEY);
    } catch {
        return null;
    }
    if (raw === null) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!isStoredLobbyClaim(parsed)) {
            return null;
        }
        // Project to the canonical shape so extra keys in a tampered or
        // future-format record never ride into the client, and so a
        // legacy row that predates the resume secret normalizes to the
        // explicit "cannot restore" state instead of `undefined`.
        return {
            guestPlayerId: parsed.guestPlayerId ?? null,
            resumeSecret: parsed.resumeSecret ?? null,
            handle: parsed.handle ?? null,
        };
    } catch {
        // Corrupted JSON (partial write, manual tampering): treat as a
        // first visit rather than failing landing.
        return null;
    }
}

/**
 * Persist the claim. Best-effort: returns `false` instead of throwing
 * when storage is missing, unwritable, or out of quota — the session
 * continues in-memory either way.
 *
 * @param claim   The complete claim snapshot to persist.
 * @param storage Storage backing (`null` → no-op success-less skip).
 * @returns `true` when the value was written and read back safely.
 */
export function saveStoredClaim(claim: StoredLobbyClaim, storage: LobbyStorage | null): boolean {
    if (storage === null) {
        return false;
    }
    try {
        storage.setItem(LOBBY_STORAGE_KEY, JSON.stringify(claim));
        return true;
    } catch {
        return false;
    }
}

/**
 * Remove the persisted claim (identity expiry, explicit forget).
 * Best-effort and idempotent: storage failures are swallowed because a
 * stale row that cannot be deleted must not crash the caller.
 *
 * @param storage Storage backing (`null` → nothing to do).
 */
export function clearStoredClaim(storage: LobbyStorage | null): void {
    if (storage === null) {
        return;
    }
    try {
        storage.removeItem(LOBBY_STORAGE_KEY);
    } catch {
        // Deletion is best-effort; see the function doc.
    }
}

// ----------------------------------------------------------------------------
// No client-side identity minting (issue #74)
// ----------------------------------------------------------------------------
//
// The universal `GuestPlayerId` is issued by the server (matchmaking is
// the identity authority) and delivered on the directed `identity` lobby
// event. The browser never mints an identity: a first connect presents an
// empty advisory claim, and subsequent connects present the canonical
// value the server previously delivered (adopted by
// `ws-lobby-client.ts`, which is the only writer of that field). There
// is therefore no `randomUUID`/hex minting helper here — see
// `specs/010-public-lobby-match-browser` Clarifications v1.6 and the
// issue #74 identity contract.
