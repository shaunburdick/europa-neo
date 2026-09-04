/**
 * T-043 — shell.css no-literals compliance test.
 *
 * Ensures that the shell stylesheet uses `var(--europa-*)` references
 * for all color properties outside the legitimate `:root[data-theme="light"]`
 * theme-override block. Zero hex/rgb literals in property values (AC-042).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname ?? __dirname, '../dev/styles/shell.css'), 'utf-8');

describe('shell.css token compliance', () => {
    it('contains no hex literals in property values outside the theme block', () => {
        // Split at the theme block — hex is allowed inside :root[data-theme="light"]
        const themeStart = css.indexOf(':root[data-theme="light"]');
        const mainCss = themeStart >= 0 ? css.slice(0, themeStart) : css;

        // Match hex colors in property values (not in selectors or comments)
        const hexInProperties = /:\s*#[0-9a-fA-F]{3,8}/g;
        const matches = mainCss.match(hexInProperties) || [];
        expect(matches).toEqual([]);
    });

    it('uses var(--europa-*) for background-color outside theme block', () => {
        const themeStart = css.indexOf(':root[data-theme="light"]');
        const mainCss = themeStart >= 0 ? css.slice(0, themeStart) : css;

        const bgRegex = /background-color:\s*(?!var\(--europa)[^;]+;/g;
        const matches = mainCss.match(bgRegex) || [];
        expect(matches).toEqual([]);
    });

    it('uses var(--europa-*) for color outside theme block', () => {
        const themeStart = css.indexOf(':root[data-theme="light"]');
        const mainCss = themeStart >= 0 ? css.slice(0, themeStart) : css;

        const colorRegex = /(?<!background-)color:\s*(?!var\(--europa)[^;]+;/g;
        const matches = mainCss.match(colorRegex) || [];
        expect(matches).toEqual([]);
    });

    it('uses var(--europa-*) for border-color outside theme block', () => {
        const themeStart = css.indexOf(':root[data-theme="light"]');
        const mainCss = themeStart >= 0 ? css.slice(0, themeStart) : css;

        const borderRegex = /border-color:\s*(?!var\(--europa)[^;]+;/g;
        const matches = mainCss.match(borderRegex) || [];
        expect(matches).toEqual([]);
    });

    it('theme block contains hex overrides (sanity check)', () => {
        const themeStart = css.indexOf(':root[data-theme="light"]');
        expect(themeStart).toBeGreaterThan(0);
        const themeCss = css.slice(themeStart);
        const hexInTheme = /:\s*#[0-9a-fA-F]{3,8}/g;
        const matches = themeCss.match(hexInTheme) || [];
        expect(matches.length).toBeGreaterThan(0);
    });
});
