/**
 * Section registry for the Unified Design System Dev Page.
 *
 * Maps sidebar navigation items to their DOM section IDs and categories.
 * IDs correspond to hash routes (e.g. `#colors`, `#button`) used by the
 * `useHashRoute` hook for deep-linking into specific demos.
 *
 * The Typography component uses `#typography-component` (not `#typography`)
 * to avoid collision with the Foundations typography section.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Describes a single navigable section in the dev page sidebar.
 *
 * @property id - Hash route fragment (e.g. `'colors'` → `#colors`).
 * @property title - Human-readable label shown in the sidebar.
 * @property category - Sidebar group for this section.
 * @property description - Optional tooltip or subtitle text.
 */
export interface SectionDescriptor {
    readonly id: string;
    readonly title: string;
    readonly category: 'foundations' | 'components' | 'primitives';
    readonly description?: string;
}

/**
 * Category metadata for sidebar grouping headers.
 *
 * Each category renders a heading above its child sections.
 */
export interface CategoryDescriptor {
    readonly key: 'foundations' | 'components' | 'primitives';
    readonly label: string;
}

// ---------------------------------------------------------------------------
// Category definitions
// ---------------------------------------------------------------------------

/**
 * Ordered category list for the sidebar.
 *
 * Rendered as section headings; order determines visual grouping.
 */
export const CATEGORIES: ReadonlyArray<CategoryDescriptor> = [
    { key: 'primitives', label: 'Game Primitives' },
    { key: 'components', label: 'Generic Components' },
    { key: 'foundations', label: 'Foundations' },
] as const;

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

/**
 * Complete section registry — one entry per navigable demo.
 *
 * Order within each category determines sidebar item order.
 * The `id` field is the hash fragment used by `useHashRoute` for
 * deep-linking and active-section highlighting.
 */
export const SECTIONS: ReadonlyArray<SectionDescriptor> = [
    // -- Foundations --------------------------------------------------------
    {
        id: 'colors',
        title: 'Colors',
        category: 'foundations',
        description: 'Color tokens with WCAG contrast ratios',
    },
    {
        id: 'typography',
        title: 'Typography',
        category: 'foundations',
        description: 'Type scale and font stack',
    },
    {
        id: 'spacing',
        title: 'Spacing & Borders',
        category: 'foundations',
        description: 'Spacing, borders, shadows, motion tokens',
    },
    {
        id: 'a11y',
        title: 'Accessibility',
        category: 'foundations',
        description: 'Contrast pairings and compliance',
    },
    {
        id: 'tokens',
        title: 'Token Reference',
        category: 'foundations',
        description: 'Complete token table',
    },
    // -- Generic Components -------------------------------------------------
    { id: 'page', title: 'Page', category: 'components' },
    { id: 'card', title: 'Card', category: 'components' },
    { id: 'plate', title: 'Plate', category: 'components' },
    { id: 'stack', title: 'Stack', category: 'components' },
    { id: 'container', title: 'Container', category: 'components' },
    { id: 'badge', title: 'Badge', category: 'components' },
    { id: 'grid', title: 'Grid', category: 'components' },
    { id: 'banner', title: 'Banner', category: 'components' },
    { id: 'chip', title: 'Chip', category: 'components' },
    {
        id: 'typography-component',
        title: 'Typography',
        category: 'components',
    },
    { id: 'waiting', title: 'Waiting', category: 'components' },
    { id: 'button', title: 'Button', category: 'components' },
    { id: 'modal', title: 'Modal', category: 'components' },
    // -- Game Primitives ----------------------------------------------------
    { id: 'troop-chip', title: 'TroopChip', category: 'primitives' },
    { id: 'city-marker', title: 'CityMarker', category: 'primitives' },
    { id: 'pipe-slope', title: 'PipeSlope', category: 'primitives' },
    {
        id: 'elevation-swatch',
        title: 'ElevationSwatch',
        category: 'primitives',
    },
    { id: 'player-badge', title: 'PlayerBadge', category: 'primitives' },
    { id: 'fog-overlay', title: 'FogOverlay', category: 'primitives' },
    {
        id: 'reserve-indicator',
        title: 'ReserveIndicator',
        category: 'primitives',
    },
];
