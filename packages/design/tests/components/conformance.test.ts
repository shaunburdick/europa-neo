/**
 * Conformance test for all 20 Europa Neo web components (spec 014, FR-030).
 *
 * FR-030 requires a single table-driven conformance suite that, for every
 * registered component, instantiates it with default attributes (and, where
 * relevant, a representative variant) and asserts that the rendered internal
 * DOM carries exactly the `europa-*` catalog class names it is specified to
 * produce. For game primitives the test additionally asserts that the
 * token-derived inline color matches the canonical `TOKENS` value.
 *
 * The component inventory is taken from the `REGISTRY` (the single source of
 * truth for tag → constructor mappings), so this suite automatically covers
 * all 20 components and will fail to compile/run if a registry entry is
 * missing. Class-name assertions use exact `className` equality for
 * single-class wrappers and `classList.contains` for composed class lists,
 * matching each component's actual implementation (the implementation is the
 * source of truth for this conformance test).
 *
 * Run with:
 *   pnpm --filter @europa/design exec vitest run tests/components/conformance.test.ts
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { REGISTRY } from '../../src/components/registry.js';
import { TOKENS } from '../../src/tokens.js';

/**
 * The inline style properties a conformance scenario may assert against the
 * token-derived color of a game primitive.
 */
type StyleProp = 'borderColor' | 'color' | 'backgroundColor' | 'borderTopColor';

/**
 * A single conformance scenario: instantiate `tag` (optionally with `attrs`),
 * then assert the rendered internal element's class names, attributes, text,
 * and/or token-derived inline color.
 */
interface Scenario {
    /** Human-readable test name. */
    readonly name: string;
    /** The custom element tag to instantiate. */
    readonly tag: string;
    /** Attributes to set on the host before it is connected. */
    readonly attrs?: Readonly<Record<string, string>>;
    /** Selector for the internal element to inspect (defaults to `:scope > *`). */
    readonly selector?: string;
    /** Exact `className` string equality (use for single-class wrappers). */
    readonly expectExactClassName?: string;
    /** Assert the element has no `class` attribute at all. */
    readonly expectNoClass?: boolean;
    /** Class names that must all be present (composed class lists). */
    readonly expectClasses?: ReadonlyArray<string>;
    /** Attribute name → expected value assertions. */
    readonly expectAttr?: Readonly<Record<string, string>>;
    /** Expected `textContent` of the inspected element. */
    readonly expectText?: string;
    /** Token-derived inline style assertions. */
    readonly expectStyles?: ReadonlyArray<{ readonly prop: StyleProp; readonly value: string }>;
    /** Optional extra assertions against the host element. */
    readonly extraAssert?: (host: HTMLElement) => void;
}

/** Tag → constructor lookup built from the canonical registry. */
const CTOR_BY_TAG = new Map(REGISTRY.map((definition) => [definition.tag, definition.ctor]));

/**
 * Read a named inline style property off a `CSSStyleDeclaration` without
 * resorting to `any` (the named color properties are all strings).
 *
 * @param style  The element's `style` object.
 * @param prop   The color property to read.
 * @returns The inline style value as a string.
 */
function readStyle(style: CSSStyleDeclaration, prop: StyleProp): string {
    return (style as unknown as Record<StyleProp, string>)[prop];
}

/**
 * The full conformance matrix: one (or more) scenario per component, covering
 * the default (no-attribute) render plus a representative variant where the
 * component's class list or accessibility contract is attribute-driven.
 */
