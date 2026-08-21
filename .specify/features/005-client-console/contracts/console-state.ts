/**
 * Console Reducer / Pure State Machine — Feature 005
 *
 * The console's state is a single immutable `ConsoleState` value
 * (declared in `console-types.ts`) advanced by a pure reducer:
 *
 *     next = reduce(state, action)
 *
 * The reducer takes a `ConsoleAction` (either a `PlayerAction` or a
 * `NetEvent` from the network layer) and returns the next state.
 *
 * Why a pure reducer?
 *   - Testable without a browser. Unit tests feed actions in and
 *     assert on the produced state. (Constitution Principle III:
 *     tested game logic.)
 *   - Deterministic. The state machine is the only source of state
 *     transitions; side effects (WebSocket send, sound, DOM update)
 *     are layered on top in the *runtime* (`console-runtime.ts`),
 *     not in the reducer.
 *   - Time-travel-friendly. The reducer's `(state, action) => state`
 *     shape makes undo / replay / debug logging trivial.
 *
 * Consumers of this file:
 *   - The console package's runtime, which subscribes to incoming
 *     network events and player actions, dispatches them through
 *     the reducer, and publishes the resulting state to the renderer.
 *   - Tests, which exercise the reducer directly.
 *
 * =============================================================================
 * CONFORMANCE TO UPSTREAM FEATURES
 * =============================================================================
 *
 * The reducer reads `PlayerView` (fog), `World` (engine), and
 * `ConnectionState` (networking) but does NOT mutate any of them.
 * All output is the console's own `ConsoleState` plus side-effect
 * descriptors (see `ReducerEffect`).
 *
 * =============================================================================
 * DETERMINISM
 * =============================================================================
 *
 * Per constitution Principle II, the console is non-authoritative —
 * it never simulates. The reducer's only job is to fold network
 * events and player gestures into UI state.
 *
 * The reducer IS allowed to use `performance.now()` (or, in tests,
 * a `nowMs` clock passed via the `ReduceOptions` bag) to stamp
 * "when did this happen" metadata. This is a UI timing concern,
 * not a simulation concern; the engine's ticks remain the source
 * of truth for game time.
 *
 * =============================================================================
 * SIDE EFFECTS
 * =============================================================================
 *
 * The reducer returns a `ReducerEffect` union describing any
 * side effects the runtime should perform (send an order over the
 * WebSocket, play a sound, persist a setting, scroll the canvas).
 * This keeps the reducer pure while letting the runtime react.
 *
 * Tests assert on the resulting `ConsoleState` AND on the
 * `ReducerEffect` (typically: "given this PlayerAction, the
 * reducer produced an effect of kind 'sendOrder' with this Order
 * shape").
 */

import type {
  ActionId,
  CameraState,
  CellRenderInfo,
  ConsoleSession,
  ConsoleState,
  FeedbackMessage,
  MapEffect,
  MapLabel,
  PlayerAction,
  QoLSettings,
  RejectedOrder,
} from './console-types';

import type {
  CellView,
  Coord,
  Direction,
  Order,
  OrderAckPayload,
  PlayerId,
  ReservesPct,
  TickEvents,
  ValidationError,
  World,
} from '@europa/engine';

import type { PlayerView } from '@europa/fog';

import type {
  ConnectionState,
  ErrorCode,
  MatchId,
  NetworkPayload,
  ProtocolEnvelope,
  SessionToken,
  TickBroadcastPayload,
} from '@europa/networking';

// ----------------------------------------------------------------------------
// Branded action id
// ----------------------------------------------------------------------------

/**
 * Internal: the next action id to stamp. Console-internal counter;
 * distinct from networking's `SequenceNumber` (the runtime maps
 * `ActionId` → `SequenceNumber` at the network boundary).
 */
export type { ActionId } from './console-types';

// ----------------------------------------------------------------------------
// Net events (what the network adapter hands to the reducer)
// ----------------------------------------------------------------------------

/**
 * Discriminated union of every event the network adapter can hand
 * to the reducer. Each variant maps to a `MessageKind` from
 * feature 004 (`network-types.ts`).
 *
 * The reducer is the single point where wire events become state
 * transitions. New wire messages = new variants here, never new
 * state fields.
 */
