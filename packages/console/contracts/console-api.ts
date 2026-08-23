/**
 * Console Public API — Feature 005
 *
 * The single surface an embedding host uses to mount, drive, and
 * tear down the console. Designed to be:
 *   - **Framework-agnostic at the contract layer** — the runtime
 *     may use any UI library (React/Solid/Svelte/vanilla) internally;
 *     the public API only exposes a minimal handle.
 *   - **Deterministic** — the reducer is pure; the renderer derives
 *     from state; the network adapter is a thin wrapper around
 *     feature 004's `MatchClient`.
 *   - **Self-contained** — no external CDN, no analytics, no remote
 *     fonts (constitution Principle VII).
 *   - **Accessible by default** — WCAG 2.2 AA target: keyboard
 *     navigable, screen-reader friendly, visible focus, sufficient
 *     contrast (constitution Principle VI).
 *
 * The embedding flow:
 *
 *   const console = createConsole(config, deps);
 *   console.mount(document.getElementById('root'));
 *   // ... user interacts; runtime drives state + network ...
 *   console.unmount();
 *
 * The host may also subscribe to state changes (for diagnostics,
 * for testing, or for embedding the console in a larger app that
 * wants to mirror some state). Subscriptions are read-only — the
 * host cannot mutate `ConsoleState` directly (immutability is
 * enforced by the readonly fields and by the reducer being the
 * only state-transition function).
 *
 * =============================================================================
 * CONFORMANCE TO UPSTREAM FEATURES
 * =============================================================================
 *
 * The console conforms to:
 *   - feature 001: reads `World` and `CellView`; emits `Order`.
 *   - feature 002: reads `PlayerView` (the only state the renderer
 *     ever sees — fog-filtered).
 *   - feature 003: reads `Board` only for the initial paint before
 *     the first `PlayerView` arrives; never reads it after.
 *   - feature 004: uses `MatchClient` (the client-side adapter
 *     declared in feature 004's `network-api.ts`) for all wire
 *     I/O. The console does NOT own a WebSocket directly.
 *
 * No additive changes to upstream features are required. The
 * console is a leaf consumer.
 */

import type {
  CameraState,
  ConsoleConnectionStatus,
  ConsoleState,
  FeedbackMessage,
  InputMapping,
  MapEffect,
  MapLabel,
  PlayerAction,
  QoLSettings,
} from './console-types';

import type {
  ActionId,
  ConsoleAction,
  ReduceOptions,
  ReducerEffect,
} from './console-state';

import type {
  ConsoleClient,
  ConsoleClientConfig,
  ConsoleClientDeps,
} from './console-to-networking';

import type {
  Coord,
  Direction,
  Order,
  PlayerId,
  ReservesPct,
  World,
} from '@europa/engine';

import type { PlayerView } from '@europa/fog';

import type {
  ConnectionState,
  MatchId,
  SessionToken,
} from '@europa/networking';

// ----------------------------------------------------------------------------
// Re-exports for convenience
// ----------------------------------------------------------------------------

export type {
  CameraState,
  ConsoleConnectionStatus,
  ConsoleState,
  FeedbackMessage,
  InputMapping,
  MapEffect,
  MapLabel,
  PlayerAction,
  QoLSettings,
  ActionId,
  ConsoleAction,
  ReduceOptions,
  ReducerEffect,
  ConsoleClient,
  ConsoleClientConfig,
  ConsoleClientDeps,
  Coord,
  Direction,
  Order,
  PlayerId,
  ReservesPct,
  World,
  PlayerView,
  ConnectionState,
  MatchId,
  SessionToken,
};

// ----------------------------------------------------------------------------
// Console configuration
// ----------------------------------------------------------------------------

/**
 * Console configuration. Required fields are minimal; everything
 * has a sensible default. The host provides a config bag and the
 * factory returns a configured `Console`.
 */
