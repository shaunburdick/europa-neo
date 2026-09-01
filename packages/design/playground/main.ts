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

/**
 * Convert a camelCase / PascalCase identifier to kebab-case, mirroring the
 * emitter in `scripts/build-css.ts` so the playground's runtime token
 * variables match the ones `dist/design.css` would define.
 *
 * @param value - Identifier segment (e.g. `pageBg`, `surfaceRaised`).
 * @returns Kebab-case form (`page-bg`, `surface-raised`).
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
 *
 * @param tag - The element tag name (e.g. `europa-button` or `div`).
 * @param attrs - Attribute name → value map (empty string for boolean attrs).
 * @param children - Child nodes or text to append.
 * @returns The configured element.
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
 *
 * @param label - Caption text describing the example.
 * @param example - The rendered component/node to display.
 * @returns A flex column cell.
 */
function cell(label: string, example: Node): HTMLElement {
    return make('div', { class: 'playground-cell' }, make('span', { class: 'playground-label' }, label), example);
}

/**
 * Build a section wrapper with a heading and a body container.
 *
 * @param title - The section heading text.
 * @returns A tuple of `[section, body]` where children go into `body`.
 */
function section(title: string): { section: HTMLElement; body: HTMLElement } {
    const body = make('div');
    const heading = make('h2', {}, title);
    const sectionEl = make('section', { class: 'playground-section' }, heading, body);
    return { section: sectionEl, body };
}

/**
 * Build a sub-heading inside a section body.
 *
 * @param text - The sub-heading text.
 * @returns An `<h3>` element.
 */
function subheading(text: string): HTMLElement {
    return make('h3', {}, text);
}

/**
 * Build a flex-wrap grid of cells.
 *
 * @param cells - The cells to lay out.
 * @returns A grid container.
 */
function grid(...cells: Array<HTMLElement>): HTMLElement {
    return make('div', { class: 'playground-grid' }, ...cells);
}

// ---------------------------------------------------------------------------
// Section 1 — Generic components (13)
// ---------------------------------------------------------------------------

const generic = section('1 · Generic components');

// europa-button — variant / size / disabled matrix
{
    const variants = ['primary', 'secondary', 'ghost', 'success', 'warning', 'error', 'info'];
    const variantCells = variants.map((variant) => cell(`${variant}`, make('europa-button', { variant }, variant)));
    const sizeCells = [
        cell('size="sm"', make('europa-button', { variant: 'primary', size: 'sm' }, 'Small')),
        cell('size="lg"', make('europa-button', { variant: 'primary', size: 'lg' }, 'Large')),
    ];
    const disabledCell = cell('disabled', make('europa-button', { variant: 'primary', disabled: '' }, 'Disabled'));

    generic.body.append(subheading('europa-button'), grid(...variantCells), grid(...sizeCells, disabledCell));
}

// europa-card / europa-plate / europa-stack / europa-container / europa-page
{
    const card = make(
        'europa-card',
        {},
        make('strong', {}, 'Card'),
        make('p', {}, 'A surface for grouping related content.'),
    );
    const plate = make('europa-plate', {}, make('strong', {}, 'Plate'), make('p', {}, 'A lighter content surface.'));
    const stack = make(
        'europa-stack',
        {},
        make('europa-button', { variant: 'secondary' }, 'First'),
        make('europa-button', { variant: 'secondary' }, 'Second'),
    );
    const container = make(
        'europa-container',
        {},
        make('h3', {}, 'Container'),
        make('p', {}, 'A full-width padded wrapper.'),
    );
    const page = make(
        'europa-page',
        {},
        make('h1', {}, 'Page'),
        make('p', {}, 'A top-level page scaffold (max-width, centered).'),
    );

    generic.body.append(
        subheading('europa-card / europa-plate / europa-stack / europa-container / europa-page'),
        grid(
            cell('europa-card', card),
            cell('europa-plate', plate),
            cell('europa-stack', stack),
            cell('europa-container', container),
            cell('europa-page', page),
        ),
    );
}

// europa-chip (count) + europa-badge (slotted label)
{
    const chip = make('europa-chip', { count: '12' });
    const chipWithLabel = make('europa-chip', { count: '5' }, 'troops');
    const badge = make('europa-badge', {}, 'Your match');

    generic.body.append(
        subheading('europa-chip / europa-badge'),
        grid(
            cell('europa-chip count="12"', chip),
            cell('europa-chip count="5" + label', chipWithLabel),
            cell('europa-badge', badge),
        ),
    );
}

// europa-banner — status / alert
{
    const status = make('europa-banner', { variant: 'status' }, 'Match started — good luck!');
    const alert = make('europa-banner', { variant: 'alert' }, 'Reconnecting to match…');

    generic.body.append(
        subheading('europa-banner'),
        grid(cell('variant="status"', status), cell('variant="alert"', alert)),
    );
}

// europa-typography — heading / subheading / body / label / caption
{
    const variants = ['heading', 'subheading', 'body', 'label', 'caption'] as const;
    const cells = variants.map((variant) =>
        cell(`variant="${variant}"`, make('europa-typography', { variant }, `The quick brown fox (${variant})`)),
    );

    generic.body.append(subheading('europa-typography'), grid(...cells));
}

// europa-grid — sidebar / wrap
{
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

    generic.body.append(
        subheading('europa-grid'),
        grid(cell('variant="sidebar"', sidebar), cell('variant="wrap"', wrap)),
    );
}

// europa-waiting — message + reduced-motion
{
    const waiting = make('europa-waiting', { message: 'Loading…' });
    const reduced = make('europa-waiting', { message: 'Reconnecting…', 'reduced-motion': '' });

    generic.body.append(
        subheading('europa-waiting'),
        grid(cell('message="Loading…"', waiting), cell('reduced-motion', reduced)),
    );
}

