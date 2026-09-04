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

// ---------------------------------------------------------------------------
// toKebabCase
// ---------------------------------------------------------------------------
describe('toKebabCase', () => {
    it('converts camelCase to kebab-case', () => {
        expect(toKebabCase('fontSize')).toBe('font-size');
        expect(toKebabCase('pageBg')).toBe('page-bg');
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
    it('returns at least one category with swatches', () => {
        const categories = buildColorCategories();
        expect(categories.length).toBeGreaterThan(0);
        for (const cat of categories) {
            // ColorCategory uses `title` (not `name`)
            expect(cat.title).toBeTruthy();
            expect(cat.swatches.length).toBeGreaterThan(0);
        }
    });

    it('every swatch has name, value, and contrast ratio', () => {
        const categories = buildColorCategories();
        for (const cat of categories) {
            for (const swatch of cat.swatches) {
                expect(swatch.name).toBeTruthy();
                expect(swatch.value).toBeTruthy();
                expect(swatch.contrastRatio).toMatch(/^\d+\.\d+:1$/);
                expect(typeof swatch.contrastPass).toBe('boolean');
            }
        }
    });

    it('includes Surfaces, Text, and Semantic categories', () => {
        const categories = buildColorCategories();
        const titles = categories.map((c) => c.title);
        expect(titles).toContain('Surfaces');
        expect(titles).toContain('Text');
        expect(titles).toContain('Semantic');
    });
});

// ---------------------------------------------------------------------------
// buildTypeSamples
// ---------------------------------------------------------------------------
describe('buildTypeSamples', () => {
    it('returns samples for all typography size tokens', () => {
        const samples = buildTypeSamples();
        expect(samples.length).toBeGreaterThan(0);
        for (const sample of samples) {
            expect(sample.token).toBeTruthy();
            expect(sample.value).toBeTruthy();
            expect(sample.sample).toBeTruthy();
        }
    });

    it('includes the 3xl and xs extremes', () => {
        const samples = buildTypeSamples();
        const tokens = samples.map((s) => s.token);
        expect(tokens).toContain('size3xl');
        expect(tokens).toContain('sizeXs');
    });
});

// ---------------------------------------------------------------------------
// buildTokenGroups
// ---------------------------------------------------------------------------
describe('buildTokenGroups', () => {
    it('returns all token groups with entries', () => {
        const groups = buildTokenGroups();
        expect(groups.length).toBeGreaterThan(0);
        for (const group of groups) {
            expect(group.title).toBeTruthy();
            expect(group.entries.length).toBeGreaterThan(0);
        }
    });

    it('marks shadow and motion groups as new', () => {
        const groups = buildTokenGroups();
        const shadow = groups.find((g) => g.title === 'Shadows Tokens');
        const motion = groups.find((g) => g.title === 'Motion Tokens');
        expect(shadow?.isNew).toBe(true);
        expect(motion?.isNew).toBe(true);
    });

    it('every entry has a europa CSS variable', () => {
        const groups = buildTokenGroups();
        for (const group of groups) {
            for (const entry of group.entries) {
                expect(entry.cssVar).toMatch(/^--europa-.+/);
            }
        }
    });
});

// ---------------------------------------------------------------------------
// buildA11yPairings
// ---------------------------------------------------------------------------
describe('buildA11yPairings', () => {
    it('returns at least 10 pairings', () => {
        const pairings = buildA11yPairings();
        expect(pairings.length).toBeGreaterThanOrEqual(10);
    });

    it('every pairing has a ratio string and pass flag', () => {
        const pairings = buildA11yPairings();
        for (const p of pairings) {
            expect(p.ratio).toMatch(/^\d+\.\d+:1$/);
            expect(typeof p.pass).toBe('boolean');
            expect(p.target).toBeTruthy();
        }
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
});
