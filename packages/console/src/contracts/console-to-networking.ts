/**
 * Console ↔ Networking boundary — Feature 005 ↔ Feature 004.
 *
 * The console's network adapter wraps feature 004's `MatchClient`
 * (`network-api.ts`) and translates between:
 *   - `PlayerAction` (console-internal) ↔ `Order` (engine-internal)
 *   - `NetEvent` (console-internal) ← `NetworkPayload` (wire envelope)
 *
 * Boundary rule: the console owns the user-facing surface; networking
 * owns the wire surface. The console does NOT touch WebSocket
 * frames directly; it talks to the `MatchClient` via its
 * `sendOrder` / `onMessage` / `state` surface.
 *
 * ----------------------------------------------------------------------------
 * Data flow at the network boundary
 * ----------------------------------------------------------------------------
 *
 *   console input layer
 *   ┌─────────────────────────────────────────────┐
 *   │  reduce(state, playerAction)                │
 *   │  effects: [{ kind: 'sendOrder', order }]    │
 *   └─────────────────┬───────────────────────────┘
 *                     │
 *                     ▼
 *   runtime
 *   ┌─────────────────────────────────────────────┐
 *   │  for each effect 'sendOrder':               │
 *   │    actionId = nextActionId()                │
 *   │    client.sendOrder(actionId, order)        │
 *   │  for each incoming envelope:                │
 *   │    consoleAction = netEventFromEnvelope(env)│
 *   │    reduce(state, consoleAction, opts)       │
 *   └─────────────────┬───────────────────────────┘
 *                     │
 *                     ▼
 *   @europa/networking MatchClient (feature 004)
 *
 * ----------------------------------------------------------------------------
 * What the console guarantees to networking
 * ----------------------------------------------------------------------------
 *
 * 1. Every `sendOrder` call is a single `Order` (never an action
 *    that the console hasn't validated). The order may still be
 *    rejected by the engine (per spec FR-006: the engine is final
 *    authority), but it will not be syntactically invalid.
 *
 * 2. The console never holds a WebSocket reference directly. It
 *    owns a `MatchClient` (feature 004 client adapter); the
 *    WebSocket is the adapter's concern.
 *
 * 3. The console respects `ClientState.lastSeenServerSeq` and
 *    surfaces a `reconnecting` status when the adapter reports a
 *    gap.
 *
 * ----------------------------------------------------------------------------
 * What networking guarantees to the console
 * ----------------------------------------------------------------------------
 *
 * 1. The `MatchClient` is a stable handle; reconnect happens
 *    transparently inside the adapter (per feature 004's US2
 *    auto-reconnect story).
 *
 * 2. Every `onMessage` call carries a `ProtocolEnvelope<NetworkPayload>`.
 *    The console narrows on `envelope.type` to produce a
 *    `NetEvent`.
 *
 * 3. The adapter exposes `state()` for the console to surface
 *    the current `ConnectionState` in the UI.
 */

import type { ActionId, NetEvent as _NetEventFromState } from './console-state';

import type { ConsoleConnectionStatus, ConsoleState } from './console-types';

import type {
  ConnectionState,
  ConnectionId,
  ErrorCode,
  MatchId,
  NetworkPayload,
  OrderSubmissionPayload,
  OrderAckPayload,
  ProtocolEnvelope,
  SessionToken,
  SequenceNumber,
  TickBroadcastPayload,
} from '@europa/networking';

import type {
  CommandResult,
  Coord,
  Direction,
  Order,
  PlayerId,
  ReservesPct,
  TickEvents,
  ValidationError,
  World,
} from '@europa/engine';

import type { PlayerView } from '@europa/fog';

// ----------------------------------------------------------------------------
// Re-exports for convenience (avoid deep-import sprawl)
// ----------------------------------------------------------------------------

export type {
  ConnectionId,
  ConnectionState,
  ErrorCode,
  MatchId,
  NetworkPayload,
  OrderSubmissionPayload,
  OrderAckPayload,
  ProtocolEnvelope,
  SessionToken,
  SequenceNumber,
  TickBroadcastPayload,
  CommandResult,
  Coord,
  Direction,
  Order,
  PlayerId,
  ReservesPct,
  TickEvents,
  ValidationError,
  World,
  PlayerView,
};

// ----------------------------------------------------------------------------
// Client config (passed to createConsoleClient)
// ----------------------------------------------------------------------------

/**
 * Configuration for the console's network adapter. The host (the
 * page that embeds the console) provides these; the adapter
 * constructs a `MatchClient` and wires it to the console's
 * reducer.
 *
 * `url` is the WebSocket URL of the feature 004 match server. The
 * default in dev is `ws://localhost:8080`; production hosts point
 * at whatever self-hosted server they run (constitution Principle
 * VII: self-hostable by default).
 *
 * `autoReconnect` is on by default (spec US5 AC-3: "auto-reconnects
 * per feature 004"). The adapter uses feature 004's reconnect
 * story transparently.
 */
