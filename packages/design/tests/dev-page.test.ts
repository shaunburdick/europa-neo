/**
 * T-042 — Dev page lib module tests.
 *
 * Validates the extracted pure-function helpers in `dev/lib/token-utils`
 * and `dev/lib/contrast` that power the unified design system showcase.
 * Runs in Vitest node-mode (happy-dom).
 */
import { describe, expect, it } from 'vitest';
import { contrastRatioNumeric, parseHex } from '../dev/lib/contrast';
import {
    buildA11yPairings,
    buildColorCategories,
    buildTokenGroups,
    buildTypeSamples,
    toKebabCase,
} from '../dev/lib/token-utils';
import { TOKENS } from '../src/tokens.ts';

// ---------------------------------------------------------------------------
// toKebabCase
// ---------------------------------------------------------------------------
describe('toKebabCase', () => {
    it('converts camelCase to kebab-case', () => {
        expect(toKebabCase('fontSize')).toBe('font-size');
        expect(toKebabCase('pageBg')).toBe('page-bg');
        expect(toKebabCase('surfaceRaised')).toBe('surface-raised');
        expect(toKebabCase('textLink')).toBe('text-link');
        expect(toKebabCase('cardHoverBorder')).toBe('card-hover-border');
    });

    it('leaves single words unchanged', () => {
        expect(toKebabCase('single')).toBe('single');
    });

    it('handles consecutive uppercase letters', () => {
        expect(toKebabCase('fontSizeXL')).toBe('font-size-xl');
    });

    it('handles all-lowercase input', () => {
        expect(toKebabCase('color')).toBe('color');
    });
});

// ---------------------------------------------------------------------------
// buildColorCategories
// ---------------------------------------------------------------------------
describe('buildColorCategories', () => {
    it('builds the three categories in display order', () => {
        const categories = buildColorCategories();
        expect(categories.map((category) => category.title)).toEqual(['Surfaces', 'Text', 'Semantic']);
    });

    it('every swatch has a name, value, contrast ratio, and pass flag', () => {
        const categories = buildColorCategories();
        for (const category of categories) {
            expect(category.swatches.length).toBeGreaterThan(0);
            for (const swatch of category.swatches) {
                expect(swatch.name).toBeTruthy();
                expect(swatch.value).toBeTruthy();
                expect(swatch.contrastRatio).toMatch(/^\d+\.\d+:\d+$/);
                expect(typeof swatch.contrastPass).toBe('boolean');
            }
        }
    });

    it('includes the text-link swatch with the accent value', () => {
        const categories = buildColorCategories();
        const textCategory = categories.find((category) => category.title === 'Text');
        const textLink = textCategory?.swatches.find((swatch) => swatch.name === 'text-link');
        expect(textLink?.value).toBe('#f59e0b');
    });
});

// ---------------------------------------------------------------------------
// buildTypeSamples
// ---------------------------------------------------------------------------
describe('buildTypeSamples', () => {
    it('returns samples for all typography size tokens', () => {
        const samples = buildTypeSamples();
        expect(samples.length).toBeGreaterThanOrEqual(7);
        for (const sample of samples) {
            expect(sample.token).toBeTruthy();
            expect(sample.value).toBeTruthy();
            expect(sample.sample).toBeTruthy();
        }
    });

    it('includes the 3xl and xs extremes', () => {
        const samples = buildTypeSamples();
        const tokens = samples.map((sample) => sample.token);
        expect(tokens).toContain('size3xl');
        expect(tokens).toContain('sizeXs');
    });
});

