/**
 * SC-005 soak — Feature 006 (T062).
 *
 * 50 sequential create / join / terminal / rematch cycles against one
 * matchmaker instance; afterwards `stats()` must report ZERO active
 * matches and ZERO active player sessions — the no-leak invariant for
 * long-running deployments (4–8 h uptime expectation, constitution
 * Principle VII self-hostable). Per `quickstart.md` §3.
 *
 * Cycle anatomy (each cycle leaves nothing behind):
 *   1. `createMatch` (Alice)            → filling
 *   2. `joinMatch` (Bob)                → auto-start → running
 *   3. `onMatchTerminal` (Alice wins)   → finished
 *   4. `requestRematch` + accept ×2     → all-accept: original
 *      collected; a fresh rematch match sits in `filling` holding both
 *      rebound sessions
 *   5. clock jumps past `emptyMatchTtlMs`; a `stats()` read drives the
 *      lazy sweeps (FR-009/FR-011): the abandoned rematch match is
 *      collected and its sessions deleted
 *
 * Determinism: counter-based `randomId`, fixed-state `Rng` factory,
 * and an injected monotonic clock — no wall-clock, no CSPRNG in the
 * run's inputs (constitution Principle II).
 */

import type { Rng } from '@europa/engine';
import { describe, expect, it } from 'vitest';

import { createMatchmaker, MATCHMAKING_CONSTANTS } from './src/index';
import { FakeServer } from './tests/fixtures/fakeServer';

/** Cycles mandated by SC-005. */
const CYCLES = 50;

/** Deterministic id factory: `id-0`, `id-1`, … (never repeats). */
function deterministicRandomId(): () => string {
  let n = 0;
  return () => `id-${String(n++).padStart(4, '0')}`;
}

/**
 * Deterministic uint32 RNG matching the engine's `Rng` shape
 * (callable + readonly state). A pure additive LCG — only
 * reproducibility matters here, not statistical quality.
 */
function deterministicRngFactory(seed: number): Rng {
  const s0 = seed >>> 0;
  const state = new Uint32Array([
    s0,
    (seed ^ 0x85eb_ca6b) >>> 0,
    (seed ^ 0xc2b2_ae35) >>> 0,
    (seed ^ 0x27d4_eb2f) >>> 0,
  ]);
  let s = s0;
  const rng = (): number => {
    s = (s + 0x6d2b_79f5) >>> 0;
    return s;
  };
  return Object.assign(rng, { state });
}

describe('SC-005: 50 sequential cycles, no leaks', () => {
  it('maintains zero leaks after 50 create/play/finish/rematch cycles', () => {
    const server = new FakeServer();
    const clock = { value: 1_000 };
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, {
      server,
      randomId: deterministicRandomId(),
      rngFactory: deterministicRngFactory,
      now: () => clock.value,
    });

    for (let i = 0; i < CYCLES; i++) {
      // -- 1. create ----------------------------------------------------
      const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
      if (!created.ok) throw new Error(`cycle ${i}: create failed`);
      const { matchId, seatAssignment: aliceSeat } = created.data;

      // -- 2. join (auto-start) ------------------------------------------
      const joined = matchmaker.joinMatch({ matchId, displayName: 'Bob' });
      if (!joined.ok) throw new Error(`cycle ${i}: join failed`);
      const bobSeat = joined.data.seatAssignment;
      expect(matchmaker.stats().runningMatches).toBe(1);

      // -- 3. terminal ---------------------------------------------------
      server.fireOnMatchTerminal({
        matchId,
        result: { kind: 'win', winner: aliceSeat.playerId, tick: i, reason: 'last_standing' },
        tick: i,
      });
      expect(matchmaker.stats().finishedMatches).toBe(1);

      // -- 4. rematch all-accept ------------------------------------------
      const requested = matchmaker.requestRematch({
        matchId,
        sessionToken: aliceSeat.sessionToken,
      });
      if (!requested.ok) throw new Error(`cycle ${i}: requestRematch failed`);
      expect(
        matchmaker.acceptRematch({
          matchId,
          rematchOfferId: requested.rematchOfferId,
          sessionToken: aliceSeat.sessionToken,
        }),
      ).toMatchObject({ ok: true, allAccepted: false });
      const bobAccept = matchmaker.acceptRematch({
        matchId,
        rematchOfferId: requested.rematchOfferId,
        sessionToken: bobSeat.sessionToken,
      });
      if (!bobAccept.ok || !bobAccept.allAccepted) {
        throw new Error(`cycle ${i}: rematch did not resolve`);
      }

      // The resolution left exactly one leftover: the fresh rematch
      // match, still `filling`, holding both rebound sessions.
      const midStats = matchmaker.stats();
      expect(midStats.fillingMatches).toBe(1);
      expect(midStats.activeMatches).toBe(1);
      expect(midStats.activePlayerSessions).toBe(2);
      // Cumulative: i prior originals + i−1 prior GC'd rematch matches
      // + this cycle's freshly resolved original.
      expect(midStats.collectedMatches).toBe(2 * i + 1);

      // -- 5. GC the abandoned rematch match ------------------------------
      clock.value += MATCHMAKING_CONSTANTS.emptyMatchTtlMs + 1;
      const swept = matchmaker.stats();
      expect(swept.fillingMatches).toBe(0);
      expect(swept.activeMatches).toBe(0);
      expect(swept.activePlayerSessions).toBe(0);
      expect(swept.collectedMatches).toBe(2 * i + 2);

      clock.value += 1; // separate cycles never share a timestamp
    }

    // Final ledger after the loop: nothing active, everything accounted.
    const stats = matchmaker.stats();
    expect(stats.activeMatches).toBe(0);
    expect(stats.activePlayerSessions).toBe(0);
    expect(stats.fillingMatches).toBe(0);
    expect(stats.runningMatches).toBe(0);
    expect(stats.finishedMatches).toBe(0);
    expect(stats.collectedMatches).toBe(CYCLES * 2);
    expect(stats.totalCreated).toBe(CYCLES * 2);
    expect(stats.totalFinished).toBe(CYCLES);
    expect(stats.totalCollected).toBe(CYCLES * 2);
    expect(stats.totalRematchAccepted).toBe(CYCLES * 2);
    expect(stats.totalForfeits).toBe(0);

    matchmaker.close();
  });
});
