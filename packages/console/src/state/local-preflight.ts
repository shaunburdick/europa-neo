/**
 * Local order preflight — Feature 005 (T026).
 *
 * Client-side sanity check of an `Order` against the local
 * fog-filtered `PlayerView` BEFORE sending it over the wire:
 *   - Paratroop / gun: target within Chebyshev distance ≤ 2 of the
 *     source (`SUBCELL_RANGE`) and on a land cell.
 *   - Pipe orders: source cell is land and owned by the issuing
 *     player.
 *   - Reserves: percent in the engine's 0..9 domain.
 *
 * **This is a UX preflight only** (spec US3 AC-3 + FR-006): it saves
 * an obviously-bogus round-trip; the server remains final authority
 * and a passing preflight never skips the send. It deliberately does
 * NOT replicate the engine's full validation (troop counts at tick
 * time, capture races, etc.).
 *
 * SECURITY-RELEVANT: every branch below must stay exhaustive and
 * fail-closed — an unknown order kind or missing cell data rejects.
 */

import { SUBCELL_RANGE } from '../config';
import type { Coord, Order, PlayerId, PlayerView, ValidationError } from './types';

/**
 * Validate an order against the local view. Returns `null` when the
 * order passes (send it); a `ValidationError` when it would be
 * rejected. Fail-closed on anything inconclusive. Pure.
 *
 * @param order    The order about to be sent.
 * @param view     The latest fog-filtered player view.
 * @param playerId The seated player id issuing the order.
 */
export function localPreflightOrder(
  order: Order,
  view: PlayerView,
  playerId: PlayerId,
): ValidationError | null {
  switch (order.kind) {
    case 'paratroop':
    case 'gun':
      return preflightAttack(order.source, order.target, view);
    case 'setPipe':
    case 'clearPipe':
    case 'setPipesExclusive':
      return preflightPipe(order.cell, view, playerId);
    case 'clearAllPipes':
      return preflightPipe(order.cell, view, playerId);
    case 'setReserves':
      return preflightReserves(order.percent);
    case 'surrender':
      // Always legal to request; the server decides surrender validity
      // (already-surrendered / terminal states are server-side facts).
      return null;
    default: {
      // Exhaustiveness guard: unknown order kinds fail closed.
      const exhaustive: never = order;
      return rejectUnknown(exhaustive);
    }
  }
}

/**
 * Compile-time unreachable sink for unknown order kinds. The
 * never-typed parameter makes any new `Order` variant without an
 * explicit case a compile error; at runtime the branch fails closed
 * with a bounds-shaped rejection.
 */
function rejectUnknown(order: never): ValidationError {
  return { kind: 'out_of_bounds', coord: order };
}

/**
 * Shared attack (paratroop/gun) checks: Chebyshev range and land
 * target. Pure.
 */
function preflightAttack(source: Coord, target: Coord, view: PlayerView): ValidationError | null {
  const distance = chebyshevDistance(source, target);
  if (distance > SUBCELL_RANGE) {
    return { kind: 'paratroop_range', source, target, distance };
  }
  const targetCell = cellAt(view, target);
  if (targetCell === undefined) {
    // Target outside the visibility horizon: cannot confirm it is a
    // legal destination → fail closed rather than leak a guess.
    return { kind: 'out_of_bounds', coord: target };
  }
  if (targetCell.cell.terrain === 'water') {
    return { kind: 'water_target', coord: target };
  }
  return null;
}

/**
 * Shared pipe-order checks: source cell visible, land, and owned by
 * the issuing player. Pure.
 */
function preflightPipe(cell: Coord, view: PlayerView, playerId: PlayerId): ValidationError | null {
  const sourceCell = cellAt(view, cell);
  if (sourceCell === undefined) {
    return { kind: 'out_of_bounds', coord: cell };
  }
  if (sourceCell.cell.terrain === 'water') {
    return { kind: 'water_target', coord: cell };
  }
  if (sourceCell.troopOwner !== playerId) {
    return { kind: 'not_owner', coord: cell };
  }
  return null;
}

/**
 * Reserves percent domain check (engine `ReservesPct` = 0..9). Pure.
 */
function preflightReserves(percent: number): ValidationError | null {
  if (!Number.isInteger(percent) || percent < 0 || percent > 9) {
    return { kind: 'invalid_percent', percent };
  }
  return null;
}

/**
 * Chebyshev distance between two coords (max of axis deltas). Pure.
 */
function chebyshevDistance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Look up a cell in the fog-filtered view by coordinate. Returns
 * `undefined` when the cell is outside the visibility horizon. Pure.
 */
function cellAt(view: PlayerView, coord: Coord): (typeof view)['visibleCells'][number] | undefined {
  return view.visibleCells.find((c) => c.coord.x === coord.x && c.coord.y === coord.y);
}
