/**
 * Preview page tests for the design system (FR-042, AC-041/042/043).
 *
 * Validates:
 * - Dev page HTML entry point structure (AC-041)
 * - shell.css no-hex compliance outside theme block (AC-042)
 * - The TypeScript module generates correct helper outputs
 * - The token tables are complete
 *
 * Run via: `vitest run tests/preview.test.ts` (node-mode, happy-dom).
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { contrastRatioNumeric, parseHex } from '../dev/lib/contrast.ts';
import {
    buildA11yPairings,
    buildColorCategories,
    buildTokenGroups,
    buildTypeSamples,
    toKebabCase,
} from '../dev/lib/token-utils.ts';
import { TOKENS } from '../src/tokens.ts';

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_DIR = path.resolve(__dirname, '..', 'dev');
const HTML_PATH = path.join(DEV_DIR, 'index.html');
const SHELL_CSS_PATH = path.join(DEV_DIR, 'styles', 'shell.css');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read the dev page HTML file contents.
 */
async function readDevHtml(): Promise<string> {
    return readFile(HTML_PATH, 'utf8');
}

/**
 * Read the shell CSS file contents.
 */
async function readShellCss(): Promise<string> {
    return readFile(SHELL_CSS_PATH, 'utf8');
}

/**
 * Check if a CSS value contains an rgb/rgba literal.
 */