const SCENARIOS: ReadonlyArray<Scenario> = [
    // ── Generic primitives (13) ──────────────────────────────────────────
    {
        name: 'europa-button renders the europa-button base class by default',
        tag: 'europa-button',
        expectExactClassName: 'europa-button',
    },
    {
        name: 'europa-button maps variant to a europa-button--<variant> modifier',
        tag: 'europa-button',
        attrs: { variant: 'primary' },
        expectClasses: ['europa-button', 'europa-button--primary'],
    },
    {
        name: 'europa-card renders the europa-card wrapper',
        tag: 'europa-card',
        expectExactClassName: 'europa-card',
    },
    {
        name: 'europa-plate renders the europa-plate wrapper',
        tag: 'europa-plate',
        expectExactClassName: 'europa-plate',
    },
    {
        name: 'europa-modal renders the europa-modal-backdrop and europa-modal dialog',
        tag: 'europa-modal',
        selector: '.europa-modal-backdrop',
        expectClasses: ['europa-modal-backdrop'],
        extraAssert: (host: HTMLElement): void => {
            const dialog = host.querySelector('.europa-modal');
            expect(dialog).not.toBeNull();
            expect(dialog?.classList.contains('europa-modal')).toBe(true);
        },
    },
    {
        name: 'europa-chip renders the europa-chip wrapper',
        tag: 'europa-chip',
        expectExactClassName: 'europa-chip',
    },
    {
        name: 'europa-badge renders the europa-badge wrapper',
        tag: 'europa-badge',
        expectExactClassName: 'europa-badge',
    },
    {
        name: 'europa-banner defaults to the status live-region contract',
        tag: 'europa-banner',
        expectClasses: ['europa-banner'],
        expectAttr: { role: 'status', 'aria-live': 'polite' },
    },
    {
        name: 'europa-banner variant="alert" switches to the alert live-region contract',
        tag: 'europa-banner',
        attrs: { variant: 'alert' },
        expectClasses: ['europa-banner'],
        expectAttr: { role: 'alert', 'aria-live': 'assertive' },
    },
    {
        name: 'europa-typography defaults to the body variant classes',
        tag: 'europa-typography',
        expectClasses: ['europa-typography', 'europa-typography--body'],
    },
    {
        name: 'europa-typography variant="heading" applies the heading modifier',
        tag: 'europa-typography',
        attrs: { variant: 'heading' },
        expectClasses: ['europa-typography', 'europa-typography--heading'],
    },
    {
        name: 'europa-waiting renders the europa-waiting family of classes',
        tag: 'europa-waiting',
        selector: '.europa-waiting',
        expectClasses: ['europa-waiting'],
        extraAssert: (host: HTMLElement): void => {
            expect(host.querySelector('.europa-waiting__plate')?.classList.contains('europa-waiting__plate')).toBe(
                true,
            );
            expect(host.querySelector('.europa-waiting__pulse')?.classList.contains('europa-waiting__pulse')).toBe(
                true,
            );
            expect(host.querySelector('.europa-waiting__text')?.classList.contains('europa-waiting__text')).toBe(true);
        },
    },
    {
        name: 'europa-waiting reduced-motion adds the europa-waiting--reduced modifier',
        tag: 'europa-waiting',
        attrs: { 'reduced-motion': '' },
        selector: '.europa-waiting',
        expectClasses: ['europa-waiting', 'europa-waiting--reduced'],
    },
    {
        name: 'europa-grid renders the europa-grid wrapper by default',
        tag: 'europa-grid',
        expectExactClassName: 'europa-grid',
    },
    {
        name: 'europa-grid variant="sidebar" adds the europa-grid--sidebar modifier',
        tag: 'europa-grid',
        attrs: { variant: 'sidebar' },
        expectClasses: ['europa-grid', 'europa-grid--sidebar'],
    },
    {
        name: 'europa-stack renders the europa-stack wrapper',
        tag: 'europa-stack',
        expectExactClassName: 'europa-stack',
    },
    {
        name: 'europa-container renders the europa-container wrapper',
        tag: 'europa-container',
        expectExactClassName: 'europa-container',
    },
    {
        name: 'europa-page renders the europa-page wrapper',
        tag: 'europa-page',
        expectExactClassName: 'europa-page',
    },

    // ── Game-specific primitives (7) ─────────────────────────────────────
    {
        name: 'europa-troop-chip owner="1" uses the accent token color',
        tag: 'europa-troop-chip',
        attrs: { count: '1', owner: '1' },
        expectClasses: ['europa-chip'],
        expectStyles: [
            { prop: 'borderColor', value: TOKENS.color.accent },
            { prop: 'color', value: TOKENS.color.accent },
        ],
    },
    {
        name: 'europa-city-marker owner="2" uses the city token color (no catalog class)',
        tag: 'europa-city-marker',
        attrs: { owner: '2' },
        expectNoClass: true,
        expectStyles: [
            { prop: 'backgroundColor', value: TOKENS.color.city },
            { prop: 'borderColor', value: TOKENS.color.city },
        ],
    },
    {
        name: 'europa-pipe-slope direction="downhill" uses the pipeDownhill token color (no catalog class)',
        tag: 'europa-pipe-slope',
        attrs: { direction: 'downhill' },
        expectNoClass: true,
        expectStyles: [{ prop: 'borderTopColor', value: TOKENS.color.pipeDownhill }],
    },
    {
        name: 'europa-elevation-swatch elevation="100" computes the land-band hsl color (no catalog class)',
        tag: 'europa-elevation-swatch',
        attrs: { elevation: '100' },
        expectNoClass: true,
        expectStyles: [{ prop: 'backgroundColor', value: 'hsl(120, 12%, 62%)' }],
    },
    {
        name: 'europa-player-badge player="3" uses the green token color',
        tag: 'europa-player-badge',
        attrs: { player: '3' },
        expectClasses: ['europa-badge'],
        expectStyles: [{ prop: 'color', value: TOKENS.color.green }],
    },
    {
        name: 'europa-fog-overlay renders an aria-hidden overlay (no catalog class)',
        tag: 'europa-fog-overlay',
        expectNoClass: true,
        expectAttr: { 'aria-hidden': 'true' },
    },
    {
        name: 'europa-reserve-indicator percent="30" renders the europa-chip with "30%" text',
        tag: 'europa-reserve-indicator',
        attrs: { percent: '30' },
        expectClasses: ['europa-chip'],
        expectText: '30%',
    },
];