export interface ConsoleConfig {
  /**
   * Where to render. The console mounts a root element inside this
   * container and replaces its contents on every render. The host
   * retains ownership of the container's outer layout.
   */
  readonly container: HTMLElement;
  /**
   * Network client config. The console creates a `MatchClient`
   * internally using these settings.
   */
  readonly client: ConsoleClientConfig;
  /**
   * Optional display name override. Defaults to `client.displayName`.
   */
  readonly displayName?: string;
  /**
   * Optional input mapping override. Defaults to `DEFAULT_INPUT_MAPPING`
   * (the original Europa control set).
   */
  readonly inputMapping?: InputMapping;
  /**
   * Optional QoL settings override. Defaults to `DEFAULT_QOL_SETTINGS`.
   * The console NEVER reads `localStorage` directly; the host is
   * responsible for persisting these. Pass the previously-persisted
   * values back on construction to restore them.
   */
  readonly qolSettings?: QoLSettings;
  /**
   * Optional logger. Defaults to a no-op. Pass `console` for dev.
   * The console never calls `console.*` directly; everything goes
   * through this logger.
   */
  readonly logger?: ConsoleLogger;
  /**
   * Optional persistence callback. The console calls this when a
   * QoL setting changes so the host can write to `localStorage`
   * (or any other store).
   *
   * The console does NOT have a built-in `localStorage` adapter
   * because the host may want to store settings in a server-side
   * profile, in a cookie, or in IndexedDB.
   */
  readonly persist?: (settings: QoLSettings) => void;
  /**
   * Optional feature flags for v1. The defaults satisfy the
   * minimum spec; the flags let the host enable or disable
   * specific QoL features.
   *
   * v1 flag values:
   *   - `sound: true` → enable sound effects (default off per
   *     spec Assumptions; silence is acceptable)
   *   - `touch: false` → touch input is v2 (default off per
   *     spec Assumptions; layout doesn't preclude it)
   *   - `experimentalKeyboardShortcuts: false` → enable any
   *     experimental shortcuts (default off; the original set
   *     is always on)
   */
  readonly features?: ConsoleFeatureFlags;
  /**
   * Optional callback invoked when the user requests surrender.
   * The console emits a `requestSurrenderConfirm` effect from
   * the reducer; the runtime opens a confirm modal; on
   * confirm, the host dispatches `{ kind: 'surrender' }` via
   * `console.dispatch(...)`.
   *
   * Why does the host own the modal? Because the host knows the
   * visual style of the surrounding app. The console ships with
   * a default modal (rendered in the same component tree) but the
   * host can override by handling surrender confirmation
   * entirely on the host side and dispatching the result.
   */
  readonly onSurrenderRequest?: () => void | Promise<void>;
}

/**
 * Feature flags. Defaults: all off (the spec is the minimum
 * surface; flags add opt-in enhancements).
 */
export interface ConsoleFeatureFlags {
  /** Sound effects. Default `false`. */
  readonly sound?: boolean;
  /** Touch input. Default `false` (v2). */
  readonly touch?: boolean;
  /** Experimental keyboard shortcuts beyond the original set. */
  readonly experimentalKeyboardShortcuts?: boolean;
  /**
   * Enable the "demo mode" / replay loader. The console ships
   * with a built-in replay player (for QA and for newcomers to
   * watch recorded matches). Default `false`; the host enables
   * it by passing `replaySource: () => Promise<ReplayTape>`.
   */
  readonly replay?: boolean;
}

// ----------------------------------------------------------------------------
// Logger
// ----------------------------------------------------------------------------

/**
 * Minimal logger interface. The console never calls `console.*`
 * directly; the host provides a logger.
 */
