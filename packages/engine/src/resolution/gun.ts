/**
 * Gun resolution phase — Feature 001, T044
 *
 * Pure `resolveGun(state, board, constants, orders): { state, events, errors }`.
 *
 * Per FR-014, each gun order:
 *   - Spends `constants.gunCost` troops from the source cell.
 *   - Damages `constants.gunDamage` troops from the target cell's
 *     occupants at tick time (regardless of owner — friendly fire
 *     is real per the spec edge case).
 *   - Does NOT move any troops to the destination (gun is a
 *     destruction mechanism, not transport).
 *
 * **Validation rules** (FR-018 surface):
 *   - Target must be in-bounds.
 *   - Source must be owned by the issuing player.
 *   - Source must have ≥ `gunCost` troops (above reserves floor).
 *
 * **Friendly fire**: the damage is applied regardless of whether the
 * target's owner matches the source's player. The implementation
 * doesn't care about ownership when subtracting troops.
 *
 * **Determinism** (FR-017 + constitution Principle II):
 *   - Pure: input is never mutated.
 *   - Integer math only (`>>> 0`).
 *   - Order of operations is fixed.
 *
 * **Errors vs events**: invalid orders are returned in the `errors`
 * array (with the typed `ValidationError` reason per FR-018); valid
 * orders mutate state and emit no dedicated events (the
 * `AppliedOrderRecord` in `tick.ts` covers "order applied" semantics).
 */

import type { EngineConstants } from '../contracts/engine-api';
import { emptyTickEvents } from '../events';
import type { Board, Order, TickEvents, ValidationError, WorldState } from '../types';

interface GunResolutionResult {
    state: WorldState;
    events: TickEvents;
    errors: ReadonlyArray<{ order: Order; reason: ValidationError }>;
}

/**
 * Resolve one tick's gun orders. Pure.
 *
 * @param state     Current world state (NOT mutated).
 * @param board     Board (used only for dimensions; cells are not read
 *                  since guns don't care about terrain type).
 * @param constants Engine rule constants. `gunCost` is the source-side
 *                  cost per shot; `gunDamage` is the target-side damage
 *                  per shot.
 * @param orders    The staged gun orders to apply. Other order kinds
 *                  are silently ignored.
 * @returns `{ state, events, errors }`.
 */
export function resolveGun(
    state: Readonly<WorldState>,
    board: Readonly<Board>,
    constants: EngineConstants,
    orders: readonly Order[],
): GunResolutionResult {
    // Lazy allocation: only allocate fresh typed arrays when an order
    // actually modifies state. This preserves input `state` reference
    // when no gun orders apply (and for white-box tests).
    let newCounts: Uint32Array | null = null;
    let newOwners: Uint8Array | null = null;

    const errors: Array<{ order: Order; reason: ValidationError }> = [];

    const w = board.width;
    void board.height; // explicit read for parity with other resolvers
    const gunCost = constants.gunCost >>> 0;
    const gunDamage = constants.gunDamage >>> 0;

    for (const order of orders) {
        if (order.kind !== 'gun') {
            continue; // ignore non-gun orders
        }

        const sourceCoord = order.source;
        const targetCoord = order.target;

        // In-bounds checks.
        if (
            !Number.isInteger(sourceCoord.x) ||
            !Number.isInteger(sourceCoord.y) ||
            sourceCoord.x < 0 ||
            sourceCoord.x >= w ||
            sourceCoord.y < 0 ||
            sourceCoord.y >= board.height
        ) {
            errors.push({ order, reason: { kind: 'out_of_bounds', coord: sourceCoord } });
            continue;
        }
        if (
            !Number.isInteger(targetCoord.x) ||
            !Number.isInteger(targetCoord.y) ||
            targetCoord.x < 0 ||
            targetCoord.x >= w ||
            targetCoord.y < 0 ||
            targetCoord.y >= board.height
        ) {
            errors.push({ order, reason: { kind: 'out_of_bounds', coord: targetCoord } });
            continue;
        }

        const sourceIdx = sourceCoord.y * w + sourceCoord.x;
        const targetIdx = targetCoord.y * w + targetCoord.x;

        // Ownership check: source must be owned by player.
        const sourceOwner = newOwners === null ? (state.troopOwners[sourceIdx] ?? 0) : (newOwners[sourceIdx] ?? 0);
        if (sourceOwner !== order.player) {
            errors.push({ order, reason: { kind: 'not_owner', coord: sourceCoord } });
            continue;
        }

        // Source insufficient: must have ≥ gunCost troops above reserves floor.
        const sourceCount = newCounts === null ? (state.troopCounts[sourceIdx] ?? 0) : (newCounts[sourceIdx] ?? 0);
        const reservesPct = (state.reservesPct[sourceIdx] ?? 0) >>> 0;
        const floor = computeReservesFloor(sourceCount, reservesPct);
        const usableAboveFloor = (sourceCount - floor) >>> 0;
        if (usableAboveFloor < gunCost) {
            errors.push({ order, reason: { kind: 'no_source_troops', coord: sourceCoord } });
            continue;
        }

        // Lazily allocate fresh arrays on the first valid order.
        if (newCounts === null) {
            newCounts = new Uint32Array(state.troopCounts);
        }
        if (newOwners === null) {
            newOwners = new Uint8Array(state.troopOwners);
        }

        // Apply: subtract gunCost from source, subtract gunDamage from target.
        const newSourceCount = sourceCount - gunCost;
        newCounts[sourceIdx] = newSourceCount;
        if (newSourceCount === 0) {
            newOwners[sourceIdx] = 0;
        }

        const targetCount = newCounts[targetIdx] ?? 0;
        if (targetCount > 0) {
            const damage = gunDamage < targetCount ? gunDamage : targetCount;
            const newTargetCount = targetCount - damage;
            newCounts[targetIdx] = newTargetCount;
            if (newTargetCount === 0) {
                // Target's count hit zero → owner becomes 0.
                newOwners[targetIdx] = 0;
            }
            // Otherwise owner unchanged (friendly fire: ownership persists).
        }
        // Target was empty: no damage applied (still spends source troops).
    }

    // If no order modified state, return input reference unchanged.
    if (newCounts === null) {
        return { state, events: emptyTickEvents(), errors };
    }

    return {
        state: {
            troopCounts: newCounts,
            troopOwners: newOwners as Uint8Array,
            pipeMasks: new Uint8Array(state.pipeMasks),
            reservesPct: new Uint8Array(state.reservesPct),
            cityOwners: new Uint8Array(state.cityOwners),
        },
        events: emptyTickEvents(),
        errors,
    };
}

/**
 * Compute the reserves floor for a given count and reserves percentage
 * (0..9) using the current-count interpretation (matches resolveDecay's
 * fallback). See resolveDecay.ts for full documentation.
 */
function computeReservesFloor(count: number, reserves: number): number {
    if (count <= 0) {
        return 0;
    }
    if (reserves <= 0) {
        return 0;
    }
    if (reserves >= 10) {
        return count;
    }
    const flowable = Math.floor((count * (10 - reserves)) / 10);
    return count - flowable;
}