export type NetEvent =
  | { readonly kind: 'connecting'; readonly matchId: MatchId }
  | { readonly kind: 'helloAck'; readonly connectionId: string; readonly heartbeatIntervalMs: number }
  | {
      readonly kind: 'joined';
      readonly sessionToken: SessionToken;
      readonly playerId: PlayerId;
      readonly view: PlayerView;
      readonly players: ReadonlyArray<import('@europa/engine').Player>;
    }
  | { readonly kind: 'reconnected'; readonly view: PlayerView }
  | { readonly kind: 'tick'; readonly view: PlayerView }
  | { readonly kind: 'orderAck'; readonly actionId: ActionId; readonly result: OrderAckPayload['result'] }
  | { readonly kind: 'terminal'; readonly result: import('@europa/engine').MatchResult }
  | { readonly kind: 'pong'; readonly clientTimeMs: number; readonly serverTimeMs: number }
  | {
      readonly kind: 'error';
      readonly code: ErrorCode;
      readonly message: string;
    }
  | { readonly kind: 'socketClosed'; readonly code: number; readonly reason: string }
  | { readonly kind: 'reconnecting'; readonly attempt: number; readonly nextRetryMs: number };

/**
 * Discriminated union of every action the reducer accepts. Combines
 * `PlayerAction` (from the input layer) with `NetEvent` (from the
 * network layer). The runtime dispatches one of these per user /
 * network event.
 */
export type ConsoleAction = PlayerAction | NetEvent;

// ----------------------------------------------------------------------------
// Reducer effect (side effects the runtime should perform)
// ----------------------------------------------------------------------------

/**
 * Side effects the reducer asks the runtime to perform. The reducer
 * is pure; the runtime interprets these effects and applies them
 * (e.g., `sendOrder` → call `client.sendOrder(order)`).
 *
 * Effects are returned in addition to (not instead of) the next
 * state. The runtime applies the state first, then runs the
 * effects.
 */
export type ReducerEffect =
  /** Send an `Order` over the WebSocket. The runtime maps it to a `OrderSubmissionPayload`. */
  | { readonly kind: 'sendOrder'; readonly actionId: ActionId; readonly order: Order }
  /** Play a UI sound. The runtime looks up the asset by `clip`. */
  | { readonly kind: 'playSound'; readonly clip: SoundClip }
  /** Persist a QoL setting change to the host's `localStorage` (via `ConsoleConfig.persist`). */
  | { readonly kind: 'persistQol'; readonly settings: QoLSettings }
  /** Trigger the surrender confirmation modal. The runtime opens the modal; on confirm, dispatches a `surrender` PlayerAction. */
  | { readonly kind: 'requestSurrenderConfirm' }
  /** Open the connection-error modal (for `error` codes that are not recoverable). */
  | { readonly kind: 'showErrorModal'; readonly title: string; readonly body: string }
  /** Announce a message to screen readers via an aria-live region. */
  | { readonly kind: 'announce'; readonly text: string; readonly politeness: 'polite' | 'assertive' }
  /** Schedule an auto-reconnect (runtime drives the timer). */
  | { readonly kind: 'scheduleReconnect'; readonly delayMs: number };

/** UI sound clip identifiers. The runtime maps these to bundled `.ogg` / `.wav` files. */
export type SoundClip =
  | 'pipe_toggle'
  | 'pipe_exclusive'
  | 'clear_pipes'
  | 'paratroop_launch'
  | 'paratroop_land'
  | 'gun_fire'
  | 'reserve_set'
  | 'combat'
  | 'capture'
  | 'error';

// ----------------------------------------------------------------------------
// Reducer
// ----------------------------------------------------------------------------

/**
 * Options bag passed to `reduce`. Lets tests inject a deterministic
 * clock (`nowMs`) and lets the runtime pass the current
 * monotonic-clock reading.
 */
export interface ReduceOptions {
  /** Monotonic epoch ms (e.g., `performance.now()` or test fixture). */
  readonly nowMs: number;
  /**
   * Optional RNG seed for any randomized UX behavior (e.g., a
   * random sound delay). Default: deterministic, no RNG.
   * (Reserved for future use; the v1 reducer uses no randomness.)
   */
  readonly rngSeed?: number;
}

