/**
 * Deterministic 1000-tick scenario — Feature 005 (T090).
 *
 * Shared by the determinism suite
 * (`tests/integration/determinism.test.ts`) and the golden-fixture
 * generator (`scripts/generate-determinism-golden.ts`). Drives the
 * REAL pipeline per tick — `tick` NetEvent → reducer → scripted
 * PlayerAction → reducer → `buildMapView` — with:
 *
 *   - a fixed clock (`nowMs = tick * 250`) so label/effect expiry
 *     stamps are reproducible;
 *   - pure arithmetic content (no randomness anywhere);
 *   - a small fog cluster (~8 cells) so the committed golden fixture
 *     stays reviewable in a diff.
 *
 * SC-002: "Rendered output matches the authoritative PlayerView for
 * 1,000 consecutive ticks in a scripted match (zero divergence)."
 */

import { buildMapView } from '../../src/state/build-map-view';
import { INITIAL_CONSOLE_STATE, reduce } from '../../src/state/reducer';
import type {
  CellView,
  ConsoleState,
  Direction,
  MapView,
  MapViewId,
  PlayerAction,
  PlayerView,
  ReservesPct,
} from '../../src/state/types';

/** Board edge length for the scripted match. */
export const SCENARIO_BOARD_SIZE = 16;

/** Total number of scripted ticks (spec SC-002 mandates 1,000). */
export const SCENARIO_TICKS = 1000;

/** Fixed clock step: one view per engine tick interval. */
export const SCENARIO_TICK_MS = 250;

/** Pipe directions cycled by the scripted pipe action. */
const PIPE_DIRECTIONS: ReadonlyArray<Direction> = ['N', 'E', 'S', 'W'];

/**
 * The visible fog cluster: P1-owned cells first (pipe/reserves
 * targets), then contested/neutral/enemy cells exercising owner
 * colors, cities, water, and elevation shading. Pure data.
 */
const CLUSTER: ReadonlyArray<{
  readonly coord: { readonly x: number; readonly y: number };
  readonly elevation: number;
  readonly terrain: 'land' | 'water';
  readonly troops: number;
  readonly owner: 1 | 2 | null;
  readonly isCity: boolean;
}> = [
  { coord: { x: 3, y: 8 }, elevation: 40, terrain: 'land', troops: 32, owner: 1, isCity: true },
  { coord: { x: 4, y: 8 }, elevation: 60, terrain: 'land', troops: 12, owner: 1, isCity: false },
  { coord: { x: 3, y: 9 }, elevation: 0, terrain: 'water', troops: 0, owner: null, isCity: false },
  { coord: { x: 4, y: 9 }, elevation: 10, terrain: 'land', troops: 5, owner: 2, isCity: false },
  { coord: { x: 3, y: 10 }, elevation: 90, terrain: 'land', troops: 21, owner: 1, isCity: false },
  { coord: { x: 4, y: 10 }, elevation: 180, terrain: 'land', troops: 18, owner: 2, isCity: true },
  { coord: { x: 3, y: 11 }, elevation: 70, terrain: 'land', troops: 0, owner: null, isCity: false },
  { coord: { x: 4, y: 11 }, elevation: 80, terrain: 'land', troops: 2, owner: 1, isCity: false },
];

/** Pipes present at tick 0 (the tick-1 diff has something to clear). */
const INITIAL_PIPES: ReadonlyArray<{ readonly x: number; readonly y: number }> = [{ x: 3, y: 8 }];

/**
 * Build the authoritative `PlayerView` for one scripted tick. Pure.
 *
 * Determinism notes: reserves on P1-owned cells drift with
 * `(tick / 10) % 10`, troop counts pulse with `tick % 7`, and every
 * 50th tick carries a combat event at (4, 9) so the effect pipeline
 * runs. All arithmetic — no randomness.
 *
 * @param tick Scripted tick number (1-based).
 */
