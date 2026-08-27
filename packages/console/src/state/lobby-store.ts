/**
 * Zustand store glue for the lobby layer — feature 010 (T-014).
 *
 * Structural sibling of the match store (`./store.ts`): holds the
 * single immutable {@link LobbyState} value and exposes a typed
 * `dispatch` that runs {@link reduceLobby} and publishes the result.
 * The lobby reducer is clock-free, so — unlike the match store — no
 * reduce options are needed; dispatch is fully deterministic.
 *
 * Commands do not travel through dispatch: lobby actions need
 * per-action promise correlation, which the controller
 * (`./lobby-controller.ts`) owns. Dispatch remains the primitive for
 * transport-event fan-in (the controller's subscriptions) and for
 * tests/wiring that need to drive transitions directly.
 */

import type { StoreApi, UseBoundStore } from 'zustand';
import { create } from 'zustand';

import { INITIAL_LOBBY_STATE, reduceLobby } from './lobby-reducer';
import type { LobbyAction, LobbyState } from './lobby-state';

/**
 * A lobby store: the bound Zustand store over `LobbyState`, plus the
 * `dispatch` primitive. (Intersection rather than extra state fields
 * keeps the stored value exactly the contractual shape — match-store
 * parity.)
 */
export type LobbyStore = UseBoundStore<StoreApi<LobbyState>> & {
    /**
     * Apply an action through the pure reducer and publish the result.
     *
     * @param action Transport event or UI transition.
     */
    dispatch(action: LobbyAction): void;
};

/**
 * Create a lobby store seeded with `initial`.
 *
 * @param initial Starting state; defaults to {@link INITIAL_LOBBY_STATE}.
 * @returns The bound store with an attached {@link LobbyStore.dispatch}.
 */
export function createLobbyStore(initial: LobbyState = INITIAL_LOBBY_STATE): LobbyStore {
    const store: UseBoundStore<StoreApi<LobbyState>> = create<LobbyState>()(() => initial);

    const dispatch = (action: LobbyAction): void => {
        store.setState(reduceLobby(store.getState(), action));
    };

    return Object.assign(store, { dispatch });
}
