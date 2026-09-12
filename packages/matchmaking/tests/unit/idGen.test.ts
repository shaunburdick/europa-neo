/**
 * Matchmaking universal-id allocation boundary — issue #74 (T024 / T029)
 *
 * The matchmaker delegates canonical id generation to `@europa/core`'s
 * CSPRNG generator (see `src/idGen.ts`). These tests pin the CONTRACT at
 * the matchmaking seam: canonical output, active-set rejection sampling,
 * bounded collision retry, fail-closed exhaustion, and fail-closed
 * entropy — without ever weakening production randomness (every case
 * injects a deterministic byte source).
 */

import type { PlayerId, RandomBytesSource } from '@europa/core';
import { isGuestPlayerId, isPlayerId, PlayerIdCollisionError, PlayerIdEntropyError } from '@europa/core';
import { describe, expect, it } from 'vitest';

import { allocateGuestPlayerId, allocatePlayerId } from '../../src/idGen';

/** Build a byte source that returns each scripted 9-byte block in turn. */
function scriptedBytes(...blocks: readonly number[][]): RandomBytesSource {
    let index = 0;
    return (length: number): Uint8Array => {
        const block = blocks[index];
        index += 1;
        if (block === undefined) {
            throw new Error('scriptedBytes: ran out of scripted blocks');
        }
        const bytes = new Uint8Array(block.slice(0, length));
        return bytes;
    };
}

const ALL_ZERO = [0, 0, 0, 0, 0, 0, 0, 0, 0];
const ALL_ONE = [1, 1, 1, 1, 1, 1, 1, 1, 1];

describe('allocatePlayerId — canonical output', () => {
    it('returns a canonical PlayerId from a deterministic byte source', () => {
        const id = allocatePlayerId({ source: scriptedBytes(ALL_ZERO) });
        expect(isPlayerId(id)).toBe(true);
        expect(id).toHaveLength(12);
    });

    it('allocateGuestPlayerId returns the same canonical value under the guest brand', () => {
        const id = allocateGuestPlayerId({ source: scriptedBytes(ALL_ZERO) });
        expect(isGuestPlayerId(id)).toBe(true);
    });
});

describe('allocatePlayerId — active-set rejection sampling', () => {
    it('redraws while the candidate is reported active, then returns the first unused id', () => {
        const seen: PlayerId[] = [];
        const id = allocatePlayerId({
            source: scriptedBytes(ALL_ZERO, ALL_ONE),
            isActive: (candidate) => {
                seen.push(candidate);
                // Reject only the first draw.
                return seen.length === 1;
            },
            maxAttempts: 3,
        });
        // Two draws: the first was rejected, the second accepted.
        expect(seen).toHaveLength(2);
        expect(seen[0]).not.toBe(seen[1]);
        expect(id).toBe(seen[1]);
    });

    it('fails closed when every draw collides (bounded retry exhausted)', () => {
        let draws = 0;
        expect(() =>
            allocatePlayerId({
                source: scriptedBytes(ALL_ZERO, ALL_ZERO, ALL_ZERO),
                isActive: () => {
                    draws += 1;
                    return true;
                },
                maxAttempts: 3,
            }),
        ).toThrow(PlayerIdCollisionError);
        expect(draws).toBe(3);
    });
});

describe('allocatePlayerId — fail-closed entropy and options', () => {
    it('propagates an entropy failure instead of falling back to weak randomness', () => {
        expect(() =>
            allocatePlayerId({
                source: () => {
                    throw new Error('no entropy');
                },
            }),
        ).toThrow(PlayerIdEntropyError);
    });

    it('rejects a non-positive maxAttempts', () => {
        expect(() => allocatePlayerId({ source: scriptedBytes(ALL_ZERO), maxAttempts: 0 })).toThrow(/maxAttempts/);
    });
});