export function buildScenarioView(tick: number): PlayerView {
  const drift = Math.floor(tick / 10) % 10;
  const pulse = tick % 7;
  const visibleCells: CellView[] = CLUSTER.map((entry) => ({
    coord: entry.coord,
    cell: {
      x: entry.coord.x,
      y: entry.coord.y,
      elevation: entry.elevation,
      terrain: entry.terrain,
    },
    troopCount: entry.owner === null ? 0 : entry.troops + pulse,
    troopOwner: entry.owner,
    pipes: new Set(
      INITIAL_PIPES.some((p) => p.x === entry.coord.x && p.y === entry.coord.y)
        ? (['N'] as Direction[])
        : [],
    ),
    reservesPercent: (entry.owner === 1 ? drift : 0) as ReservesPct,
    cityOwner: entry.isCity ? entry.owner : null,
  }));
  return {
    player: 1,
    tick,
    visibleCells,
    events:
      tick % 50 === 0
        ? {
            combat: [{ at: { x: 4, y: 9 }, attacker: 1, defender: 2 }],
            captures: [],
            eliminations: [],
            appliedOrders: [],
            errors: [],
          }
        : { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
    config: {
      boardSize: SCENARIO_BOARD_SIZE,
      playerCount: 2,
      tickIntervalMs: SCENARIO_TICK_MS,
      seed: 0,
      visibilityRadius: 2,
    },
  };
}

/**
 * The scripted player gesture for one tick. Cycles through pipe set,
 * reserves set, pipe clear-all, selection, camera pan, and single
 * pipe clear so every order-producing + local-only reducer branch
 * runs under the fixed clock. Pure.
 *
 * @param tick Scripted tick number (1-based).
 */
export function buildScenarioAction(tick: number): PlayerAction {
  switch (tick % 6) {
    case 0:
      return {
        kind: 'setPipe',
        cell: { x: 3, y: 8 },
        direction: PIPE_DIRECTIONS[tick % 4] ?? 'N',
      };
    case 1:
      return { kind: 'setReserves', cell: { x: 4, y: 8 }, percent: (tick % 10) as ReservesPct };
    case 2:
      return { kind: 'clearAllPipes', cell: { x: 3, y: 8 } };
    case 3:
      return {
        kind: 'selectCell',
        cell: { x: tick % SCENARIO_BOARD_SIZE, y: tick % SCENARIO_BOARD_SIZE },
      };
    case 4:
      return {
        kind: 'setCamera',
        camera: {
          zoom: 32,
          pan: { x: (tick % 5) * 2, y: (tick % 4) * 2 },
          minZoom: 12,
          maxZoom: 96,
        },
      };
    default:
      return { kind: 'clearPipe', cell: { x: 3, y: 8 }, direction: 'N' };
  }
}

/** Serializable snapshot of one frame (Sets/Maps flattened, stable order). */
export interface SerializedMapView {
  readonly id: string;
  readonly tick: number;
  readonly width: number;
  readonly height: number;
  readonly cells: ReadonlyArray<{
    readonly key: string;
    readonly coord: { readonly x: number; readonly y: number };
    readonly elevation: number;
    readonly terrain: string;
    readonly troops: number;
    readonly owner: number | null;
    readonly isCity: boolean;
    readonly cityOwner: number | null;
    readonly pipes: ReadonlyArray<string>;
    readonly reservesPct: number;
    readonly changedThisTick: boolean;
  }>;
  readonly playerColors: Readonly<Record<string, string>>;
  readonly effects: ReadonlyArray<{
    readonly kind: string;
    readonly cell: { readonly x: number; readonly y: number };
    readonly otherCell: { readonly x: number; readonly y: number } | null;
    readonly expiresAtMs: number;
  }>;
  readonly labels: ReadonlyArray<{
    readonly cell: { readonly x: number; readonly y: number };
    readonly text: string;
    readonly expiresAtMs: number;
  }>;
  readonly camera: {
    readonly zoom: number;
    readonly pan: { readonly x: number; readonly y: number };
    readonly minZoom: number;
    readonly maxZoom: number;
  };
  readonly hover: { readonly x: number; readonly y: number } | null;
  readonly selection: { readonly x: number; readonly y: number } | null;
  readonly exclusiveMode: boolean;
}

/** Serializable snapshot of the final ConsoleState. */
export interface SerializedConsoleState {
  readonly status: string;
  readonly inputEnabled: boolean;
  readonly exclusiveMode: boolean;
  readonly tick: number | null;
  readonly session: {
    readonly matchId: string | null;
    readonly sessionToken: string | null;
    readonly playerId: number | null;
    readonly displayName: string;
    readonly opponents: ReadonlyArray<string>;
  };
  readonly feedbackCount: number;
  readonly rejectedOrders: ReadonlyArray<{
    readonly actionId: number;
    readonly reason: string;
    readonly atTick: number;
  }>;
}

/**
 * Flatten a `MapView` into JSON-stable data with sorted keys so the
 * golden fixture diffs cleanly and byte-compare is meaningful. Pure.
 */
export function serializeMapView(mapView: MapView): SerializedMapView {
  return {
    id: mapView.id,
    tick: mapView.tick,
    width: mapView.width,
    height: mapView.height,
    cells: [...mapView.cells.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, info]) => ({
        key,
        coord: info.coord,
        elevation: info.elevation,
        terrain: info.terrain,
        troops: info.troops,
        owner: info.owner,
        isCity: info.isCity,
        cityOwner: info.cityOwner,
        pipes: [...info.pipes].sort(),
        reservesPct: info.reservesPct,
        changedThisTick: info.changedThisTick,
      })),
    playerColors: Object.fromEntries(
      Object.entries(mapView.playerColors).sort(([a], [b]) => a.localeCompare(b)),
    ),
    effects: mapView.effects.map((effect) => ({
      kind: effect.kind,
      cell: effect.cell,
      otherCell: effect.otherCell ?? null,
      expiresAtMs: effect.expiresAtMs,
    })),
    labels: mapView.labels.map((label) => ({
      cell: label.cell,
      text: label.text,
      expiresAtMs: label.expiresAtMs,
    })),
    camera: mapView.camera,
    hover: mapView.hover,
    selection: mapView.selection,
    exclusiveMode: mapView.exclusiveMode,
  };
}

