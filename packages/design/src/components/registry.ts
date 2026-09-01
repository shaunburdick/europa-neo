/**
 * The component registry for `@europa/design/components`.
 *
 * `REGISTRY` is the single source of truth for the component inventory: every
 * `europa-*` custom element tag and its constructor class. It is consumed by
 * `register()` (idempotent bulk registration) and by the G-10 drift guard
 * (`scripts/check-component-catalog.ts`), which asserts that every registered
 * tag has a corresponding `DESIGN.md` § 2 entry and vice versa.
 *
 * The component classes themselves live in `./generic/*` and `./game/*` and
 * are created in later implementation waves; the imports here reference those
 * files so that the registry is complete from the start.
 */

import { EuropaCityMarker } from './game/city-marker.js';
import { EuropaElevationSwatch } from './game/elevation-swatch.js';
import { EuropaFogOverlay } from './game/fog-overlay.js';
import { EuropaPipeSlope } from './game/pipe-slope.js';
import { EuropaPlayerBadge } from './game/player-badge.js';
import { EuropaReserveIndicator } from './game/reserve-indicator.js';
import { EuropaTroopChip } from './game/troop-chip.js';
import { EuropaBadge } from './generic/badge.js';
import { EuropaBanner } from './generic/banner.js';
import { EuropaButton } from './generic/button.js';
import { EuropaCard } from './generic/card.js';
import { EuropaChip } from './generic/chip.js';
import { EuropaContainer } from './generic/container.js';
import { EuropaGrid } from './generic/grid.js';
import { EuropaModal } from './generic/modal.js';
import { EuropaPage } from './generic/page.js';
import { EuropaPlate } from './generic/plate.js';
import { EuropaStack } from './generic/stack.js';
import { EuropaTypography } from './generic/typography.js';
import { EuropaWaiting } from './generic/waiting.js';

/**
 * Describes a single registered custom element: its tag name and the class
 * that implements it.
 */
export interface ComponentDefinition {
    /** The custom element tag name, e.g. `europa-button`. */
    readonly tag: string;
    /** The class implementing the element (a `CustomElementConstructor`). */
    readonly ctor: CustomElementConstructor;
}

/**
 * The complete inventory of Europa Neo web components — 13 generic primitives
 * followed by 7 game-specific primitives. Order is stable: generic first, then
 * game. Consumed by `register()` and the G-10 drift guard.
 */
export const REGISTRY: readonly ComponentDefinition[] = [
    // Generic primitives (13)
    { tag: 'europa-button', ctor: EuropaButton },
    { tag: 'europa-card', ctor: EuropaCard },
    { tag: 'europa-plate', ctor: EuropaPlate },
    { tag: 'europa-modal', ctor: EuropaModal },
    { tag: 'europa-chip', ctor: EuropaChip },
    { tag: 'europa-badge', ctor: EuropaBadge },
    { tag: 'europa-banner', ctor: EuropaBanner },
    { tag: 'europa-typography', ctor: EuropaTypography },
    { tag: 'europa-waiting', ctor: EuropaWaiting },
    { tag: 'europa-grid', ctor: EuropaGrid },
    { tag: 'europa-stack', ctor: EuropaStack },
    { tag: 'europa-container', ctor: EuropaContainer },
    { tag: 'europa-page', ctor: EuropaPage },
    // Game-specific primitives (7)
    { tag: 'europa-troop-chip', ctor: EuropaTroopChip },
    { tag: 'europa-city-marker', ctor: EuropaCityMarker },
    { tag: 'europa-pipe-slope', ctor: EuropaPipeSlope },
    { tag: 'europa-elevation-swatch', ctor: EuropaElevationSwatch },
    { tag: 'europa-player-badge', ctor: EuropaPlayerBadge },
    { tag: 'europa-fog-overlay', ctor: EuropaFogOverlay },
    { tag: 'europa-reserve-indicator', ctor: EuropaReserveIndicator },
];
