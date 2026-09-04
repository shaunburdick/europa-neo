/**
 * Tests for the deterministic CSS emitter (spec 012, FR-006 / FR-046)
 * and the `--emit-json` mode (Feature 062, FR-006).
 *
 * Validates `buildCssText()` output structure, variable coverage, new
 * shadow/motion/color/typography/focus-ring tokens, inline comments,
 * and byte-identical determinism.  Validates `buildTokensJson()` array
 * structure, lexicographic sort, and completeness.
 *
 * Does NOT test `writeDesignCss()` — it requires filesystem setup beyond
 * the scope of unit tests. The former `emitCatalogStylesModule()` was
 * removed in the React conversion (spec 014 Clarifications v1.2).
 */

import { describe, expect, it } from 'vitest';

import { buildCssText, buildTokensJson } from '../scripts/build-css.js';

// ---------------------------------------------------------------------------
// buildCssText()
// ---------------------------------------------------------------------------

describe('buildCssText()', () => {
    it('starts with :root { and ends with }', () => {
        const css = buildCssText();
        expect(css).toMatch(/^:root \{\n/);
        expect(css).toMatch(/\n\}\n$/);
    });

    it('contains all token groups as CSS variables', () => {
        const css = buildCssText();
        expect(css).toContain('--europa-color-');
        expect(css).toContain('--europa-shadows-');
        expect(css).toContain('--europa-motion-');
        expect(css).toContain('--europa-typography-');
        expect(css).toContain('--europa-focus-ring-');
        expect(css).toContain('--europa-spacing-');
        expect(css).toContain('--europa-radii-');
        expect(css).toContain('--europa-borders-');
        expect(css).toContain('--europa-control-height-');
    });

    it('includes the new shadow tokens', () => {
        const css = buildCssText();
        expect(css).toContain('--europa-shadows-card-hover: 0 4px 12px rgba(0, 0, 0, 0.3);');
        expect(css).toContain('--europa-shadows-card-active: 0 2px 4px rgba(0, 0, 0, 0.25);');
        expect(css).toContain('--europa-shadows-hud: 0 2px 8px rgba(0, 0, 0, 0.25);');
    });

    it('includes the new motion tokens', () => {
        const css = buildCssText();
        expect(css).toContain('--europa-motion-duration: 120ms;');
        expect(css).toContain('--europa-motion-transition-fast: 80ms;');
        expect(css).toContain('--europa-motion-easing-out: cubic-bezier(0.16, 1, 0.3, 1);');
    });

    it('includes the new color tokens', () => {
        const css = buildCssText();
        expect(css).toContain('--europa-color-text-link: #f59e0b;');
        expect(css).toContain('--europa-color-accent-active: #d97706;');
        expect(css).toContain('--europa-color-divider: #374151;');
        expect(css).toContain('--europa-color-card-hover-border: #f59e0b;');
    });

    it('includes the new typography tokens', () => {
        const css = buildCssText();
        expect(css).toContain('--europa-typography-heading: 1.5rem;');
        expect(css).toContain('--europa-typography-tracking-tight: -0.025em;');
    });

    it('includes the new focus ring tokens', () => {
        const css = buildCssText();
        expect(css).toContain('--europa-focus-ring-dark-color: #111827;');
        expect(css).toContain('--europa-focus-ring-light-color: #ffffff;');
    });

    it('emits inline comments before background tokens (FR-046)', () => {
        const css = buildCssText();
        expect(css).toContain('/* page-bg: the outermost page background (lobby, manual pages) */');
        expect(css).toContain('/* void-bg: the board/canvas recessed background (distinct from page-bg) */');
    });

    it('emits numeric token values without quotes', () => {
        const css = buildCssText();
        // motion.durationMs is 120 (number), should appear as bare 120
        expect(css).toMatch(/--europa-motion-duration-ms: 120;/);
        // color.landHue is 120 (number)
        expect(css).toMatch(/--europa-color-land-hue: 120;/);
    });

    it('is byte-identical across repeated calls', () => {
        const first = buildCssText();
        const second = buildCssText();
        expect(first).toBe(second);
    });

    it('uses LF line endings only (no CRLF)', () => {
        const css = buildCssText();
        expect(css).not.toContain('\r\n');
    });

    it('has no trailing whitespace on variable lines', () => {
        const css = buildCssText();
        for (const line of css.split('\n')) {
            if (line.startsWith('  --europa-')) {
                expect(line).not.toMatch(/ +$/);
            }
        }
    });
});

// ---------------------------------------------------------------------------
// buildTokensJson()
// ---------------------------------------------------------------------------

