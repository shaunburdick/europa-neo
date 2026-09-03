/**
 * Public surface of the `@europa/console` package.
 *
 * FINAL barrel (T088): the complete embedding surface. The host
 * entry point is {@link createConsole} (T087) over the runtime
 * (T086); everything else is the per-phase module surface — pure
 * state machine, network adapter plumbing, input math/controllers,
 * UI components, a11y primitives, and the US5 QoL layer — plus the
 * tunable constants and the full type surface (contract mirrors +
 * upstream re-exports).
 *
 * Types: everything flows through `./state/types`, which re-exports
 * the contract mirrors (byte-identical to
 * `specs/005-client-console/contracts/`) plus the upstream
 * engine/fog/networking types via `import type`. The embedding-facing
 * contract types (`Console`, `ConsoleConfig`, …) re-export directly
 * from `./contracts/console-api`.
 *
 * The names in each `export { ... }` block are sorted alphabetically
 * (Biome `organizeImports` rule), matching the other five packages'
 * barrels.
 */

// ----------------------------------------------------------------------------
// Embedding surface — factory + runtime (T086/T087)
// ----------------------------------------------------------------------------

export { createConsole } from './create-console';
export { ConsoleRuntime } from './runtime';

// ----------------------------------------------------------------------------
// Runtime surface — state machine + order bridge
// ----------------------------------------------------------------------------

export { actionToOrder } from './state/action-to-order';
export {
    buildMapView,
    cellViewToRenderInfo,
    coordKey,
    eventToEffect,
    keyToCoord,
} from './state/build-map-view';
export { diffCellChanges } from './state/diff';
export { formatActionConfirmation, formatRejection } from './state/format';
export { localPreflightOrder } from './state/local-preflight';
export {
    createOrderBridge,
    type OrderBridge,
    type OrderBridgeArgs,
    type OrderBridgeClient,
} from './state/order-actions';
export { appendFeedback, appendRejection, INITIAL_CONSOLE_STATE, reduce } from './state/reducer';
export { createConsoleStore } from './state/store';

// ----------------------------------------------------------------------------
// Lobby state layer — feature 010 (T-014): reducer/store/controller beside
// the match store; production entry is selected by semantic routing.
// ----------------------------------------------------------------------------

export {
    createLobbyController,
    type LobbyCommandFailure,
    type LobbyCommandResult,
    type LobbyCommandSuccess,
    type LobbyController,
    type LobbyControllerArgs,
    type LobbyTransport,
} from './state/lobby-controller';
export { INITIAL_LOBBY_STATE, reduceLobby } from './state/lobby-reducer';
export type {
    LobbyAction,
    LobbyActionError,
    LobbyActionErrorCode,
    LobbyActionKind,
    LobbyActionStatus,
    LobbyFailure,
    LobbyFailureCode,
    LobbyIdentityStatus,
    LobbyState,
    LobbyViewMode,
} from './state/lobby-state';
export { createLobbyStore, type LobbyStore } from './state/lobby-store';

// ----------------------------------------------------------------------------
// Runtime surface — network adapter + a11y + input layer
// ----------------------------------------------------------------------------

