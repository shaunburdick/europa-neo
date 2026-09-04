/**
 * Conformance test for all 20 Europa Neo React components (spec 014, FR-030).
 *
 * FR-030 requires a single table-driven conformance suite that, for every
 * component, renders it with default props (and, where relevant, a
 * representative variant) and asserts that the rendered DOM carries exactly
 * the `europa-*` catalog class names it is specified to produce. For game
 * primitives the test additionally asserts that the token-derived inline
 * color matches the canonical `TOKENS` value.
 *
 * The component inventory is taken from the barrel exports (the single
 * source of truth for component → prop-type mappings), so this suite
 * automatically covers all 20 components and will fail to compile/run if
 * a barrel export is missing.
 *
 * Run with:
 *   pnpm --filter @europa/design exec vitest run tests/components/conformance.test.ts
 */

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
} from '../../src/components/index.js';
import { TOKENS } from '../../src/tokens.js';

// ---------------------------------------------------------------------------
// Scenario types
// ---------------------------------------------------------------------------

/**
 * The inline style properties a conformance scenario may assert against the
 * token-derived color of a game primitive.
 */
type StyleProp = 'borderColor' | 'color' | 'backgroundColor' | 'borderBottomColor';

/**
 * A single conformance scenario: render a React component with optional
 * props, then assert the rendered DOM's class names, attributes, text,
 * and/or token-derived inline color.
 */
interface Scenario {
    /** Human-readable test name. */
    readonly name: string;
    /** React element to render (JSX). */
    readonly element: React.ReactElement;
    /** Selector for the element to inspect (defaults to first rendered child). */
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
}

// ---------------------------------------------------------------------------
// Style helper
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// The full conformance matrix
// ---------------------------------------------------------------------------