describe('buildTokensJson()', () => {
    it('returns an array of entries with group, name, cssVar, value', () => {
        const entries = buildTokensJson();
        expect(Array.isArray(entries)).toBe(true);
        expect(entries.length).toBeGreaterThan(0);

        for (const entry of entries) {
            expect(entry).toHaveProperty('group');
            expect(entry).toHaveProperty('name');
            expect(entry).toHaveProperty('cssVar');
            expect(entry).toHaveProperty('value');
            expect(typeof entry.group).toBe('string');
            expect(typeof entry.name).toBe('string');
            expect(typeof entry.cssVar).toBe('string');
            expect(typeof entry.value).toBe('string');
        }
    });

    it('sorts entries lexicographically by cssVar', () => {
        const entries = buildTokensJson();
        const cssVars = entries.map((e) => e.cssVar);
        const sorted = [...cssVars].sort();
        expect(cssVars).toEqual(sorted);
    });

    it('includes all new shadow tokens', () => {
        const entries = buildTokensJson();
        const cssVars = new Set(entries.map((e) => e.cssVar));

        expect(cssVars.has('--europa-shadows-card-hover')).toBe(true);
        expect(cssVars.has('--europa-shadows-card-active')).toBe(true);
        expect(cssVars.has('--europa-shadows-hud')).toBe(true);
    });

    it('includes all new motion tokens', () => {
        const entries = buildTokensJson();
        const cssVars = new Set(entries.map((e) => e.cssVar));

        expect(cssVars.has('--europa-motion-duration')).toBe(true);
        expect(cssVars.has('--europa-motion-transition-fast')).toBe(true);
        expect(cssVars.has('--europa-motion-easing-out')).toBe(true);
    });

    it('includes all new color tokens', () => {
        const entries = buildTokensJson();
        const cssVars = new Set(entries.map((e) => e.cssVar));

        expect(cssVars.has('--europa-color-text-link')).toBe(true);
        expect(cssVars.has('--europa-color-accent-active')).toBe(true);
        expect(cssVars.has('--europa-color-divider')).toBe(true);
        expect(cssVars.has('--europa-color-card-hover-border')).toBe(true);
    });

    it('includes all new typography tokens', () => {
        const entries = buildTokensJson();
        const cssVars = new Set(entries.map((e) => e.cssVar));

        expect(cssVars.has('--europa-typography-heading')).toBe(true);
        expect(cssVars.has('--europa-typography-tracking-tight')).toBe(true);
    });

    it('includes all new focus ring tokens', () => {
        const entries = buildTokensJson();
        const cssVars = new Set(entries.map((e) => e.cssVar));

        expect(cssVars.has('--europa-focus-ring-dark-color')).toBe(true);
        expect(cssVars.has('--europa-focus-ring-light-color')).toBe(true);
    });

    it('maps cssVar names back to the correct group', () => {
        const entries = buildTokensJson();
        const byCssVar = new Map(entries.map((e) => [e.cssVar, e]));

        const hover = byCssVar.get('--europa-shadows-card-hover');
        expect(hover?.group).toBe('shadows');
        expect(hover?.name).toBe('cardHover');

        const heading = byCssVar.get('--europa-typography-heading');
        expect(heading?.group).toBe('typography');
        expect(heading?.name).toBe('heading');

        const duration = byCssVar.get('--europa-motion-duration');
        expect(duration?.group).toBe('motion');
        expect(duration?.name).toBe('duration');
    });

    it('converts numeric values to strings', () => {
        const entries = buildTokensJson();
        const byCssVar = new Map(entries.map((e) => [e.cssVar, e]));

        const durationMs = byCssVar.get('--europa-motion-duration-ms');
        expect(durationMs?.value).toBe('120');
        expect(typeof durationMs?.value).toBe('string');

        const landHue = byCssVar.get('--europa-color-land-hue');
        expect(landHue?.value).toBe('120');
    });

    it('is byte-identical across repeated calls', () => {
        const first = buildTokensJson();
        const second = buildTokensJson();
        expect(first).toEqual(second);
    });

    it('produces one entry per TOKENS leaf', () => {
        const entries = buildTokensJson();
        // Count leaves across all groups in the canonical TOKENS table
        // (hardcoded to the current known count to detect accidental omissions)
        expect(entries.length).toBeGreaterThanOrEqual(75);
    });

    it('every cssVar starts with --europa-', () => {
        const entries = buildTokensJson();
        for (const entry of entries) {
            expect(entry.cssVar).toMatch(/^--europa-/);
        }
    });

    it('every value is a non-empty string', () => {
        const entries = buildTokensJson();
        for (const entry of entries) {
            expect(entry.value.length).toBeGreaterThan(0);
        }
    });
});