/**
 * Flatten the final `ConsoleState` (volatile views aside) into
 * JSON-stable data. Pure.
 */
export function serializeConsoleState(state: ConsoleState): SerializedConsoleState {
  return {
    status: state.status,
    inputEnabled: state.inputEnabled,
    exclusiveMode: state.exclusiveMode,
    tick: state.latestView?.tick ?? null,
    session: {
      matchId: state.session.matchId,
      sessionToken: state.session.sessionToken,
      playerId: state.session.playerId,
      displayName: state.session.displayName,
      opponents: state.session.opponents,
    },
    feedbackCount: state.feedback.length,
    rejectedOrders: state.rejectedOrders.map((rejection) => ({
      actionId: rejection.actionId,
      reason: rejection.reason,
      atTick: rejection.atTick,
    })),
  };
}

/** Full run result: one serialized frame per tick plus final state. */
export interface ScenarioRun {
  readonly frames: ReadonlyArray<SerializedMapView>;
  readonly finalState: SerializedConsoleState;
}

/**
 * Run the full 1000-tick scripted scenario through the real pipeline
 * (reducer → buildMapView each tick) and return serializable frames.
 * Deterministic: same code path always produces identical output.
 *
 * The console starts SEEDED LIVE (status 'live', seated as player 1)
 * so the reducer's live-input gate lets the scripted order-producing
 * gestures through — exercising the sendOrder/pending-order/feedback
 * branches, not just local-only ones.
 */
export function runDeterminismScenario(): ScenarioRun {
  let state: ConsoleState = {
    ...INITIAL_CONSOLE_STATE,
    status: 'live',
    inputEnabled: true,
    session: { ...INITIAL_CONSOLE_STATE.session, playerId: 1 },
  };
  let prevFrame: MapView | null = null;
  const frames: SerializedMapView[] = [];

  for (let tick = 1; tick <= SCENARIO_TICKS; tick += 1) {
    const nowMs = tick * SCENARIO_TICK_MS;

    // 1. Authoritative view arrives (wire → NetEvent → reducer).
    const tickStep = reduce(state, { kind: 'tick', view: buildScenarioView(tick) }, { nowMs });
    state = tickStep.state;

    // 2. The scripted player gesture (input → PlayerAction → reducer).
    const actionStep = reduce(state, buildScenarioAction(tick), { nowMs });
    state = actionStep.state;

    // 3. Render derivation (state → MapView), chained for diffs.
    const latestView = state.latestView;
    if (latestView === null) {
      throw new Error(`determinism scenario: latestView missing at tick ${tick}`);
    }
    const frame = buildMapView({
      id: `mv-${tick}` as MapViewId,
      view: latestView,
      camera: state.camera,
      hover: state.hover,
      selection: state.selection,
      exclusiveMode: state.exclusiveMode,
      prevView: prevFrame,
      nowMs,
    });
    frames.push(serializeMapView(frame));
    prevFrame = frame;
  }

  return { frames, finalState: serializeConsoleState(state) };
}
