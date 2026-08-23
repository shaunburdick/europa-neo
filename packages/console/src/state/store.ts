/**
 * Zustand store glue — Feature 005 (T028).
 *
 * Wraps the pure reducer (T022) in a subscription primitive
 * (research.md §3): the store holds the single immutable
 * `ConsoleState` value and exposes a typed `dispatch` that runs
 * `reduce` and publishes the next state. The renderer subscribes via
 * the returned bound store; the runtime dispatches.
 *
 * The store is the runtime's primary surface. `dispatch` defaults
 * `nowMs` to `performance.now()` — this is THE sanctioned wall-clock
 * boundary for the console UI (the reducer itself stays pure).
 *
 * Effects produced by the reducer are handed to the optional
 * `onEffect` sink AFTER the new state is published (contract ordering:
 * "apply the state first, then run the effects"). Phase 8's runtime
 * wires that sink to the network adapter / sound player / persistence.
 */

import type { StoreApi, UseBoundStore } from 'zustand';
import { create } from 'zustand';

import { INITIAL_CONSOLE_STATE, reduce } from './reducer';
import type { ConsoleAction, ConsoleState, ReduceOptions, ReducerEffect } from './types';

/**
 * A console store: the bound Zustand store over `ConsoleState`, plus
 * the `dispatch` primitive. (Intersection rather than extra state
 * fields keeps the stored value exactly the contractual shape.)
 */
export type ConsoleStore = UseBoundStore<StoreApi<ConsoleState>> & {
  /**
   * Apply an action through the pure reducer and publish the result.
   *
   * @param action Player gesture or network event.
   * @param options Partial reduce options; `nowMs` defaults to
   *                `performance.now()` (sanctioned UI boundary).
   */
  dispatch(action: ConsoleAction, options?: Partial<ReduceOptions>): void;
};

/**
 * Create a console store seeded with `initial`.
 *
 * @param initial Starting state; defaults to {@link INITIAL_CONSOLE_STATE}.
 * @param onEffect Optional sink for reducer effects (`sendOrder`,
 *                 `playSound`, `persistQol`, …). Called once per
 *                 effect, after the new state is published. Defaults
 *                 to a no-op so tests can drive the store standalone.
 * @returns The bound store with an attached {@link ConsoleStore.dispatch}.
 */
export function createConsoleStore(
  initial: ConsoleState = INITIAL_CONSOLE_STATE,
  onEffect: (effect: ReducerEffect) => void = () => undefined,
): ConsoleStore {
  const store: UseBoundStore<StoreApi<ConsoleState>> = create<ConsoleState>()(() => initial);

  /**
   * Dispatch implementation shared by all stores created here.
   * Pure-reducer application + publication + effect hand-off.
   */
  const dispatch = (action: ConsoleAction, options?: Partial<ReduceOptions>): void => {
    const nowMs = options?.nowMs ?? performance.now();
    // exactOptionalPropertyTypes: only carry rngSeed when provided.
    const resolvedOptions: ReduceOptions =
      options?.rngSeed === undefined ? { nowMs } : { nowMs, rngSeed: options.rngSeed };
    const { state: nextState, effects } = reduce(store.getState(), action, resolvedOptions);
    store.setState(nextState);
    for (const effect of effects) {
      onEffect(effect);
    }
  };

  return Object.assign(store, { dispatch });
}
