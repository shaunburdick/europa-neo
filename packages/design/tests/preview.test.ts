/**
 * Preview page tests for the design system (FR-042, AC-041/042/043).
 *
 * Validates:
 * - All major sections render in the HTML shell (AC-041)
 * - No hex/rgb literals in the page's own `<style>` block (AC-042)
 * - The TypeScript module generates correct contrast ratios
 * - The token tables are complete
 * - The page loads without structural errors
 *
 * Run via: `vitest run tests/preview.test.ts` (node-mode, happy-dom).
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
    buildA11yPairings,
    buildColorCategories,
    buildTokenGroups,
    buildTypeSamples,
    contrastRatio,
    contrastRatioNumeric,
    parseHex,
    relativeLuminance,
    toKebabCase,
} from '../preview/main.ts';
import { TOKENS } from '../src/tokens.ts';

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW_DIR = path.resolve(__dirname, '..', 'preview');
const HTML_PATH = path.join(PREVIEW_DIR, 'index.html');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read the preview HTML file contents.
 */
async function readPreviewHtml(): Promise<string> {
    return readFile(HTML_PATH, 'utf8');
}

/**
 * Extract the content of the first `<style>` block from HTML.
 */
function extractStyleBlock(html: string): string {
    const start = html.indexOf('<style>');
    const end = html.indexOf('</style>');
    if (start === -1 || end === -1) {
        return '';
    }
    return html.slice(start + '<style>'.length, end);
}

/**
 * Check if a CSS value contains a hex color literal (#rgb or #rrggbb).
 */
function containsHexLiteral(value: string): boolean {
    // Match #rgb or #rrggbb patterns (not inside var() or comments)
    return /#(?:[0-9a-fA-F]{3}){1,2}\b/.test(value);
}

/**
 * Check if a CSS value contains an rgb/rgba literal.
 */
