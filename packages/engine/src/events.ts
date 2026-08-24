/**
 * TickEvents Builders — Feature 001
 *
 * Pure, immutable helpers for assembling the `TickEvents` value that
 * `tick()` returns each step. Per `research.md` §7 and the contract's
 * `TickEvents` type, the engine emits a deterministic, replayable list
 * of what happened during resolution; consumers (fog filter, network
 * transport, console renderer) read this stream to drive UI / wire
 * format / visibility diffs.
 *
 * **Why pure builders (no shared mutation)?** Spec FR-017 demands
 * determinism, and `tick()` itself is a pure function returning a new
 * `World`. If event builders mutated shared arrays, two `tick()` calls
 * with the same input could observe each other's events — a sneaky
 * non-determinism. Every helper here returns a new `TickEvents` object
 * with fresh arrays; the input is never touched.
 *
 * The `errors` field carries failed orders (validation rejections);
 * `appliedOrders` carries successful ones. Order of pushes is preserved
 * (last-pushed = last-seen), so resolution order is observable.
 */

import type {
    AppliedOrderRecord,
    CaptureEvent,
    CombatEvent,
    EliminationEvent,
    Order,
    TickEvents,
    ValidationError,
} from './types';

// ----------------------------------------------------------------------------
// Empty container
// ----------------------------------------------------------------------------

/**
 * Construct a fresh, empty `TickEvents` value. Each call returns
 * a NEW object with NEW arrays (no shared references) — essential
 * for purity; two parallel `tick()` calls cannot observe each
 * other's events.
 */
export function emptyTickEvents(): TickEvents {
    return {
        combat: [],
        captures: [],
        eliminations: [],
        appliedOrders: [],
        errors: [],
    };
}

// ----------------------------------------------------------------------------
// Push helpers — all return a new `TickEvents`; inputs are never mutated.
// ----------------------------------------------------------------------------

/**
 * Append a combat resolution event.
 */
export function pushCombatEvent(events: TickEvents, e: CombatEvent): TickEvents {
    return { ...events, combat: [...events.combat, e] };
}

/**
 * Append a cell/city capture event.
 */
export function pushCaptureEvent(events: TickEvents, e: CaptureEvent): TickEvents {
    return { ...events, captures: [...events.captures, e] };
}

/**
 * Append a player elimination event.
 */
export function pushEliminationEvent(events: TickEvents, e: EliminationEvent): TickEvents {
    return { ...events, eliminations: [...events.eliminations, e] };
}

/**
 * Append a successfully applied order (or its validation error, for
 * records where the same field carries both — see `AppliedOrderRecord`).
 */
export function pushAppliedOrder(events: TickEvents, r: AppliedOrderRecord): TickEvents {
    return { ...events, appliedOrders: [...events.appliedOrders, r] };
}

/**
 * Append a failed order with its validation reason. `errors` is the
 * catch-all for FR-018 validation rejections that don't fall into the
 * combat/capture/elimination categories.
 */
export function pushError(events: TickEvents, e: { order: Order; reason: ValidationError }): TickEvents {
    return { ...events, errors: [...events.errors, e] };
}