export interface ConsoleClientConfig {
  /** WebSocket URL of the match server. */
  readonly url: string;
  /** Display name for this console's player (cosmetic; no auth in v1). */
  readonly displayName: string;
  /**
   * Optional reconnect token from a prior session. If provided,
   * the adapter will call `joinMatch` with `reconnectToken`
   * instead of opening a new seat.
   */
  readonly reconnectToken?: SessionToken;
  /**
   * Optional requested match id. If provided, the adapter joins
   * this match. If omitted, the host must call `joinMatch` later
   * (e.g., after the player picks a match from a lobby).
   */
  readonly matchId?: MatchId;
  /**
   * Optional requested seat. Server picks the lowest open seat
   * if omitted.
   */
  readonly requestedSeat?: number;
  /** Whether to auto-reconnect on socket close. Default `true`. */
  readonly autoReconnect?: boolean;
  /**
   * Verbose logging flag. Default `false`. When `true`, the
   * adapter logs every envelope to the host's `logger` (passed
   * at `createConsoleClient` time).
   */
  readonly verboseLogging?: boolean;
  /**
   * Optional override of the rate-limit hint. The server is the
   * source of truth (`ServerConfig.ordersPerSecond`); this is
   * purely for client-side debouncing of the input layer.
   * Default `10` orders/second (matches feature 004 default).
   */
  readonly clientOrderRatePerSec?: number;
}

/**
 * Default client config (no token, no match id — host must
 * `joinMatch` explicitly). Documented value choices:
 *   - `url: 'ws://localhost:8080'` — the dev default called out in
 *     `ConsoleClientConfig.url`; production hosts override it
 *     (constitution Principle VII: self-hostable by default).
 *   - `displayName: ''` — cosmetic only; the host always supplies
 *     the real player name (empty string keeps the default honest
 *     rather than inventing a placeholder identity).
 *   - `autoReconnect: true` — spec US5 AC-3.
 *   - `verboseLogging: false` — quiet by default.
 *   - `clientOrderRatePerSec: 10` — matches feature 004's default
 *     order rate (and `CONSOLE_CONSTANTS.clientOrderRatePerSec`).
 */
export const DEFAULT_CONSOLE_CLIENT_CONFIG: ConsoleClientConfig = {
  url: 'ws://localhost:8080',
  displayName: '',
  autoReconnect: true,
  verboseLogging: false,
  clientOrderRatePerSec: 10,
};

// ----------------------------------------------------------------------------
// ConsoleClient (the adapter the runtime owns)
// ----------------------------------------------------------------------------

/**
 * The console's network adapter. Created by `createConsoleClient`,
 * owned by the runtime, queried by the renderer for status.
 *
 * Lifecycle:
 *   1. `createConsoleClient(config)` → `ConsoleClient`
 *   2. `client.connect()` → opens the WebSocket, sends `hello`,
 *      awaits `helloAck`.
 *   3. `client.joinMatch()` → sends `joinMatch`, awaits `joinAck`.
 *      After this, the client is receiving `tick` and `orderAck`
 *      envelopes; the runtime dispatches them as `NetEvent`s.
 *   4. `client.sendOrder(actionId, order)` → sends an order. The
 *      runtime awaits the matching `orderAck` to fire feedback.
 *   5. `client.close()` → explicit close; no more envelopes.
 *
 * The adapter is **stateless beyond what feature 004's
 * `MatchClient` provides**. It does not hold its own queue or
 * dedup; those are networking's concerns.
 */
export interface ConsoleClient {
  /** Open the WebSocket and complete the hello handshake. */
  connect(): Promise<void>;
  /**
   * Join (or rejoin) a match. If `config.reconnectToken` was set,
   * the client presents it; otherwise it requests a new seat.
   * Must be called after `connect()` and before `sendOrder()`.
   */
  joinMatch(): Promise<void>;
  /**
   * Submit an `Order` with the console's `ActionId` stamped on it.
   * The server correlates the `OrderAck` by envelope `seq`; the
   * console correlates by `actionId` (mapped to envelope `seq`
   * inside the adapter).
   *
   * Throws if not connected or if the rate limit (client-side
   * debounce) is exceeded.
   */
  sendOrder(actionId: ActionId, order: Order): Promise<void>;
  /**
   * Subscribe to incoming envelopes. The returned function
   * unsubscribes (mirrors feature 004's `onMessage` pattern).
   * Runtime calls this once at construction.
   */
  onEnvelope(handler: (envelope: ProtocolEnvelope<NetworkPayload>) => void): () => void;
  /**
   * Current state snapshot. Drives `ConsoleState.status`.
   */
  state(): ConsoleClientState;
  /**
   * Current session token (after `joinMatch`). Persist this to
   * `localStorage` so the page can offer "reconnect" on reload.
   */
  sessionToken(): SessionToken | null;
  /**
   * Current player id (after `joinMatch`). Null until joined.
   */
  playerId(): PlayerId | null;
  /** Explicit close. After this, no more envelopes. */
  close(): void;
}