function containsRgbLiteral(value: string): boolean {
    return /rgba?\s*\(/.test(value);
}

// ---------------------------------------------------------------------------
// HTML structure tests (AC-041) — migrated to dev page
// ---------------------------------------------------------------------------

describe('dev page HTML structure (AC-041)', () => {
    it('has a root div for React mounting', async () => {
        const content = await readDevHtml();
        expect(content).toContain('id="root"');
    });

    it('imports main.tsx as a module', async () => {
        const content = await readDevHtml();
        expect(content).toContain('src="./main.tsx"');
        expect(content).toContain('type="module"');
    });

    it('has the correct page title', async () => {
        const content = await readDevHtml();
        expect(content).toContain('<title>Europa Design System</title>');
    });

    it('declares lang attribute', async () => {
        const content = await readDevHtml();
        expect(content).toContain('lang="en"');
    });

    it('includes viewport meta tag', async () => {
        const content = await readDevHtml();
        expect(content).toContain('name="viewport"');
    });
});

// ---------------------------------------------------------------------------
// AC-042: shell.css token compliance (migrated from inline style block)
// ---------------------------------------------------------------------------

describe('shell.css token compliance (AC-042)', () => {
    it('contains no hex literals in property values outside theme block', async () => {
        const css = await readShellCss();
        const themeStart = css.indexOf(':root[data-theme="light"]');
        const mainCss = themeStart >= 0 ? css.slice(0, themeStart) : css;

        const hexInProperties = /:\s*#[0-9a-fA-F]{3,8}/g;
        const matches = mainCss.match(hexInProperties) || [];
        expect(matches).toEqual([]);
    });

    it('contains no rgb/rgba literals outside theme block', async () => {
        const css = await readShellCss();
        const themeStart = css.indexOf(':root[data-theme="light"]');
        const mainCss = themeStart >= 0 ? css.slice(0, themeStart) : css;

        const lines = mainCss.split('\n');
        const violations: string[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '' || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('//')) {
                continue;
            }

            const colonIndex = trimmed.indexOf(':');
            if (colonIndex > 0) {
                const value = trimmed
                    .slice(colonIndex + 1)
                    .replace(/;$/, '')
                    .trim();
                if (!value.startsWith('var(')) {
                    if (containsRgbLiteral(value)) {
                        violations.push(trimmed);
                    }
                }
            }
        }

        expect(violations, `Found rgb/rgba literals outside theme block:\n${violations.join('\n')}`).toHaveLength(0);
    });

    it('uses var(--europa-*) for background-color outside theme block', async () => {
        const css = await readShellCss();
        const themeStart = css.indexOf(':root[data-theme="light"]');
        const mainCss = themeStart >= 0 ? css.slice(0, themeStart) : css;

        const bgRegex = /background-color:\s*(?!var\(--europa)[^;]+;/g;
        const matches = mainCss.match(bgRegex) || [];
        expect(matches).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// WCAG contrast ratio helpers
// ---------------------------------------------------------------------------

describe('WCAG contrast ratio helpers', () => {
    it('parseHex handles 6-digit hex', () => {
        expect(parseHex('#ffffff')).toEqual([255, 255, 255]);
        expect(parseHex('#000000')).toEqual([0, 0, 0]);
        expect(parseHex('#f59e0b')).toEqual([245, 158, 11]);
    });

    it('parseHex handles 3-digit hex', () => {
        expect(parseHex('#fff')).toEqual([255, 255, 255]);
        expect(parseHex('#000')).toEqual([0, 0, 0]);
    });

    it('parseHex handles hex without leading #', () => {
        expect(parseHex('ffffff')).toEqual([255, 255, 255]);
    });

    it('contrastRatioNumeric meets threshold checks', () => {
        expect(contrastRatioNumeric('#f59e0b', '#111827')).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatioNumeric('#000000', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    });

    it('toKebabCase converts correctly', () => {
        expect(toKebabCase('pageBg')).toBe('page-bg');
        expect(toKebabCase('surfaceRaised')).toBe('surface-raised');
        expect(toKebabCase('textLink')).toBe('text-link');
        expect(toKebabCase('cardHoverBorder')).toBe('card-hover-border');
    });
});

// ---------------------------------------------------------------------------
// Color swatch generation
// ---------------------------------------------------------------------------

describe('color swatch generation (AC-041)', () => {
    it('builds three categories', () => {
        const categories = buildColorCategories();
        expect(categories).toHaveLength(3);
        expect(categories.map((c) => c.title)).toEqual(['Surfaces', 'Text', 'Semantic']);
    });

    it('each swatch has a name, value, and contrast ratio', () => {
        const categories = buildColorCategories();
        for (const category of categories) {
            for (const swatch of category.swatches) {
                expect(swatch.name).toBeTruthy();
                expect(swatch.value).toBeTruthy();
                expect(swatch.contrastRatio).toMatch(/^\d+\.\d+:\d+$/);
                expect(typeof swatch.contrastPass).toBe('boolean');
            }
        }
    });

    it('includes text-link swatch', () => {
        const categories = buildColorCategories();
        const textCategory = categories.find((c) => c.title === 'Text');
        expect(textCategory).toBeDefined();
        const textLink = textCategory?.swatches.find((s) => s.name === 'text-link');
        expect(textLink).toBeDefined();
        expect(textLink?.value).toBe('#f59e0b');
    });
});

// ---------------------------------------------------------------------------
// Typography scale generation
// ---------------------------------------------------------------------------

describe('type scale generation (AC-041)', () => {
    it('builds samples for all size tokens', () => {
        const samples = buildTypeSamples();
        expect(samples.length).toBeGreaterThanOrEqual(7);
    });

    it('each sample has a token, value, and sample text', () => {
        const samples = buildTypeSamples();
        for (const sample of samples) {
            expect(sample.token).toBeTruthy();
            expect(sample.value).toBeTruthy();
            expect(sample.sample).toBeTruthy();
        }
    });

    it('matches token values from TOKENS', () => {
        const samples = buildTypeSamples();
        const size3xl = samples.find((s) => s.token === 'size3xl');
        expect(size3xl?.value).toBe(TOKENS.typography.size3xl);
        const sizeXl = samples.find((s) => s.token === 'sizeXl');
        expect(sizeXl?.value).toBe(TOKENS.typography.sizeXl);
    });
});

// ---------------------------------------------------------------------------
// Token table generation
// ---------------------------------------------------------------------------

describe('token table generation (AC-041)', () => {
    it('builds groups for all token categories', () => {
        const groups = buildTokenGroups();
        const expectedGroups = Object.keys(TOKENS);
        expect(groups.length).toBe(expectedGroups.length);
    });

    it('each group has a title, entries, and isNew flag', () => {
        const groups = buildTokenGroups();
        for (const group of groups) {
            expect(group.title).toBeTruthy();
            expect(group.entries.length).toBeGreaterThan(0);
            expect(typeof group.isNew).toBe('boolean');
        }
    });

    it('shadows and motion groups are marked as new', () => {
        const groups = buildTokenGroups();
        const shadows = groups.find((g) => g.title === 'Shadows Tokens');
        const motion = groups.find((g) => g.title === 'Motion Tokens');
        expect(shadows?.isNew).toBe(true);
        expect(motion?.isNew).toBe(true);
    });

    it('each entry has name, cssVar, and value', () => {
        const groups = buildTokenGroups();
        for (const group of groups) {
            for (const entry of group.entries) {
                expect(entry.name).toBeTruthy();
                expect(entry.cssVar).toMatch(/^--europa-/);
                expect(entry.value).toBeTruthy();
            }
        }
    });

    it('color group has all expected entries', () => {
        const groups = buildTokenGroups();
        const colorGroup = groups.find((g) => g.title === 'Color Tokens');
        expect(colorGroup).toBeDefined();
        const cssVarNames = colorGroup?.entries.map((e) => e.cssVar) ?? [];
        expect(cssVarNames).toContain('--europa-color-accent');
        expect(cssVarNames).toContain('--europa-color-text-link');
        expect(cssVarNames).toContain('--europa-color-divider');
        expect(cssVarNames).toContain('--europa-color-card-hover-border');
        expect(cssVarNames).toContain('--europa-color-accent-active');
    });

    it('shadow group has all six entries', () => {
        const groups = buildTokenGroups();
        const shadowGroup = groups.find((g) => g.title === 'Shadows Tokens');
        expect(shadowGroup).toBeDefined();
        expect(shadowGroup?.entries.length).toBe(6);
        const cssVarNames = shadowGroup?.entries.map((e) => e.cssVar) ?? [];
        expect(cssVarNames).toContain('--europa-shadows-card-hover');
        expect(cssVarNames).toContain('--europa-shadows-card-active');
        expect(cssVarNames).toContain('--europa-shadows-hud');
        expect(cssVarNames).toContain('--europa-shadows-board');
        expect(cssVarNames).toContain('--europa-shadows-modal');
        expect(cssVarNames).toContain('--europa-shadows-plate');
    });

    it('motion group has all seven new entries', () => {
        const groups = buildTokenGroups();
        const motionGroup = groups.find((g) => g.title === 'Motion Tokens');
        expect(motionGroup).toBeDefined();
        const cssVarNames = motionGroup?.entries.map((e) => e.cssVar) ?? [];
        expect(cssVarNames).toContain('--europa-motion-duration');
        expect(cssVarNames).toContain('--europa-motion-transition-fast');
        expect(cssVarNames).toContain('--europa-motion-transition-default');
        expect(cssVarNames).toContain('--europa-motion-transition-slow');
        expect(cssVarNames).toContain('--europa-motion-transition-spring');
        expect(cssVarNames).toContain('--europa-motion-easing-out');
        expect(cssVarNames).toContain('--europa-motion-easing-in-out');
    });
});

// ---------------------------------------------------------------------------
// A11y pairings generation
// ---------------------------------------------------------------------------

describe('a11y pairings generation (AC-041)', () => {
    it('builds at least 10 contrast pairings', () => {
        const pairings = buildA11yPairings();
        expect(pairings.length).toBeGreaterThanOrEqual(10);
    });

    it('each pairing has required fields', () => {
        const pairings = buildA11yPairings();
        for (const p of pairings) {
            expect(p.pairing).toBeTruthy();
            expect(p.foreground).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(p.background).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(p.ratio).toMatch(/^\d+\.\d+:\d+$/);
            expect(p.target).toMatch(/^\d+\.?\d*:\d+$/);
            expect(typeof p.pass).toBe('boolean');
        }
    });

    it('includes textLink on surface pairing', () => {
        const pairings = buildA11yPairings();
        const textLinkPairing = pairings.find((p) => p.pairing === 'textLink on surface');
        expect(textLinkPairing).toBeDefined();
        expect(textLinkPairing?.pass).toBe(true);
    });

    it('includes badge variant pairings', () => {
        const pairings = buildA11yPairings();
        const pairingsNames = pairings.map((p) => p.pairing);
        expect(pairingsNames).toContain('success on successBg');
        expect(pairingsNames).toContain('warning on warningBg');
        expect(pairingsNames).toContain('error on errorBg');
        expect(pairingsNames).toContain('info on infoBg');
        expect(pairingsNames).toContain('accent on chipBg');
    });
});

// ---------------------------------------------------------------------------
// Token contract: values match TOKENS object
// ---------------------------------------------------------------------------

describe('token contract with TOKENS object', () => {
    it('buildTypeSamples values match TOKENS', () => {
        const samples = buildTypeSamples();
        for (const sample of samples) {
            const tokenKey = sample.token as keyof typeof TOKENS.typography;
            // Only check keys that exist in TOKENS.typography
            if (tokenKey in TOKENS.typography) {
                expect(sample.value).toBe(TOKENS.typography[tokenKey]);
            }
        }
    });

    it('buildColorCategories uses TOKENS values', () => {
        const categories = buildColorCategories();
        const textCategory = categories.find((c) => c.title === 'Text');
        const textPrimary = textCategory?.swatches.find((s) => s.name === 'text-primary');
        expect(textPrimary?.value).toBe(TOKENS.color.textPrimary);
    });

    it('buildA11yPairings uses TOKENS values', () => {
        const pairings = buildA11yPairings();
        const textLink = pairings.find((p) => p.pairing === 'textLink on surface');
        expect(textLink?.foreground).toBe(TOKENS.color.textLink);
        expect(textLink?.background).toBe(TOKENS.color.surface);
    });

    it('shadow tokens are no longer "none"', () => {
        expect(TOKENS.shadows.board).not.toBe('none');
        expect(TOKENS.shadows.modal).not.toBe('none');
        expect(TOKENS.shadows.plate).not.toBe('none');
        expect(TOKENS.shadows.cardHover).toBeDefined();
        expect(TOKENS.shadows.cardActive).toBeDefined();
        expect(TOKENS.shadows.hud).toBeDefined();
    });
});