export { KeyboardNavigator } from './a11y/keyboard';
export { LiveRegionAnnouncer } from './a11y/live-region';
export {
    directionFromRegion,
    hitTest,
    regionFromDirection,
    regionFromSubcell,
} from './input/hit-test';
export {
    type DraftIgnoreReason,
    type DraftOutcome,
    OrderDraftController,
    type TranslateKeyArgs,
    translateKey,
} from './input/order-draft';
export { fireGun } from './input/order-gun';
export { fireParatroop } from './input/order-paratroop';
export {
    decideRegionClick,
    type PointerButton,
    pipePresentInDirection,
    type RegionClickArgs,
    type RegionClickDecision,
    type RegionSelectCallbacks,
    RegionSelectController,
    type RegionSelectHandle,
} from './input/region-select';
export { subcellToTargetCoord, subcellToTargetOffset } from './input/subcell';
export {
    type AbilityArgs,
    type AbilityFireArgs,
    type AbilityKind,
    buildAbilityAction,
    CURSOR_STALE_MS,
    fireAbility,
    isCursorFresh,
    type NoLaunchReason,
    type TargetingOutcome,
} from './input/subcell-target';
export { createConsoleClient } from './net/client';
export { consoleStatusFromConnectionState } from './net/connection';
export { netEventFromEnvelope } from './net/envelope-to-event';
export { rehydrateEnvelopeViews } from './net/rehydrate-wire-views';
export {
    createWsMatchClient,
    type WsClientLogger,
    type WsClientState,
    type WsMatchClient,
    type WsMatchClientContract,
    type WsMatchClientOptions,
} from './net/ws-match-client';

// ----------------------------------------------------------------------------
// Input controllers + QoL layer (Phases 4–7, US2–US5)
// ----------------------------------------------------------------------------

export {
    buildReservesAction,
    type ReservesIgnoreReason,
    type ReservesOutcome,
    reservesDigitLabel,
    resolveReservePercent,
} from './input/order-reserves';
export {
    buildHotkeyTable,
    findHotkeyCollisions,
    HotkeyController,
    type HotkeyControllerOptions,
    type HotkeyId,
    resolveInputMapping,
} from './qol/hotkeys';
export {
    MINIMAP_SIZE_PX,
    Minimap,
    type MinimapCoord,
    type MinimapGeometry,
    type MinimapProps,
    minimapScale,
    viewportRect,
} from './qol/minimap';
export {
    loadPreferences,
    type PreferencesHost,
    savePreferences,
} from './qol/preferences';
export {
    filterEffectsForMotion,
    type MotionAdjustedTtls,
    motionAdjustedTtls,
    prefersReducedMotion,
    REDUCED_MOTION_QUERY,
    subscribeReducedMotion,
} from './qol/reduced-motion';
export {
    type BoardBounds,
    clampCamera,
    pannedCamera,
    ZOOM_WHEEL_STEP,
    ZoomPanController,
    zoomedCamera,
} from './qol/zoom';

// ----------------------------------------------------------------------------
// UI components (Phases 5–7) + error boundary
// ----------------------------------------------------------------------------

export { ErrorBoundary, type ErrorBoundaryProps } from './render/ErrorBoundary';
export { SurrenderModal, type SurrenderModalProps } from './render/SurrenderModal';
export { OrderBar, type OrderBarProps } from './ui/order-bar';
export { ReservesPanel, type ReservesPanelProps } from './ui/reserves-panel';
export {
    aimingTarget,
    formatTargetingLabel,
    TargetingOverlay,
    type TargetingOverlayProps,
} from './ui/targeting-overlay';

// ----------------------------------------------------------------------------
// Embedding contract types (Console handle + config + seams)
// ----------------------------------------------------------------------------

export type {
    Console,
    ConsoleConfig,
    ConsoleConstants,
    ConsoleDeps,
    ConsoleFeatureFlags,
    ConsoleInput,
    ConsoleRenderer,
    ConsoleRuntime as ConsoleRuntimeContract,
    ConsoleSoundPlayer,
    ReplayTape,
} from '../contracts/console-api';

// ----------------------------------------------------------------------------
// Tunable constants + defaults (single source of truth: contracts/)
// ----------------------------------------------------------------------------

export {
    CONSOLE_API_VERSION,
    CONSOLE_CONSTANTS,
    DEFAULT_CAMERA,
    DEFAULT_INPUT_MAPPING,
    DEFAULT_PLAYER_COLORS,
    DEFAULT_QOL_SETTINGS,
    SPECTATOR_COLOR,
    SUBCELL_RANGE,
} from './config';

// ----------------------------------------------------------------------------
// Types (contract mirrors + upstream re-exports)
// ----------------------------------------------------------------------------

export * from './state/types';
