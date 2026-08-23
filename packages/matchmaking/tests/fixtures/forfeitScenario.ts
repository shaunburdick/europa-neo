/**
 * Forfeit scenario fixture — Feature 006 US5 tests (T055–T057)
 *
 * Builds hand-rolled `MatchRecord`s backed by a real in-memory store,
 * a real engine session (scripted all-land board, per
 * `engineSession.test.ts`), and the recording FakeServer so the
 * forfeit policy unit (`src/forfeit.ts`) can be exercised directly —
 * plus matchmaker-level scenarios that drive the same policy through
 * the wired `onSeatExpired` bridge handler.
 *
 * Pure test helper: no I/O, no timers (fake clock via closure).
 */

import type { Board, Cell, CityPlacement, PlayerId } from '@europa/engine';
import type { Logger, SessionToken } from '@europa/networking';

import type { MatchId, SeatIndex } from '../../contracts/match-types';
import { DEFAULT_MATCH_SETTINGS } from '../../contracts/match-types';
import { buildEngineSession, buildMatchConfig } from '../../src/engineSession';
import { createMatchRecord } from '../../src/internal/matchRecord';
import type { MatchRecord } from '../../src/internal/matchRecord';
import { createPlayerSession } from '../../src/internal/playerSession';
import type { SeatRecord } from '../../src/internal/seatRecord';
import { createSeatRecord } from '../../src/internal/seatRecord';
import { createStore } from '../../src/store';
import type { MatchmakerStore } from '../../src/store';
import { FakeServer } from './fakeServer';

/** Flat all-land board with one home city per player (deterministic). */
export function scriptedBoard(size: number, playerCount: 2 | 3 | 4): Board {
  const cells: Cell[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      cells.push({ x, y, elevation: 0, terrain: 'land' });
    }
  }
  const cities: CityPlacement[] = [];
  const homes: ReadonlyArray<readonly [number, number]> = [
    [1, 1],
    [size - 2, size - 2],
  ];
  for (let seat = 1; seat <= playerCount; seat++) {
    const home = homes[seat - 1];
    if (home === undefined) throw new Error('fixture home missing');
    cities.push({ cell: { x: home[0], y: home[1] }, owner: seat });
  }
  return { width: size, height: size, cells: Object.freeze(cells), cities: Object.freeze(cities) };
}

/** A silent logger for direct `handleSeatExpired` invocations. */
export const SILENT_LOGGER: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** Everything a forfeit test needs. */
export interface ForfeitFixture {
  /** The store holding the match + both sessions. */
  readonly store: MatchmakerStore;
  /** Recording server stub. */
  readonly server: FakeServer;
  /** The match record (running or filling per the maker). */
  readonly match: MatchRecord;
  /** Seat 0 (Alice) bearer token. */
  readonly aliceToken: SessionToken;
  /** Seat 1 (Bob) bearer token. */
  readonly bobToken: SessionToken;
  /** Current fake-clock reading. */
  nowMs(): number;
  /** Advance the fake clock. */
  advanceMs(ms: number): void;
}

const ALICE_TOKEN = 'aaaaaaaa-0000-4000-8000-00000000000a' as SessionToken;
const BOB_TOKEN = 'bbbbbbbb-0000-4000-8000-00000000000b' as SessionToken;

interface MakerArgs {
  /** `'running'` attaches a real engine session; `'filling'` does not. */
  readonly status: 'running' | 'filling';
}

/** Shared builder: a 1v1 match with Alice (seat 0) and Bob (seat 1). */
function makeFixture(args: MakerArgs): ForfeitFixture {
  let clockMs = 3_000_000;
  const nowMs = (): number => clockMs;

  const settings = { ...DEFAULT_MATCH_SETTINGS, boardSize: 8 };
  const match = createMatchRecord({
    matchId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' as MatchId,
    visibility: 'public',
    settings,
    createdAtMs: clockMs - 100,
  });

  const alice = createPlayerSession({
    displayName: 'Alice',
    randomId: () => '11111111-1111-4111-8111-111111111111',
    now: nowMs,
  });
  const bob = createPlayerSession({
    displayName: 'Bob',
    randomId: () => '22222222-2222-4222-8222-222222222222',
    now: nowMs,
  });

  const seats: SeatRecord[] = [
    createSeatRecord({
      seatIndex: 0 as SeatIndex,
      playerSessionId: alice.playerSessionId,
      displayName: 'Alice',
      sessionToken: ALICE_TOKEN,
      playerId: args.status === 'running' ? (1 as PlayerId) : null,
      connectedAtMs: clockMs - 100,
    }),
    createSeatRecord({
      seatIndex: 1 as SeatIndex,
      playerSessionId: bob.playerSessionId,
      displayName: 'Bob',
      sessionToken: BOB_TOKEN,
      playerId: args.status === 'running' ? (2 as PlayerId) : null,
      connectedAtMs: clockMs - 100,
    }),
  ];
  for (const seat of seats) {
    match.seats.set(seat.seatIndex, seat);
  }
  alice.currentMatchId = match.matchId;
  alice.currentSeatIndex = 0 as SeatIndex;
  alice.currentSessionToken = ALICE_TOKEN;
  bob.currentMatchId = match.matchId;
  bob.currentSeatIndex = 1 as SeatIndex;
  bob.currentSessionToken = BOB_TOKEN;

  if (args.status === 'running') {
    const config = buildMatchConfig(settings, 987654321);
    match.engineConfig = config;
    match.engineSession = buildEngineSession(config, scriptedBoard(8, 2));
    match.startedAtMs = clockMs - 50;
    match.status = 'running';
  }

  const store: MatchmakerStore = createStore();
  store.putMatch(match);
  store.putSession(alice);
  store.putSession(bob);

  return {
    store,
    server: new FakeServer({ now: nowMs }),
    match,
    aliceToken: ALICE_TOKEN,
    bobToken: BOB_TOKEN,
    nowMs,
    advanceMs(ms: number): void {
      clockMs += ms;
    },
  };
}

/** A running 1v1 match with a live engine session. */
export function makeRunningForfeitFixture(): ForfeitFixture {
  return makeFixture({ status: 'running' });
}

/** A filling 1v1 match (seats claimed, no engine session yet). */
export function makeFillingForfeitFixture(): ForfeitFixture {
  return makeFixture({ status: 'filling' });
}