function containsRgbLiteral(value: string): boolean {
    return /rgba?\s*\(/.test(value);
}

// ---------------------------------------------------------------------------
// HTML structure tests (AC-041)
// ---------------------------------------------------------------------------

describe('preview page HTML structure (AC-041)', () => {
    let html: string;

    it('loads the HTML file', async () => {
        html = await readPreviewHtml();
        expect(html.length).toBeGreaterThan(0);
    });

    it('contains the sticky navigation', async () => {
        const content = await readPreviewHtml();
        expect(content).toContain('class="preview-nav"');
        expect(content).toContain('aria-label="Design system sections"');
    });

    it('contains the hero section with stats', async () => {
        const content = await readPreviewHtml();
        expect(content).toContain('class="preview-hero"');
        expect(content).toContain('data-stat="components"');
        expect(content).toContain('data-stat="colors"');
        expect(content).toContain('data-stat="a11y"');
    });

    it('contains the colors section', async () => {
        const content = await readPreviewHtml();
        expect(content).toContain('id="colors"');
        expect(content).toContain('id="color-swatches"');
    });

    it('contains the typography section', async () => {
        const content = await readPreviewHtml();
        expect(content).toContain('id="typography"');
        expect(content).toContain('id="type-scale"');
    });

    it('contains the tokens section', async () => {
        const content = await readPreviewHtml();
        expect(content).toContain('id="tokens"');
        expect(content).toContain('id="token-tables"');
    });

    it('contains the components section', async () => {
        const content = await readPreviewHtml();
        expect(content).toContain('id="components"');
    });

    it('contains the accessibility section', async () => {
        const content = await readPreviewHtml();
        expect(content).toContain('id="accessibility"');
        expect(content).toContain('id="a11y-table"');
    });

    it('contains the layouts section', async () => {
        const content = await readPreviewHtml();
        expect(content).toContain('id="layouts"');
    });

    it('contains the footer', async () => {
        const content = await readPreviewHtml();
        expect(content).toContain('class="preview-footer"');
    });

    it('links to dist/design.css', async () => {
        const content = await readPreviewHtml();
        expect(content).toContain('href="../dist/design.css"');
    });

    it('imports main.ts as a module', async () => {
        const content = await readPreviewHtml();
        expect(content).toContain('src="./main.ts"');
        expect(content).toContain('type="module"');
    });
});

// ---------------------------------------------------------------------------
// AC-042: No hex/rgb literals in the page's own CSS
// ---------------------------------------------------------------------------

describe('preview page CSS token compliance (AC-042)', () => {
    it('contains no hex literals in the <style> block', async () => {
        const html = await readPreviewHtml();
        const styleBlock = extractStyleBlock(html);

        // Allow hex values inside code examples and comments, but not in
        // property values. We check for hex in property-value positions.
        const lines = styleBlock.split('\n');
        const violations: string[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            // Skip empty lines, comments, and property names
            if (trimmed === '' || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('//')) {
                continue;
            }

            // Check for property declarations with hex values
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex > 0) {
                const value = trimmed
                    .slice(colonIndex + 1)
                    .replace(/;$/, '')
                    .trim();
                // Skip var() references and calc() expressions
                if (!value.startsWith('var(') && !value.startsWith('calc(')) {
                    if (containsHexLiteral(value)) {
                        violations.push(trimmed);
                    }
                }
            }
        }

        expect(violations, `Found hex literals in <style> block:\n${violations.join('\n')}`).toHaveLength(0);
    });

    it('contains no rgb/rgba literals in the <style> block', async () => {
        const html = await readPreviewHtml();
        const styleBlock = extractStyleBlock(html);

        const lines = styleBlock.split('\n');
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

        expect(violations, `Found rgb/rgba literals in <style> block:\n${violations.join('\n')}`).toHaveLength(0);
    });

    it('uses only --europa-* custom properties in CSS values', async () => {
        const html = await readPreviewHtml();
        const styleBlock = extractStyleBlock(html);

        // Extract all property values that should be var() references
        const lines = styleBlock.split('\n');
        const nonVarValues: string[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (
                trimmed === '' ||
                trimmed.startsWith('/*') ||
                trimmed.startsWith('*') ||
                trimmed.startsWith('//') ||
                trimmed.startsWith('@')
            ) {
                continue;
            }

            const colonIndex = trimmed.indexOf(':');
            if (colonIndex > 0) {
                const prop = trimmed.slice(0, colonIndex).trim();
                const value = trimmed
                    .slice(colonIndex + 1)
                    .replace(/;$/, '')
                    .trim();

                // Skip non-color properties (display, position, etc.)
                const colorProps = [
                    'color',
                    'background-color',
                    'background',
                    'border-color',
                    'border-top-color',
                    'border-left-color',
                    'border-right-color',
                    'border-bottom-color',
                    'outline-color',
                    'box-shadow',
                    'text-shadow',
                ];

                if (colorProps.includes(prop)) {
                    if (
                        !value.startsWith('var(') &&
                        !value.startsWith('transparent') &&
                        !value.startsWith('none') &&
                        value !== 'inherit' &&
                        value !== 'currentColor'
                    ) {
                        nonVarValues.push(`${prop}: ${value}`);
                    }
                }
            }
        }

        expect(nonVarValues, `Found non-var() color values:\n${nonVarValues.join('\n')}`).toHaveLength(0);
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

    it('relativeLuminance computes correct values', () => {
        // White has luminance 1.0
        expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1.0, 2);
        // Black has luminance 0.0
        expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0.0, 2);
    });

    it('contrastRatio returns correct ratio for black on white', () => {
        const ratio = contrastRatio('#000000', '#ffffff');
        expect(ratio).toBe('21.00:1');
    });

    it('contrastRatio returns 1:1 for identical colors', () => {
        const ratio = contrastRatio('#111827', '#111827');
        expect(ratio).toBe('1.00:1');
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
