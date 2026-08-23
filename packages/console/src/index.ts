/**
 * Public surface of the `@europa/console` package.
 *
 * Phase 2 barrel (T037): the pure state machine, network adapter
 * plumbing, a11y primitives, input math, and tunable constants. The
 * populated `createConsole` factory + `Console` handle land in Phase 8
 * after all user-story implementations exist.
 *
 * Types: everything flows through `./state/types`, which re-exports
 * the contract mirrors (byte-identical to
 * `.specify/features/005-client-console/contracts/`) plus the upstream
 * engine/fog/networking types via `import type`.
 *
 * The names in each `export { ... }` block are sorted alphabetically
 * (Biome `organizeImports` rule), matching the other five packages'
 * barrels.
 */

// ----------------------------------------------------------------------------
// Runtime surface — state machine
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
export { appendFeedback, appendRejection, INITIAL_CONSOLE_STATE, reduce } from './state/reducer';
export { createConsoleStore } from './state/store';

// ----------------------------------------------------------------------------
// Runtime surface — network adapter + a11y + input math
// ----------------------------------------------------------------------------

export { KeyboardNavigator } from './a11y/keyboard';
export { LiveRegionAnnouncer } from './a11y/live-region';
export {
  directionFromRegion,
  hitTest,
  regionFromDirection,
  regionFromSubcell,
} from './input/hit-test';
export { subcellToTargetCoord, subcellToTargetOffset } from './input/subcell';
export { createConsoleClient } from './net/client';
export { consoleStatusFromConnectionState } from './net/connection';
export { netEventFromEnvelope } from './net/envelope-to-event';

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
  SUBCELL_RANGE,
} from './config';

// ----------------------------------------------------------------------------
// Types (contract mirrors + upstream re-exports)
// ----------------------------------------------------------------------------

export * from './state/types';