// europa-modal — OPEN example framed inside a positioned container
{
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

    generic.body.append(subheading('europa-modal (open)'), framed);
}

// ---------------------------------------------------------------------------
// Section 2 — Game-specific primitives (7)
// ---------------------------------------------------------------------------

const game = section('2 · Game-specific primitives');

// europa-troop-chip — owner 1..4 + absent, with count
{
    const owners = ['1', '2', '3', '4', ''];
    const cells = owners.map((owner) => {
        const label = owner === '' ? 'no owner' : `owner="${owner}"`;
        const attrs = owner === '' ? { count: '20' } : { owner, count: '20' };
        return cell(label, make('europa-troop-chip', attrs));
    });

    game.body.append(subheading('europa-troop-chip (count="20")'), grid(...cells));
}

// europa-city-marker — owner 1..4 + absent
{
    const owners = ['1', '2', '3', '4', ''];
    const cells = owners.map((owner) => {
        const label = owner === '' ? 'no owner' : `owner="${owner}"`;
        const attrs = owner === '' ? {} : { owner };
        return cell(label, make('europa-city-marker', attrs));
    });

    game.body.append(subheading('europa-city-marker'), grid(...cells));
}

// europa-pipe-slope — downhill / flat / uphill / stalled
{
    const directions = ['downhill', 'flat', 'uphill', 'stalled'] as const;
    const cells = directions.map((direction) =>
        cell(`direction="${direction}"`, make('europa-pipe-slope', { direction })),
    );

    game.body.append(subheading('europa-pipe-slope'), grid(...cells));
}

// europa-elevation-swatch — ramp of elevation values
{
    const elevations = [0, 25, 50, 75, 100];
    const cells = elevations.map((elevation) =>
        cell(`elevation="${elevation}"`, make('europa-elevation-swatch', { elevation: String(elevation) })),
    );

    game.body.append(subheading('europa-elevation-swatch'), grid(...cells));
}

// europa-player-badge — player 1..4 + name, plus absent
{
    const players = ['1', '2', '3', '4', ''];
    const cells = players.map((player) => {
        if (player === '') {
            return cell('no player', make('europa-player-badge', {}));
        }
        return cell(`player="${player}" name="Alice"`, make('europa-player-badge', { player, name: 'Alice' }));
    });

    game.body.append(subheading('europa-player-badge'), grid(...cells));
}

// europa-fog-overlay — visible (default) + visible="false", framed in a box
{
    const visible = make('europa-fog-overlay', {});
    const hidden = make('europa-fog-overlay', { visible: 'false' });

    game.body.append(
        subheading('europa-fog-overlay (framed)'),
        grid(
            cell('default (visible)', make('div', { class: 'playground-fog-box' }, visible)),
            cell('visible="false"', make('div', { class: 'playground-fog-box' }, hidden)),
        ),
    );
}

// europa-reserve-indicator — percent 0 / 30 / 60 / 90
{
    const percents = ['0', '30', '60', '90'];
    const cells = percents.map((percent) =>
        cell(`percent="${percent}"`, make('europa-reserve-indicator', { percent })),
    );

    game.body.append(subheading('europa-reserve-indicator'), grid(...cells));
}

// ---------------------------------------------------------------------------
// Section 3 — Token color reference
// ---------------------------------------------------------------------------

const tokens = section('3 · Token color reference');

/**
 * Build a single color swatch (box + hex/value label).
 *
 * @param label - Caption shown under the swatch.
 * @param value - The CSS color value to paint the box with.
 * @returns A swatch cell.
 */
function swatch(label: string, value: string): HTMLElement {
    const box = make('div', { class: 'swatch-box' });
    box.style.backgroundColor = value;
    return make('div', { class: 'playground-swatch' }, box, make('span', { class: 'swatch-label' }, label));
}

// Player colors
{
    const playerColors: Array<[string, string]> = [
        ['P1', TOKENS.color.accent],
        ['P2', TOKENS.color.city],
        ['P3', TOKENS.color.green],
        ['P4', TOKENS.color.blue],
        ['fallback', TOKENS.color.textMuted],
    ];
    const cells = playerColors.map(([label, value]) => swatch(`${label} · ${value}`, value));
    tokens.body.append(subheading('Player colors'), make('div', { class: 'playground-swatch-row' }, ...cells));
}

// Pipe-slope colors
{
    const pipeColors: Array<[string, string]> = [
        ['downhill', TOKENS.color.pipeDownhill],
        ['flat', TOKENS.color.pipeFlat],
        ['uphill', TOKENS.color.pipeUphill],
        ['stalled', TOKENS.color.pipeStalled],
    ];
    const cells = pipeColors.map(([label, value]) => swatch(`${label} · ${value}`, value));
    tokens.body.append(subheading('Pipe-slope colors'), make('div', { class: 'playground-swatch-row' }, ...cells));
}

// Elevation ramp — replicate the component's hsl() formula from tokens
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
    tokens.body.append(
        subheading('Elevation ramp (0→100, step 10)'),
        make('div', { class: 'playground-swatch-row' }, ...cells),
    );
}

// Base palette — a selection of key TOKENS.color.* values
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
        return swatch(`${key} · ${value}`, value);
    });
    tokens.body.append(
        subheading('Base palette (TOKENS.color.*)'),
        make('div', { class: 'playground-swatch-row' }, ...cells),
    );
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const app = document.getElementById('app');
if (app !== null) {
    app.append(generic.section, game.section, tokens.section);
}
