import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EuropaPipeSlope } from '../../../src/components/game/pipe-slope.js';
import { TOKENS } from '../../../src/tokens.js';

/**
 * Tests for the `<europa-pipe-slope>` component (spec 014, FR-009 / FR-010 /
 * FR-014).
 *
 * The component reads a `direction` attribute (`downhill` | `flat` | `uphill` |
 * `stalled`) and renders a `<span role="img">` whose `borderBottomColor` is the
 * corresponding canonical pipe token. The 16px bottom border forms the visible
 * downward-pointing triangle; left/right borders (12px) are transparent. An
 * unknown or absent direction falls back to the muted `pipeStalled` token.
 * Uses light DOM and inline styles only — no Shadow DOM.
 *
 * Covered here (T-049):
 * - Each direction maps to the correct `TOKENS.color.pipe*` value.
 * - `aria-label` is generated from the direction (e.g. "pipe downhill").
 * - Internal span carries `role="img"`.
 * - Changing the `direction` attribute updates both color and `aria-label`.
 * - Unknown / absent direction falls back to `pipeStalled`.
 */
describe('europa-pipe-slope', () => {
    beforeAll(() => {
        customElements.define('europa-pipe-slope', EuropaPipeSlope);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    /**
     * Helper: create a `<europa-pipe-slope>`, optionally set `direction`, and
     * append to the DOM so the connected callback fires.
     */
    function mount(direction?: string): EuropaPipeSlope {
        const el = document.createElement('europa-pipe-slope') as EuropaPipeSlope;
        if (direction !== undefined) {
            el.setAttribute('direction', direction);
        }
        document.body.appendChild(el);
        return el;
    }

    /**
     * Helper: return the internal `<span role="img">` rendered inside the
     * component.
     */
    function getIndicator(el: EuropaPipeSlope): HTMLSpanElement {
        const span = el.querySelector('span[role="img"]');
        expect(span).not.toBeNull();
        return span as HTMLSpanElement;
    }

    // ── T-049.1: direction → token color ────────────────────────────────

    describe('direction → token color', () => {
        const cases: Array<{
            direction: string;
            tokenKey: keyof typeof TOKENS.color;
            label: string;
        }> = [
            {
                direction: 'downhill',
                tokenKey: 'pipeDownhill',
                label: 'downhill',
            },
            {
                direction: 'flat',
                tokenKey: 'pipeFlat',
                label: 'flat',
            },
            {
                direction: 'uphill',
                tokenKey: 'pipeUphill',
                label: 'uphill',
            },
            {
                direction: 'stalled',
                tokenKey: 'pipeStalled',
                label: 'stalled',
            },
        ];

        for (const { direction, tokenKey, label } of cases) {
            it(`sets borderBottomColor to ${label} token (${TOKENS.color[tokenKey]})`, () => {
                const el = mount(direction);
                const span = getIndicator(el);
                expect(span.style.borderBottomColor).toBe(TOKENS.color[tokenKey]);
            });
        }
    });

    // ── T-049.2: aria-label generation ──────────────────────────────────

    describe('aria-label', () => {
        it('sets aria-label to "pipe <direction>" for each valid direction', () => {
            for (const direction of ['downhill', 'flat', 'uphill', 'stalled']) {
                document.body.innerHTML = '';
                const el = mount(direction);
                const span = getIndicator(el);
                expect(span.getAttribute('aria-label')).toBe(`pipe ${direction}`);
            }
        });
    });

    // ── T-049.3: role="img" on the internal span ────────────────────────

    it('renders an internal span with role="img"', () => {
        const el = mount('downhill');
        const span = getIndicator(el);
        expect(span.getAttribute('role')).toBe('img');
    });

    // ── T-049.4: attribute change updates color and aria-label ──────────

    it('updates color and aria-label when direction attribute changes', () => {
        const el = mount('downhill');
        const span = getIndicator(el);

        expect(span.style.borderBottomColor).toBe(TOKENS.color.pipeDownhill);
        expect(span.getAttribute('aria-label')).toBe('pipe downhill');

        el.setAttribute('direction', 'flat');
        expect(span.style.borderBottomColor).toBe(TOKENS.color.pipeFlat);
        expect(span.getAttribute('aria-label')).toBe('pipe flat');

        el.setAttribute('direction', 'uphill');
        expect(span.style.borderBottomColor).toBe(TOKENS.color.pipeUphill);
        expect(span.getAttribute('aria-label')).toBe('pipe uphill');

        el.setAttribute('direction', 'stalled');
        expect(span.style.borderBottomColor).toBe(TOKENS.color.pipeStalled);
        expect(span.getAttribute('aria-label')).toBe('pipe stalled');
    });

    // ── T-049.5: unknown / absent direction → stalled fallback ───────────

    describe('unknown / absent direction falls back to stalled', () => {
        it('falls back to stalled when direction is absent', () => {
            const el = mount();
            const span = getIndicator(el);

            expect(span.style.borderBottomColor).toBe(TOKENS.color.pipeStalled);
            expect(span.getAttribute('aria-label')).toBe('pipe stalled');
        });

        it('falls back to stalled for an unrecognized direction value', () => {
            const el = mount('diagonal');
            const span = getIndicator(el);

            expect(span.style.borderBottomColor).toBe(TOKENS.color.pipeStalled);
            expect(span.getAttribute('aria-label')).toBe('pipe stalled');
        });

        it('falls back to stalled when direction is set to empty string', () => {
            const el = mount('');
            const span = getIndicator(el);

            expect(span.style.borderBottomColor).toBe(TOKENS.color.pipeStalled);
            expect(span.getAttribute('aria-label')).toBe('pipe stalled');
        });
    });
});