// ---------------------------------------------------------------------------
// buildTokenGroups
// ---------------------------------------------------------------------------
describe('buildTokenGroups', () => {
    it('returns one group per TOKENS category with entries', () => {
        const groups = buildTokenGroups();
        expect(groups.length).toBe(Object.keys(TOKENS).length);
        for (const group of groups) {
            expect(group.title).toBeTruthy();
            expect(group.entries.length).toBeGreaterThan(0);
            expect(typeof group.isNew).toBe('boolean');
        }
    });

    it('marks shadow and motion groups as new', () => {
        const groups = buildTokenGroups();
        const shadow = groups.find((group) => group.title === 'Shadows Tokens');
        const motion = groups.find((group) => group.title === 'Motion Tokens');
        expect(shadow?.isNew).toBe(true);
        expect(motion?.isNew).toBe(true);
    });

    it('every entry has a europa CSS variable and a value', () => {
        const groups = buildTokenGroups();
        for (const group of groups) {
            for (const entry of group.entries) {
                expect(entry.name).toBeTruthy();
                expect(entry.cssVar).toMatch(/^--europa-.+/);
                expect(entry.value).toBeTruthy();
            }
        }
    });

    it('color group has all expected entries', () => {
        const groups = buildTokenGroups();
        const colorGroup = groups.find((group) => group.title === 'Color Tokens');
        const cssVarNames = colorGroup?.entries.map((entry) => entry.cssVar) ?? [];
        expect(cssVarNames).toContain('--europa-color-accent');
        expect(cssVarNames).toContain('--europa-color-text-link');
        expect(cssVarNames).toContain('--europa-color-divider');
        expect(cssVarNames).toContain('--europa-color-card-hover-border');
        expect(cssVarNames).toContain('--europa-color-accent-active');
    });

    it('shadow group has all six entries', () => {
        const groups = buildTokenGroups();
        const shadowGroup = groups.find((group) => group.title === 'Shadows Tokens');
        expect(shadowGroup?.entries.length).toBe(6);
        const cssVarNames = shadowGroup?.entries.map((entry) => entry.cssVar) ?? [];
        expect(cssVarNames).toContain('--europa-shadows-card-hover');
        expect(cssVarNames).toContain('--europa-shadows-card-active');
        expect(cssVarNames).toContain('--europa-shadows-hud');
        expect(cssVarNames).toContain('--europa-shadows-board');
        expect(cssVarNames).toContain('--europa-shadows-modal');
        expect(cssVarNames).toContain('--europa-shadows-plate');
    });

    it('motion group has all seven new entries', () => {
        const groups = buildTokenGroups();
        const motionGroup = groups.find((group) => group.title === 'Motion Tokens');
        const cssVarNames = motionGroup?.entries.map((entry) => entry.cssVar) ?? [];
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
// buildA11yPairings
// ---------------------------------------------------------------------------
describe('buildA11yPairings', () => {
    it('returns at least 10 contrast pairings', () => {
        const pairings = buildA11yPairings();
        expect(pairings.length).toBeGreaterThanOrEqual(10);
    });

    it('every pairing has its colours, ratio, target, and pass flag', () => {
        const pairings = buildA11yPairings();
        for (const pairing of pairings) {
            expect(pairing.pairing).toBeTruthy();
            expect(pairing.foreground).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(pairing.background).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(pairing.ratio).toMatch(/^\d+\.\d+:\d+$/);
            expect(pairing.target).toMatch(/^\d+\.?\d*:\d+$/);
            expect(typeof pairing.pass).toBe('boolean');
        }
    });

    it('includes the textLink on surface pairing', () => {
        const pairings = buildA11yPairings();
        const textLink = pairings.find((pairing) => pairing.pairing === 'textLink on surface');
        expect(textLink?.pass).toBe(true);
        expect(textLink?.foreground).toBe('#f59e0b');
        expect(textLink?.background).toBe('#111827');
    });

    it('includes badge variant pairings', () => {
        const pairings = buildA11yPairings();
        const names = pairings.map((pairing) => pairing.pairing);
        expect(names).toContain('success on successBg');
        expect(names).toContain('warning on warningBg');
        expect(names).toContain('error on errorBg');
        expect(names).toContain('info on infoBg');
        expect(names).toContain('accent on chipBg');
    });
});

// ---------------------------------------------------------------------------
// contrast helpers (smoke)
// ---------------------------------------------------------------------------
describe('contrast helpers', () => {
    it('parseHex returns [r, g, b] for 6-digit hex', () => {
        expect(parseHex('#ffffff')).toEqual([255, 255, 255]);
        expect(parseHex('#000000')).toEqual([0, 0, 0]);
        expect(parseHex('#ff8800')).toEqual([255, 136, 0]);
    });

    it('parseHex handles 3-digit shorthand', () => {
        expect(parseHex('#fff')).toEqual([255, 255, 255]);
        expect(parseHex('#f80')).toEqual([255, 136, 0]);
    });

    it('parseHex handles missing # prefix', () => {
        expect(parseHex('ffffff')).toEqual([255, 255, 255]);
    });

    it('contrastRatioNumeric returns 1 for identical colors', () => {
        expect(contrastRatioNumeric('#808080', '#808080')).toBeCloseTo(1, 1);
    });

    it('contrastRatioNumeric returns > 1 for different colors', () => {
        expect(contrastRatioNumeric('#ffffff', '#000000')).toBeGreaterThan(1);
    });

    it('contrastRatioNumeric measures a text pairing against its AA threshold', () => {
        expect(contrastRatioNumeric('#f59e0b', '#111827')).toBeGreaterThanOrEqual(4.5);
    });
});

// ---------------------------------------------------------------------------
// TOKENS contract
// ---------------------------------------------------------------------------
describe('TOKENS shadow contract', () => {
    it('shadow tokens are no longer "none"', () => {
        expect(TOKENS.shadows.board).not.toBe('none');
        expect(TOKENS.shadows.modal).not.toBe('none');
        expect(TOKENS.shadows.plate).not.toBe('none');
        expect(TOKENS.shadows.cardHover).toBeDefined();
        expect(TOKENS.shadows.cardActive).toBeDefined();
        expect(TOKENS.shadows.hud).toBeDefined();
    });
});
