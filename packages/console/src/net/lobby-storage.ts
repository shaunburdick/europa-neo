/**
 * Local-storage persistence for the browser lobby claim — feature 010 (T-012).
 *
 * FR-003: the browser stores the non-secret guest player ID and the last
 * accepted handle under a namespaced key so a reload can restore the
 * active `GuestPlayerIdentity`. This module is the ONLY place the
 * console's lobby client touches storage, and it is deliberately
 * paranoid at every boundary:
 *
 *   - The stored value is a non-secret stored resume claim, not auth and not
 *     a session/reconnect bearer token. The
 *     server honors a presented claim only while its own registry still
 *     holds that identity; unknown/stale/forged claims silently mint a
 *     fresh identity server-side (matchmaking `restoreIdentity`).
 *   - Corrupted or wrong-shaped JSON is tolerated (`loadStoredClaim`
 *     returns `null`, never throws) — a cleared or half-written store
 *     must never break landing.
 *   - Storage itself may be unavailable (private browsing, disabled,
 *     quota pressure): every accessor swallows the failure and the
 *     caller degrades to an in-memory-only session
 *     ({@link resolveLobbyStorage} returns `null`,
 *     {@link saveStoredClaim} returns `false`).
 *
 * Boundary (spec FR-024 / NFR-003): the player ID is non-secret
 * correlation data and is kept here for resume-claim construction. This
 * module does not place it in URLs, query strings, logs, or error messages
 * because those surfaces do not need it. The persisted resume claim is a
 * non-secret correlation data, distinct from session/reconnect bearer
 * credentials. The persisted payload is exactly
 * `{ guestPlayerId, handle }` per data-model.md §4 ("The client stores
 * only `{ guestPlayerIdClaim, handle }` under a namespaced key").
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
 * The persisted non-secret resume claim (data-model.md §4), distinct from
 * session/reconnect bearer credentials. `guestPlayerId` is `null` until
 * the SERVER issues the universal identity (issue #74: the browser never
 * mints one); after the directed `identity` event delivers it, the client
 * adopts and persists it here. `handle` is the last SERVER-accepted
 * display handle (`null` until the visitor picks a valid one); both
 * fields are advisory input on restore — the server record always wins.
 */
export interface StoredLobbyClaim {
    /** Server-issued universal identity, or `null` before first delivery. */
    readonly guestPlayerId: GuestPlayerId | null;
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
 * Shape guard for one parsed claim record (post-JSON validation).
 *
 * The identity is validated with the canonical
 * {@link isGuestPlayerId} validator (issue #74) — never a
 * `length > 0` proxy. `null` is the legitimate pre-allocation state and
 * is accepted; any other non-canonical value (including `undefined`,
 * numbers, or wrong-length strings) is rejected so corrupted or
 * tampered storage is treated as a first visit.
 *
 * @param value Parsed JSON value.
 * @returns `true` when the value is a well-formed stored claim.
 */
function isStoredLobbyClaim(value: unknown): value is StoredLobbyClaim {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value as Partial<StoredLobbyClaim>;
    const { guestPlayerId, handle } = candidate;
    const identityValid = guestPlayerId === null || isGuestPlayerId(guestPlayerId);
    return identityValid && (handle === null || typeof handle === 'string');
}

/**
 * Probe the platform `localStorage` and return it as a
 * {@link LobbyStorage}, or `null` when unavailable (private mode,
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
        // future-format record never ride into the client.
        return { guestPlayerId: parsed.guestPlayerId, handle: parsed.handle };
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
// event. The browser NEVER synthesizes an identity: a first connect
// presents an advisory claim with no `guestPlayerId`, and subsequent
// connects present the canonical value the server previously delivered
// (adopted by `ws-lobby-client.ts`, which is the only writer of that
// field). There is therefore no `randomUUID`/hex minting helper here —
// see `specs/010-public-lobby-match-browser` Clarifications v1.6 and the
// issue #74 identity contract.
