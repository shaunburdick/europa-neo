/**
 * Canonical player identity tests — issue #74 (Wave 1, T007)
 *
 * Verifies the behaviour of `packages/core/src/player-id.ts`:
 *   1. Normative constants and the canonical pattern.
 *   2. Non-throwing guards and throwing parsers (valid + invalid vectors).
 *   3. The branded type witnesses (compile-time only; see
 *      `src/player-id.contract.ts` for the enforced version).
 *   4. CSPRNG generation: exact 72-bit output shape, deterministic
 *      injected-byte vectors, bias-free six-bit boundary behaviour,
 *      candidate-level rejection/retry, bounded exhaustion, and
 *      fail-closed entropy handling.
 *   5. Purity and supply-chain guards: no clock/`Math.random`, no
 *      `node:crypto` static import, no direct runtime `nanoid`.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { GuestPlayerId, PlayerId, RandomBytesSource } from '../../src/index';
import {
    DEFAULT_PLAYER_ID_MAX_ATTEMPTS,
    generatePlayerId,
    InvalidPlayerIdError,
    isGuestPlayerId,
    isPlayerId,
    PLAYER_ID_ALPHABET,
    PLAYER_ID_BITS,
    PLAYER_ID_LENGTH,
    PLAYER_ID_PATTERN,
    PlayerIdCollisionError,
    PlayerIdEntropyError,
    PlayerIdError,
    parseGuestPlayerId,
    parsePlayerId,
} from '../../src/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = resolve(here, '..', '..', 'src', 'player-id.ts');
const PACKAGE_JSON_PATH = resolve(here, '..', '..', 'package.json');

/** A source that returns `byte` repeated for the requested length. */
function fixedByteSource(byte: number): RandomBytesSource {
    return (length: number) => new Uint8Array(length).fill(byte);
}

/** A source that returns queued buffers in order, then fails. */
function queueSource(...buffers: ReadonlyArray<Uint8Array>): RandomBytesSource {
    let index = 0;
    return () => {
        const buffer = buffers[index];
        index += 1;
        if (buffer === undefined) {
            throw new Error(`queueSource exhausted after ${buffers.length} call(s)`);
        }
        return buffer;
    };
}

/** Build a 9-byte buffer whose first byte is `byte` and remainder is zero. */
function leadingByte(byte: number): Uint8Array {
    const bytes = new Uint8Array(9);
    bytes[0] = byte;
    return bytes;
}

const ZERO_BYTES = new Uint8Array(9);
const MAX_BYTES = new Uint8Array(9).fill(0xff);

