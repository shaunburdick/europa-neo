/**
 * LobbyStorage persistence unit tests — feature 010 (T-012).
 *
 * Covers the paranoid boundaries of `lobby-storage.ts`:
 *
 *   - save/load/clear round-trips under the namespaced key,
 *   - corrupted / wrong-shaped JSON tolerated (never throws),
 *   - storage failures tolerated (private mode, quota, SecurityError),
 *   - `resolveLobbyStorage` probing (usable vs unavailable),
 *   - claim-id minting preference chain (randomUUID → getRandomValues
 *     → loud failure).
 */

import { describe, expect, it, vi } from 'vitest';

import {
    clearStoredClaim,
    type GuestClaimIdCrypto,
    LOBBY_STORAGE_KEY,
    type LobbyStorage,
    loadStoredClaim,
    mintGuestClaimId,
    resolveLobbyStorage,
    type StoredLobbyClaim,
    saveStoredClaim,
} from '../../../src/net/lobby-storage';

/** In-memory double satisfying the structural {@link LobbyStorage} seam. */
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
}

/** Storage double whose every method throws (private-mode simulation). */
class ThrowingStorage implements LobbyStorage {
    getItem(): string | null {
        throw new Error('SecurityError: storage unavailable');
    }

    setItem(): void {
        throw new Error('QuotaExceededError');
    }

    removeItem(): void {
        throw new Error('SecurityError: storage unavailable');
    }
}

/** Method-level throw selector: only ONE method throws per instance. */
class SelectivelyThrowingStorage implements LobbyStorage {
    constructor(
        private readonly failing: 'getItem' | 'setItem' | 'removeItem',
        private readonly backing: LobbyStorage = new MemoryStorage(),
    ) {}

    getItem(key: string): string | null {
        if (this.failing === 'getItem') {
            throw new Error('read failed');
        }
        return this.backing.getItem(key);
    }

    setItem(key: string, value: string): void {
        if (this.failing === 'setItem') {
            throw new Error('write failed');
        }
        this.backing.setItem(key, value);
    }

    removeItem(key: string): void {
        if (this.failing === 'removeItem') {
            throw new Error('remove failed');
        }
        this.backing.removeItem(key);
    }
}

function claim(overrides: Partial<StoredLobbyClaim> = {}): StoredLobbyClaim {
    return { guestPlayerId: 'claim-abc', handle: 'Nova', ...overrides };
}

describe('lobby claim round-trip', () => {
    it('saves, loads, and clears under the namespaced key', () => {
        const storage = new MemoryStorage();
        expect(loadStoredClaim(storage)).toBeNull();

        expect(saveStoredClaim(claim(), storage)).toBe(true);
        expect(JSON.parse(storage.getItem(LOBBY_STORAGE_KEY) ?? '')).toEqual(claim());

        const loaded = loadStoredClaim(storage);
        expect(loaded).toEqual(claim());

        clearStoredClaim(storage);
        expect(storage.getItem(LOBBY_STORAGE_KEY)).toBeNull();
        expect(loadStoredClaim(storage)).toBeNull();
    });

    it('clear is idempotent on an empty store', () => {
        const storage = new MemoryStorage();
        expect(() => clearStoredClaim(storage)).not.toThrow();
    });
});

describe('corrupted payloads are tolerated', () => {
    it('returns null for syntactically invalid JSON', () => {
        const storage = new MemoryStorage();
        storage.setItem(LOBBY_STORAGE_KEY, '{"guestPlayerId": "trunc');
        expect(loadStoredClaim(storage)).toBeNull();
    });

    it.each([
        ['null literal', 'null'],
        ['array root', '[]'],
        ['string root', '"claim-abc"'],
        ['missing guestPlayerId', '{"handle":"Nova"}'],
        ['empty guestPlayerId', '{"guestPlayerId":"","handle":"Nova"}'],
        ['non-string guestPlayerId', '{"guestPlayerId":42,"handle":"Nova"}'],
        ['non-string handle', '{"guestPlayerId":"c","handle":42}'],
    ])('returns null for %s', (_label, raw) => {
        const storage = new MemoryStorage();
        storage.setItem(LOBBY_STORAGE_KEY, raw);
        expect(loadStoredClaim(storage)).toBeNull();
    });

    it('ignores extra keys on an otherwise valid record', () => {
        const storage = new MemoryStorage();
        storage.setItem(LOBBY_STORAGE_KEY, JSON.stringify({ ...claim(), extra: 'ignored' }));
        expect(loadStoredClaim(storage)).toEqual(claim());
    });
});