/**
 * The reduce function. Pure. Given the current state, an action,
 * and an options bag, returns the next state + a list of side
 * effects.
 *
 * @param state Current `ConsoleState`. May be `null` for the very
 *              first call (the runtime seeds it from
 *              `INITIAL_CONSOLE_STATE` before the first dispatch).
 * @param action A `PlayerAction` (from input) or a `NetEvent` (from
 *               the network adapter).
 * @param options Clock + RNG injection.
 */
export declare function reduce(
  state: ConsoleState,
  action: ConsoleAction,
  options: ReduceOptions,
): { readonly state: ConsoleState; readonly effects: ReadonlyArray<ReducerEffect> };

/**
 * The initial console state. Used by the runtime before the first
 * `reduce` call. Exposed so tests can compare against it.
 */
export declare const INITIAL_CONSOLE_STATE: ConsoleState;

// ----------------------------------------------------------------------------
// Pure helpers (also exposed for unit testing)
// ----------------------------------------------------------------------------

/**
 * Translate a `PlayerAction` into an engine `Order` + the
 * `playerId` who issues it. Returns `null` for actions that do
 * not produce an order (e.g., `selectCell`, `setCamera`).
 *
 * Pure. The reducer calls this; tests can also call it directly.
 *
 * @param action The player action.
 * @param playerId The local player id (used to stamp the `Order`).
 * @param session The current `ConsoleSession` (used to validate
 *                that the action is legal in the current state).
 */
export declare function actionToOrder(
  action: PlayerAction,
  playerId: PlayerId,
  session: ConsoleSession,
): Order | null;

/**
 * Compute the input layer's "exclusive pipe" mode. Returns `true`
 * when the next primary-button pipe click should produce
 * `OrderSetPipesExclusive` (replacing all pipes) rather than
 * `OrderSetPipe` (toggle).
 *
 * Sources (any of):
 *   - Alt key is currently held
 *   - Middle mouse button is the active pointer
 *   - `ConsoleState.exclusiveMode` was toggled on by hotkey
 */
export declare function computeExclusiveMode(input: {
  readonly altKey: boolean;
  readonly button: 'left' | 'middle' | 'right';
  readonly explicitToggle: boolean;
}): boolean;

/**
 * Build a `MapView` snapshot from a `PlayerView` + view state.
 * Pure. The runtime calls this on every tick; the renderer reads
 * the result.
 *
 * @param view Latest `PlayerView` from the server.
 * @param camera Current camera state (zoom + pan).
 * @param hover Current hover cell (or null).
 * @param selection Current selection cell (or null).
 * @param exclusiveMode Whether exclusive-pipe mode is active.
 * @param prevView Previous `MapView` (for `changedThisTick`
 *                 computation). May be `null` on the first call.
 */
export declare function buildMapView(args: {
  readonly id: import('./console-types').MapViewId;
  readonly view: PlayerView;
  readonly camera: CameraState;
  readonly hover: Coord | null;
  readonly selection: Coord | null;
  readonly exclusiveMode: boolean;
  readonly prevView: import('./console-types').MapView;
  readonly nowMs: number;
}): import('./console-types').MapView;

/**
 * Compute per-cell `changedThisTick` flags by diffing the latest
 * `PlayerView`'s `visibleCells` against the previous view's cell
 * map. Used by `buildMapView`; exposed for tests so diffing can be
 * unit-tested in isolation.
 *
 * Pure. O(n) over visible cells.
 */
export declare function diffCellChanges(
  prev: ReadonlyMap<string, CellRenderInfo>,
  next: ReadonlyMap<string, CellRenderInfo>,
): ReadonlySet<string>;

/**
 * Convert a `CellView` (engine type) to a `CellRenderInfo`
 * (console type). Pure. The map for `MapView.cells` is built by
 * calling this on every `visibleCell` in the latest `PlayerView`.
 */
export declare function cellViewToRenderInfo(cell: CellView): CellRenderInfo;

/**
 * Build a `MapEffect` from an engine `TickEvents` entry. Returns
 * `null` for events that don't translate to an effect (e.g., a
 * combat event in a cell the player can no longer see).
 */
export declare function eventToEffect(
  event: TickEvents['combat'][number] | TickEvents['captures'][number] | TickEvents['eliminations'][number],
  options: { readonly nowMs: number; readonly tick: number },
): MapEffect | null;

/**
 * Append a feedback message to the queue, evicting expired ones.
 * Pure (modulo the `nowMs` clock).
 */
