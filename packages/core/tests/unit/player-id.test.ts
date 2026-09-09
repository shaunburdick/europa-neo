/**
 * Player Identifier tests — Feature 025, Wave 1
 *
 * Validates the two core player-ID functions:
 *   1. `toPlayerId` — branded string assertion (round-trip).
 *   2. `generatePlayerId` — length, charset, uniqueness, edge cases.
 *
 * The branded type pattern means TypeScript catches misuse at compile
 * time; these tests verify runtime behavior and correctness.
 */

import { describe, expect, it, vi } from 'vitest';
import { generatePlayerId, toPlayerId } from '../../src/player-id';
import type { PlayerId } from '../../src/types';

// ---------------------------------------------------------------------------
// toPlayerId — branded string assertion
// ---------------------------------------------------------------------------

describe('toPlayerId — branded string assertion', () => {
    it('returns the same string typed as PlayerId', () => {
        const raw = 'AbC123xYz90Q';
        const id = toPlayerId(raw);
        expect(id).toBe(raw);
        // Structural check: branded string is still a string
        expect(typeof id).toBe('string');
    });

    it('round-trips through PlayerId type', () => {
        const id = toPlayerId('test-player-1');
        // Rebranding a branded ID is a no-op
        const reb = toPlayerId(id as string);
        expect(reb).toBe(id);
    });

    it('accepts empty string (caller validates)', () => {
        const id = toPlayerId('');
        expect(id).toBe('');
    });

    it('accepts special characters (caller validates)', () => {
        const id = toPlayerId('player/with:special chars');
        expect(id).toBe('player/with:special chars');
    });
});

// ---------------------------------------------------------------------------
// generatePlayerId — NanoID 12-char generation
// ---------------------------------------------------------------------------

describe('generatePlayerId — NanoID generation', () => {
    const VALID_CHARSET = /^[A-Za-z0-9]+$/;

    it('returns a 12-character string by default', () => {
        const id = generatePlayerId();
        expect(typeof id).toBe('string');
        expect(id).toHaveLength(12);
    });

    it('returns only alphanumeric characters (URL-safe)', () => {
        // Generate 100 IDs to increase confidence
        for (let i = 0; i < 100; i++) {
            const id = generatePlayerId();
            expect(id).toMatch(VALID_CHARSET);
        }
    });

    it('respects custom length parameter', () => {
        expect(generatePlayerId(1)).toHaveLength(1);
        expect(generatePlayerId(6)).toHaveLength(6);
        expect(generatePlayerId(24)).toHaveLength(24);
        expect(generatePlayerId(64)).toHaveLength(64);
    });

    it('produces unique IDs across 1000 generations', () => {
        const ids = new Set<string>();
        for (let i = 0; i < 1000; i++) {
            ids.add(generatePlayerId());
        }
        // 1000 unique 12-char alphanumeric IDs — collision is astronomically unlikely
        expect(ids.size).toBe(1000);
    });

    it('throws RangeError for non-positive length', () => {
        expect(() => generatePlayerId(0)).toThrow(RangeError);
        expect(() => generatePlayerId(-1)).toThrow(RangeError);
        expect(() => generatePlayerId(-100)).toThrow(RangeError);
    });

    it('throws RangeError for non-integer length', () => {
        expect(() => generatePlayerId(1.5)).toThrow(RangeError);
        expect(() => generatePlayerId(NaN)).toThrow(RangeError);
        expect(() => generatePlayerId(Infinity)).toThrow(RangeError);
    });

    it('accepts length of 1 (minimum valid)', () => {
        const id = generatePlayerId(1);
        expect(id).toHaveLength(1);
        expect(id).toMatch(VALID_CHARSET);
    });

    it('is compatible with PlayerId type', () => {
        const id: PlayerId = generatePlayerId();
        expect(typeof id).toBe('string');
        expect(id).toHaveLength(12);
    });
});

// ---------------------------------------------------------------------------
// Integration: toPlayerId + generatePlayerId
// ---------------------------------------------------------------------------

describe('player-id integration', () => {
    it('toPlayerId can brand a generated ID', () => {
        const generated = generatePlayerId();
        const branded = toPlayerId(generated);
        expect(branded).toBe(generated);
    });

    it('generated IDs are valid branded PlayerIds', () => {
        const ids: PlayerId[] = [];
        for (let i = 0; i < 50; i++) {
            ids.push(generatePlayerId());
        }
        // All unique
        expect(new Set(ids).size).toBe(50);
        // All strings
        for (const id of ids) {
            expect(typeof id).toBe('string');
            expect(id).toHaveLength(12);
        }
    });
});

// ---------------------------------------------------------------------------
// Edge case: crypto unavailable
// ---------------------------------------------------------------------------

describe('generatePlayerId — crypto unavailable', () => {
    it('throws when crypto.getRandomValues is missing', async () => {
        const original = globalThis.crypto;
        try {
            // Remove crypto to simulate an environment without it.
            // Use Object.defineProperty to avoid `any` casts — the property
            // is configurable on globalThis in V8.
            Object.defineProperty(globalThis, 'crypto', {
                value: undefined,
                configurable: true,
                writable: true,
            });
            // Force fresh module import so the cached cryptoGlobal reads undefined
            vi.resetModules();
            const { generatePlayerId: freshGenerate } = await import('../../src/player-id');
            expect(() => freshGenerate()).toThrow('crypto.getRandomValues is not available');
        } finally {
            // Restore crypto for other tests
            Object.defineProperty(globalThis, 'crypto', {
                value: original,
                configurable: true,
                writable: true,
            });
            vi.resetModules();
        }
    });
});
