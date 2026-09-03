/**
 * Console Type Contracts — Feature 005
 *
 * The public type surface of the `@europa/console` package.
 * Re-exported via `@europa/console` (packages/console/src/index.ts).
 *
 * Source-of-truth engine / fog / networking types are imported
 * **type-only** from their packages. They are not duplicated here.
 *
 * Consumers of this file:
 *   - The console package's own implementation (renderer, input,
 *     state, sound, QoL).
 *   - Downstream embedding hosts (e.g., a future self-hostable
 *     web-shell that embeds the console in a page).
 *
 * Versioning: breaking changes bump `CONSOLE_API_VERSION` and update
 * downstream callers in the same change set (constitution Principle
 * IV: specs as documentation; stale contracts are bugs).
 *
 * Rules for this file:
 *   - All types are readonly outside console internals.
 *   - No `any`. Use `unknown` + narrowing where shape is dynamic.
 *   - Numbers that represent counts/indices/capacities are integers
 *     (mirroring engine's discipline).
 *   - No DOM types (Window, Document, Event) leak here — the console
 *     is a pure data layer; DOM interaction lives in the renderer
 *     sub-module. This keeps the contracts usable from SSR/test
 *     environments.
 *
 * =============================================================================
 * CONFORMANCE TO UPSTREAM FEATURES
 * =============================================================================
 *
 * The console conforms to:
 *   - feature 001: `engine-types.ts` (`World`, `CellView`, `Coord`,
 *     `Direction`, `Order`, `ReservesPct`, `PlayerId`, `TickEvents`,
 *     `MatchConfig`).
 *   - feature 002: `fog-types.ts` (`PlayerView` — the per-tick payload
 *     the console reads from).
 *   - feature 003: `terrain-types.ts` (`Board`, `Cell` — used for
 *     the **static map layer** the console draws; visible cells are
 *     owned by `PlayerView.visibleCells`, but elevation/terrain for
 *     cells NOT yet visible come from the initial `Board` snapshot
 *     when available, else they are void).
 *   - feature 004: `network-types.ts` (`ConnectionState`, `SessionToken`,
 *     `MatchId`, `ConnectionId`, `ErrorCode`) — the console's net
 *     adapter mirrors the server's state machine and surfaces
 *     `error.code` verbatim for screen-reader-friendly error messages.
 *
 * No additive changes to upstream features are required. The console
 * is a leaf consumer; its only outbound contract is `Order` (which is
 * the engine's type, not extended).
 *
 * =============================================================================
 * SPEC AMBIGUITIES RESOLVED (see research.md §13 for full list)
 * =============================================================================
 *
 * - **Visible-cell definition**: "visible" = present in
 *   `PlayerView.visibleCells`. Cells outside the horizon are void
 *   (no terrain drawn, no units, no pipes) per fog FR-002.
 *   Note: this differs from feature 003 (terrain) only insofar as
 *   the console NEVER accesses the `Board` for cells the player
 *   cannot see — it relies entirely on the fog-filtered `PlayerView`.
 *   The `Board` is *only* used as the initial snapshot for the
 *   very first paint before any `PlayerView` arrives.
 * - **"Subcell targeting"** (spec US3 AC-1/2/3): the cursor
 *   position WITHIN a cell determines the paratroop/gun destination.
 *   The mapping is documented in §"Subcell targeting" below.
 * - **Region of cell** (spec US2 AC-1/2): quadrant of a cell =
 *   north / east / south / west half. See §"CellRegion".
 * - **Cell-side for pipe targeting**: a click in the *northern half*
 *   of a cell toggles the `N` pipe; southern half → `S`; eastern
 *   half → `E`; western half → `W`. The exact split is geometric
 *   (Y axis < 0.5 → N, X axis < 0.5 → W, etc.) per the original.
 * - **Spectator mode**: console reads full-board `PlayerView` (set by
 *   fog's `options.spectator: true`); input is disabled (every
 *   `Order`-producing gesture is suppressed); the only legal
 *   gesture is "quit / close window" (navigation, not an order).
 */

// ----------------------------------------------------------------------------
// Version
// ----------------------------------------------------------------------------

/**
 * Current console API version. Increment on any breaking change to
 * the public surface (types or functions in console-types.ts and
 * console-api.ts).
 *
 * Mirrors the engine/fog/networking versioning discipline: every
 * consumer pin-checks at startup; incrementing forces a coordinated
 * update.
 */
