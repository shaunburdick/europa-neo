/**
 * Unit tests for `listPublicMatches` filtering — Feature 006 (T033)
 *
 * Covers FR-005 + spec US2 AC-1/AC-2/AC-3 + data-model.md §12: given a
 * mix of matches in `filling`/`running`/`finished`/`collected` states
 * with both `public`/`private` visibilities, the projection returns
 * ONLY matches with `status === 'filling' && visibility === 'public'`;
 * private matches never appear regardless of status; the result array
 * is rebuilt on every call (mutation snapshot) and seat occupancy
 * reflects the live `seats.size` at projection time.
 *
 * Pure-function level (the wired `Matchmaker.listPublicMatches` surface
 * gets its own suites in `lobby.staleness.test.ts` / `lobby.multi.test.ts`
 * and quickstart Q-M01); record shapes come from the real factories so
 * the filter is tested against production data, not doubles.
 *
 * Test descriptions cite the requirement they pin.
 */

import type { MatchId } from '@europa/networking';
import { describe, expect, it } from 'vitest';
import type {
  MatchStatus,
  MatchVisibility,
  PlayerSessionId,
  SeatIndex,
  SessionToken,
} from '../../contracts/match-types';
import { DEFAULT_MATCH_SETTINGS } from '../../contracts/match-types';
import { createMatchRecord, type MatchRecord } from '../../src/internal/matchRecord';
import { createSeatRecord } from '../../src/internal/seatRecord';
import { listPublicMatches } from '../../src/lobby';

/** Deterministic id factory: concrete ids never matter to filtering logic. */
let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-id-${String(idCounter).padStart(3, '0')}`;
}

/** Every lifecycle status, in state-machine order (FR-012). */
const ALL_STATUSES: readonly MatchStatus[] = ['filling', 'running', 'finished', 'collected'];

/**
 * Build a match record in an arbitrary status with one host seat so it
 * is projectable whenever the filter lets it through.
 */
function makeMatch(visibility: MatchVisibility, status: MatchStatus): MatchRecord {
  const record = createMatchRecord({
    matchId: nextId('match') as MatchId,
    visibility,
    settings: DEFAULT_MATCH_SETTINGS,
    createdAtMs: 1_000,
  });
  record.seats.set(
    0 as SeatIndex,
    createSeatRecord({
      seatIndex: 0 as SeatIndex,
      playerSessionId: nextId('session') as PlayerSessionId,
      displayName: 'Host',
      sessionToken: nextId('token') as SessionToken,
      playerId: null,
      connectedAtMs: 1_000,
    }),
  );
  record.status = status;
  return record;
}

describe('listPublicMatches — status × visibility matrix (US2 AC-1/AC-2)', () => {
  it('FR-005: projects ONLY public filling matches out of a full 4×2 mix', () => {
    const mix: readonly MatchRecord[] = ALL_STATUSES.flatMap((status) => [
      makeMatch('public', status),
      makeMatch('private', status),
    ]);

    const entries = listPublicMatches(mix, 61_000);

    // Exactly one survivor: the single (public, filling) cell.
    expect(entries).toHaveLength(1);
    expect(entries[0]?.matchId).toBe(mix[0]?.matchId);
    expect(entries[0]?.visibility).toBe('public');
  });

  it('FR-005 / Q1: private matches never appear regardless of status', () => {
    const privates = ALL_STATUSES.map((status) => makeMatch('private', status));

    expect(listPublicMatches(privates, 61_000)).toEqual([]);
  });

  it('FR-005: running/finished/collected public matches never appear (not joinable)', () => {
    const unjoinable = ALL_STATUSES.filter((s) => s !== 'filling').map((status) =>
      makeMatch('public', status),
    );

    expect(listPublicMatches(unjoinable, 61_000)).toEqual([]);
  });

  it('FR-005: preserves insertion order across the surviving entries', () => {
    const first = makeMatch('public', 'filling');
    const blocked = makeMatch('private', 'filling');
    const second = makeMatch('public', 'filling');

    const entries = listPublicMatches([first, blocked, second], 61_000);

    expect(entries.map((e) => e.matchId)).toEqual([first.matchId, second.matchId]);
  });
});

describe('listPublicMatches — mutation snapshot (US2 AC-3 / SC-003)', () => {
  it('FR-005: rebuilds the array on every call — no shared/cached snapshot', () => {
    const match = makeMatch('public', 'filling');

    const first = listPublicMatches([match], 61_000);
    const second = listPublicMatches([match], 61_000);

    expect(first).not.toBe(second); // fresh array identity per call
    expect(first).toEqual(second); // …with equal contents absent mutations
  });

  it('FR-005 / SC-003: seat occupancy reflects the live seats.size at projection time', () => {
    const match = makeMatch('public', 'filling');

    const before = listPublicMatches([match], 61_000);
    expect(before[0]?.seatsFilled).toBe(1);

    // Mutate the record BETWEEN calls — the next projection must see it.
    match.seats.set(
      1 as SeatIndex,
      createSeatRecord({
        seatIndex: 1 as SeatIndex,
        playerSessionId: nextId('session') as PlayerSessionId,
        displayName: 'Joiner',
        sessionToken: nextId('token') as SessionToken,
        playerId: null,
        connectedAtMs: 2_000,
      }),
    );

    const after = listPublicMatches([match], 62_000);
    expect(after[0]?.seatsFilled).toBe(2);
  });

  it('FR-005 / SC-003: a record transitioning filling → running drops out on the next call', () => {
    const match = makeMatch('public', 'filling');

    const before = listPublicMatches([match], 61_000);
    expect(before).toHaveLength(1);

    match.status = 'running';

    expect(listPublicMatches([match], 62_000)).toEqual([]);
  });
});
