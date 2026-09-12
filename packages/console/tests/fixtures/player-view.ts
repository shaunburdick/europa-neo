/**
 * PlayerView / ConsoleState test fixtures — Feature 005 (T034).
 *
 * Deterministic builders used by unit, integration, component, and
 * a11y suites (quickstart.md Q-U06). Kept dependency-light: only
 * console src modules + upstream types.
 *
 * JSDoc reference: data-model.md §17 (test invariants; the
 * determinism test T083 consumes {@link scriptedTick}).
 */

import { parsePlayerId } from '@europa/core';

import { INITIAL_CONSOLE_STATE, reduce } from '../../src/state/reducer';
import type {
    CellView,
    ConsoleState,
    Coord,
    Direction,
    MatchConfig,
    PlayerAction,
    PlayerId,
    PlayerView,
    ReducerEffect,
    ReservesPct,
    TickEvents,
} from '../../src/state/types';

/**
 * Canonical deterministic test identities (issue #74). Exact 12-char
 * `[A-Za-z0-9_-]` values so every fixture exercises the real canonical
 * validator; engine/console code never accepts a numeric identity.
 */
export const TEST_PLAYER_1: PlayerId = parsePlayerId('TestPlayer01');
export const TEST_PLAYER_2: PlayerId = parsePlayerId('TestPlayer02');
export const TEST_PLAYER_3: PlayerId = parsePlayerId('TestPlayer03');
export const TEST_PLAYER_4: PlayerId = parsePlayerId('TestPlayer04');

/** Arguments for {@link buildCellView}; everything has a sane default. */
export interface BuildCellViewArgs {
    readonly coord: Coord;
    /** Elevation 0..255. Default 0. */
    readonly elevation?: number;
    /** Terrain classification. Default 'land'. */
    readonly terrain?: 'land' | 'water';
    /** Troop count. Default 0. */
    readonly troops?: number;
    /** Troop owner. Default `null`. */
    readonly owner?: PlayerId | null;
    /** Whether the cell is a city. Default `false`. */
    readonly isCity?: boolean;
    /** City owner. Defaults to `owner` when `isCity`, else `null`. */
    readonly cityOwner?: PlayerId | null;
    /** Active pipe directions. Default empty set. */
    readonly pipes?: ReadonlySet<Direction>;
    /** Reserves percentage 0..9. Default 0. */
    readonly reservesPct?: ReservesPct;
}

/**
 * Build an engine `CellView` (fog read-view shape). Pure.
 */
export function buildCellView(args: BuildCellViewArgs): CellView {
    return {
        coord: args.coord,
        cell: {
            x: args.coord.x,
            y: args.coord.y,
            elevation: args.elevation ?? 0,
            terrain: args.terrain ?? 'land',
        },
        troopCount: args.troops ?? 0,
        troopOwner: args.owner ?? null,
        pipes: args.pipes ?? new Set<Direction>(),
        reservesPercent: args.reservesPct ?? 0,
        cityOwner: args.cityOwner ?? (args.isCity === true ? (args.owner ?? null) : null),
    };
}

/** Arguments for {@link buildPlayerView}. */
export interface BuildPlayerViewArgs {
    /** Board width in cells (drives `config.boardSize`). */
    readonly width: number;
    /** Board height in cells (defensive; engine boards are square). */
    readonly height?: number;
    /** Visible cells (the fog-filtered set). Default empty. */
    readonly visibleCells?: readonly CellView[];
    /** View tick. Default 0. */
    readonly tick?: number;
    /** Owning player of this view. Default {@link TEST_PLAYER_1}. */
    readonly playerId?: PlayerId;
    /** Player identities in placement-slot order. Default the first two. */
    readonly playerIds?: readonly PlayerId[];
    /** Match seed for the embedded MatchConfig. Default 0. */
    readonly seed?: number;
    /** Tick events block. Default: all-empty events. */
    readonly tickEvents?: TickEvents;
}

/**
 * Build a fog-filtered `PlayerView` for tests. The embedded
 * `MatchConfig` uses neutral defaults (250 ms ticks, seed 0, sensor
 * radius 2) unless overridden — fields the console reads but never
 * mutates. Pure.
 */
export function buildPlayerView(args: BuildPlayerViewArgs): PlayerView {
    const config: MatchConfig = {
        boardSize: args.width,
        playerIds: args.playerIds ?? [TEST_PLAYER_1, TEST_PLAYER_2],
        tickIntervalMs: 250,
        seed: args.seed ?? 0,
        visibilityRadius: 2,
    };
    const emptyEvents: TickEvents = {
        combat: [],
        captures: [],
        eliminations: [],
        appliedOrders: [],
        errors: [],
    };
    return {
        player: args.playerId ?? TEST_PLAYER_1,
        tick: args.tick ?? 0,
        visibleCells: args.visibleCells ?? [],
        events: args.tickEvents ?? emptyEvents,
        config,
    };
}

/** Result triple of {@link scriptedTick}. */
export interface ScriptedTickResult {
    readonly view: PlayerView;
    readonly state: ConsoleState;
    readonly effects: readonly ReducerEffect[];
}

/**
 * Seed a live console state around `view` (status 'live', input
 * enabled, seated as the view's owner) without dispatching anything.
 * The US2/US3 input suites start from this shape so gesture handlers
 * see an issuable match. Pure.
 *
 * @param view The fog-filtered view the console should hold.
 */
export function createLiveConsoleState(view: PlayerView): ConsoleState {
    return {
        ...INITIAL_CONSOLE_STATE,
        status: 'live',
        inputEnabled: true,
        latestView: view,
        session: { ...INITIAL_CONSOLE_STATE.session, playerId: view.player },
    };
}

/**
 * Apply a scripted action to a scripted view: seeds a live console
 * state (status 'live', seated as the view's owner) with `view` as
 * the latest applied view, dispatches `action` at `nowMs`, and
 * returns the resulting view + state + effects triple. Used by the
 * determinism suite (T083) and reducer-focused integration tests.
 * Pure.
 */
export function scriptedTick(view: PlayerView, action: PlayerAction, nowMs: number): ScriptedTickResult {
    const seeded: ConsoleState = {
        ...INITIAL_CONSOLE_STATE,
        status: 'live',
        inputEnabled: true,
        latestView: view,
        session: { ...INITIAL_CONSOLE_STATE.session, playerId: view.player },
    };
    const reduced = reduce(seeded, action, { nowMs });
    return { view, state: reduced.state, effects: reduced.effects };
}