afterEach(() => {
    vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('canonical constants', () => {
    it('exposes the exact 64-symbol alphabet with no duplicates', () => {
        expect(PLAYER_ID_ALPHABET).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-');
        expect(PLAYER_ID_ALPHABET).toHaveLength(64);
        expect(new Set(PLAYER_ID_ALPHABET).size).toBe(64);
    });

    it('exposes the exact length and entropy width', () => {
        expect(PLAYER_ID_LENGTH).toBe(12);
        expect(PLAYER_ID_BITS).toBe(72);
        expect(PLAYER_ID_LENGTH * 6).toBe(PLAYER_ID_BITS);
    });

    it('uses the exact canonical pattern', () => {
        expect(PLAYER_ID_PATTERN.source).toBe('^[A-Za-z0-9_-]{12}$');
    });
});

// ---------------------------------------------------------------------------
// Guards and parsers
// ---------------------------------------------------------------------------

describe('isPlayerId / parsePlayerId', () => {
    const valid: ReadonlyArray<string> = [
        '------------',
        '____________',
        // The contract lists `A0b_-9XyZ12` / `aBcDeF012_-` as valid, but both
        // are 11 characters and the normative constant is exactly {12}. The
        // canonical 12-character forms are the valid vectors; the 11-character
        // originals are asserted invalid below.
        'A0b_-9XyZ12A',
        'aBcDeF012_-A',
        'AAAAAAAAAAAA',
        '000000000000',
        'aBcDeFgHiJkL',
    ];

    for (const value of valid) {
        it(`accepts canonical id ${JSON.stringify(value)}`, () => {
            expect(isPlayerId(value)).toBe(true);
            expect(parsePlayerId(value)).toBe(value);
        });
    }

    const invalid: ReadonlyArray<{ readonly label: string; readonly value: unknown }> = [
        { label: 'too short (4)', value: '1234' },
        { label: 'too long (13)', value: '1234567890123' },
        { label: 'disallowed punctuation', value: '12345678901!' },
        { label: 'non-canonical fixture handle', value: 'guest-0001' },
        { label: 'embedded space', value: 'A BcDeF012_-' },
        { label: 'non-ASCII character', value: 'éBcDeF012_-' },
        { label: '11-char contract vector (A0b_-9XyZ12)', value: 'A0b_-9XyZ12' },
        { label: '11-char contract vector (aBcDeF012_-)', value: 'aBcDeF012_-' },
        { label: 'numeric 1', value: 1 },
        { label: 'numeric 0', value: 0 },
        { label: 'null', value: null },
        { label: 'undefined', value: undefined },
        { label: 'empty string', value: '' },
        { label: 'objects', value: { id: 'AAAAAAAAAAAA' } },
        { label: 'arrays', value: ['AAAAAAAAAAAA'] },
        { label: 'booleans', value: true },
    ];

    for (const { label, value } of invalid) {
        it(`rejects ${label}`, () => {
            expect(isPlayerId(value)).toBe(false);
            expect(() => parsePlayerId(value)).toThrow(InvalidPlayerIdError);
        });
    }

    it('never coerces numbers into ids', () => {
        expect(isPlayerId(1)).toBe(false);
        expect(isPlayerId(Number('1'))).toBe(false);
        expect(isPlayerId(111111111111)).toBe(false);
    });

    it('parsePlayerId carries the offending value and a domain error name', () => {
        try {
            parsePlayerId(42);
            expect.unreachable('parsePlayerId should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(PlayerIdError);
            if (!(error instanceof InvalidPlayerIdError)) {
                throw error;
            }
            expect(error.received).toBe(42);
            expect(error.name).toBe('InvalidPlayerIdError');
            expect(error.message).toContain('received a number');
        }
    });
});

describe('isGuestPlayerId / parseGuestPlayerId', () => {
    it('validates the same canonical representation', () => {
        const id = '------------';
        expect(isGuestPlayerId(id)).toBe(true);
        expect(parseGuestPlayerId(id)).toBe(id);
    });

    it('rejects the same non-canonical values', () => {
        expect(isGuestPlayerId(1)).toBe(false);
        expect(isGuestPlayerId('guest-0001')).toBe(false);
        expect(() => parseGuestPlayerId(null)).toThrow(InvalidPlayerIdError);
    });
});

describe('branded type witnesses (runtime-visible assertions)', () => {
    it('brands are strings at runtime', () => {
        const playerId: PlayerId = parsePlayerId('AAAAAAAAAAAA');
        const guestId: GuestPlayerId = parseGuestPlayerId('AAAAAAAAAAAA');
        expectTypeOf(playerId).toMatchTypeOf<string>();
        expectTypeOf(guestId).toMatchTypeOf<string>();
        expect(playerId).toBe(guestId);
    });
});

// ---------------------------------------------------------------------------
// Generation — shape, determinism, boundaries
// ---------------------------------------------------------------------------

describe('generatePlayerId — output shape', () => {
    it('produces exactly 12 canonical characters (72 bits)', () => {
        const id = generatePlayerId();
        expect(id).toHaveLength(PLAYER_ID_LENGTH);
        expect(PLAYER_ID_PATTERN.test(id)).toBe(true);
        for (const char of id) {
            expect(PLAYER_ID_ALPHABET).toContain(char);
        }
    });

    it('returns canonical ids that parse', () => {
        const id = generatePlayerId();
        expect(isPlayerId(id)).toBe(true);
        expect(parsePlayerId(id)).toBe(id);
    });

    it('requests exactly 9 bytes from the source', () => {
        const lengths: number[] = [];
        const source: RandomBytesSource = (length) => {
            lengths.push(length);
            return new Uint8Array(length);
        };
        generatePlayerId(source);
        expect(lengths).toEqual([9]);
    });
});

describe('generatePlayerId — deterministic injected-byte vectors', () => {
    it('maps nine zero bytes to all-A', () => {
        expect(generatePlayerId(fixedByteSource(0x00))).toBe('AAAAAAAAAAAA');
    });

    it('maps nine 0xFF bytes to all-hyphen', () => {
        expect(generatePlayerId(fixedByteSource(0xff))).toBe('------------');
    });

    it('extracts six-bit groups at the 0x00/0x3F/0x40 boundary', () => {
        const bytes = new Uint8Array([0x00, 0x3f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
        expect(generatePlayerId(queueSource(bytes))).toBe('AD8AAAAAAAAA');
    });

    it('is deterministic for an identical injected sequence', () => {
        const first = generatePlayerId(fixedByteSource(0x5a));
        const second = generatePlayerId(fixedByteSource(0x5a));
        expect(first).toBe(second);
    });
});

describe('generatePlayerId — six-bit boundary and modulo-bias guard', () => {
    // The low six bits of a byte have exactly four preimages per symbol
    // (256 = 4 × 64), so masking is bias-free and rejects nothing. Assert
    // that property across the full byte domain plus the top-bit boundaries.
    it('maps every byte value to an in-range symbol with no bias', () => {
        const counts = new Map<string, number>();
        for (let byte = 0; byte < 256; byte++) {
            const first = generatePlayerId(fixedByteSource(byte))[0] ?? '';
            counts.set(first, (counts.get(first) ?? 0) + 1);
        }
        expect(counts.size).toBe(64);
        for (const count of counts.values()) {
            expect(count).toBe(4);
        }
    });

    it('honours the high six bits at explicit boundary bytes', () => {
        const expected: ReadonlyArray<readonly [number, string]> = [
            [0x00, 'A'],
            [0x3f, 'P'],
            [0x40, 'Q'],
            [0xbf, 'v'],
            [0xc0, 'w'],
            [0xff, '-'],
        ];
        for (const [byte, symbol] of expected) {
            expect(generatePlayerId(queueSource(leadingByte(byte))).charAt(0)).toBe(symbol);
        }
    });
});

// ---------------------------------------------------------------------------
// Generation — rejection sampling, retries, exhaustion
// ---------------------------------------------------------------------------

describe('generatePlayerId — candidate rejection and collision retry', () => {
    it('rejects an active candidate and returns the next draw', () => {
        const active: PlayerId[] = [];
        const result = generatePlayerId(queueSource(ZERO_BYTES, MAX_BYTES), (candidate) => {
            active.push(candidate);
            return candidate === 'AAAAAAAAAAAA';
        });
        expect(active).toEqual(['AAAAAAAAAAAA', '------------']);
        expect(result).toBe('------------');
    });

    it('returns the first candidate immediately when it is not active', () => {
        const active: PlayerId[] = [];
        const result = generatePlayerId(fixedByteSource(0x00), (candidate) => {
            active.push(candidate);
            return false;
        });
        expect(result).toBe('AAAAAAAAAAAA');
        expect(active).toEqual(['AAAAAAAAAAAA']);
    });

    it('fails closed once the bounded retry budget is exhausted', () => {
        const source = queueSource(ZERO_BYTES, MAX_BYTES, ZERO_BYTES);
        let attempts = 0;
        try {
            generatePlayerId(
                source,
                () => {
                    attempts += 1;
                    return true;
                },
                { maxAttempts: 3 },
            );
            expect.unreachable('generation should have exhausted its budget');
        } catch (error) {
            expect(error).toBeInstanceOf(PlayerIdError);
            if (!(error instanceof PlayerIdCollisionError)) {
                throw error;
            }
            expect(error.attempts).toBe(3);
        }
        expect(attempts).toBe(3);
    });

    it('defaults the retry budget to the documented maximum', () => {
        expect(DEFAULT_PLAYER_ID_MAX_ATTEMPTS).toBeGreaterThanOrEqual(1);
        let attempts = 0;
        expect(() =>
            generatePlayerId(fixedByteSource(0x00), () => {
                attempts += 1;
                return true;
            }),
        ).toThrow(PlayerIdCollisionError);
        expect(attempts).toBe(DEFAULT_PLAYER_ID_MAX_ATTEMPTS);
    });

    it('rejects a non-positive or non-integer retry budget before drawing', () => {
        for (const maxAttempts of [0, -1, 1.5, Number.NaN]) {
            expect(() => generatePlayerId(fixedByteSource(0x00), undefined, { maxAttempts })).toThrow(PlayerIdError);
        }
    });
});

// ---------------------------------------------------------------------------
// Generation — fail-closed entropy handling
// ---------------------------------------------------------------------------

describe('generatePlayerId — entropy failure is fail-closed', () => {
    it('wraps a generic source failure as an actionable entropy error', () => {
        const cause = new Error('device unavailable');
        try {
            generatePlayerId(() => {
                throw cause;
            });
            expect.unreachable('generation should have failed closed');
        } catch (error) {
            if (!(error instanceof PlayerIdEntropyError)) {
                throw error;
            }
            expect(error.cause).toBe(cause);
        }
    });

    it('rethrows an existing domain entropy error unchanged', () => {
        const original = new PlayerIdEntropyError('specific entropy failure');
        try {
            generatePlayerId(() => {
                throw original;
            });
            expect.unreachable('generation should have failed closed');
        } catch (error) {
            expect(error).toBe(original);
        }
    });

    it('rejects a short entropy buffer', () => {
        expect(() => generatePlayerId(() => new Uint8Array(8))).toThrow(/expected 9/);
    });

    it('rejects an over-long entropy buffer', () => {
        expect(() => generatePlayerId(() => new Uint8Array(10))).toThrow(PlayerIdEntropyError);
    });

    it('fails closed when the platform CSPRNG is unavailable', () => {
        vi.stubGlobal('crypto', undefined);
        expect(() => generatePlayerId()).toThrow(PlayerIdEntropyError);
    });

    it('fails closed when the platform CSPRNG lacks getRandomValues', () => {
        vi.stubGlobal('crypto', {});
        expect(() => generatePlayerId()).toThrow(/no platform CSPRNG/);
    });
});

// ---------------------------------------------------------------------------
// Purity and supply-chain guards
// ---------------------------------------------------------------------------

describe('player-id.ts — determinism and supply-chain guards', () => {
    it('does not read a clock or use Math.random', () => {
        const src = readFileSync(SOURCE_PATH, 'utf8');
        const forbidden: ReadonlyArray<RegExp> = [
            /\bMath\.random\b/,
            /\bDate\.now\b/,
            /\bperformance\.now\b/,
            /\bnew Date\b/,
        ];
        const hits = forbidden.filter((pattern) => pattern.test(src));
        expect(hits, 'player-id.ts must not read a clock or use weak randomness').toEqual([]);
    });

    it('does not statically import node:crypto (browser-safe isomorphic module)', () => {
        const src = readFileSync(SOURCE_PATH, 'utf8');
        expect(src).not.toMatch(/from\s+['"]node:crypto['"]/);
        expect(src).not.toMatch(/require\(\s*['"]node:crypto['"]\s*\)/);
    });

    it('does not import or depend on nanoid', () => {
        const src = readFileSync(SOURCE_PATH, 'utf8');
        expect(src).not.toMatch(/from\s+['"]nanoid['"]/);
        expect(src).not.toMatch(/require\(\s*['"]nanoid['"]\s*\)/);

        const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as Record<string, Record<string, string>>;
        for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
            expect(pkg[section] ?? {}).not.toHaveProperty('nanoid');
        }
    });
});
