/**
 * Terminal results assembly — Feature 006 (US4/US5 support)
 *
 * Builds the contract's `MatchResultsRecord` (data-model.md §10) from
 * an engine world snapshot. Shared by exactly two callers so the
 * results shape has one construction site:
 *
 *   - the `onMatchTerminal` bridge handler (US4, engine-reported result)
 *   - the all-players-forfeited teardown (US5 AC-2, `kind: 'cancelled'`)
 *
 * `finalBoardHash` is a deterministic FNV-1a fold over the final
 * troop + city ownership arrays — stable for identical worlds (SC-001
 * discipline), never used as a simulation input.
 *
 * Display names come from the match's seat records, not from the
 * world: the engine treats names as cosmetic-only and the seats are
 * the source of truth (`engineSession.ts` doc).
 *
 * Pure module: no clock reads, no randomness (constitution Principle II).
 */

import type { PlayerId, World } from '@europa/engine';
import type { MatchId } from '@europa/networking';
import type { MatchResultsRecord } from '../contracts/match-types';
import type { SeatRecord } from './internal/seatRecord';

/** FNV-1a 32-bit offset basis and prime. */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Fold typed-array contents into a 32-bit FNV-1a hash. Deterministic
 * and allocation-light; collisions are acceptable (the hash is
 * informational).
 *
 * @param arrays - Typed arrays to fold, in order.
 * @returns The hash as an 8-char lowercase hex string.
 */
function fnv1aHex(...arrays: ReadonlyArray<ArrayLike<number>>): string {
  let hash = FNV_OFFSET;
  for (const array of arrays) {
    for (let index = 0; index < array.length; index++) {
      hash ^= (array[index] ?? 0) & 0xff;
      hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

/** Args for {@linkcode buildMatchResultsRecord}. */
export interface BuildResultsArgs {
  /** The finished match's id. */
  readonly matchId: MatchId;
  /** The final engine world snapshot. */
  readonly world: World;
  /** Engine terminal result, or the matchmaker's cancelled marker. */
  readonly result: MatchResultsRecord['result'];
  /** Seat records in the match (for display-name resolution). */
  readonly seats: ReadonlyMap<number, SeatRecord>;
}

/**
 * Assemble the terminal `MatchResultsRecord` for a finished or
 * cancelled match (FR-008): effective seed from the world, per-player
 * standings in seat order with display names resolved from seats, and
 * a deterministic final-board hash.
 *
 * @param args - Match identity, final world, terminal result, seats.
 * @returns The frozen-shape results record ready to store.
 */
export function buildMatchResultsRecord(args: BuildResultsArgs): MatchResultsRecord {
  const { matchId, result, seats, world } = args;

  const finalPlayers = [...seats.values()]
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((seat) => {
      const player = world.players[seat.seatIndex];
      return {
        id: (seat.playerId ?? ((seat.seatIndex + 1) as PlayerId)) as PlayerId,
        displayName: seat.displayName,
        status: player?.status ?? 'eliminated',
        finalTroops: player?.troopsHeld ?? 0,
        finalCities: player?.citiesOwned ?? 0,
      };
    });

  return {
    matchId,
    tick: world.tick,
    effectiveSeed: world.rngSeed,
    result,
    finalBoardHash: fnv1aHex(world.state.troopCounts, world.state.cityOwners),
    finalPlayers,
  };
}
