/**
 * Paratroop resolution phase — Feature 001, T043
 *
 * Pure `resolveParatroop(state, board, constants, orders, registry,
 * tickNumber): { state, events, errors, successfulOrderIndices }`.
 *
 * Per FR-013, each paratroop order:
 *   - Spends `2 × N` troops from the source cell, where `N` is the
 *     paratroop count per order (modeled by `constants.paratroopCost`).
 *   - Resolves the landing against the target's state at that moment:
 *     neutral/same-owner targets gain `N` (clamped to `cellCapacity`);
 *     enemy-held targets resolve as 1:1 attrition combat
 *     (`resolveTwoWayAttrition`) and emit a `CombatEvent`.
 *   - Clears the destination cell's `pipeMasks` (FR-013 — paratroopers
 *     break enemy pipes) regardless of combat outcome.
 *   - Range ≤ 2 Chebyshev (validated via `validateCommand`).
 *   - Target must be land and in-bounds; enemy-held targets are valid
 *     (validate.ts checks terrain, range, source ownership, and the
 *     source's reserves floor — never target ownership).
 *
 * **Reserves invariant**: the source cell must have ≥ `2 × N` troops
 * ABOVE its reserves floor. Spending 2 × N troops that would push the
 * count below the floor is rejected (the cell still needs to be able
 * to feed itself).
 *
 * **Determinism** (FR-017 + constitution Principle II):
 *   - Pure function: input is never mutated.
 *   - Integer math only (`>>> 0`).
 *   - Order of operations is fixed: validate each order, then apply
 *     all valid orders in the supplied sequence, so sequential landings
 *     on one target resolve against whatever the previous landing left.
 *
 * **Errors vs events**: invalid orders are returned in the `errors`
 * array (with the typed `ValidationError` reason per FR-018). Valid
 * orders mutate the state; enemy landings additionally emit a
 * `CombatEvent`, while neutral/same-owner landings emit nothing — the
 * `AppliedOrderRecord` in `tick.ts` covers the "order was applied"
 * semantics for both. The terminal/elimination phase is the source of
 * `EliminationEvent` emissions, not this module.
 */

import type { EngineConstants } from '../contracts/engine-api';
import { emptyTickEvents, pushCombatEvent } from '../events';
import type { PlayerRegistry } from '../playerRegistry';
import type { Board, Order, TickEvents, ValidationError, WorldState } from '../types';
import { resolveTwoWayAttrition } from './attrition';

const PARATROOP_MAX_RANGE = 2;

/**
 * Resolve one tick's paratroop orders. Pure.
 *
 * @param state     Current world state (NOT mutated).
 * @param board     Board (used for terrain lookup on target).
 * @param constants Engine rule constants. `paratroopCost` is N — the
 *                  number of paratroopers per order. Source loses 2N,
 *                  target gains N (FR-013 2:1 ratio).
 * @param orders    The staged paratroop orders to apply. Other order
 *                  kinds are silently ignored (callers filter by kind
 *                  before invoking this resolver).
 * @param registry  ID ↔ dense-index registry; the order's `player` is
 *                  resolved to its 1-based owner byte through it.
 * @param tickNumber Tick number stamped on any `CombatEvent` an enemy
 *                  landing emits.
 * @returns `{ state, events, errors }`. `state` is the post-resolution
 *          world state with new typed arrays (immutable update).
 *          `errors` carries the typed `ValidationError` for every
 *          rejected order (FR-018 surface). `events.combat` carries one
 *          `CombatEvent` per enemy landing; neutral and same-owner
 *          landings emit nothing.
 *          `successfulOrderIndices` identifies successful occurrences in the
 *          supplied order array, rather than relying on object identity.
 */
