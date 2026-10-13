/**
 * Lobby claim storage unit tests — issue #74 + issue #146 (FR-003/FR-042).
 *
 * The browser NEVER mints a guest identity (the server issues it), so the
 * stored claim's `guestPlayerId` is `null` until the directed `identity`
 * event delivers one. This suite pins the storage boundary:
 *
 *   - a canonical server-issued id round-trips, together with the
 *     owner-only resume secret delivered beside it;
 *   - the `null` pre-allocation state is accepted;
 *   - a LEGACY v1 record written before issue #146 (no `resumeSecret`
 *     key) loads as an explicit `null` — a valid "cannot restore" state;
 *   - any non-canonical value (UUID, hex blob, short string, number) is
 *     rejected via the canonical `isGuestPlayerId` validator — not a
 *     `length > 0` proxy — and a wrong-TYPED `resumeSecret` is rejected
 *     the same way, so corrupted/tampered storage reads as a first visit
 *     rather than poisoning the resume claim.
 */

import { parseGuestPlayerId } from '@europa/core';
import { describe, expect, it } from 'vitest';

import {
    clearStoredClaim,
    LOBBY_STORAGE_KEY,
    type LobbyStorage,
    loadStoredClaim,
    type StoredLobbyClaim,
    saveStoredClaim,
} from '../../../src/net/lobby-storage';

/** Minimal in-memory {@link LobbyStorage} double. */
class MemoryStorage implements LobbyStorage {
    private readonly map = new Map<string, string>();

    getItem(key: string): string | null {
        return this.map.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.map.set(key, value);
    }

    removeItem(key: string): void {
        this.map.delete(key);
    }

    seed(raw: string): void {
        this.map.set(LOBBY_STORAGE_KEY, raw);
    }

    raw(): string | null {
        return this.map.get(LOBBY_STORAGE_KEY) ?? null;
    }
}

const SERVER_ID = parseGuestPlayerId('Guest0000001');
const SERVER_SECRET = '2f0c3a1e-6d0b-4f3f-9d2b-7a1c5e8b4d10';

describe('lobby claim storage (issue #74)', () => {
    it('round-trips a server-issued canonical id, its resume secret, and handle', () => {
        const storage = new MemoryStorage();
        const claim: StoredLobbyClaim = { guestPlayerId: SERVER_ID, resumeSecret: SERVER_SECRET, handle: 'Nova' };
        expect(saveStoredClaim(claim, storage)).toBe(true);
        expect(loadStoredClaim(storage)).toEqual(claim);
    });

    it('accepts the pre-allocation null identity (first visit)', () => {
        const storage = new MemoryStorage();
        const claim: StoredLobbyClaim = { guestPlayerId: null, resumeSecret: null, handle: null };
        expect(saveStoredClaim(claim, storage)).toBe(true);
        expect(loadStoredClaim(storage)).toEqual(claim);
    });

    it('reads a legacy v1 record with no resume-secret key as "cannot restore"', () => {
        // Storage key and shape version are deliberately unchanged (plan
        // AD-9): old rows keep their still-valid id instead of being
        // discarded by a key bump, and simply cannot prove possession.
        const storage = new MemoryStorage();
        storage.seed(JSON.stringify({ guestPlayerId: SERVER_ID, handle: 'Nova' }));
        expect(loadStoredClaim(storage)).toEqual({
            guestPlayerId: SERVER_ID,
            resumeSecret: null,
            handle: 'Nova',
        });
    });

    it('rejects a tampered resume secret of the wrong type', () => {
        const numeric = new MemoryStorage();
        numeric.seed(JSON.stringify({ guestPlayerId: SERVER_ID, resumeSecret: 42, handle: 'Nova' }));
        expect(loadStoredClaim(numeric)).toBeNull();

        const object = new MemoryStorage();
        object.seed(JSON.stringify({ guestPlayerId: SERVER_ID, resumeSecret: { n: 1 }, handle: 'Nova' }));
        expect(loadStoredClaim(object)).toBeNull();
    });

    it('projects away extra keys a future-format record might carry', () => {
        const storage = new MemoryStorage();
        storage.seed(
            JSON.stringify({
                guestPlayerId: SERVER_ID,
                resumeSecret: SERVER_SECRET,
                handle: 'Nova',
                futureField: 'must not ride through',
            }),
        );
        expect(loadStoredClaim(storage)).toEqual({
            guestPlayerId: SERVER_ID,
            resumeSecret: SERVER_SECRET,
            handle: 'Nova',
        });
    });

    it.each(['not-an-id', '1234', '1234567890123456', 'guest-0001', 'A0b_-9XyZ12', 'aBcDeF012_-'])(
        'rejects a non-canonical stored id (%s)',
        (bad) => {
            const storage = new MemoryStorage();
            storage.seed(JSON.stringify({ guestPlayerId: bad, handle: null }));
            expect(loadStoredClaim(storage)).toBeNull();
        },
    );

    it('rejects a numeric stored id, null handle shape violations, and malformed JSON', () => {
        const numeric = new MemoryStorage();
        numeric.seed(JSON.stringify({ guestPlayerId: 1, handle: null }));
        expect(loadStoredClaim(numeric)).toBeNull();

        const badHandle = new MemoryStorage();
        badHandle.seed(JSON.stringify({ guestPlayerId: SERVER_ID, handle: 7 }));
        expect(loadStoredClaim(badHandle)).toBeNull();

        const malformed = new MemoryStorage();
        malformed.seed('{oops');
        expect(loadStoredClaim(malformed)).toBeNull();
    });

    it('is a no-op (null) when storage is unavailable', () => {
        expect(loadStoredClaim(null)).toBeNull();
        expect(saveStoredClaim({ guestPlayerId: SERVER_ID, resumeSecret: null, handle: null }, null)).toBe(false);
        expect(() => {
            clearStoredClaim(null);
        }).not.toThrow();
    });

    it('clears the persisted claim', () => {
        const storage = new MemoryStorage();
        saveStoredClaim({ guestPlayerId: SERVER_ID, resumeSecret: SERVER_SECRET, handle: 'Nova' }, storage);
        expect(storage.raw()).not.toBeNull();
        clearStoredClaim(storage);
        expect(storage.raw()).toBeNull();
        expect(loadStoredClaim(storage)).toBeNull();
    });

    it('tolerates a throwing storage at every accessor', () => {
        const throwing: LobbyStorage = {
            getItem: () => {
                throw new Error('SecurityError');
            },
            setItem: () => {
                throw new Error('QuotaExceededError');
            },
            removeItem: () => {
                throw new Error('SecurityError');
            },
        };
        expect(loadStoredClaim(throwing)).toBeNull();
        expect(saveStoredClaim({ guestPlayerId: SERVER_ID, resumeSecret: null, handle: null }, throwing)).toBe(false);
        expect(() => {
            clearStoredClaim(throwing);
        }).not.toThrow();
    });
});