/**
 * Snapshot of the adapter's state. Mirrors feature 004's
 * `ClientState` but adds `consoleStatus` (the UI-facing
 * `ConsoleConnectionStatus`).
 */
export interface ConsoleClientState {
  readonly connection: ConnectionState;
  readonly sessionToken: SessionToken | null;
  readonly matchId: MatchId | null;
  readonly playerId: PlayerId | null;
  readonly lastTick: number;
  readonly lastSeenServerSeq: SequenceNumber;
  /**
   * UI-friendly status. Derived from `connection` + the adapter's
   * internal observation of socket-level events. The runtime
   * copies this into `ConsoleState.status`.
   */
  readonly consoleStatus: ConsoleConnectionStatus;
}

/**
 * Factory. Constructs a `ConsoleClient` with the given config.
 * Does NOT connect — call `client.connect()` afterwards.
 *
 * @param config Client config (URL, display name, optional token).
 * @param deps Test seam. The runtime uses real feature 004 deps;
 *             tests inject a `FakeMatchClient` (declared in
 *             `console-api.ts` and implemented in tests).
 */
export declare function createConsoleClient(
  config: ConsoleClientConfig,
  deps?: ConsoleClientDeps,
): ConsoleClient;

/**
 * Optional dependencies for the adapter. Production: omit; the
 * factory constructs a real feature 004 `MatchClient`. Tests:
 * pass a `matchClientFactory` that returns a `FakeMatchClient`.
 */
export interface ConsoleClientDeps {
  /**
   * Factory for the underlying `MatchClient`. Defaults to
   * `createMatchClient` from `@europa/networking`. Exposed for
   * tests so they can inject a fake without booting a real
   * WebSocket server.
   */
  readonly matchClientFactory?: (opts: { readonly autoReconnect?: boolean; readonly verboseLogging?: boolean }) => unknown;
  /**
   * Optional logger. Defaults to a no-op. The runtime can pass
   * `console` for dev logging.
   */
  readonly logger?: import('./console-api').ConsoleLogger;
}

// ----------------------------------------------------------------------------
// Envelope → NetEvent translation
// ----------------------------------------------------------------------------

/**
 * Translate a wire envelope into a console `NetEvent`. Returns
 * `null` for envelopes the console ignores (e.g., a `pong` whose
 * `clientTimeMs` doesn't match a pending `ping`).
 *
 * The runtime calls this on every incoming envelope. Pure — no
 * I/O, no state mutation. The runtime is responsible for stamping
 * the resulting `NetEvent` with a clock reading (it does this
 * when it dispatches to the reducer).
 *
 * @param envelope Incoming wire envelope.
 * @param ctx Context for ack correlation: the runtime's current
 *            `ActionId → SequenceNumber` map and any pending
 *            session metadata.
 */
export declare function netEventFromEnvelope(
  envelope: ProtocolEnvelope<NetworkPayload>,
  ctx: EnvelopeContext,
): _NetEventFromState | null;

/**
 * Context for envelope → NetEvent translation. The runtime builds
 * this from its own bookkeeping:
 *   - `seqToActionId` maps the wire's `SequenceNumber` back to the
 *     console's `ActionId` so order acks correlate correctly.
 *   - `connectedAtMs` is stamped on the first `helloAck` so the
 *     runtime can compute "reconnecting for X ms" durations.
 */
export interface EnvelopeContext {
  /** Reverse map from wire seq → console action id. */
  readonly seqToActionId: ReadonlyMap<SequenceNumber, ActionId>;
  /** The adapter's monotonic connection time (after `helloAck`). */
  readonly connectedAtMs: number;
  /**
   * Latest `PlayerView` the runtime has applied. Used for
   * sanity-checking tick monotonicity (the console drops out-of-
   * order ticks, per spec edge case).
   */
  readonly lastAppliedTick: number;
}

// ----------------------------------------------------------------------------
// Order → wire payload translation
// ----------------------------------------------------------------------------

/**
 * Wrap an `Order` in an `OrderSubmissionPayload` and stamp the
 * envelope with a fresh `SequenceNumber`. The adapter calls this
 * before sending; the runtime does not see it directly.
 *
 * @internal — exported for tests.
 */
export declare function buildOrderEnvelope(
  order: Order,
  nextSeq: SequenceNumber,
): ProtocolEnvelope<OrderSubmissionPayload>;

/**
 * Map a `OrderAck` payload to a console `NetEvent` of kind
 * `orderAck`. The runtime dispatches the resulting event to the
 * reducer. The reducer matches the `actionId` to update feedback
 * ("Sent → Acknowledged" or "Sent → Rejected: out of bounds").
 *
 * @internal — exported for tests.
 */
export declare function netEventFromOrderAck(
  ack: OrderAckPayload,
  actionId: ActionId,
): { readonly kind: 'orderAck'; readonly actionId: ActionId; readonly result: OrderAckPayload['result'] };
