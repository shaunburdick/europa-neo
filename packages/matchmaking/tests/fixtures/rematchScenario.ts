/**
 * Rematch scenario fixture — Feature 006 US4 tests (T047–T050)
 *
 * Builds the canonical "finished 2-player match" starting state the
 * rematch suites share: Alice creates, Bob joins (auto-start), the
 * engine fires `onMatchTerminal` with a win for player 1, and the
 * matchmaker transitions the match to `finished` (US4 AC-1). Tests
 * drive the injected fake clock via {@linkcode RematchScenario.advanceMs}
 * so window-expiry behavior is deterministic (constitution Principle II:
 * no wall-clock reads inside matchmaking logic).
 *
 * Pure test helper: no I/O, no timers.
 */

import type { MatchId, MatchVisibility, SeatAssignment } from '../../contracts/match-types';
import type { Matchmaker } from '../../contracts/matchmaking-api';
import { MATCHMAKING_CONSTANTS } from '../../src/constants';
import { createMatchmaker } from '../../src/matchmaker';
import { FakeServer } from './fakeServer';

/** Everything a rematch test needs to drive the handshake. */
export interface RematchScenario {
  /** Recording server stub (bridge triggers + call logs). */
  readonly server: FakeServer;
  /** The matchmaker under test. */
  readonly matchmaker: Matchmaker;
  /** The finished match's id. */
  readonly matchId: MatchId;
  /** Alice's original seat assignment (seat 0, creator). */
  readonly alice: SeatAssignment;
  /** Bob's original seat assignment (seat 1, joiner). */
  readonly bob: SeatAssignment;
  /** Advance the fake clock by `ms` milliseconds. */
  advanceMs(ms: number): void;
  /** Current fake-clock reading (epoch ms). */
  nowMs(): number;
}

/** Args for {@linkcode makeFinished2pScenario}. */
export interface FinishedScenarioArgs {
  /** Original match visibility; defaults to `'public'`. */
  readonly visibility?: MatchVisibility;
  /** Tick recorded on the terminal event; defaults to 42. */
  readonly tick?: number;
}

/**
 * Create a 2-player match, run it to a win-for-player-1 terminal
 * event, and return the finished-scenario handles.
 *
 * @param args - Optional visibility and terminal tick overrides.
 * @returns The scenario handles (match is `finished`, window not yet
 *   opened — offers materialize on the first `requestRematch`).
 */
export function makeFinished2pScenario(args?: FinishedScenarioArgs): RematchScenario {
  const visibility = args?.visibility ?? 'public';
  const tick = args?.tick ?? 42;

  let clockMs = 1_000_000;
  const now = (): number => clockMs;
  const server = new FakeServer({ now });
  const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server, now });

  const created = matchmaker.createMatch({ visibility, displayName: 'Alice' });
  if (!created.ok) {
    throw new Error('scenario: createMatch failed');
  }
  const joined = matchmaker.joinMatch({
    matchId: created.data.matchId,
    displayName: 'Bob',
  });
  if (!joined.ok) {
    throw new Error('scenario: joinMatch failed');
  }

  const { matchId } = created.data;
  server.fireOnMatchTerminal({
    matchId,
    result: { kind: 'win', winner: 1, tick, reason: 'last_standing' },
    tick,
  });

  return {
    server,
    matchmaker,
    matchId,
    alice: created.data.seatAssignment,
    bob: joined.data.seatAssignment,
    advanceMs(ms: number): void {
      clockMs += ms;
    },
    nowMs(): number {
      return clockMs;
    },
  };
}