export function resolveParatroop(
    state: Readonly<WorldState>,
    board: Readonly<Board>,
    constants: EngineConstants,
    orders: readonly Order[],
    registry: PlayerRegistry,
    tickNumber: number,
): {
    state: WorldState;
    events: TickEvents;
    errors: ReadonlyArray<{ order: Order; reason: ValidationError }>;
    successfulOrderIndices: ReadonlyArray<number>;
} {
    // Lazy allocation: only allocate fresh typed arrays when an order
    // actually modifies state. This preserves the input `state`
    // reference when no paratroop orders apply (and for white-box tests
    // that check identity).
    let newCounts: Uint32Array | null = null;
    let newOwners: Uint8Array | null = null;
    let newPipes: Uint8Array | null = null;

    const errors: Array<{ order: Order; reason: ValidationError }> = [];
    const successfulOrderIndices: number[] = [];
    let events: TickEvents = emptyTickEvents();

    const w = board.width;
    void board.height; // height = width for square boards; explicit read for parity

    // N = paratroopCount per order (= constants.paratroopCost).
    // Source spends 2N, target gains N.
    const paratroopN = constants.paratroopCost >>> 0;
    const sourceSpend = Math.imul(paratroopN, 2) >>> 0;

    for (const [orderIndex, order] of orders.entries()) {
        if (order.kind !== 'paratroop') {
            continue; // ignore non-paratroop orders
        }

        const targetCoord = order.target;
        const sourceCoord = order.source;

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

        // Water check.
        const targetCell = board.cells[targetIdx];
        if (targetCell === undefined || targetCell.terrain !== 'land') {
            errors.push({ order, reason: { kind: 'water_target', coord: targetCoord } });
            continue;
        }

        // Range check (Chebyshev distance ≤ 2).
        const dx = Math.abs(targetCoord.x - sourceCoord.x);
        const dy = Math.abs(targetCoord.y - sourceCoord.y);
        const distance = dx > dy ? dx : dy;
        if (distance > PARATROOP_MAX_RANGE) {
            errors.push({
                order,
                reason: { kind: 'paratroop_range', source: sourceCoord, target: targetCoord, distance },
            });
            continue;
        }

        // Lazily allocate fresh arrays on the first valid order.
        if (newCounts === null) {
            newCounts = new Uint32Array(state.troopCounts);
        }
        if (newOwners === null) {
            newOwners = new Uint8Array(state.troopOwners);
        }
        if (newPipes === null) {
            newPipes = new Uint8Array(state.pipeMasks);
        }

        // Ownership check: source must be owned by the issuing player.
        // Resolve the canonical ID to its 0-based dense index.
        const playerIndex = registry.indexOfId(order.player);
        if (playerIndex === null) {
            errors.push({ order, reason: { kind: 'unknown_player', player: order.player } });
            continue;
        }
        const sourceOwner = newOwners[sourceIdx] ?? 0;
        if (sourceOwner !== playerIndex + 1) {
            errors.push({ order, reason: { kind: 'not_owner', coord: sourceCoord } });
            continue;
        }

        // Reserves floor: source must have ≥ 2N troops ABOVE the floor.
        const sourceCount = newCounts[sourceIdx] ?? 0;
        const reservesPct = (state.reservesPct[sourceIdx] ?? 0) >>> 0;
        const floor = computeReservesFloor(sourceCount, reservesPct);
        const usableAboveFloor = (sourceCount - floor) >>> 0;
        if (usableAboveFloor < sourceSpend) {
            errors.push({ order, reason: { kind: 'no_source_troops', coord: sourceCoord } });
            continue;
        }

        // Apply: subtract 2N from source, resolve the landing at the target, clear target pipes.
        const newSourceCount = sourceCount - sourceSpend;
        newCounts[sourceIdx] = newSourceCount;
        if (newSourceCount === 0) {
            newOwners[sourceIdx] = 0;
        }

        const attackerOwner = playerIndex + 1;
        const targetOwner = newOwners[targetIdx] ?? 0;
        const targetCount = newCounts[targetIdx] ?? 0;
        const cap = constants.cellCapacity >>> 0;

        if (targetOwner !== 0 && targetOwner !== attackerOwner) {
            // Enemy-held: the landing is an attack; ownership transfers
            // only if the garrison is eliminated.
            const outcome = resolveTwoWayAttrition({
                attackerOwner,
                attackerTotal: paratroopN,
                defenderOwner: targetOwner,
                defenderTotal: targetCount,
                cellCapacity: cap,
            });
            newCounts[targetIdx] = outcome.winnerCount;
            // No owner write while the garrison survives (winner stays the
            // defender); a tie writes 0.
            if (outcome.winnerOwner !== targetOwner) {
                newOwners[targetIdx] = outcome.winnerOwner;
            }
            events = pushCombatEvent(events, {
                tick: tickNumber,
                cell: { x: targetCoord.x, y: targetCoord.y },
                attacker: registry.requireIdAt(attackerOwner - 1),
                defender: registry.requireIdAt(targetOwner - 1),
                attackerLoss: outcome.damage,
                defenderLoss: outcome.damage,
                winner: outcome.winnerOwner === 0 ? 'tie' : registry.requireIdAt(outcome.winnerOwner - 1),
                attackerTotal: paratroopN,
                defenderTotal: targetCount,
            });
        } else {
            const newTargetCount = targetCount + paratroopN;
            newCounts[targetIdx] = newTargetCount > cap ? cap : newTargetCount;
            newOwners[targetIdx] = attackerOwner;
        }

        // Clear destination pipes (FR-013).
        newPipes[targetIdx] = 0;
        successfulOrderIndices.push(orderIndex);
    }

    // If we made no changes, return the input state unchanged so
    // reference identity is preserved for callers that check no-op.
    if (newCounts === null) {
        return { state, events, errors, successfulOrderIndices };
    }

    return {
        state: {
            troopCounts: newCounts,
            troopOwners: newOwners as Uint8Array,
            pipeMasks: newPipes as Uint8Array,
            reservesPct: new Uint8Array(state.reservesPct),
            cityOwners: new Uint8Array(state.cityOwners),
        },
        events,
        errors,
        successfulOrderIndices,
    };
}

/**
 * Compute the reserves floor for a given count and reserves percentage
 * (0..9) using the current-count interpretation, matching `resolveDecay`'s
 * fallback semantics:
 *   floor = count - floor(count * (10 - reserves) / 10)
 * Edge cases: count ≤ 0 → 0; reserves ≤ 0 → 0; reserves ≥ 10 → count.
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
