/**
 * City Symmetry — Feature 003
 *
 * Enforces 180° rotational symmetry on the city placement
 * (FR-004 / INV-9). For each city, computes its 180°-rotated
 * partner coord and assigns it to the appropriate opposite player.
 *
 * **Player mapping**:
 *
 *   - 2 players: P1 ↔ P2 (top ↔ bottom).
 *   - 4 players: P1 ↔ P4 (diagonally opposite quadrants: TL ↔ BR).
 *     P2 ↔ P3 (TR ↔ BL).
 *   - 3 players: P1 ↔ P3 (top ↔ bottom); P2 is self-symmetric
 *     (the middle band is its own 180° partner, so P2's cities
 *     mirror to themselves).
 *
 * **Symmetry-by-construction**: the function does NOT check that
 * the input is symmetric. It builds the symmetric output by
 * construction: for each input city, the partner coord is added
 * to the output (with the appropriate owner). This guarantees the
 * output is exactly 180°-rotationally symmetric — no post-hoc
 * verification is needed.
 */

import type { Coord, PlayerId } from './contracts/terrain-types';

interface InputCity {
  readonly cell: Coord;
  readonly owner: PlayerId;
}

interface OutputCity {
  readonly cell: Coord;
  readonly owner: PlayerId;
}

/**
 * Map a player to their 180°-rotational partner.
 *   - 2p: P1 ↔ P2.
 *   - 4p: P1 ↔ P4, P2 ↔ P3.
 *   - 3p: P1 ↔ P3, P2 ↔ P2 (self).
 */
function partnerPlayer(p: PlayerId, playerCount: 2 | 3 | 4): PlayerId {
  if (playerCount === 2) {
    return p === 1 ? 2 : 1;
  }
  if (playerCount === 3) {
    if (p === 1) return 3;
    if (p === 3) return 1;
    return 2; // P2 is self-symmetric
  }
  // playerCount === 4
  if (p === 1) return 4;
  if (p === 2) return 3;
  if (p === 3) return 2;
  return 1;
}

/**
 * Enforce 180° rotational symmetry on the city placement.
 *
 * For each input city (cell, owner), the 180°-rotated partner
 * `(width-1-x, height-1-y)` is added to the output, owned by
 * `partnerPlayer(owner, playerCount)`. The original city is also
 * included.
 *
 * @param placed      Cities placed per band (one entry per city,
 *                    already grouped by player via the caller).
 * @param width       Board width.
 * @param height      Board height.
 * @param playerCount Player count (2, 3, or 4).
 * @returns A flat list of cities, exactly 180°-rotationally
 *          symmetric.
 */
export function enforceCitySymmetry(
  placed: ReadonlyArray<InputCity>,
  width: number,
  height: number,
  playerCount: 2 | 3 | 4,
): ReadonlyArray<OutputCity> {
  // Build a lookup for dedup: if the input already contains a city
  // at the partner coord with the partner owner, we don't add a
  // duplicate. This handles the case where the caller placed
  // cities for multiple players and the partners are already there.
  const lookupKey = (cell: Coord, owner: PlayerId): string =>
    `${String(cell.x)},${String(cell.y)},${String(owner)}`;
  const existing = new Set<string>();
  for (const city of placed) {
    existing.add(lookupKey(city.cell, city.owner));
  }
  const out: OutputCity[] = [...placed];
  for (const city of placed) {
    // Compute the partner coord and owner.
    const partnerX = width - 1 - city.cell.x;
    const partnerY = height - 1 - city.cell.y;
    const partnerOwner = partnerPlayer(city.owner, playerCount);
    // If the partner is the same cell and same owner (e.g., center
    // cell of an odd-sized board for a self-symmetric player),
    // skip the duplicate to avoid double-counting.
    if (partnerX === city.cell.x && partnerY === city.cell.y && partnerOwner === city.owner) {
      continue;
    }
    // If the partner is already in the input (with the correct
    // owner), skip — no need to add a duplicate.
    if (existing.has(lookupKey({ x: partnerX, y: partnerY }, partnerOwner))) {
      continue;
    }
    out.push({ cell: { x: partnerX, y: partnerY }, owner: partnerOwner });
  }
  return out;
}
