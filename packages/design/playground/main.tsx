/**
 * Europa Design — React Component Playground entry point.
 *
 * A dev-tool inspection aid that renders all 20 shared React components
 * and the design token palette into a real browser so the PO can visually
 * verify variants, states, and the design tokens.
 *
 * It imports directly from `src/` (not `dist/`) so the page always reflects
 * current component source and Vite HMR works without a separate build step.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import {
    EuropaBadge,
    EuropaBanner,
    EuropaButton,
    EuropaCard,
    EuropaChip,
    EuropaCityMarker,
    EuropaContainer,
    EuropaElevationSwatch,
    EuropaFogOverlay,
    EuropaGrid,
    EuropaModal,
    EuropaPage,
    EuropaPipeSlope,
    EuropaPlate,
    EuropaPlayerBadge,
    EuropaReserveIndicator,
    EuropaStack,
    EuropaTroopChip,
    EuropaTypography,
    EuropaWaiting,
} from '../src/components/index.ts';
import '../src/styles/catalog.css';
import { TOKENS } from '../src/tokens.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a camelCase / PascalCase identifier to kebab-case, mirroring the
 * emitter in `scripts/build-css.ts` so the playground's runtime token
 * variables match the ones `dist/design.css` would define.
 */
function toKebabCase(value: string): string {
    return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Publish the canonical {@link TOKENS} table as `--europa-*` CSS custom
 * properties on `:root`.
 *
 * `src/styles/catalog.css` only *consumes* these variables; the `:root`
 * definitions are normally emitted into `dist/design.css` by the build. In
 * dev we define them straight from the source tokens so the showcase is fully
 * styled with no prior build and hot-reloads when tokens change.
 */
function applyTokenVariables(): void {
    const root = document.documentElement;
    const groups = Object.keys(TOKENS).sort() as Array<keyof typeof TOKENS>;

    for (const group of groups) {
        const groupValue = TOKENS[group] as Record<string, string | number>;
        const groupKebab = toKebabCase(group as string);

        for (const leafKey of Object.keys(groupValue).sort()) {
            const rawValue = groupValue[leafKey];
            if (rawValue === undefined) {
                continue;
            }
            const cssVar = `--europa-${groupKebab}-${toKebabCase(leafKey)}`;
            root.style.setProperty(cssVar, String(rawValue));
        }
    }
}

applyTokenVariables();

/**
 * Create a native DOM element with attributes and children.
 *
 * Used for layout containers (headings, dividers, grid wrappers) that are
 * not React components.
 */
function make(tag: string, attrs: Record<string, string> = {}, ...children: Array<Node | string>): HTMLElement {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        node.setAttribute(key, value);
    }
    for (const child of children) {
        node.append(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
}

/**
 * Build a labelled showcase cell: a small caption above the rendered example.
 */
function cell(label: string, example: Node): HTMLElement {
    return make('div', { class: 'playground-cell' }, make('span', { class: 'playground-label' }, label), example);
}

/**
 * Build a flex-wrap grid of cells.
 */
function grid(...cells: Array<HTMLElement>): HTMLElement {
    return make('div', { class: 'playground-grid' }, ...cells);
}

/**
 * Build a sub-heading inside a section body.
 */
function subheading(text: string): HTMLElement {
    return make('h3', { class: 'ds-subheading' }, text);
}

/**
 * Render a React element into a DOM container and return it wrapped in a
 * playground cell. This bridges React components into the DOM-based layout.
 */
function reactDemo(label: string, element: React.ReactElement): HTMLElement {
    const wrapper = document.createElement('div');
    createRoot(wrapper).render(element);
    return cell(label, wrapper);
}

/**
 * Section descriptor used by both the TOC builder and the section renderer.
 */
interface SectionDescriptor {
    id: string;
    title: string;
    tag: string;
    description: string;
    render: (body: HTMLElement) => void;
}

// ---------------------------------------------------------------------------
// Component sections
// ---------------------------------------------------------------------------

const sections: SectionDescriptor[] = [
    // ── Generic components (13) ──────────────────────────────────────────
    {
        id: 'button',
        title: 'Button',
        tag: 'EuropaButton',
        description:
            'Clickable action element with primary / secondary / ghost variants, five semantic state colours, and sm / lg sizes.',
        render(body) {
            const variants = ['primary', 'secondary', 'ghost', 'success', 'warning', 'error', 'info'];
            const variantCells = variants.map((v) =>
                reactDemo(v, React.createElement(EuropaButton, { variant: v as never }, v)),
            );
            const sizeCells = [
                reactDemo('size="sm"', React.createElement(EuropaButton, { variant: 'primary', size: 'sm' }, 'Small')),
                reactDemo('size="lg"', React.createElement(EuropaButton, { variant: 'primary', size: 'lg' }, 'Large')),
            ];
            const disabledCell = reactDemo(
                'disabled',
                React.createElement(EuropaButton, { variant: 'primary', disabled: true }, 'Disabled'),
            );

            body.append(subheading('Variants'), grid(...variantCells));
            body.append(subheading('Sizes & states'), grid(...sizeCells, disabledCell));
        },
    },
    {
        id: 'card',
        title: 'Card',
        tag: 'EuropaCard',
        description: 'Surface for grouping related content with a subtle border and raised background.',
        render(body) {
            body.append(
                grid(
                    reactDemo(
                        'default',
                        React.createElement(
                            EuropaCard,
                            null,
                            React.createElement('strong', null, 'Card'),
                            React.createElement('p', null, 'A surface for grouping related content.'),
                        ),
                    ),
                ),
            );
        },
    },
    {
        id: 'plate',
        title: 'Plate',
        tag: 'EuropaPlate',
        description: 'Lighter content surface with a larger border-radius than Card.',
        render(body) {
            body.append(
                grid(
                    reactDemo(
                        'default',
                        React.createElement(
                            EuropaPlate,
                            null,
                            React.createElement('strong', null, 'Plate'),
                            React.createElement('p', null, 'A lighter content surface.'),
                        ),
                    ),
                ),
            );
        },
    },
    {
        id: 'stack',
        title: 'Stack',
        tag: 'EuropaStack',
        description: 'Vertical flex container that applies consistent spacing between children.',
        render(body) {
            body.append(
                grid(
                    reactDemo(
                        'two buttons',
                        React.createElement(
                            EuropaStack,
                            null,
                            React.createElement(EuropaButton, { variant: 'secondary' }, 'First'),
                            React.createElement(EuropaButton, { variant: 'secondary' }, 'Second'),
                        ),
                    ),
                ),
            );
        },
    },
    {
        id: 'container',
        title: 'Container',
        tag: 'EuropaContainer',
        description: 'Full-width padded wrapper for grouping page-level content.',
        render(body) {
            body.append(
                grid(
                    reactDemo(
                        'default',
                        React.createElement(
                            EuropaContainer,
                            null,
                            React.createElement('h3', null, 'Container'),
                            React.createElement('p', null, 'A full-width padded wrapper.'),
                        ),
                    ),
                ),
            );
        },
    },
    {
        id: 'page',
        title: 'Page',
        tag: 'EuropaPage',
        description: 'Top-level page scaffold with max-width, centering, and consistent padding.',
        render(body) {
            body.append(
                grid(
                    reactDemo(
                        'default',
                        React.createElement(
                            EuropaPage,
                            null,
                            React.createElement('h1', null, 'Page'),
                            React.createElement('p', null, 'A top-level page scaffold (max-width, centered).'),
                        ),
                    ),
                ),
            );
        },
    },
    {
        id: 'chip',
        title: 'Chip',
        tag: 'EuropaChip',
        description: 'Compact inline label for numeric counts, typically used inside troop indicators.',
        render(body) {
            body.append(
                grid(
                    reactDemo('count={12}', React.createElement(EuropaChip, { count: 12 })),
                    reactDemo('count={5} + label', React.createElement(EuropaChip, { count: 5 }, 'troops')),
                ),
            );
        },
    },
    {
        id: 'badge',
        title: 'Badge',
        tag: 'EuropaBadge',
        description: 'Slotted inline label for short textual annotations.',
        render(body) {
            body.append(grid(reactDemo('default', React.createElement(EuropaBadge, null, 'Your match'))));
        },
    },
    {
        id: 'banner',
        title: 'Banner',
        tag: 'EuropaBanner',
        description:
            'Full-width status or alert bar. Fixed-position by design; examples below are framed in a positioned container so they do not cover the page.',
        render(body) {
            const statusBox = make('div', { class: 'playground-banner-box' });
            createRoot(statusBox).render(
                React.createElement(EuropaBanner, { variant: 'status' }, 'Match started \u2014 good luck!'),
            );

            const alertBox = make('div', { class: 'playground-banner-box' });
            createRoot(alertBox).render(
                React.createElement(EuropaBanner, { variant: 'alert' }, 'Reconnecting to match\u2026'),
            );

            body.append(subheading('variant="status"'), statusBox, subheading('variant="alert"'), alertBox);
        },
    },
    {
        id: 'typography',
        title: 'Typography',
        tag: 'EuropaTypography',
        description: 'Semantic text wrapper with heading, subheading, body, label, and caption variants.',
        render(body) {
            const variants = ['heading', 'subheading', 'body', 'label', 'caption'] as const;
            const cells = variants.map((v) =>
                reactDemo(
                    `variant="${v}"`,
                    React.createElement(EuropaTypography, { variant: v }, `The quick brown fox (${v})`),
                ),
            );
            body.append(subheading('Variants'), grid(...cells));
        },
    },
    {
        id: 'grid',
        title: 'Grid',
        tag: 'EuropaGrid',
        description: 'Layout primitive with sidebar (vertical stack) and wrap (flex-wrap) modes.',
        render(body) {
            const sidebar = reactDemo(
                'variant="sidebar"',
                React.createElement(
                    EuropaGrid,
                    { variant: 'sidebar' },
                    React.createElement(EuropaCard, null, 'Sidebar item'),
                    React.createElement(EuropaCard, null, 'Sidebar item'),
                ),
            );
            const wrap = reactDemo(
                'variant="wrap"',
                React.createElement(
                    EuropaGrid,
                    { variant: 'wrap' },
                    React.createElement(EuropaCard, null, 'Wrap A'),
                    React.createElement(EuropaCard, null, 'Wrap B'),
                    React.createElement(EuropaCard, null, 'Wrap C'),
                ),
            );
            body.append(grid(sidebar, wrap));
        },
    },
    {
        id: 'waiting',
        title: 'Waiting',
        tag: 'EuropaWaiting',
        description: 'Animated loading indicator with a custom message and optional reduced-motion mode.',
        render(body) {
            body.append(
                grid(
                    reactDemo(
                        'message="Loading\u2026"',
                        React.createElement(EuropaWaiting, { message: 'Loading\u2026' }),
                    ),
                    reactDemo(
                        'reduced-motion',
                        React.createElement(EuropaWaiting, {
                            message: 'Reconnecting\u2026',
                            reducedMotion: true,
                        }),
                    ),
                ),
            );
        },
    },
    {
        id: 'modal',
        title: 'Modal',
        tag: 'EuropaModal',
        description: 'Dialog overlay with title, body, and action buttons. Framed in a positioned box for inspection.',
        render(body) {
            const framed = make('div', { class: 'playground-modal-box' });
            createRoot(framed).render(
                React.createElement(
                    EuropaModal,
                    { title: 'Example dialog', open: true, onClose: () => {} },
                    React.createElement(
                        'p',
                        null,
                        'This is the modal body. Press Escape or click the backdrop to close it.',
                    ),
                    React.createElement(
                        EuropaModalActions,
                        null,
                        React.createElement(EuropaButton, { variant: 'ghost' }, 'Cancel'),
                        React.createElement(EuropaButton, { variant: 'primary' }, 'OK'),
                    ),
                ),
            );
            body.append(subheading('open'), framed);
        },
    },

    // ── Game-specific primitives (7) ─────────────────────────────────────
    {
        id: 'troop-chip',
        title: 'Troop Chip',
        tag: 'EuropaTroopChip',
        description:
            'Player-coloured chip showing troop count for a board cell, with four owner slots and an unowned state.',
        render(body) {
            const owners = [1, 2, 3, 4, undefined] as const;
            const cells = owners.map((owner) => {
                const label = owner === undefined ? 'no owner' : `owner={${owner}}`;
                return reactDemo(
                    label,
                    React.createElement(EuropaTroopChip, { count: 20, ...(owner !== undefined ? { owner } : {}) }),
                );
            });
            body.append(subheading('count={20}'), grid(...cells));
        },
    },
    {
        id: 'city-marker',
        title: 'City Marker',
        tag: 'EuropaCityMarker',
        description: 'Small indicator for city ownership on the board, with four player colours and an unowned state.',
        render(body) {
            const owners = [1, 2, 3, 4] as const;
            const cells = owners.map((owner) => {
                const label = `owner={${owner}}`;
                return reactDemo(label, React.createElement(EuropaCityMarker, { owner }));
            });
            body.append(subheading('owner variants'), grid(...cells));
        },
    },
    {
        id: 'pipe-slope',
        title: 'Pipe Slope',
        tag: 'EuropaPipeSlope',
        description:
            'Directional colour indicator for pipe flow: downhill (green), flat (amber), uphill (red), stalled (grey).',
        render(body) {
            const directions = ['downhill', 'flat', 'uphill', 'stalled'] as const;
            const cells = directions.map((d) =>
                reactDemo(`direction="${d}"`, React.createElement(EuropaPipeSlope, { direction: d })),
            );
            body.append(grid(...cells));
        },
    },
    {
        id: 'elevation-swatch',
        title: 'Elevation Swatch',
        tag: 'EuropaElevationSwatch',
        description: 'Colour ramp tile mapping an elevation value (0\u2013100) to the terrain HSL formula.',
        render(body) {
            const elevations = [0, 25, 50, 75, 100];
            const cells = elevations.map((e) =>
                reactDemo(`elevation={${e}}`, React.createElement(EuropaElevationSwatch, { elevation: e })),
            );
            body.append(subheading('Ramp (0 / 25 / 50 / 75 / 100)'), grid(...cells));
        },
    },
    {
        id: 'player-badge',
        title: 'Player Badge',
        tag: 'EuropaPlayerBadge',
        description: 'Name badge coloured by player number, used in the HUD and lobby.',
        render(body) {
            const players = [1, 2, 3, 4] as const;
            const cells = players.map((p) =>
                reactDemo(
                    `player={${p}} name="Alice"`,
                    React.createElement(EuropaPlayerBadge, { player: p, name: 'Alice' }),
                ),
            );
            body.append(subheading('player variants'), grid(...cells));
        },
    },
    {
        id: 'fog-overlay',
        title: 'Fog Overlay',
        tag: 'EuropaFogOverlay',
        description: 'Full-cell overlay that hides unexplored board tiles. Framed in a visible box for inspection.',
        render(body) {
            const visibleBox = make('div', { class: 'playground-fog-box' });
            createRoot(visibleBox).render(React.createElement(EuropaFogOverlay));

            const hiddenBox = make('div', { class: 'playground-fog-box' });
            createRoot(hiddenBox).render(React.createElement(EuropaFogOverlay, { visible: false }));

            body.append(grid(cell('default (visible)', visibleBox), cell('visible={false}', hiddenBox)));
        },
    },
    {
        id: 'reserve-indicator',
        title: 'Reserve Indicator',
        tag: 'EuropaReserveIndicator',
        description: 'Radial gauge showing the percentage of reserves available to a player (0\u201390%).',
        render(body) {
            const percents = [0, 30, 60, 90];
            const cells = percents.map((p) =>
                reactDemo(`percent={${p}}`, React.createElement(EuropaReserveIndicator, { percent: p })),
            );
            body.append(grid(...cells));
        },
    },

    // ── Token colour reference ───────────────────────────────────────────
    {
        id: 'tokens',
        title: 'Token Colour Reference',
        tag: 'tokens',
        description:
            'The canonical design token palette. Every colour used by the components above is sourced from these tokens.',
        render(body) {
            renderTokenSection(body);
        },
    },
];

// ---------------------------------------------------------------------------
// Modal.Actions helper (slot name for action buttons)
// ---------------------------------------------------------------------------

/**
 * A simple wrapper that renders children inside a div with `slot="actions"`
 * for the modal's footer area. Used only in the playground demo.
 */
function EuropaModalActions({ children }: { children?: React.ReactNode }) {
    return <div slot="actions">{children}</div>;
}

// ---------------------------------------------------------------------------
// Token reference renderer
// ---------------------------------------------------------------------------

/**
 * Build a single colour swatch (box + hex/value label).
 */
function swatch(label: string, value: string): HTMLElement {
    const box = make('div', { class: 'swatch-box' });
    box.style.backgroundColor = value;
    return make('div', { class: 'playground-swatch' }, box, make('span', { class: 'swatch-label' }, label));
}

/**
 * Render the token colour reference into the section body.
 */
function renderTokenSection(body: HTMLElement): void {
    // Player colours
    {
        const playerColors: Array<[string, string]> = [
            ['P1', TOKENS.color.accent],
            ['P2', TOKENS.color.city],
            ['P3', TOKENS.color.green],
            ['P4', TOKENS.color.blue],
            ['fallback', TOKENS.color.textMuted],
        ];
        const cells = playerColors.map(([label, value]) => swatch(`${label} \u00b7 ${value}`, value));
        body.append(subheading('Player colours'), make('div', { class: 'playground-swatch-row' }, ...cells));
    }

    // Pipe-slope colours
    {
        const pipeColors: Array<[string, string]> = [
            ['downhill', TOKENS.color.pipeDownhill],
            ['flat', TOKENS.color.pipeFlat],
            ['uphill', TOKENS.color.pipeUphill],
            ['stalled', TOKENS.color.pipeStalled],
        ];
        const cells = pipeColors.map(([label, value]) => swatch(`${label} \u00b7 ${value}`, value));
        body.append(subheading('Pipe-slope colours'), make('div', { class: 'playground-swatch-row' }, ...cells));
    }

    // Elevation ramp
    {
        const { landHue, landSaturationPct, landMinLightnessPct, landMaxLightnessPct } = TOKENS.color;
        const elevationColor = (elevation: number): string => {
            const t = elevation / 100;
            const lightness = landMinLightnessPct + (landMaxLightnessPct - landMinLightnessPct) * t;
            return `hsl(${landHue}, ${landSaturationPct}%, ${lightness}%)`;
        };

        const cells: Array<HTMLElement> = [];
        for (let elevation = 0; elevation <= 100; elevation += 10) {
            cells.push(swatch(`${elevation}`, elevationColor(elevation)));
        }
        body.append(
            subheading('Elevation ramp (0\u2192100, step 10)'),
            make('div', { class: 'playground-swatch-row' }, ...cells),
        );
    }

    // Base palette
    {
        const baseKeys: Array<keyof typeof TOKENS.color> = [
            'pageBg',
            'surface',
            'surfaceRaised',
            'textPrimary',
            'textSecondary',
            'textMuted',
            'border',
            'accent',
            'city',
            'green',
            'blue',
            'red',
            'success',
            'warning',
            'error',
            'info',
            'water',
            'voidBg',
            'overlayStrong',
        ];
        const cells = baseKeys.map((key) => {
            const value = TOKENS.color[key];
            return swatch(`${key} \u00b7 ${value}`, value);
        });
        body.append(
            subheading('Base palette (TOKENS.color.*)'),
            make('div', { class: 'playground-swatch-row' }, ...cells),
        );
    }
}

// ---------------------------------------------------------------------------
// TOC builder
// ---------------------------------------------------------------------------

/**
 * Populate the table-of-contents nav from the section descriptors.
 * Each entry is an anchor link to the section heading.
 */
function buildTOC(): void {
    const tocList = document.getElementById('toc');
    if (tocList === null) {
        return;
    }

    sections.forEach((s, i) => {
        if (i > 0) {
            tocList.append(make('span', { class: 'ds-toc__sep', 'aria-hidden': 'true' }, '\u00b7'));
        }

        const link = make('a', { href: `#${s.id}` }, s.title);
        tocList.append(make('li', {}, link));
    });
}

// ---------------------------------------------------------------------------
// Section renderer
// ---------------------------------------------------------------------------

/**
 * Render all sections into #app.
 */
function renderSections(): void {
    const app = document.getElementById('app');
    if (app === null) {
        return;
    }

    for (const s of sections) {
        const heading = make(
            'h2',
            { class: 'ds-section__heading', id: s.id },
            s.title,
            make('span', { class: 'ds-section__tag' }, s.tag),
        );

        const desc = make('p', { class: 'ds-section__desc' }, s.description);
        const body = make('div');

        s.render(body);

        const section = make('section', { class: 'ds-section' }, heading, desc, body);

        // Add a divider between sections (except after the last one)
        app.append(section);
        if (s !== sections[sections.length - 1]) {
            app.append(make('hr', { class: 'ds-section__divider' }));
        }
    }
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

buildTOC();
renderSections();
