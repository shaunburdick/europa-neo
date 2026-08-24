/**
 * Test View Builders — Feature 002
 *
 * Test-only helpers for constructing *expected* `VisibleSet` and
 * `PlayerView` values to compare against the fog package's
 * algorithm output. Mirrors the engine's
 * `packages/engine/tests/fixtures/board.ts` "expected board"
 * pattern (build the expected value, then assert equality).
 *
 * The key builder is `expectedChebyshevDisk(center, r, w, h)`,
 * which produces the same `Coord[]` the fog's `chebyshevDisk`
 * helper produces, so test assertions can compare the
 * algorithm's output against the independent expected
 * derivation without a direct dependency on `chebyshevDisk`
 * itself (DRY-but-verifiable).
 *
 * Also includes:
 *   - `disjointDisks(disk1, disk2)` — asserts two Chebyshev
 *     disks do not overlap, used by Q-F01's multi-stack test
 *     to verify that two friendly stacks in disjoint regions
 *     produce a union whose length equals the sum of the
 *     individual disks.
 *   - `buildExpectedPlayerView(world, player, radius)` —
 *     builds a *reference* `PlayerView` (without going through
 *     `computePlayerView`) using the same row-major iteration
 *     discipline as the impl. Used by conformance-style
 *     tests and Q-F06's determinism check.
 */

import type { CellView, Coord, MatchConfig, PlayerId, TickEvents, World } from '@europa/engine';

import { chebyshevDisk, chebyshevDistance } from '../../src/range';
import type { PlayerView, VisibleSet } from '../../src/types';

/**
 * Return the row-major `Coord[]` of all cells within Chebyshev
 * range `r` of `center`, bounds-clipped to `width × height`.
 * Pure integer math; identical to `chebyshevDisk` so test
 * assertions can be DRY but still detect drift.
 *
 * Re-exported from the `src/range` module (not reimplemented)
 * so a future change to the canonical helper is automatically
 * reflected in test expectations. The two functions MUST remain
 * equivalent; the contract test in Wave 5B Polish
 * (T039/contracts-drift) enforces this at the type level.
 *
 * @param center The viewer's `(x, y)`. MUST be in-bounds.
 * @param r      Non-negative integer radius.
 * @param width  Board width (cells).
 * @param height Board height (cells).
 * @returns Row-major `Coord[]` of all in-bounds cells within
 *         Chebyshev distance `r` of `center`.
 */
export function expectedChebyshevDisk(
  center: Coord,
  r: number,
  width: number,
  height: number,
): Coord[] {
  return chebyshevDisk(center, r, width, height);
}

/**
 * Assert that two `Coord[]` Chebyshev disks do not share any
 * cell. Used by the multi-stack test in Q-F01 to verify that
 * two friendly stacks in disjoint regions produce a union
 * whose length equals the sum of the individual disks (i.e.,
 * the union is a clean sum with no overlap).
 *
 * Pure boolean; throws a descriptive error on overlap so test
 * failures are easy to diagnose.
 *
 * @param disk1 First disk (a `Coord[]`).
 * @param disk2 Second disk (a `Coord[]`).
 * @returns `true` iff the two disks are disjoint.
 * @throws If the disks share any cell (a programmer error in
 *         the test setup, not a fog-package bug).
 */
export function disjointDisks(disk1: readonly Coord[], disk2: readonly Coord[]): boolean {
  const set1 = new Set<number>();
  for (const c of disk1) {
    set1.add(c.y * 1_000_000 + c.x);
  }
  for (const c of disk2) {
    if (set1.has(c.y * 1_000_000 + c.x)) {
      throw new Error(`disjointDisks: disks overlap at [${c.x}, ${c.y}] — test setup error`);
    }
  }
  return true;
}

/**
 * Build an expected `VisibleSet` for a single friendly stack
 * at `center` with Chebyshev radius `r`. Convenience helper
 * for the lone-stack Q-F01 test.
 *
 * @param world    The world (used only to extract `width` /
 *                 `height` and `tick`).
 * @param player   The friendly player. Echoed into the result.
 * @param center   The viewer's `(x, y)`.
 * @param r        The Chebyshev radius.
 * @returns A `VisibleSet` with the expected cells in row-major
 *         order.
 */
export function expectedSingleStackView(
  world: Readonly<World>,
  player: PlayerId,
  center: Coord,
  r: number,
): VisibleSet {
  return {
    player,
    tick: world.tick,
    visibleCells: expectedChebyshevDisk(center, r, world.board.width, world.board.height),
  };
}

/**
 * Build an *expected* `PlayerView` from a list of `CellView`s
 * (the caller has already decoded them, typically via
 * `getCell`). This is a thin builder that the test owns —
 * the fog package's own `computePlayerView` is what we're
 * testing against. Used by the deterministic-snapshot tests
 * and by US1 AC-3 ("enemy in/out of horizon").
 *
 * The `events` field defaults to the engine's `emptyTickEvents`
 * shape (empty arrays). Pass a populated `TickEvents` if the
 * test expects non-empty events.
 *
 * @param player        The player the view is for.
 * @param tick          The world tick.
 * @param visibleCells  Decoded cells (typically from
 *                      `getCell(world, x, y)`).
 * @param config        Snapshot of `MatchConfig` (echoes
 *                      `world.config`).
 * @param events        Pre-filtered `TickEvents`. Defaults to
 *                      empty (all arrays length 0).
 * @returns A fully-populated `PlayerView` ready for equality
 *         comparison.
 */
export function buildExpectedPlayerView(
  player: PlayerId,
  tick: number,
  visibleCells: readonly CellView[],
  config: Readonly<MatchConfig>,
  events?: Readonly<TickEvents>,
): PlayerView {
  return {
    player,
    tick,
    visibleCells,
    events: events ?? {
      combat: [],
      captures: [],
      eliminations: [],
      appliedOrders: [],
      errors: [],
    },
    config,
  };
}

/**
 * Re-export `chebyshevDistance` for fixture consumers that
 * need to compute distances directly (e.g., for the edge-of-
 * board tests in Q-F08).
 */
export { chebyshevDistance };
