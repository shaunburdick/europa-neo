/**
 * Unit tests for the lazy GC sweeps — Feature 006 (T063 support +
 * review remediation, FR-011).
 *
 * Pins both collection sweeps on the read paths (`stats()` /
 * `listPublicMatches()`):
 *
 * - `sweepStaleEmptyMatches`: filling matches idle past
 *   `emptyMatchTtlMs` are collected and their seated players'
 *   ephemeral sessions are deleted (SC-005 no-leak invariant).
 * - `sweepFinishedResultsTtl`: finished matches past `resultsTtlMs`
 *   are collected — including matches that finished with NO rematch
 *   offer — freeing their slot against `maxConcurrentMatches`.
 *
 * Every other status is untouched. The sweeps are lazy by design —
 * NO timers in matchmaking logic; tests drive the injected clock and
 * observe through reads.
 */

import { describe, expect, it } from 'vitest';

import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from '../fixtures/fakeServer';
import { makeFinished2pScenario } from '../fixtures/rematchScenario';

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

describe('matchmaker — results-TTL sweep (FR-011 second clause)', () => {
  it('collects a finished match with no rematch offer after resultsTtlMs', () => {
    // The canonical scenario finishes with NO requestRematch — the
    // exact shape that used to leak forever (B1).
    const scenario = makeFinished2pScenario();
    const { matchmaker, matchId } = scenario;

    const fresh = matchmaker.stats();
    expect(fresh.finishedMatches).toBe(1);
    expect(fresh.activePlayerSessions).toBe(2);

    // Exactly at the TTL boundary (finishedAtMs anchors the clock):
    // collected, and both participants' sessions are gone.
    scenario.advanceMs(MATCHMAKING_CONSTANTS.resultsTtlMs);
    const swept = matchmaker.stats();
    expect(swept.finishedMatches).toBe(0);
    expect(swept.collectedMatches).toBe(1);
    expect(swept.totalCollected).toBe(1);
    expect(swept.activePlayerSessions).toBe(0);

    // Post-collection operations land on the non-leaking failure path.
    expect(
      matchmaker.requestRematch({ matchId, sessionToken: scenario.alice.sessionToken }),
    ).toMatchObject({ ok: false });
  });

  it('frees the concurrency cap — createMatch succeeds again after the sweep', () => {
    let clockMs = 2_000_000;
    const now = (): number => clockMs;
    const server = new FakeServer({ now });
    const config = {
      ...MATCHMAKING_CONSTANTS,
      maxConcurrentMatches: 2,
      resultsTtlMs: 5_000,
    };
    const mm = createMatchmaker(config, { server, now });

    /** Create, fill, and finish one match (no rematch offer). */
    const finishOne = (name: string): void => {
      const created = mm.createMatch({ visibility: 'public', displayName: name });
      if (!created.ok) throw new Error('fixture create failed');
      const joined = mm.joinMatch({ matchId: created.data.matchId, displayName: `${name} II` });
      if (!joined.ok) throw new Error('fixture join failed');
      server.fireOnMatchTerminal({
        matchId: created.data.matchId,
        result: { kind: 'win', winner: 1, tick: 10, reason: 'last_standing' },
        tick: 10,
      });
    };
    finishOne('Alice');
    finishOne('Bob');

    // Cap reached: the next creation is rejected…
    const blocked = mm.createMatch({ visibility: 'public', displayName: 'Carol' });
    expect(blocked).toMatchObject({ ok: false, error: { code: 'rate_limited' } });

    // …until the results TTL elapses and the read-path sweep collects
    // both finished matches.
    clockMs += config.resultsTtlMs + 1;
    const stats = mm.stats();
    expect(stats.collectedMatches).toBe(2);
    expect(stats.activePlayerSessions).toBe(0);

    const retry = mm.createMatch({ visibility: 'public', displayName: 'Carol' });
    expect(retry.ok).toBe(true);
    mm.close();
  });

  it('leaves a fresh finished match untouched inside the TTL across repeated reads', () => {
    const scenario = makeFinished2pScenario();
    const { matchmaker } = scenario;

    // Repeated read-path sweeps inside the TTL must be no-ops.
    scenario.advanceMs(MATCHMAKING_CONSTANTS.resultsTtlMs - 1);
    for (let read = 0; read < 3; read++) {
      const stats = matchmaker.stats();
      expect(stats.finishedMatches).toBe(1);
      expect(stats.collectedMatches).toBe(0);
      expect(stats.activePlayerSessions).toBe(2);
    }

    // The offer-less window is still live: a rematch can open.
    const offered = matchmaker.requestRematch({
      matchId: scenario.matchId,
      sessionToken: scenario.alice.sessionToken,
    });
    expect(offered).toMatchObject({ ok: true });
    scenario.matchmaker.close();
  });
});
