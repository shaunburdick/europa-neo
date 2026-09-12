/**
 * Visibility Horizon — Feature 002, US1 (T027)
 *
 * `computeVisibleSet` is the core of the fog package: given a `World`
 * snapshot and a player, it returns every cell within Chebyshev range
 * `visibilityRadius` of ANY of that player's troop stacks.
 *
 * Identity resolution (spec v1.5 FR-010, issue #74): the caller passes
 * a universal 12-character `PlayerId` string. The engine stores owners
 * as private **1-based dense bytes** (`0` = neutral, `k` = the player
 * at registry index `k - 1`), so fog resolves the public ID through
 * `world.playerRegistry` *before* any visibility computation and never
 * compares a string to a raw byte. Unknown, forged, malformed, or
 * numeric IDs resolve to `null` and **fail closed** — an empty visible
 * set is returned, never a fallback seat, index `0`, or coercion. The
 * same authority rule is applied by `computePlayerView`.
 *
 * Algorithm (per `research.md` §1 and `contracts/fog-api.ts` JSDoc):
 *   1. Resolve `player` → 1-based owner byte via the world registry.
 *   2. Iterate `world.state.troopOwners` row-major (y outer, x inner);
 *      collect viewers where `troopOwners[i] === ownerByte &&
 *      troopCounts[i] > 0`. Cities do NOT project vision (spec US1
 *      Edge Case "city ownership") — vision derives from troop
 *      presence only.
 *   3. Allocate a fresh binary `FogMask` (zero-init) per call — the
 *      no-memory rule (spec FR-004 / US2): nothing survives between
 *      calls, so previously seen cells can never leak into the output.
 *   4. For each viewer, mark every cell within Chebyshev range using
 *      the engine's `cellsInRange` (bounds-clipped, row-major order).
 *   5. Iterate the mask row-major and emit each marked cell's `Coord`.
 *
 * Determinism (spec FR-007): identical `(world, player,
 * visibilityRadius)` produces byte-identical output. Row-major
 * iteration everywhere; integer-only math; no wall-clock, no PRNG,
 * no Set/Map iteration in the output path (constitution Principle II).
 *
 * Signature conforms to feature 001's `engine-to-fog.ts`
 * `computeVisibleSet` declaration (structurally assignable; verified
 * by `tests/conformance.test.ts`). The parameter is accepted as
 * optional so callers may omit it, in which case the match config's
 * `visibilityRadius` is used (falling back to
 * `FOG_CONSTANTS.defaultRadiusFallback` defensively).
 */

import type { Coord, PlayerId, World } from '@europa/engine';
import { cellsInRange } from '@europa/engine';

import { FOG_CONSTANTS } from './constants';
import { createMask, isVisible as isCellMarked } from './mask';
import type { VisibleSet } from './types';

const SIGNED_32_HALF_RANGE = 2 ** 31;
const SIGNED_32_MODULUS = 2 ** 32;

/**
 * Convert a finite number using the same ToInt32 semantics as JavaScript's
 * `value | 0`, without introducing a bitwise-lint exception in this package.
 *
 * @param value The radius to normalize.
 * @returns The signed 32-bit integer represented by `value`.
 */
function toSigned32(value: number): number {
    const truncated = Math.trunc(value);
    const unsigned = ((truncated % SIGNED_32_MODULUS) + SIGNED_32_MODULUS) % SIGNED_32_MODULUS;
    return unsigned >= SIGNED_32_HALF_RANGE ? unsigned - SIGNED_32_MODULUS : unsigned;
}

/**
 * Resolve the effective sensor radius for a world snapshot.
 *
 * Prefers the explicit argument, then the match config's
 * `visibilityRadius` (the engine guarantees it is populated), then
 * the defensive `FOG_CONSTANTS.defaultRadiusFallback`. Radius normalization
 * deliberately uses JavaScript's signed 32-bit conversion (`| 0`), exactly as
 * the engine's `cellsInRange` does. This matters at the signed 32-bit
 * boundaries: for example, `2 ** 31` becomes zero, while values below
 * `-2 ** 31` wrap before the non-negative clamp. Non-finite values convert to
 * zero.
 *
 * @param visibilityRadius Explicit radius from the caller, if any.
 * @param world            The world snapshot (source of the config
 *                         default).
 * @returns A non-negative integer radius.
 */