export declare function appendFeedback(
  current: ReadonlyArray<FeedbackMessage>,
  message: Omit<FeedbackMessage, 'id' | 'createdAtMs'>,
  nowMs: number,
): ReadonlyArray<FeedbackMessage>;

/**
 * Record a rejected order. Pure. Caps the history at the most
 * recent N (default 10) entries.
 */
export declare function appendRejection(
  current: ReadonlyArray<RejectedOrder>,
  rejection: Omit<RejectedOrder, 'atMs'>,
  nowMs: number,
): ReadonlyArray<RejectedOrder>;

/**
 * Coords are used as map keys. This builds the canonical string
 * key. Branded type or just string? Just string — keyed map is
 * the simplest correct option.
 */
export declare function coordKey(coord: Coord): string;
export declare function keyToCoord(key: string): Coord;

// ----------------------------------------------------------------------------
// Subcell targeting implementation (per spec US3)
// ----------------------------------------------------------------------------

/**
 * Subcell targeting implementation. The cursor position within a
 * cell (0..1 on each axis) is bucketed into one of 5 bins per axis
 * (width 0.2 each), giving a 5×5 mini-grid aligned with the
 * source cell. The center cell (0.5, 0.5) means "self" (no
 * paratroop launch).
 *
 * The algorithm matches the original Europa behavior:
 *   - 0.00 ≤ x < 0.20 → dx = -2
 *   - 0.20 ≤ x < 0.40 → dx = -1
 *   - 0.40 ≤ x < 0.60 → dx =  0
 *   - 0.60 ≤ x < 0.80 → dx = +1
 *   - 0.80 ≤ x < 1.00 → dx = +2
 *   (same for y, with 0 = north)
 *
 * Pure. Exposed as part of the contract surface because both the
 * reducer and the input layer call it; putting it in the
 * `console-state.ts` module keeps the function beside the rest
 * of the pure logic.
 */
export declare function subcellToOffset(subcell: { readonly x: number; readonly y: number }): {
  readonly dx: number;
  readonly dy: number;
};

/**
 * Validate a paratroop/gun order against the local view (range,
 * water, ownership). Pure. Returns `null` if the order would be
 * accepted; returns a `ValidationError` if it would be rejected.
 *
 * **Important**: this is a local preflight only. The server is
 * final authority (spec FR-006). The console MUST still send the
 * order if the local check passes; the server's `OrderAck` is the
 * tiebreaker.
 *
 * The local preflight exists for:
 *   - UX (don't accept an obviously-bogus click)
 *   - Spec US3 AC-3 ("client clamps/rejects locally before sending
 *     for out-of-range targets")
 *   - Saving the network round-trip when the order is guaranteed
 *     to be rejected.
 *
 * It does NOT replicate the engine's full validation logic; only
 * the rules that can be checked from the `PlayerView` alone
 * (range, water, ownership, source-troops-present, reserves
 * percent in range).
 */
export declare function localPreflightOrder(
  order: Order,
  view: PlayerView,
  playerId: PlayerId,
): ValidationError | null;

/**
 * Format a transient HUD message for an order action. Pure. The
 * reducer calls this when a `PlayerAction` produces an order so
 * the player gets a "Sent: pipe N at (5, 7)" confirmation. The
 * message is shown for ~2 seconds.
 */
export declare function formatActionConfirmation(action: PlayerAction, cell: Coord): string;

/**
 * Format a transient HUD message for an order rejection. Pure.
 * Translates a `ValidationError` to a human-readable string
 * suitable for screen readers (no jargon).
 */
export declare function formatRejection(reason: ValidationError): string;

// ----------------------------------------------------------------------------
// Re-exports
// ----------------------------------------------------------------------------

/**
 * Re-export the console types the reducer surface depends on. Most
 * consumers of this file want `ConsoleAction` and `ReducerEffect`;
 * the `PlayerAction` re-export is here for symmetry.
 */
export type {
  CellView,
  Coord,
  Direction,
  Order,
  PlayerId,
  ReservesPct,
  ValidationError,
  World,
  PlayerView,
  ConnectionState,
  ErrorCode,
  MatchId,
  SessionToken,
  NetworkPayload,
  ProtocolEnvelope,
  TickBroadcastPayload,
};
