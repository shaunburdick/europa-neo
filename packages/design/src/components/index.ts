/**
 * @europa/design/components — barrel re-export for all web components.
 *
 * Re-exports every component class (for selective registration) and the
 * bulk `register()` function (FR-005 / FR-008). Importing this module
 * has no side effects (FR-004).
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Bulk registration (FR-003 / FR-004 / FR-005)
// ---------------------------------------------------------------------------

export { register } from './register.js';

// ---------------------------------------------------------------------------
// Generic components (13) — FR-001
// ---------------------------------------------------------------------------

export { EuropaBadge } from './generic/badge.js';
export { EuropaBanner } from './generic/banner.js';
export { EuropaButton } from './generic/button.js';
export { EuropaCard } from './generic/card.js';
export { EuropaChip } from './generic/chip.js';
export { EuropaContainer } from './generic/container.js';
export { EuropaGrid } from './generic/grid.js';
export { EuropaModal } from './generic/modal.js';
export { EuropaPage } from './generic/page.js';
export { EuropaPlate } from './generic/plate.js';
export { EuropaStack } from './generic/stack.js';
export { EuropaTypography } from './generic/typography.js';
export { EuropaWaiting } from './generic/waiting.js';

// ---------------------------------------------------------------------------
// Game-specific primitives (7) — FR-002
// ---------------------------------------------------------------------------

export { EuropaCityMarker } from './game/city-marker.js';
export { EuropaElevationSwatch } from './game/elevation-swatch.js';
export { EuropaFogOverlay } from './game/fog-overlay.js';
export { EuropaPipeSlope } from './game/pipe-slope.js';
export { EuropaPlayerBadge } from './game/player-badge.js';
export { EuropaReserveIndicator } from './game/reserve-indicator.js';
export { EuropaTroopChip } from './game/troop-chip.js';
