/**
 * @europa/design/components — barrel re-export for all React components.
 *
 * Re-exports every React component (function components) and their prop
 * interfaces. Importing this module has no side effects.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Generic components (13) — FR-001
// ---------------------------------------------------------------------------

export { EuropaBadge, type EuropaBadgeProps } from './generic/badge.js';
export { EuropaBanner, type EuropaBannerProps } from './generic/banner.js';
export { EuropaButton, type EuropaButtonProps } from './generic/button.js';
export { EuropaCard, type EuropaCardProps } from './generic/card.js';
export { EuropaChip, type EuropaChipProps } from './generic/chip.js';
export { EuropaContainer, type EuropaContainerProps } from './generic/container.js';
export { EuropaGrid, type EuropaGridProps } from './generic/grid.js';
export { EuropaModal, type EuropaModalProps } from './generic/modal.js';
export { EuropaPage, type EuropaPageProps } from './generic/page.js';
export { EuropaPlate, type EuropaPlateProps } from './generic/plate.js';
export { EuropaStack, type EuropaStackProps } from './generic/stack.js';
export { EuropaTypography, type EuropaTypographyProps } from './generic/typography.js';
export { EuropaWaiting, type EuropaWaitingProps } from './generic/waiting.js';

// ---------------------------------------------------------------------------
// Game-specific primitives (7) — FR-002
// ---------------------------------------------------------------------------

export { EuropaCityMarker, type EuropaCityMarkerProps } from './game/city-marker.js';
export { EuropaElevationSwatch, type EuropaElevationSwatchProps } from './game/elevation-swatch.js';
export { EuropaFogOverlay, type EuropaFogOverlayProps } from './game/fog-overlay.js';
export { EuropaPipeSlope, type EuropaPipeSlopeProps, type PipeSlopeDirection } from './game/pipe-slope.js';
export { EuropaPlayerBadge, type EuropaPlayerBadgeProps } from './game/player-badge.js';
export { EuropaReserveIndicator, type EuropaReserveIndicatorProps } from './game/reserve-indicator.js';
export { EuropaTroopChip, type EuropaTroopChipProps } from './game/troop-chip.js';
