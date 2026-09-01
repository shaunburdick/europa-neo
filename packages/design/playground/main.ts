/**
 * Europa Design — Web Component Playground entry point.
 *
 * A framework-free inspection aid (NOT a spec deliverable) that renders all
 * 20 shared web components and the token color reference into a real browser
 * so the PO can visually verify variants, states, and the design tokens.
 *
 * It imports directly from `src/` (not `dist/`) so the page always reflects
 * current component source and Vite HMR works without a separate build step.
 */

import { register } from '../src/components/index.ts';
import '../src/styles/catalog.css';
import { TOKENS } from '../src/tokens.ts';

/** Register all 20 custom elements with the browser. */
register();

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
 * Create an element (custom or native) with attributes and children.
 *
 * Attributes are set before the node is connected/inserted, which is required
 * for custom elements so their `attributeChangedCallback` sees the initial
 * values. Children may be strings (turned into text nodes) or nodes.
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
        tag: 'europa-button',
        description:
            'Clickable action element with primary / secondary / ghost variants, five semantic state colours, and sm / lg sizes.',
        render(body) {
            const variants = ['primary', 'secondary', 'ghost', 'success', 'warning', 'error', 'info'];
            const variantCells = variants.map((v) => cell(v, make('europa-button', { variant: v }, v)));
            const sizeCells = [
                cell('size="sm"', make('europa-button', { variant: 'primary', size: 'sm' }, 'Small')),
                cell('size="lg"', make('europa-button', { variant: 'primary', size: 'lg' }, 'Large')),
            ];
            const disabledCell = cell(
                'disabled',
                make('europa-button', { variant: 'primary', disabled: '' }, 'Disabled'),
            );

            body.append(subheading('Variants'), grid(...variantCells));
            body.append(subheading('Sizes & states'), grid(...sizeCells, disabledCell));
        },
    },
    {
        id: 'card',
        title: 'Card',
        tag: 'europa-card',
        description: 'Surface for grouping related content with a subtle border and raised background.',
        render(body) {
            body.append(
                grid(
                    cell(
                        'default',
                        make(
                            'europa-card',
                            {},
                            make('strong', {}, 'Card'),
                            make('p', {}, 'A surface for grouping related content.'),
                        ),
                    ),
                ),
            );
        },
    },
    {
        id: 'plate',
        title: 'Plate',
        tag: 'europa-plate',
        description: 'Lighter content surface with a larger border-radius than Card.',
        render(body) {
            body.append(
                grid(
                    cell(
                        'default',
                        make(
                            'europa-plate',
                            {},
                            make('strong', {}, 'Plate'),
                            make('p', {}, 'A lighter content surface.'),
                        ),
                    ),
                ),
            );
        },
    },
    {
        id: 'stack',
        title: 'Stack',
        tag: 'europa-stack',
        description: 'Vertical flex container that applies consistent spacing between children.',
        render(body) {
            body.append(
                grid(
                    cell(
                        'two buttons',
                        make(
                            'europa-stack',
                            {},
                            make('europa-button', { variant: 'secondary' }, 'First'),
                            make('europa-button', { variant: 'secondary' }, 'Second'),
                        ),
                    ),
                ),
            );
        },
    },
    {
        id: 'container',
        title: 'Container',
        tag: 'europa-container',
        description: 'Full-width padded wrapper for grouping page-level content.',
        render(body) {
            body.append(
                grid(
                    cell(
                        'default',
                        make(
                            'europa-container',
                            {},
                            make('h3', {}, 'Container'),
                            make('p', {}, 'A full-width padded wrapper.'),
                        ),
                    ),
                ),
            );
        },
    },
    {
        id: 'page',
        title: 'Page',
        tag: 'europa-page',
        description: 'Top-level page scaffold with max-width, centering, and consistent padding.',
        render(body) {
            body.append(
                grid(
                    cell(
                        'default',
                        make(
                            'europa-page',
                            {},
                            make('h1', {}, 'Page'),
                            make('p', {}, 'A top-level page scaffold (max-width, centered).'),
                        ),
                    ),
                ),
            );
        },
    },
    {
        id: 'chip',
        title: 'Chip',
        tag: 'europa-chip',
        description: 'Compact inline label for numeric counts, typically used inside troop indicators.',
        render(body) {
            body.append(
                grid(
                    cell('count="12"', make('europa-chip', { count: '12' })),
                    cell('count="5" + label', make('europa-chip', { count: '5' }, 'troops')),
                ),
            );
        },
    },
    {
        id: 'badge',
        title: 'Badge',
        tag: 'europa-badge',
        description: 'Slotted inline label for short textual annotations.',
        render(body) {
            body.append(grid(cell('default', make('europa-badge', {}, 'Your match'))));
        },
    },
    {
        id: 'banner',
        title: 'Banner',
        tag: 'europa-banner',
        description:
            'Full-width status or alert bar. Fixed-position by design; examples below are framed in a positioned container so they do not cover the page.',
        render(body) {
            const status = make('europa-banner', { variant: 'status' }, 'Match started \u2014 good luck!');
            const alert = make('europa-banner', { variant: 'alert' }, 'Reconnecting to match\u2026');

            // Task A: wrap each banner in a positioned container so fixed
            // positioning is scoped to the box, not the viewport.
            const statusBox = make('div', { class: 'playground-banner-box' }, status);
            const alertBox = make('div', { class: 'playground-banner-box' }, alert);

            body.append(subheading('variant="status"'), statusBox, subheading('variant="alert"'), alertBox);
        },
    },
    {
        id: 'typography',
        title: 'Typography',
        tag: 'europa-typography',
        description: 'Semantic text wrapper with heading, subheading, body, label, and caption variants.',
        render(body) {
            const variants = ['heading', 'subheading', 'body', 'label', 'caption'] as const;
            const cells = variants.map((v) =>
                cell(`variant="${v}"`, make('europa-typography', { variant: v }, `The quick brown fox (${v})`)),
            );
            body.append(subheading('Variants'), grid(...cells));
        },
    },
    {
        id: 'grid',
        title: 'Grid',
        tag: 'europa-grid',
        description: 'Layout primitive with sidebar (vertical stack) and wrap (flex-wrap) modes.',
        render(body) {
            const sidebar = make(
                'europa-grid',
                { variant: 'sidebar' },
                make('europa-card', {}, 'Sidebar item'),
                make('europa-card', {}, 'Sidebar item'),
            );
            const wrap = make(
                'europa-grid',
                { variant: 'wrap' },
                make('europa-card', {}, 'Wrap A'),
                make('europa-card', {}, 'Wrap B'),
                make('europa-card', {}, 'Wrap C'),
            );
            body.append(grid(cell('variant="sidebar"', sidebar), cell('variant="wrap"', wrap)));
        },
    },
    {
        id: 'waiting',
        title: 'Waiting',
        tag: 'europa-waiting',
        description: 'Animated loading indicator with a custom message and optional reduced-motion mode.',
        render(body) {
            body.append(
                grid(
                    cell('message="Loading\u2026"', make('europa-waiting', { message: 'Loading\u2026' })),
                    cell(
                        'reduced-motion',
                        make('europa-waiting', { message: 'Reconnecting\u2026', 'reduced-motion': '' }),
                    ),
                ),
            );
        },
    },
    {
        id: 'modal',
        title: 'Modal',
        tag: 'europa-modal',
        description: 'Dialog overlay with title, body, and action buttons. Framed in a positioned box for inspection.',
        render(body) {
            const dialog = make(
                'europa-modal',
                { open: '', title: 'Example dialog' },
                make('p', {}, 'This is the modal body. Press Escape or click the backdrop to close it.'),
                make(
                    'div',
                    { slot: 'actions' },
                    make('europa-button', { variant: 'ghost' }, 'Cancel'),
                    make('europa-button', { variant: 'primary' }, 'OK'),
                ),
            );
            const framed = make('div', { class: 'playground-modal-box' }, dialog);
            body.append(subheading('open'), framed);
        },
    },

    // ── Game-specific primitives (7) ─────────────────────────────────────
    {
        id: 'troop-chip',
        title: 'Troop Chip',
        tag: 'europa-troop-chip',
        description:
            'Player-coloured chip showing troop count for a board cell, with four owner slots and an unowned state.',
        render(body) {
            const owners = ['1', '2', '3', '4', ''];
            const cells = owners.map((owner) => {
                const label = owner === '' ? 'no owner' : `owner="${owner}"`;
                const attrs = owner === '' ? { count: '20' } : { owner, count: '20' };
                return cell(label, make('europa-troop-chip', attrs));
            });
            body.append(subheading('count="20"'), grid(...cells));
        },
    },
    {
        id: 'city-marker',
        title: 'City Marker',
        tag: 'europa-city-marker',
        description: 'Small indicator for city ownership on the board, with four player colours and an unowned state.',
        render(body) {
            const owners = ['1', '2', '3', '4', ''];
            const cells = owners.map((owner) => {
                const label = owner === '' ? 'no owner' : `owner="${owner}"`;
                const attrs = owner === '' ? {} : { owner };
                return cell(label, make('europa-city-marker', attrs));
            });
            body.append(grid(...cells));
        },
    },
    {
        id: 'pipe-slope',
        title: 'Pipe Slope',
        tag: 'europa-pipe-slope',
        description:
            'Directional colour indicator for pipe flow: downhill (green), flat (amber), uphill (red), stalled (grey).',
        render(body) {
            const directions = ['downhill', 'flat', 'uphill', 'stalled'] as const;
            const cells = directions.map((d) => cell(`direction="${d}"`, make('europa-pipe-slope', { direction: d })));
            body.append(grid(...cells));
        },
    },
    {
        id: 'elevation-swatch',
        title: 'Elevation Swatch',
        tag: 'europa-elevation-swatch',
        description: 'Colour ramp tile mapping an elevation value (0\u2013100) to the terrain HSL formula.',
        render(body) {
            const elevations = [0, 25, 50, 75, 100];
            const cells = elevations.map((e) =>
                cell(`elevation="${e}"`, make('europa-elevation-swatch', { elevation: String(e) })),
            );
            body.append(subheading('Ramp (0 / 25 / 50 / 75 / 100)'), grid(...cells));
        },
    },
    {
        id: 'player-badge',
        title: 'Player Badge',
        tag: 'europa-player-badge',
        description: 'Name badge coloured by player number, used in the HUD and lobby.',
        render(body) {
            const players = ['1', '2', '3', '4', ''];
            const cells = players.map((p) => {
                if (p === '') {
                    return cell('no player', make('europa-player-badge', {}));
                }
                return cell(`player="${p}" name="Alice"`, make('europa-player-badge', { player: p, name: 'Alice' }));
            });
            body.append(grid(...cells));
        },
    },
    {
        id: 'fog-overlay',
        title: 'Fog Overlay',
        tag: 'europa-fog-overlay',
        description: 'Full-cell overlay that hides unexplored board tiles. Framed in a visible box for inspection.',
        render(body) {
            body.append(
                grid(
                    cell(
                        'default (visible)',
                        make('div', { class: 'playground-fog-box' }, make('europa-fog-overlay', {})),
                    ),
                    cell(
                        'visible="false"',
                        make('div', { class: 'playground-fog-box' }, make('europa-fog-overlay', { visible: 'false' })),
                    ),
                ),
            );
        },
    },
    {
        id: 'reserve-indicator',
        title: 'Reserve Indicator',
        tag: 'europa-reserve-indicator',
        description: 'Radial gauge showing the percentage of reserves available to a player (0\u201390%).',
        render(body) {
            const percents = ['0', '30', '60', '90'];
            const cells = percents.map((p) => cell(`percent="${p}"`, make('europa-reserve-indicator', { percent: p })));
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
