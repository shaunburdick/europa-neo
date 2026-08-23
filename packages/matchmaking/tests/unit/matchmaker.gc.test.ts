/**
 * Unit tests for the lazy empty-match GC sweep — Feature 006 (T063
 * support, FR-011).
 *
 * Pins `sweepStaleEmptyMatches` (Phase 8): filling matches idle past
 * `emptyMatchTtlMs` are collected on read paths (`stats()` /
 * `listPublicMatches()`), their seated players' ephemeral sessions are
 * deleted (SC-005 no-leak invariant), and every other status is
 * untouched. The sweep is lazy by design — NO timers in matchmaking
 * logic; tests drive the injected clock and observe through reads.
 */

import { describe, expect, it } from 'vitest';

import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';

/** Config with a short TTL so tests advance small, explicit steps. */
const GC_CONFIG = { ...MATCHMAKING_CONSTANTS, emptyMatchTtlMs: 1_000 };

describe('matchmaker — empty-match GC sweep (FR-011)', () => {
  it('collects a stale filling match and deletes its seated session', () => {
    const clock = { value: 0 };
    const server = new FakeServer();
    const mm = createMatchmaker(GC_CONFIG, { server, now: () => clock.value });

    const created = mm.createMatch({ visibility: 'public', displayName: 'Alice' });
    if (!created.ok) throw new Error('fixture create failed');

    // Before the TTL elapses the match survives.
    const early = mm.stats();
    expect(early.fillingMatches).toBe(1);
    expect(early.collectedMatches).toBe(0);
    expect(early.activePlayerSessions).toBe(1);

    // Just under the TTL: still alive.
    clock.value += GC_CONFIG.emptyMatchTtlMs - 1;
    expect(mm.stats().fillingMatches).toBe(1);

    // Exactly at the TTL boundary: collected.
    clock.value += 1;
    const swept = mm.stats();
    expect(swept.fillingMatches).toBe(0);
    expect(swept.collectedMatches).toBe(1);
    expect(swept.totalCollected).toBe(1);
    expect(swept.activePlayerSessions).toBe(0);
    mm.close();
  });

  it('collects a seatless filling match left by an inline forfeit release', () => {
    const clock = { value: 10_000 };
    const server = new FakeServer();
    const mm = createMatchmaker(GC_CONFIG, { server, now: () => clock.value });

    const created = mm.createMatch({ visibility: 'public', displayName: 'Alice' });
    if (!created.ok) throw new Error('fixture create failed');
    // Creator's seat expires while still filling → inline release
    // empties the match (US5 dispatch ruling 3).
    server.fireOnSeatExpired({
      matchId: created.data.matchId,
      sessionToken: created.data.seatAssignment.sessionToken,
      playerId: null,
    });
    expect(mm.stats().fillingMatches).toBe(1);

    // Past the TTL the seatless husk is collected too (spec edge case:
    // "unstarted matches with no seated players are garbage-collected").
    clock.value += GC_CONFIG.emptyMatchTtlMs + 1;
    const stats = mm.stats();
    expect(stats.fillingMatches).toBe(0);
    expect(stats.collectedMatches).toBe(1);
    expect(stats.activePlayerSessions).toBe(0);
    mm.close();
  });

  it('never collects running matches regardless of age', () => {
    const clock = { value: 0 };
    const server = new FakeServer();
    const mm = createMatchmaker(GC_CONFIG, { server, now: () => clock.value });

    const created = mm.createMatch({ visibility: 'public', displayName: 'Alice' });
    if (!created.ok) throw new Error('fixture create failed');
    expect(mm.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' }).ok).toBe(true);

    clock.value += GC_CONFIG.emptyMatchTtlMs * 10;
    const stats = mm.stats();
    expect(stats.runningMatches).toBe(1);
    expect(stats.collectedMatches).toBe(0);
    expect(stats.activePlayerSessions).toBe(2);
    mm.close();
  });

  it('resets the idle clock when a joiner arrives (lastActivityAtMs anchor)', () => {
    const clock = { value: 0 };
    const server = new FakeServer();
    const mm = createMatchmaker(GC_CONFIG, { server, now: () => clock.value });

    const created = mm.createMatch({ visibility: 'public', displayName: 'Alice' });
    if (!created.ok) throw new Error('fixture create failed');

    // Age almost to the TTL…
    clock.value += GC_CONFIG.emptyMatchTtlMs - 1;
    // …then a join refreshes lastActivityAtMs.
    const joined = mm.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' });
    expect(joined.ok).toBe(true);

    // The original TTL window would have lapsed long ago, but the
    // match auto-started on the fill — running matches are immune.
    clock.value += GC_CONFIG.emptyMatchTtlMs * 5;
    const stats = mm.stats();
    expect(stats.runningMatches).toBe(1);
    expect(stats.collectedMatches).toBe(0);
    mm.close();
  });

  it('listPublicMatches also drives the sweep (read-path parity)', () => {
    const clock = { value: 0 };
    const server = new FakeServer();
    const mm = createMatchmaker(GC_CONFIG, { server, now: () => clock.value });

    const created = mm.createMatch({ visibility: 'public', displayName: 'Alice' });
    if (!created.ok) throw new Error('fixture create failed');
    expect(mm.listPublicMatches().matches).toHaveLength(1);

    clock.value += GC_CONFIG.emptyMatchTtlMs + 1;
    const lobby = mm.listPublicMatches();
    expect(lobby.ok).toBe(true);
    if (!lobby.ok) return;
    expect(lobby.matches).toHaveLength(0);
    expect(mm.stats().collectedMatches).toBe(1);
    mm.close();
  });
});
