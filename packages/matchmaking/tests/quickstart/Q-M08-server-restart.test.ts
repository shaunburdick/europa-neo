/**
 * Q-M08 — Server restart wipes match state (assumption). Feature 006
 * (T064).
 *
 * Verbatim scenario from `quickstart.md` §Q-M08 (spec §Assumptions:
 * "no persistence across server restarts"). Mechanical adjustments,
 * per package test conventions:
 *   1. imports resolve to `../../src/index` rather than the self
 *      package name (which would hit a possibly-stale dist build);
 *   2. `close()` calls are awaited (they return Promises) so the test
 *      stays sync-safe under lint's floating-promise hygiene;
 *   3. the deps objects read `{ server: server1 }` / `{ server: server2 }`
 *      — the quickstart prose's `{ server1 }` shorthand would create a
 *      property NAMED `server1`, which `MatchmakerDeps.server` never
 *      sees (contracts win over prose; Q-M04 precedent).
 */

import { describe, expect, it } from 'vitest';

import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { FakeServer } from '../fixtures/fakeServer';

describe('Q-M08: server restart wipes match state', () => {
    it('match state is gone after close()', async () => {
        const server1 = new FakeServer();
        const matchmaker1 = createMatchmaker(MATCHMAKING_CONSTANTS, { server: server1 });

        const create = matchmaker1.createMatch({
            visibility: 'public',
            displayName: 'Alice',
        });
        if (!create.ok) {
            throw new Error('create failed');
        }
        const { matchId } = create.data;

        expect(matchmaker1.listPublicMatches().ok && matchmaker1.stats().activeMatches).toBe(1);

        // Simulate server restart
        await matchmaker1.close();

        // New matchmaker, same FakeServer (or a new one — state is gone either way)
        const server2 = new FakeServer();
        const matchmaker2 = createMatchmaker(MATCHMAKING_CONSTANTS, { server: server2 });

        // Old matchId is unknown to the new matchmaker
        const joinResult = matchmaker2.joinMatch({ matchId, displayName: 'Bob' });
        expect(joinResult.ok).toBe(false);
        if (joinResult.ok) {
            return;
        }
        expect(joinResult.error.code).toBe('match_not_found');

        await matchmaker2.close();
    });
});