export interface ConsoleLogger {
  debug(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  info(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  warn(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  error(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
}

/** No-op logger. Default if `ConsoleConfig.logger` is omitted. */
export const NULL_LOGGER: ConsoleLogger;

// ----------------------------------------------------------------------------
// The Console handle
// ----------------------------------------------------------------------------

/**
 * The console handle. Returned by `createConsole`. Owns the runtime,
 * the renderer, the input layer, and the network adapter.
 *
 * Lifecycle:
 *   1. `createConsole(config, deps?)` → `Console`
 *   2. `console.mount(container)` → starts the render loop, opens
 *      the WebSocket via the client adapter, dispatches the initial
 *      state.
 *   3. (User interacts / server ticks; runtime drives the reducer.)
 *   4. `console.unmount()` → tears down the render loop, closes
 *      the WebSocket, frees DOM references.
 *
 * After `unmount()`, the handle is unusable. The host should drop
 * the reference.
 */
export interface Console {
  /**
   * Mount the console into a container element. Begins the render
   * loop, opens the WebSocket, and dispatches the initial state.
   * Idempotent: calling twice is a no-op.
   */
  mount(container: HTMLElement): Promise<void>;
  /**
   * Tear down the console. Stops the render loop, closes the
   * WebSocket, and removes all DOM nodes. Idempotent.
   */
  unmount(): Promise<void>;
  /**
   * Subscribe to state changes. The handler is called after every
   * reducer step with the new state. Returns an unsubscribe
   * function.
   *
   * Subscriptions are READ-ONLY: the state passed to the handler
   * is the reducer's output; the host must not mutate it.
   */
  subscribe(handler: (state: ConsoleState) => void): () => void;
  /**
   * Get the current state snapshot. Cheap (returns the cached
   * value, not a deep clone).
   */
  getState(): ConsoleState;
  /**
   * Dispatch a `PlayerAction` to the reducer. Used for programmatic
   * control (e.g., the host's surrender confirm flow dispatches
   * `{ kind: 'surrender' }`).
   *
   * Most actions are dispatched by the input layer; this method is
   * for host-side dispatches only.
   */
  dispatch(action: ConsoleAction): void;
  /**
   * Send a wire `Order` directly. Bypasses the input layer. Used
   * by tests and by the surrender flow (which doesn't fit the
   * pointer/keyboard model).
   *
   * Returns the `ActionId` assigned to this order. The host can
   * correlate with the eventual `orderAck` event by listening
   * via `subscribe`.
   */
  sendOrder(order: Order): ActionId;
  /**
   * Get the session token. Persist this externally (e.g., to
   * `localStorage`) so the page can offer reconnect on reload.
   * Returns `null` if not yet joined.
   */
  getSessionToken(): SessionToken | null;
  /**
   * Get the current player id. Returns `null` if not yet joined.
   */
  getPlayerId(): PlayerId | null;
  /**
   * Get the current connection status (UI-friendly).
   */
  getConnectionStatus(): ConsoleConnectionStatus;
  /**
   * Open a surrender confirmation modal. The host's
   * `onSurrenderRequest` callback is invoked first; if it
   * resolves truthy, the dispatch is sent. If the callback
   * is omitted, the console uses its built-in modal.
   */
  requestSurrender(): Promise<void>;
  /**
   * Update QoL settings programmatically. Equivalent to dispatching
   * a `{ kind: 'setQol', patch }` action. The runtime calls the
   * `persist` callback (if any) to save the new settings.
   */
  setQolSettings(patch: Partial<QoLSettings>): void;
  /**
   * Update the camera (zoom / pan) programmatically. Used by
   * tests and by the host's "reset view" button.
   */
  setCamera(camera: Partial<CameraState>): void;
  /**
   * Open the "demo mode" replay loader. The host provides a
   * `ReplayTape`; the console renders the tape as a sequence
   * of PlayerViews. Available only when `features.replay` is
   * `true` and the host passes a `replaySource` via `deps`.
   *
   * Out of scope for v1 implementation but declared here for
   * forward compatibility.
   */
  loadReplay?(tape: import('./console-replay').ReplayTape): Promise<void>;
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------

/**
 * Construct a `Console` instance. Does NOT mount — call
 * `console.mount(container)` afterwards.
 *
 * @param config Console configuration (container, client, logger, ...).
 * @param deps   Optional dependencies for testing. Production: omit.
 *
 * @example
 * ```ts
 * import { createConsole, NULL_LOGGER } from '@europa/console';
 *
 * const console = createConsole({
 *   container: document.getElementById('root')!,
 *   client: {
 *     url: 'ws://localhost:8080',
 *     displayName: 'Alice',
 *   },
 *   logger: console,
 *   persist: (settings) => localStorage.setItem('qol', JSON.stringify(settings)),
 * });
 *
 * await console.mount(document.getElementById('root')!);
 * // ... user interacts ...
 * await console.unmount();
 * ```
 */
export declare function createConsole(config: ConsoleConfig, deps?: ConsoleDeps): Console;

// ----------------------------------------------------------------------------
// Test seam (optional dependencies)
// ----------------------------------------------------------------------------

/**
 * Optional dependencies the console uses internally. Production:
 * omit. Tests inject fakes to drive the console deterministically.
 *
 * The console's runtime is the only consumer of these dependencies.
 * The renderer / input layer / reducer do not see them; they
 * receive everything through the `ConsoleState` and `PlayerAction`
 * surface.
 */
export interface ConsoleDeps {
  /**
   * Factory for the network adapter. Defaults to
   * `createConsoleClient` from `console-to-networking.ts`. Tests
   * pass a factory that returns a fake client.
   */
  readonly clientFactory?: (config: ConsoleClientConfig, deps?: ConsoleClientDeps) => ConsoleClient;
  /**
   * Factory for the renderer. Defaults to the built-in React
   * renderer. Tests pass a fake that records render calls.
   *
   * Why a factory? The renderer is the only place the UI library
   * choice (React vs Solid vs Svelte) leaks. By making it a
   * factory, the public API is library-agnostic and the
   * implementation can swap renderers without breaking callers.
   */
  readonly rendererFactory?: (config: ConsoleConfig) => ConsoleRenderer;
  /**
   * Factory for the input layer. Defaults to the built-in
   * pointer + keyboard input layer. Tests pass a fake that
   * synthesizes events.
   */
  readonly inputFactory?: (config: ConsoleConfig, runtime: ConsoleRuntime) => ConsoleInput;
  /**
   * Sound player. Defaults to a no-op. Pass a real implementation
   * (HTMLAudioElement wrapper) to enable sound.
   */
  readonly soundPlayer?: ConsoleSoundPlayer;
  /**
   * Clock source. Defaults to `performance.now`. Tests pass a
   * controllable clock.
   */
  readonly clock?: () => number;
}

/**
 * The runtime — the glue between reducer, network, input, and
 * renderer. Created internally by `createConsole`. The factory
 * dependencies return objects that the runtime composes.
 *
 * @internal — declared for tests.
 */
export interface ConsoleRuntime {
  /** Current state. The runtime is the single source of truth. */
  getState(): ConsoleState;
  /**
   * Apply an action to the reducer and run resulting effects
   * (send orders, play sounds, etc.). Used by the input layer
   * and the network adapter.
   */
  apply(action: ConsoleAction): void;
  /**
   * Subscribe to state changes (for the renderer to redraw on
   * every reducer step).
   */
  subscribe(handler: (state: ConsoleState) => void): () => void;
  /**
   * Tear down (called by `console.unmount()`).
   */
  teardown(): Promise<void>;
}

/**
 * Renderer interface. The built-in implementation uses React 19
 * (see `research.md` §1) but the contract is library-agnostic.
 *
 * The renderer receives a DOM element and a runtime; it draws
 * the current state on every state change and tears down on
 * `unmount`.
 */
export interface ConsoleRenderer {
  /** Mount into a container. Begin drawing. */
  mount(container: HTMLElement, runtime: ConsoleRuntime): void;
  /** Tear down. Remove all DOM. */
  unmount(): void;
  /** Optional: re-render on every state change. Default = on. */
  readonly onStateChange?: (handler: (state: ConsoleState) => void) => () => void;
}

/**
 * Input layer interface. The built-in implementation handles
 * pointer + keyboard + (future) touch.
 */
export interface ConsoleInput {
  /** Begin listening for input. */
  start(): void;
  /** Stop listening. */
  stop(): void;
  /** Tear down. Remove all listeners. */
  teardown(): void;
}

/**
 * Sound player interface. The built-in implementation is a
 * thin wrapper over HTMLAudioElement; tests pass a fake.
 */
export interface ConsoleSoundPlayer {
  play(clip: import('./console-state').SoundClip): void;
  setMuted(muted: boolean): void;
}

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

/**
 * Single tunable-constants location for the console (mirror of
 * engine's `ENGINE_CONSTANTS` discipline). Anything the host
 * might want to tweak (default zoom, feedback TTL, label TTL)
 * lives here.
 */
export interface ConsoleConstants {
  /** Default cell size in CSS pixels. */
  readonly defaultCellPx: number;
  /** Min cell size in CSS pixels. */
  readonly minCellPx: number;
  /** Max cell size in CSS pixels. */
  readonly maxCellPx: number;
  /** Default feedback message TTL in ms. */
  readonly feedbackTtlMs: number;
  /** Default label TTL in ms (e.g., "70%" flash). */
  readonly labelTtlMs: number;
  /** Default effect TTL in ms (e.g., combat flash). */
  readonly effectTtlMs: number;
  /** Maximum feedback messages retained. */
  readonly maxFeedbackMessages: number;
  /** Maximum rejected orders retained in history. */
  readonly maxRejectedOrders: number;
  /** Local rate-limit debounce in orders/second. */
  readonly clientOrderRatePerSec: number;
  /** Reconnect attempt backoff base (ms). */
  readonly reconnectBackoffBaseMs: number;
  /** Reconnect attempt backoff cap (ms). */
  readonly reconnectBackoffCapMs: number;
}

/** Default console constants. */
export const CONSOLE_CONSTANTS: ConsoleConstants;

/** Console API version. */
export const CONSOLE_API_VERSION: '0.1.0';