function resolveRadius(visibilityRadius: number | undefined, world: Readonly<World>): number {
    const raw = visibilityRadius ?? world.config.visibilityRadius ?? FOG_CONSTANTS.defaultRadiusFallback;
    // Keep this conversion equivalent to cellsInRange's `r | 0` without
    // duplicating a bitwise operation that the fog package's lint rejects.
    return Math.max(0, Number.isFinite(raw) ? toSigned32(raw) : 0);
}

/**
 * Resolve a universal `PlayerId` to the engine's private 1-based dense
 * owner byte used by `WorldState.troopOwners` / `WorldState.cityOwners`.
 *
 * This is fog's single audited identity-resolution seam (spec v1.5
 * FR-010, issue #74): every visibility computation routes through the
 * world's authoritative `PlayerRegistry`. Fog never compares a
 * `PlayerId` string to a raw owner byte, never infers an index from
 * array position or seat, and never coerces a numeric value.
 *
 * An unknown, forged, malformed, or numeric ID is *not* registered, so
 * the lookup returns `null` and callers fail closed.
 *
 * @param world  The world snapshot whose registry is authoritative.
 * @param player The candidate universal player ID (may be forged or
 *               malformed at runtime).
 * @returns The 1-based dense owner byte, or `null` when the ID is not
 *          a registered canonical player.
 */
export function resolvePlayerOwnerByte(world: Readonly<World>, player: PlayerId): number | null {
    const index = world.playerRegistry.indexOfId(player);
    return index === null ? null : index + 1;
}

/**
 * Compute the per-player `VisibleSet` for one tick. Pure.
 *
 * The result is the union of the Chebyshev disks (radius
 * `visibilityRadius`) centered on every troop stack owned by
 * `player` with `troopCount > 0`. Cells are emitted in row-major
 * order with no duplicates. Destroyed stacks (`troopCount === 0`)
 * project nothing; cities alone project nothing (spec US1 Edge
 * Cases).
 *
 * Fail-closed identity rule (spec v1.5 FR-010): `player` is resolved
 * through the world's authoritative `PlayerRegistry` **before** any
 * board scan. An unknown, forged, malformed, or numeric ID yields an
 * empty `visibleCells` list — never a fallback seat or index `0`, and
 * never hidden state. A registered ID that simply has no troops sees
 * the same empty set through the ordinary horizon rule.
 *
 * JSDoc references: FR-001 (per-player visible set from troop
 * positions), FR-007 (deterministic), FR-008 (uniform radius),
 * FR-010 (authoritative resolution), US1 AC-1 (lone stack horizon),
 * US1 AC-2 (multi-stack union).
 *
 * @param world            The current `World` snapshot (from
 *                         `tick()`).
 * @param player           The universal player ID whose visibility is
 *                         computed.
 * @param visibilityRadius Sensor radius in cells (Chebyshev).
 *                         Optional; defaults to
 *                         `world.config.visibilityRadius`.
 * @returns A `VisibleSet` containing every cell visible to `player`
 *         this tick, row-major, no duplicates (empty when the ID is
 *         not registered).
 */
export function computeVisibleSet(world: Readonly<World>, player: PlayerId, visibilityRadius?: number): VisibleSet {
    const { width, height } = world.board;

    // Resolve the universal ID through the authoritative engine
    // registry BEFORE any visibility computation. Unknown/forged/
    // malformed/numeric -> fail closed with no cells and no seat
    // fallback (spec FR-010).
    const ownerByte = resolvePlayerOwnerByte(world, player);
    if (ownerByte === null) {
        return { player, tick: world.tick, visibleCells: [] };
    }

    const radius = resolveRadius(visibilityRadius, world);

    // Fresh zero-init mask per call — the structural no-memory rule
    // (FR-004): there is no recall state anywhere in the pipeline.
    const mask = createMask(width, height);
    const { troopCounts, troopOwners } = world.state;

    // Pass 1 — mark horizons. Row-major scan over owners; each viewer
    // stamps its bounds-clipped Chebyshev disk into the shared mask.
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if ((troopOwners[idx] ?? 0) !== ownerByte) {
                continue;
            }
            if ((troopCounts[idx] ?? 0) <= 0) {
                continue;
            }
            const cells = cellsInRange(world, { x, y }, radius);
            for (const cell of cells) {
                mask.data[cell.y * width + cell.x] = FOG_CONSTANTS.maskVisible;
            }
        }
    }

    // Pass 2 — collect marks row-major. Duplicate-free by
    // construction (each flat index is visited exactly once).
    const visibleCells: Coord[] = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (isCellMarked(mask, x, y)) {
                visibleCells.push({ x, y });
            }
        }
    }

    return { player, tick: world.tick, visibleCells };
}