describe('storage failures are tolerated', () => {
    it('save returns false instead of throwing on quota pressure', () => {
        const storage = new SelectivelyThrowingStorage('setItem');
        expect(saveStoredClaim(claim(), storage)).toBe(false);
    });

    it('load returns null instead of throwing on read failure', () => {
        const storage = new SelectivelyThrowingStorage('getItem');
        expect(loadStoredClaim(storage)).toBeNull();
    });

    it('clear swallows removal failures', () => {
        const storage = new SelectivelyThrowingStorage('removeItem');
        expect(() => clearStoredClaim(storage)).not.toThrow();
    });

    it('every accessor tolerates a fully broken storage (private mode)', () => {
        const storage = new ThrowingStorage();
        expect(loadStoredClaim(storage)).toBeNull();
        expect(saveStoredClaim(claim(), storage)).toBe(false);
        expect(() => clearStoredClaim(storage)).not.toThrow();
    });

    it('null storage short-circuits everything', () => {
        expect(loadStoredClaim(null)).toBeNull();
        expect(saveStoredClaim(claim(), null)).toBe(false);
        expect(() => clearStoredClaim(null)).not.toThrow();
    });
});

describe('resolveLobbyStorage probing', () => {
    it('returns a usable storage when localStorage works (happy-dom)', () => {
        const resolved = resolveLobbyStorage();
        expect(resolved).not.toBeNull();
        // Round-trip through the RESOLVED backing proves writability.
        expect(saveStoredClaim(claim({ handle: null }), resolved)).toBe(true);
        expect(loadStoredClaim(resolved)?.guestPlayerId).toBe('claim-abc');
        clearStoredClaim(resolved);
    });

    it('returns null when localStorage access throws (security settings)', () => {
        vi.stubGlobal(
            'localStorage',
            new (class implements LobbyStorage {
                getItem(): string | null {
                    throw new Error('SecurityError');
                }

                setItem(): void {
                    throw new Error('SecurityError');
                }

                removeItem(): void {
                    throw new Error('SecurityError');
                }
            })(),
        );
        try {
            expect(resolveLobbyStorage()).toBeNull();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe('mintGuestClaimId preference chain', () => {
    it('prefers crypto.randomUUID', () => {
        const crypto = { randomUUID: () => 'uuid-1' } satisfies GuestClaimIdCrypto;
        expect(mintGuestClaimId(crypto)).toBe('uuid-1');
    });

    it('falls back to getRandomValues hex when randomUUID is missing', () => {
        const crypto: GuestClaimIdCrypto = {
            getRandomValues: (array: Uint8Array) => {
                array.fill(0xab);
                return array;
            },
        };
        const id = mintGuestClaimId(crypto);
        expect(id).toMatch(/^[0-9a-f]+$/);
        expect(id.length).toBe(32);
    });

    it('mints distinct ids across calls', () => {
        const seen = new Set<string>();
        for (let i = 0; i < 8; i += 1) {
            seen.add(mintGuestClaimId(globalThis.crypto));
        }
        expect(seen.size).toBe(8);
    });

    it('throws loudly when no Web Crypto surface exists at all', () => {
        const crypto: GuestClaimIdCrypto = {};
        expect(() => mintGuestClaimId(crypto)).toThrow(/no Web Crypto/);
    });
});
