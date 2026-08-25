/**
 * Q-M06 — Empty unstarted match garbage collection (FR-011 edge case).
 * Feature 006 (T063).
 *
 * Verbatim scenario from `quickstart.md` §Q-M06 (spec FR-011; edge
 * case "How are stale empty matches cleaned up?"). Mechanical
 * adjustments, per package test conventions:
 *   1. imports resolve to `../../src/index` rather than the self
 *      package name (which would hit a possibly-stale dist build);
 *   2. `close()` is awaited (it returns a Promise) so the test stays
 *      sync-safe under lint's floating-promise hygiene.
 *
 * The GC itself is a LAZY sweep (no timers in matchmaking logic): the
 * `vi.useFakeTimers()` clock advance moves `Date.now`, and the next
 * `stats()` read observes the filling → collected transition.
 */

import { describe, expect, it, vi } from 'vitest';

import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

describe('Q-M06: empty unstarted match GC', () => {
    it('collects matches with no seated players after TTL', async () => {
        vi.useFakeTimers();
        const server = new FakeServer();
        const matchmaker = createMatchmaker(
            { ...MATCHMAKING_CONSTANTS, emptyMatchTtlMs: 1000 }, // 1s for the test
            { server },
        );

        // Create a match; only Alice is seated (filling, not full)
        const create = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
        });
        if (!create.ok) {
            throw new Error('create failed');
        }

        const stats1 = matchmaker.stats();
        expect(stats1.fillingMatches).toBe(1);

        // Advance time past the TTL
        vi.advanceTimersByTime(2000);

        // Sweep ran; match should be collected
        const stats2 = matchmaker.stats();
        expect(stats2.fillingMatches).toBe(0);
        expect(stats2.collectedMatches).toBeGreaterThanOrEqual(1);

        vi.useRealTimers();
        await matchmaker.close();
    });
});
