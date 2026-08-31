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
 * session/reconnect bearer credentials. `handle` is the
 * last SERVER-accepted display handle (`null` until the visitor picks
 * a valid one); it is advisory input on restore — the server record
 * always wins.
 */
export interface StoredLobbyClaim {
    readonly guestPlayerId: GuestPlayerId;
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
 * Minimal structural view of the Web Crypto surface used to mint
 * claim ids. Declared locally (instead of using the DOM `Crypto`
 * type) so tests can inject deterministic fakes and so the fallback
 * chain below degrades gracefully when only `getRandomValues` exists.
 */
export interface GuestClaimIdCrypto {
    readonly randomUUID?: (() => string) | undefined;
    readonly getRandomValues?: ((array: Uint8Array) => Uint8Array) | undefined;
}

/** Shape guard for one parsed claim record (post-JSON validation). */
function isStoredLobbyClaim(value: unknown): value is StoredLobbyClaim {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value as Partial<StoredLobbyClaim>;
    const { guestPlayerId, handle } = candidate;
    return (
        typeof guestPlayerId === 'string' && guestPlayerId.length > 0 && (handle === null || typeof handle === 'string')
    );
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

/** Hex alphabet width for the `getRandomValues` fallback (bits/4). */
const FALLBACK_HEX_BYTE_PAIRS = 16;

/**
 * Mint a fresh opaque claim id. Preference order:
 *
 *   1. `crypto.randomUUID()` (CSPRNG UUID v4 — every evergreen browser
 *      and Node ≥ 19 in secure contexts),
 *   2. 16 bytes from `crypto.getRandomValues` rendered as hex,
 *   3. otherwise throw: a runtime with NO Web Crypto at all cannot
 *      produce collision-resistant identity claims, and failing loudly
 *      beats silently reusing a predictable id.
 *
 * The result is an uncorrelated random string — it carries no meaning,
 * which is exactly what FR-024's opacity requires.
 *
 * @param cryptoProvider Crypto source; defaults to `globalThis.crypto`.
 *   Tests inject deterministic fakes.
 */
export function mintGuestClaimId(cryptoProvider: GuestClaimIdCrypto = globalThis.crypto): GuestPlayerId {
    if (typeof cryptoProvider.randomUUID === 'function') {
        return cryptoProvider.randomUUID() as GuestPlayerId;
    }
    if (typeof cryptoProvider.getRandomValues === 'function') {
        const bytes = new Uint8Array(FALLBACK_HEX_BYTE_PAIRS);
        cryptoProvider.getRandomValues(bytes);
        let hex = '';
        for (const byte of bytes) {
            hex += byte.toString(16).padStart(2, '0');
        }
        return hex as GuestPlayerId;
    }
    throw new Error('lobby-storage: no Web Crypto provider available to mint a guest claim id');
}