export const CONSOLE_API_VERSION = '0.1.0' as const;

// ----------------------------------------------------------------------------
// Engine / fog / networking types (re-exported for convenience, not re-defined)
// ----------------------------------------------------------------------------

import type {
  CellView,
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

import type {
  ConnectionState,
  ErrorCode,
  MatchId,
  SessionToken,
  SequenceNumber,
} from '@europa/networking';

// ----------------------------------------------------------------------------
// Branded primitives
// ----------------------------------------------------------------------------

/**
 * Identifies a `MapView` instance. One per match. Branded so a
 * `MapViewId` cannot be confused with a `MatchId` (different
 * conceptual entity).
 */
export type MapViewId = string & { readonly __brand: 'MapViewId' };

/**
 * Identifies a `PlayerAction` for ack correlation. The console stamps
 * this on every outbound action; the server's `OrderAckPayload.seq`
 * matches. (Mirrors networking's `SequenceNumber` but is **console-
 * owned**; networking re-numbers at the envelope level.)
 */
export type ActionId = number & { readonly __brand: 'ActionId' };

/**
 * Cell coordinate in **screen space** (CSS pixels, origin top-left of
 * the map canvas). Distinguished from engine `Coord` (cell indices
 * in the board grid).
 */
export interface ScreenPoint {
  readonly x: number; // CSS pixels
  readonly y: number;
}

/**
 * Cursor position resolved against the map canvas. Carries both the
 * screen point and the cell + region the point falls in. Computed by
 * the input layer once per `pointermove`/`mousemove`.
 */
export interface CursorTarget {
  readonly screen: ScreenPoint;
  /** Cell the cursor is in. `null` only if the cursor is over the chrome (HUD/lobby) rather than the map. */
  readonly cell: Coord | null;
  /** Region of the cell the cursor is in. `null` when cell is null. */
  readonly region: CellRegion | null;
  /**
   * Local subcell position in `[0, 1) × [0, 1)` within the cell, for
   * paratroop/gun targeting. `null` when cell is null.
   */
  readonly subcell: SubcellPosition | null;
}

// ----------------------------------------------------------------------------
// Cell region (for pipe targeting)
// ----------------------------------------------------------------------------

/**
 * Quadrant of a cell. Used by pipe-toggle input to map a cursor
 * position inside a cell to a `Direction`.
 *
 * The original Europa's mapping (per `europa-source/.../controls.html`):
 *   - North half of a cell → `N` (pipe on the north edge)
 *   - South half of a cell → `S`
 *   - West half  of a cell → `W`
 *   - East half  of a cell → `E`
 *
 * The console uses the same mapping. Edge cases (exactly on the
 * centerline) are resolved with a documented tie-break: the X axis
 * is tested first (W vs E), then the Y axis (N vs S). Cursor on the
 * exact center (0.5, 0.5) maps to `N` by tie-break (rounds upward
 * into the upper half so a centered cursor selects the "primary"
 * direction the keyboard `i` would have selected).
 */
export type CellRegion = 'N' | 'E' | 'S' | 'W';

/**
 * Resolve a cell-local position to a `CellRegion`. Pure function;
 * lives here (not in console-api.ts) so test code can import it
 * without depending on the implementation surface.
 *
 * @param subcellX 0..1 across the cell width (0 = west edge, 1 = east edge)
 * @param subcellY 0..1 across the cell height (0 = north edge, 1 = south edge)
 */
export declare function regionFromSubcell(subcellX: number, subcellY: number): CellRegion;

/**
 * Map a `CellRegion` to the engine `Direction` it produces an
 * order for. `regionFromDirection` is the inverse. These two helpers
 * are the single source of truth for the mapping; the input layer
 * imports them and never hard-codes the relationship inline.
 */
export declare function directionFromRegion(region: CellRegion): Direction;
export declare function regionFromDirection(direction: Direction): CellRegion;

// ----------------------------------------------------------------------------
// Subcell targeting (for paratroop/gun)
// ----------------------------------------------------------------------------

/**
 * Local position inside a cell, normalized to `[0, 1) × [0, 1)`. The
 * input layer fills this every pointer move; the paratroop/gun
 * handler projects it to a board cell via `subcellToTargetCoord`.
 */
export interface SubcellPosition {
  /** 0 = west edge, 1 = east edge (exclusive). */
  readonly x: number;
  /** 0 = north edge, 1 = south edge (exclusive). */
  readonly y: number;
}

/**
 * The subcell targeting ring layout. Matches the original Europa
 * "local map" of a single cell (per `europa-source/.../controls.html`).
 *
 * The cell is conceptually divided into a 5×5 mini-grid:
 *   - 1 center subcell (the source cell itself; cannot target here)
 *   - 8 ring-1 subcells (one step N/E/S/W/NE/NW/SE/SW; Chebyshev d=1)
 *   - 16 ring-2 subcells (two steps each direction; Chebyshev d=2)
 *
 * For v1, the mapping is implemented as a direct calculation rather
 * than a lookup table: the cursor's subcell position determines the
 * offset `(dx, dy)` via threshold rules documented in
 * `subcellToTargetOffset` (see `console-state.ts` §"Subcell targeting
 * implementation" for the algorithm).
 *
 * The hard cap is **Chebyshev distance ≤ 2** from the source cell
 * (spec US3 AC-3: "target beyond range 2 implied by cursor position
 * is rejected locally"). Anything beyond is clamped to the ring-2
 * edge in the cursor's general direction.
 */
export const SUBCELL_RANGE = 2 as const;

/**
 * Compute the `(dx, dy)` offset in cells from a source cell given a
 * subcell position. Result is in `{-2..2, -2..2}` and satisfies
 * `max(|dx|, |dy|) <= 2` (Chebyshev).
 *
 * Threshold rule (centers at 0.1, 0.3, 0.5, 0.7, 0.9 of cell):
 *   x < 0.20 → -2; 0.20 ≤ x < 0.40 → -1; 0.40 ≤ x < 0.60 → 0;
 *   0.60 ≤ x < 0.80 → +1; x ≥ 0.80 → +2
 *   (same for y axis, with 0 = north, 1 = south)
 *
 * If the cursor is in the exact center (0.5, 0.5) the offset is
 * (0, 0) — meaning "self" / no paratroop launch (the paratroop
 * handler rejects orders with `source === target`).
 */
export declare function subcellToTargetOffset(subcell: SubcellPosition): {
  readonly dx: number;
  readonly dy: number;
};

/**
 * Apply a `(dx, dy)` offset to a `Coord` to compute the target cell.
 * Pure. Out-of-bounds targets are returned unchanged (the
 * paratroop/gun handlers reject them at order-construction time).
 */
export declare function subcellToTargetCoord(source: Coord, subcell: SubcellPosition): Coord;

// ----------------------------------------------------------------------------
// Connection status (mirror of feature 004's `ConnectionState` + UI sugar)
// ----------------------------------------------------------------------------

/**
 * Connection status as the console sees it. Distinct from
 * `ConnectionState` (server-side state machine) and from `ClientState`
 * (networking's internal client state). `ConsoleConnectionStatus` is
 * the union the **UI** uses to choose a banner / spinner / input lock.
 *
 * The console derives this from incoming `ConnectionState` plus its
 * own observations (e.g., a "reconnecting" status is shown after
 * the console has detected a socket close but before the auto-
 * reconnect attempt completes).
 */
export type ConsoleConnectionStatus =
  /** WebSocket not yet opened (initial mount, before first `connect()`). */
  | 'idle'
  /** WebSocket open; hello/join not yet completed. */
  | 'connecting'
  /** Hello/join complete; receiving ticks. Inputs are live. */
  | 'live'
  /** Console detected socket close; auto-reconnect in progress. */
  | 'reconnecting'
  /** Reconnect grace window expired; seat possibly forfeit. */
  | 'expired'
  /** Player has surrendered or been eliminated; spectating only. */
  | 'spectating'
  /** Match ended (engine reported `MatchResult`). No further ticks. */
  | 'game_over'
  /** Console closed (user navigated away / explicit close). */
  | 'closed';

/**
 * Convenience map from server `ConnectionState` to console
 * `ConsoleConnectionStatus`. The function lives here so the
 * reduction logic is shared across UI and tests.
 */
export declare function consoleStatusFromConnectionState(state: ConnectionState): ConsoleConnectionStatus;

// ----------------------------------------------------------------------------
// MapView (the rendered board)
// ----------------------------------------------------------------------------

/**
 * What the renderer needs to draw one frame. Derived from the latest
 * `PlayerView` plus view-state (zoom, pan, selected cell, etc.).
 *
 * `MapView` is **pure data** — no DOM, no canvas references — so the
 * renderer can re-derive it for any frame and the state layer can
 * unit-test it without a browser.
 */
export interface MapView {
  /** Unique id for the view (used as React `key` and for diagnostics). */
  readonly id: MapViewId;
  /** The current tick (from `PlayerView.tick`). */
  readonly tick: number;
  /**
   * Board width/height in cells. From `PlayerView.config.boardSize`.
   * Console supports non-square boards defensively, but the engine
   * only generates square boards in v1.
   */
  readonly width: number;
  readonly height: number;
  /**
   * Map of `coordKey(cell) → CellRenderInfo` for every visible cell.
   * Cells outside the horizon are NOT present in this map; the
   * renderer treats their pixels as the "void" background.
   */
  readonly cells: ReadonlyMap<string, CellRenderInfo>;
  /**
   * Per-player cosmetic color used for owner/city markers. Indexed
   * by `PlayerId`. Comes from the matchmaker / display-name
   * announcement (future feature 006 extension; v1 console uses
   * a fixed palette defined in `DEFAULT_PLAYER_COLORS`).
   */
  readonly playerColors: Readonly<Record<PlayerId, string>>;
  /**
   * Transient effect markers the renderer should draw on top of
   * the base layer (combat flashes, capture highlights, recent
   * paratroop trails). Cleared after the renderer reports
   * "consumed" (see `RenderFeedback`).
   */
  readonly effects: ReadonlyArray<MapEffect>;
  /**
   * Transient text labels (e.g., "70%" flash on reserve change).
   * Cleared when the renderer's TTL expires; the console layer sets a
   * `ttlMs` and forgets.
   */
  readonly labels: ReadonlyArray<MapLabel>;
  /**
   * Current view transform (zoom + pan). Mutated by user input
   * (scroll, drag). Renderer must redraw on every change.
   */
  readonly camera: CameraState;
  /**
   * The cell the cursor is currently over. Drives the highlight
   * layer. `null` when the cursor is over the chrome.
   */
  readonly hover: Coord | null;
  /**
   * The cell the user has "selected" (e.g., a focused cell for
   * keyboard targeting). Distinct from `hover` — `hover` tracks
   * the mouse; `selection` is keyboard / programmatic. Renderer
   * draws a focus ring on `selection` for accessibility (WCAG 2.2
   * 2.4.7 Focus Visible).
   */
  readonly selection: Coord | null;
  /**
   * The cell range currently being dragged (for region / area
   * selection). `null` when no drag is in progress. Used for
   * future "select multiple cells" features; v1 supports single-
   * cell targeting so this is always `null` (see research.md §12).
   */
  readonly dragSelection: ReadonlyArray<Coord> | null;
  /**
   * Whether the user is currently in "exclusive pipe" mode (set
   * by holding Alt, by middle-click, or by the right-click
   * equivalent — see `InputMapping.exclusiveModifier`). When
   * `true`, the next pipe click issues `OrderSetPipesExclusive`
   * instead of toggle.
   */
  readonly exclusiveMode: boolean;
}

/**
 * Slope classification for one pipe direction (005 FR-013).
 *
 * - `'downhill'` — destination elevation < source (green).
 * - `'flat'`     — equal elevation, or destination outside the
 *                  visibility horizon (fog fallback — no slope claim).
 * - `'uphill'`   — destination elevation > source (red).
 * - `'stalled'`  — uphill with flow rate 0 under feature 001 FR-007's
 *                  formula (hollow/outline-only triangle in the
 *                  stalled color).
 *
 * Module-local (not exported): the console's public surface exposes
 * the classification structurally through `CellRenderInfo.pipeSlopes`;
 * the renderer's own union lives in `src/render/pipe-slope.ts`.
 */
type PipeSlope = 'downhill' | 'flat' | 'uphill' | 'stalled';

/** Per-cell render info. Pure data, no DOM. */
export interface CellRenderInfo {
    readonly coord: Coord;
    /** Elevation (0..255 integer). Used by the renderer to shade terrain. */
    readonly elevation: number;
    /** Terrain classification. Water cells render as blue; land as shaded. */
    readonly terrain: 'land' | 'water';
    /** Troop count. `0` means empty (renderer may draw a fainter dot). */
    readonly troops: number;
    /** Owner of the troops. `null` for empty / neutral. */
    readonly owner: PlayerId | null;
    /** Whether the cell is a city. City cells get a distinct border + icon. */
    readonly isCity: boolean;
    /** City owner (may differ from `owner` during a capture in flight). */
    readonly cityOwner: PlayerId | null;
    /** Set of directions with active pipes. Renderer draws pipe triangles. */
    readonly pipes: ReadonlySet<Direction>;
    /**
     * Per-direction slope classification for rendering (005 FR-013).
     * One entry per direction in `pipes`, computed by `buildMapView`
     * from the source/destination elevation delta (feature 001
     * FR-007); a destination outside the visibility horizon classifies
     * as `'flat'` (fog fallback). Additive field — consumers that do
     * not color-code pipes may ignore it.
     */
    readonly pipeSlopes: ReadonlyMap<Direction, PipeSlope>;
    /**
     * Per-direction normalized intensity (0–1) for pipe rendering
     * (issue #43). 0 = no gradient signal (flat/stalled/fog),
     * 1 = maximum gradient. Intensity encodes triangle size/thickness
     * — bigger triangles indicate stronger slopes. Additive field —
     * consumers that don't render intensity may ignore it.
     */
    readonly pipeIntensities: ReadonlyMap<Direction, number>;
    /** Reserves percentage (0..9 → 0%..90% in steps of 10). */
    readonly reservesPct: ReservesPct;
    /**
     * Set when the cell changed during the last tick. The renderer
     * draws a brief "flash" highlight (~200ms) on changed cells. The
     * flag is reset after the next render.
     */
    readonly changedThisTick: boolean;
}

/**
 * Transient effect marker the renderer draws on top of the base
 * layer. Cleared after one render frame (or after the renderer
 * reports the effect consumed).
 */
export interface MapEffect {
  readonly kind: 'combat' | 'capture' | 'paratroop_launch' | 'paratroop_land' | 'gun_fire';
  readonly cell: Coord;
  /** Optional secondary cell (e.g., paratroop source/destination). */
  readonly otherCell?: Coord;
  /** Epoch ms when the effect should be removed (for time-based fade). */
  readonly expiresAtMs: number;
}

/**
 * Transient text label the renderer draws at a cell (e.g., "70%"
 * after a reserve change). Cleared when `expiresAtMs` is reached.
 */
export interface MapLabel {
  readonly cell: Coord;
  readonly text: string;
  readonly expiresAtMs: number;
}

/**
 * View transform. `zoom` is the pixel size of a cell (so `zoom=32`
 * means each cell is 32×32 CSS pixels); `pan` is the offset in
 * pixels from the board's top-left corner. The renderer maps
 * `board (x, y) → screen (pan.x + x*zoom, pan.y + y*zoom)`.
 */
export interface CameraState {
  /** Cell size in CSS pixels. Clamped to [BOARD_MIN_ZOOM, BOARD_MAX_ZOOM]. */
  readonly zoom: number;
  /** Top-left offset in CSS pixels. */
  readonly pan: { readonly x: number; readonly y: number };
  /** Min cell size (CSS pixels). Default 12 (board visible at 12×12 = 384px min). */
  readonly minZoom: number;
  /** Max cell size. Default 96 (so a single cell fits the viewport). */
  readonly maxZoom: number;
}

/**
 * Default camera state. Picked so a 32×32 board fits in a typical
 * 1024×768 viewport at the default zoom (data-model.md §4).
 */
export const DEFAULT_CAMERA: CameraState = {
  zoom: 32,
  pan: { x: 0, y: 0 },
  minZoom: 12,
  maxZoom: 96,
};

/**
 * Default per-player color palette (Tailwind-ish hex strings, no CDN
 * required). Keys are `PlayerId` (1..4 — the engine supports 2–4
 * players by contract). Chosen for hue + lightness separation so
 * colorblind players can distinguish owners (research.md §6); the
 * `ownerColorRing` QoL setting adds a redundant shape signal on top.
 *
 * Palette (Tailwind v3 hex, chosen by hand — no runtime dependency):
 *   - Player 1: red-600    `#dc2626`
 *   - Player 2: blue-600   `#2563eb`
 *   - Player 3: emerald-600 `#059669`
 *   - Player 4: amber-600  `#d97706`
 */
export const DEFAULT_PLAYER_COLORS: Readonly<Record<PlayerId, string>> = {
  1: '#dc2626',
  2: '#2563eb',
  3: '#059669',
  4: '#d97706',
};

/**
 * Fallback color for spectators (no player ID).
 * Gray-500 — neutral, distinct from all player colors.
 */
export const SPECTATOR_COLOR = '#888888';

// ----------------------------------------------------------------------------
// ConsoleState (the global, non-render state)
// ----------------------------------------------------------------------------

/**
 * The console's global state. The renderer derives `MapView` from
 * this on every frame. Kept intentionally small — anything
 * derivable is derived, not stored.
 *
 * Pure data; mutated only by the reducer in `console-state.ts`.
 */
export interface ConsoleState {
  /** Current connection status. Drives the connection banner. */
  readonly status: ConsoleConnectionStatus;
  /** Last successfully-applied `PlayerView`. Source of truth for the renderer. */
  readonly latestView: PlayerView | null;
  /** Initial world snapshot (from `JoinAckPayload.snapshot`). Used for the very first paint. */
  readonly initialWorld: World | null;
  /** Current camera (zoom + pan). */
  readonly camera: CameraState;
  /** Hovered cell. */
  readonly hover: Coord | null;
  /** Keyboard-selected cell. */
  readonly selection: Coord | null;
  /**
   * Last-known cursor screen point. Used to recompute the cursor
   * target when the camera moves (so the highlighted cell stays
   * under the cursor even after a zoom).
   */
  readonly lastCursorScreen: ScreenPoint | null;
  /** Order feedback queue: flash messages for the HUD. */
  readonly feedback: ReadonlyArray<FeedbackMessage>;
  /** Order rejection history. The HUD shows a small "X rejected" count. */
  readonly rejectedOrders: ReadonlyArray<RejectedOrder>;
  /** QoL settings (persisted to `localStorage` by the host). */
  readonly qol: QoLSettings;
  /** Session metadata. */
  readonly session: ConsoleSession;
  /**
   * Whether input is currently enabled. Disabled when:
   *   - `status !== 'live'` (connecting / reconnecting / spectating / etc.)
   *   - The console is showing a modal (surrender confirm, error)
   *   - The user explicitly disabled input (rare; future)
   */
  readonly inputEnabled: boolean;
  /**
   * Whether the console is currently in "exclusive pipe" mode.
   * Set true while Alt is held, while middle-mouse is down, or by
   * pressing a hotkey to toggle.
   */
  readonly exclusiveMode: boolean;
}

/**
 * One transient feedback message the HUD shows for ~2 seconds.
 * Cleared by the reducer on the next tick after `ttlMs` elapses.
 */
export interface FeedbackMessage {
  readonly id: string;
  /** Visible message text (e.g., "Reserved 70% at (5, 7)"). */
  readonly text: string;
  readonly kind: 'info' | 'success' | 'warning' | 'error';
  readonly ttlMs: number;
  readonly createdAtMs: number;
}

/**
 * Record of one rejected order. The HUD shows the most recent N
 * (default 3). Cleared when the user opens the feedback panel.
 */
export interface RejectedOrder {
  readonly actionId: ActionId;
  readonly order: Order;
  readonly reason: ValidationError;
  readonly atTick: number;
  readonly atMs: number;
}

/**
 * QoL settings. Persisted to `localStorage` by the host (the
 * console does not access `localStorage` itself — that's a host
 * concern; the console reads/writes through `ConsoleConfig.persist`).
 */
export interface QoLSettings {
  /** Sound effects enabled. Default `false` (per spec Assumptions). */
  readonly soundOn: boolean;
  /** UI animation intensity: 'full' or 'reduced'. Default 'full'. */
  readonly animation: 'full' | 'reduced';
  /** Show tooltips on hover. Default `true`. */
  readonly tooltips: boolean;
  /**
   * Preferred visual theme. Console supports 'system' (follow
   * `prefers-color-scheme`), 'light', or 'dark'. Default 'system'.
   */
  readonly theme: 'system' | 'light' | 'dark';
  /**
   * Edge / ring color for the cell-border contrast aid (helps
   * colorblind players distinguish owners). Default `true` (on).
   */
  readonly ownerColorRing: boolean;
}

/**
 * Default QoL settings (values per data-model.md §9: sound off per
 * spec Assumptions, full animation, tooltips on, system theme,
 * owner color ring on).
 */
export const DEFAULT_QOL_SETTINGS: QoLSettings = {
  soundOn: false,
  animation: 'full',
  tooltips: true,
  theme: 'system',
  ownerColorRing: true,
};

/**
 * Console session metadata. Persisted across reconnects so the
 * user can rejoin without re-entering the match id (the token is
 * the source of truth; the display name is cosmetic).
 */
export interface ConsoleSession {
  readonly matchId: MatchId | null;
  readonly sessionToken: SessionToken | null;
  readonly playerId: PlayerId | null;
  readonly displayName: string;
  /** Display names of other players in the match. Index by `PlayerId - 1`. */
  readonly opponents: ReadonlyArray<string>;
}

// ----------------------------------------------------------------------------
// PlayerAction (the console's outbound event)
// ----------------------------------------------------------------------------

/**
 * Discriminated union of every legal gesture the console produces.
 * Each variant maps 1:1 to an engine `Order` (or, for `surrender`,
 * stays as `surrender`); the input layer translates gesture → action
 * and the net layer wraps it for the wire.
 *
 * The console NEVER constructs an engine `Order` directly. The
 * `PlayerAction` type is the input layer's public surface; the
 * reducer (`console-state.ts`) turns an action into an `Order`
 * via the mapping table in `InputMapping` (see console-state.ts).
 *
 * This two-step indirection is intentional: it lets us add new
 * gestures (e.g., "drop paratroop here" via context menu) without
 * changing the Order wire format, and lets us unit-test the
 * gesture-to-order mapping without involving the net layer.
 */
export type PlayerAction =
  | { readonly kind: 'setPipe'; readonly cell: Coord; readonly direction: Direction }
  | { readonly kind: 'clearPipe'; readonly cell: Coord; readonly direction: Direction }
  | { readonly kind: 'setPipesExclusive'; readonly cell: Coord; readonly direction: Direction }
  | { readonly kind: 'clearAllPipes'; readonly cell: Coord }
  | { readonly kind: 'setReserves'; readonly cell: Coord; readonly percent: ReservesPct }
  | { readonly kind: 'paratroop'; readonly source: Coord; readonly target: Coord }
  | { readonly kind: 'gun'; readonly source: Coord; readonly target: Coord }
  | { readonly kind: 'surrender' }
  // Local-only actions (no wire equivalent):
  | { readonly kind: 'selectCell'; readonly cell: Coord | null }
  | { readonly kind: 'hoverCell'; readonly cell: Coord | null }
  | { readonly kind: 'setCamera'; readonly camera: CameraState }
  | { readonly kind: 'setQol'; readonly patch: Partial<QoLSettings> }
  | { readonly kind: 'setExclusiveMode'; readonly enabled: boolean };

// ----------------------------------------------------------------------------
// InputMapping (control table)
// ----------------------------------------------------------------------------

/**
 * Declarative table of all input bindings. The console binds this
 * table once at construction; the input layer reads from it (and
 * the host can override per-binding via `ConsoleConfig.inputOverrides`).
 *
 * Keys are stable identifiers (NOT raw key codes), so locale /
 * keyboard-layout changes don't break the mapping. The default
 * table is exposed as `DEFAULT_INPUT_MAPPING` (below).
 *
 * The shape mirrors the original Europa control set (per
 * `europa-source/.../controls.html`) plus the additions required
 * by spec US2/US3/US4.
 */
export interface InputMapping {
  /** Pipe toggle on each region. Mouse button is the primary. */
  readonly pipeToggle: PointerBinding;
  /** Exclusive pipe (replaces all). Right mouse button OR Alt+primary. */
  readonly pipeExclusive: PointerBinding;
  /** Keyboard pipe shortcuts. Maps i/j/k/l → N/W/S/E (matches original). */
  readonly pipeKeys: Readonly<Record<'pipeNorth' | 'pipeWest' | 'pipeSouth' | 'pipeEast', string>>;
  /** Alt+key produces exclusive pipe. */
  readonly pipeExclusiveKeys: Readonly<Record<'pipeNorth' | 'pipeWest' | 'pipeSouth' | 'pipeEast', string>>;
  /** Clear all pipes. Space (matches original). */
  readonly clearCellPipes: string;
  /** Paratroop fire. `p` (matches original). */
  readonly paratroopPrimary: string;
  /** Paratroop fire alternative. `h` (matches original). */
  readonly paratroopAlt: string;
  /** Gun fire. `g` (matches original). */
  readonly gunPrimary: string;
  /** Gun fire alternative. `o` (matches original). */
  readonly gunAlt: string;
  /** Reserve keys 0..9. */
  readonly reserveKeys: ReadonlyArray<string>;
  /** Cancel / clear selection. `Escape`. */
  readonly cancel: string;
  /** Move selection N/W/S/E (separate from pipe keys; default arrows). */
  readonly selectionMove: Readonly<Record<'north' | 'west' | 'south' | 'east', string>>;
}

/**
 * Pointer binding descriptor. Captures the button + modifier set
 * for a single gesture.
 */
export interface PointerBinding {
  /** Primary mouse button. `'left' | 'middle' | 'right'`. */
  readonly button: 'left' | 'middle' | 'right';
  /** Required modifier keys (any of = match). */
  readonly modifiers: ReadonlyArray<'alt' | 'ctrl' | 'meta' | 'shift'>;
}

/**
 * Default input mapping. Matches the original Europa control set
 * (per `europa-source/.../controls.html`): i/j/k/l pipe keys,
 * Space clears pipes, p/h paratroop, g/o gun, 0–9 reserves,
 * Escape cancels, arrows move the selection. Pointer bindings:
 * left button toggles a pipe; right button issues an exclusive
 * pipe (Alt+primary is the keyboard-equivalent exclusive path via
 * `pipeExclusiveKeys`).
 */
export const DEFAULT_INPUT_MAPPING: InputMapping = {
  pipeToggle: { button: 'left', modifiers: [] },
  pipeExclusive: { button: 'right', modifiers: [] },
  pipeKeys: {
    pipeNorth: 'i',
    pipeWest: 'j',
    pipeSouth: 'k',
    pipeEast: 'l',
  },
  pipeExclusiveKeys: {
    pipeNorth: 'Alt+i',
    pipeWest: 'Alt+j',
    pipeSouth: 'Alt+k',
    pipeEast: 'Alt+l',
  },
  clearCellPipes: ' ',
  paratroopPrimary: 'p',
  paratroopAlt: 'h',
  gunPrimary: 'g',
  gunAlt: 'o',
  reserveKeys: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  cancel: 'Escape',
  selectionMove: {
    north: 'ArrowUp',
    west: 'ArrowLeft',
    south: 'ArrowDown',
    east: 'ArrowRight',
  },
};

// ----------------------------------------------------------------------------
// Render feedback
// ----------------------------------------------------------------------------

/**
 * Feedback the renderer reports to the state layer after a draw.
 * Used to clear one-shot effects (e.g., "the combat flash on cell
 * (3, 4) has been drawn") and to debounce transient labels.
 */
export interface RenderFeedback {
  /**
   * Effects the renderer has consumed. The reducer removes them
   * from `ConsoleState.latestView` (via the MapView layer).
   */
  readonly consumedEffects: ReadonlyArray<MapEffect>;
  /** Labels the renderer has finished drawing. */
  readonly consumedLabels: ReadonlyArray<MapLabel>;
}

// ----------------------------------------------------------------------------
// Public re-exports of upstream types
// ----------------------------------------------------------------------------

/**
 * Re-export the engine / fog / networking types the console's public
 * surface depends on, so consumers of `@europa/console` can import
 * everything from one place. Drift between these and the upstream
 * declarations = bug (caught by TypeScript build).
 */
export type {
  CellView,
  Coord,
  Direction,
  Order,
  PlayerId,
  ReservesPct,
  TickEvents,
  ValidationError,
  World,
  PlayerView,
  ConnectionState,
  ErrorCode,
  MatchId,
  SessionToken,
  SequenceNumber,
};