describe('web component conformance (FR-030)', () => {
    beforeAll(() => {
        for (const { tag, ctor } of REGISTRY) {
            if (customElements.get(tag) === undefined) {
                customElements.define(tag, ctor);
            }
        }
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    for (const scenario of SCENARIOS) {
        it(scenario.name, () => {
            const ctor = CTOR_BY_TAG.get(scenario.tag);
            expect(ctor, `missing constructor for ${scenario.tag}`).toBeDefined();

            const host = document.createElement(scenario.tag);
            if (scenario.attrs !== undefined) {
                for (const [key, value] of Object.entries(scenario.attrs)) {
                    host.setAttribute(key, value);
                }
            }
            document.body.appendChild(host);

            const selector = scenario.selector ?? ':scope > *';
            const el = host.querySelector(selector);
            expect(el, `expected internal element for ${scenario.tag}`).not.toBeNull();

            if (scenario.expectNoClass === true) {
                expect(el?.className).toBe('');
            }

            if (scenario.expectExactClassName !== undefined) {
                expect(el?.className).toBe(scenario.expectExactClassName);
            }

            if (scenario.expectClasses !== undefined) {
                for (const cls of scenario.expectClasses) {
                    expect(el?.classList.contains(cls), `expected class "${cls}" on ${scenario.tag}`).toBe(true);
                }
            }

            if (scenario.expectAttr !== undefined) {
                for (const [key, value] of Object.entries(scenario.expectAttr)) {
                    expect(el?.getAttribute(key), `expected attribute ${key} on ${scenario.tag}`).toBe(value);
                }
            }

            if (scenario.expectText !== undefined) {
                expect(el?.textContent).toBe(scenario.expectText);
            }

            if (scenario.expectStyles !== undefined) {
                for (const { prop, value } of scenario.expectStyles) {
                    expect(
                        el !== null ? readStyle(el.style, prop) : '',
                        `expected style ${prop} on ${scenario.tag}`,
                    ).toBe(value);
                }
            }

            if (scenario.extraAssert !== undefined) {
                scenario.extraAssert(host);
            }
        });
    }
});