const SCENARIOS: ReadonlyArray<Scenario> = [
    // ── Generic primitives (13) ──────────────────────────────────────────
    {
        name: 'EuropaButton renders the europa-button base class by default',
        element: <EuropaButton>Deploy</EuropaButton>,
        expectExactClassName: 'europa-button',
    },
    {
        name: 'EuropaButton maps variant to a europa-button--<variant> modifier',
        element: <EuropaButton variant="primary">Deploy</EuropaButton>,
        expectClasses: ['europa-button', 'europa-button--primary'],
    },
    {
        name: 'EuropaCard renders the europa-card wrapper',
        element: <EuropaCard>Content</EuropaCard>,
        expectExactClassName: 'europa-card',
    },
    {
        name: 'EuropaPlate renders the europa-plate wrapper',
        element: <EuropaPlate>Content</EuropaPlate>,
        expectExactClassName: 'europa-plate',
    },
    {
        name: 'EuropaModal renders the europa-modal-backdrop and europa-modal dialog',
        element: (
            <EuropaModal open title="Test">
                Content
            </EuropaModal>
        ),
        selector: '.europa-modal-backdrop',
        expectClasses: ['europa-modal-backdrop'],
    },
    {
        name: 'EuropaModal dialog has correct a11y attributes',
        element: (
            <EuropaModal open title="Confirm">
                Are you sure?
            </EuropaModal>
        ),
        selector: '.europa-modal',
        expectClasses: ['europa-modal'],
        expectAttr: { role: 'dialog', 'aria-modal': 'true' },
    },
    {
        name: 'EuropaChip renders the europa-chip wrapper',
        element: <EuropaChip count={5} />,
        expectExactClassName: 'europa-chip',
    },
    {
        name: 'EuropaBadge renders the europa-badge wrapper',
        element: <EuropaBadge>Label</EuropaBadge>,
        expectExactClassName: 'europa-badge',
    },
    {
        name: 'EuropaBanner defaults to the status live-region contract',
        element: <EuropaBanner>Status message</EuropaBanner>,
        expectClasses: ['europa-banner'],
        expectAttr: { role: 'status', 'aria-live': 'polite' },
    },
    {
        name: 'EuropaBanner variant="alert" switches to the alert live-region contract',
        element: <EuropaBanner variant="alert">Alert!</EuropaBanner>,
        expectClasses: ['europa-banner'],
        expectAttr: { role: 'alert', 'aria-live': 'assertive' },
    },
    {
        name: 'EuropaTypography defaults to the body variant classes',
        element: <EuropaTypography>Text</EuropaTypography>,
        expectClasses: ['europa-typography', 'europa-typography--body'],
    },
    {
        name: 'EuropaTypography variant="heading" applies the heading modifier',
        element: <EuropaTypography variant="heading">Heading</EuropaTypography>,
        expectClasses: ['europa-typography', 'europa-typography--heading'],
    },
    {
        name: 'EuropaWaiting renders the europa-waiting family of classes',
        element: <EuropaWaiting message="Loading…" />,
        selector: '.europa-waiting',
        expectClasses: ['europa-waiting'],
    },
    {
        name: 'EuropaWaiting reducedMotion adds the europa-waiting--reduced modifier',
        element: <EuropaWaiting message="Loading…" reducedMotion />,
        selector: '.europa-waiting',
        expectClasses: ['europa-waiting', 'europa-waiting--reduced'],
    },
    {
        name: 'EuropaGrid renders the europa-grid wrapper by default',
        element: <EuropaGrid>Content</EuropaGrid>,
        expectExactClassName: 'europa-grid',
    },
    {
        name: 'EuropaGrid variant="sidebar" adds the europa-grid--sidebar modifier',
        element: <EuropaGrid variant="sidebar">Content</EuropaGrid>,
        expectClasses: ['europa-grid', 'europa-grid--sidebar'],
    },
    {
        name: 'EuropaStack renders the europa-stack wrapper',
        element: <EuropaStack>Content</EuropaStack>,
        expectExactClassName: 'europa-stack',
    },
    {
        name: 'EuropaContainer renders the europa-container wrapper',
        element: <EuropaContainer>Content</EuropaContainer>,
        expectExactClassName: 'europa-container',
    },
    {
        name: 'EuropaPage renders the europa-page wrapper',
        element: <EuropaPage>Content</EuropaPage>,
        expectExactClassName: 'europa-page',
    },

    // ── Game-specific primitives (7) ─────────────────────────────────────
    {
        name: 'EuropaTroopChip owner=1 uses the accent token color',
        element: <EuropaTroopChip count={1} owner={1} />,
        expectClasses: ['europa-chip'],
        expectStyles: [
            { prop: 'borderColor', value: TOKENS.color.accent },
            { prop: 'color', value: TOKENS.color.accent },
        ],
    },
    {
        name: 'EuropaCityMarker owner=2 uses the city token color (no catalog class)',
        element: <EuropaCityMarker owner={2} />,
        expectNoClass: true,
        expectStyles: [
            { prop: 'backgroundColor', value: TOKENS.color.city },
            { prop: 'borderColor', value: TOKENS.color.city },
        ],
    },
    {
        name: 'EuropaPipeSlope direction="downhill" uses the pipeDownhill token color (no catalog class)',
        element: <EuropaPipeSlope direction="downhill" />,
        expectNoClass: true,
        expectStyles: [{ prop: 'borderBottomColor', value: TOKENS.color.pipeDownhill }],
    },
    {
        name: 'EuropaElevationSwatch elevation=100 computes the land-band hsl color (no catalog class)',
        element: <EuropaElevationSwatch elevation={100} />,
        expectNoClass: true,
        expectStyles: [{ prop: 'backgroundColor', value: 'hsl(120, 12%, 62%)' }],
    },
    {
        name: 'EuropaPlayerBadge player=3 uses the green token color',
        element: <EuropaPlayerBadge player={3} />,
        expectClasses: ['europa-badge'],
        expectStyles: [{ prop: 'color', value: TOKENS.color.green }],
    },
    {
        name: 'EuropaFogOverlay renders an aria-hidden overlay (no catalog class)',
        element: <EuropaFogOverlay />,
        expectNoClass: true,
        expectAttr: { 'aria-hidden': 'true' },
    },
    {
        name: 'EuropaReserveIndicator percent=30 renders the europa-chip with "30%" text',
        element: <EuropaReserveIndicator percent={30} />,
        expectClasses: ['europa-chip'],
        expectText: '30%',
    },
];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('React component conformance (FR-030)', () => {
    afterEach(() => {
        // RTL cleanup handled by setup.ts afterEach(cleanup)
    });

    for (const scenario of SCENARIOS) {
        it(scenario.name, () => {
            const { container } = render(scenario.element);

            // Resolve the target element: use selector if provided, otherwise
            // take the first child of the container (the rendered root).
            const el =
                scenario.selector !== undefined
                    ? container.querySelector(scenario.selector)
                    : container.firstElementChild;

            expect(el, `expected element for scenario "${scenario.name}"`).not.toBeNull();

            if (scenario.expectNoClass === true) {
                expect(el?.className).toBe('');
            }

            if (scenario.expectExactClassName !== undefined) {
                expect(el?.className).toBe(scenario.expectExactClassName);
            }

            if (scenario.expectClasses !== undefined) {
                for (const cls of scenario.expectClasses) {
                    expect(el?.classList.contains(cls), `expected class "${cls}" in scenario "${scenario.name}"`).toBe(
                        true,
                    );
                }
            }

            if (scenario.expectAttr !== undefined) {
                for (const [key, value] of Object.entries(scenario.expectAttr)) {
                    expect(el?.getAttribute(key), `expected attribute ${key} in scenario "${scenario.name}"`).toBe(
                        value,
                    );
                }
            }

            if (scenario.expectText !== undefined) {
                expect(el?.textContent).toBe(scenario.expectText);
            }

            if (scenario.expectStyles !== undefined) {
                for (const { prop, value } of scenario.expectStyles) {
                    expect(
                        el !== null ? readStyle(el.style, prop) : '',
                        `expected style ${prop} in scenario "${scenario.name}"`,
                    ).toBe(value);
                }
            }
        });
    }
});
