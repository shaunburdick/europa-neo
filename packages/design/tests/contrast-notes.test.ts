/**
 * Tests for the contrast-notes generator (Feature 062 FR-045, AC-045b).
 *
 * Verifies the WCAG 2.x relative luminance and contrast-ratio math,
 * the structure and completeness of the generated contrast notes, and
 * the AA threshold pass/fail logic.
 */

import { describe, expect, it } from 'vitest';

import { computeContrastNotes, contrastRatio, relativeLuminance } from '../scripts/generate-contrast-notes.js';

/* ------------------------------------------------------------------ */
/*  relativeLuminance                                                  */
/* ------------------------------------------------------------------ */

describe('relativeLuminance', () => {
    it('computes black (#000000) as 0', () => {
        expect(relativeLuminance('#000000')).toBe(0);
    });

    it('computes white (#ffffff) as 1', () => {
        expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6);
    });

    it('computes mid-gray (#808080) between 0 and 1', () => {
        const lum = relativeLuminance('#808080');
        expect(lum).toBeGreaterThan(0);
        expect(lum).toBeLessThan(1);
    });

    it('handles the linearization threshold (c <= 0.03928)', () => {
        // A very dark channel should use the linear branch c / 12.92
        const lum = relativeLuminance('#010101');
        expect(lum).toBeGreaterThan(0);
        expect(lum).toBeLessThan(0.01);
    });
});

/* ------------------------------------------------------------------ */
/*  contrastRatio                                                     */
/* ------------------------------------------------------------------ */

describe('contrastRatio', () => {
    it('returns ~21:1 for white on black', () => {
        const ratio = contrastRatio('#ffffff', '#000000');
        expect(ratio).toBeCloseTo(21, 0);
    });

    it('returns ~21:1 for black on white (order-independent)', () => {
        const ratio = contrastRatio('#000000', '#ffffff');
        expect(ratio).toBeCloseTo(21, 0);
    });

    it('returns exactly 1:1 for identical colors', () => {
        expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
        expect(contrastRatio('#000000', '#000000')).toBe(1);
        expect(contrastRatio('#808080', '#808080')).toBe(1);
    });

    it('returns a ratio >= 1 for any two distinct colors', () => {
        const ratio = contrastRatio('#3b82f6', '#60a5fa');
        expect(ratio).toBeGreaterThanOrEqual(1);
    });

    it('returns the same result regardless of argument order', () => {
        const a = contrastRatio('#ff0000', '#00ff00');
        const b = contrastRatio('#00ff00', '#ff0000');
        expect(a).toBe(b);
    });
});

/* ------------------------------------------------------------------ */
/*  computeContrastNotes — structure and completeness                 */
/* ------------------------------------------------------------------ */

describe('computeContrastNotes', () => {
    const notes = computeContrastNotes();

    it('returns a non-empty array', () => {
        expect(notes.length).toBeGreaterThan(0);
    });

    it('each entry has all required fields', () => {
        for (const note of notes) {
            expect(note).toHaveProperty('pairing');
            expect(note).toHaveProperty('foreground');
            expect(note).toHaveProperty('background');
            expect(note).toHaveProperty('ratio');
            expect(note).toHaveProperty('target');
            expect(note).toHaveProperty('pass');
        }
    });

    it('pairing field is a non-empty string', () => {
        for (const note of notes) {
            expect(typeof note.pairing).toBe('string');
            expect(note.pairing.length).toBeGreaterThan(0);
        }
    });

    it('foreground and background are 7-character hex strings', () => {
        for (const note of notes) {
            expect(note.foreground).toMatch(/^#[0-9a-f]{6}$/);
            expect(note.background).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    it('ratio is formatted as "X.XX:1"', () => {
        for (const note of notes) {
            expect(note.ratio).toMatch(/^\d+\.\d{2}:1$/);
        }
    });

    it('target is formatted as "X:1"', () => {
        for (const note of notes) {
            expect(note.target).toMatch(/^\d+\.?\d*:1$/);
        }
    });

    it('pass is a boolean', () => {
        for (const note of notes) {
            expect(typeof note.pass).toBe('boolean');
        }
    });
});

/* ------------------------------------------------------------------ */
/*  computeContrastNotes — AA threshold logic                         */
/* ------------------------------------------------------------------ */

describe('computeContrastNotes — AA threshold', () => {
    const notes = computeContrastNotes();

    it('pass is true when ratio meets or exceeds the target', () => {
        for (const note of notes) {
            const ratioValue = parseFloat(note.ratio);
            const targetValue = parseFloat(note.target);
            if (ratioValue >= targetValue) {
                expect(note.pass).toBe(true);
            }
        }
    });

    it('pass is false when ratio is below the target', () => {
        for (const note of notes) {
            const ratioValue = parseFloat(note.ratio);
            const targetValue = parseFloat(note.target);
            if (ratioValue < targetValue) {
                expect(note.pass).toBe(false);
            }
        }
    });

    it("every entry's pass matches the computed threshold", () => {
        for (const note of notes) {
            const ratioValue = parseFloat(note.ratio);
            const targetValue = parseFloat(note.target);
            expect(note.pass).toBe(ratioValue >= targetValue);
        }
    });
});

/* ------------------------------------------------------------------ */
/*  computeContrastNotes — pairing completeness (FR-045)             */
/* ------------------------------------------------------------------ */

describe('computeContrastNotes — pairing completeness', () => {
    const notes = computeContrastNotes();
    const labels = notes.map((n) => n.pairing);

    it('includes textLink on surface pairing', () => {
        expect(labels).toContain('textLink on surface');
    });

    it('includes textLink on pageBg pairing', () => {
        expect(labels).toContain('textLink on pageBg');
    });

    it('includes accentActive on surface pairing', () => {
        expect(labels).toContain('accentActive on surface');
    });

    it('includes divider on pageBg pairing', () => {
        expect(labels).toContain('divider on pageBg');
    });

    it('includes cardHoverBorder on surface pairing', () => {
        expect(labels).toContain('cardHoverBorder on surface');
    });

    it('includes badge status variant pairings', () => {
        expect(labels).toContain('success on successBg');
        expect(labels).toContain('warning on warningBg');
        expect(labels).toContain('error on errorBg');
        expect(labels).toContain('info on infoBg');
        expect(labels).toContain('accent on chipBg');
    });

    it('includes focus ring pairings', () => {
        expect(labels).toContain('focusRing on surface');
        expect(labels).toContain('lightColor on surface');
        expect(labels).toContain('darkColor on surfaceRaised');
    });

    it('has exactly 13 pairings', () => {
        expect(notes).toHaveLength(13);
    });
});

/* ------------------------------------------------------------------ */
/*  computeContrastNotes — known ratio values (spot checks)           */
/* ------------------------------------------------------------------ */

describe('computeContrastNotes — known ratio values', () => {
    const notes = computeContrastNotes();

    it('textLink on pageBg has a high contrast ratio (> 8:1)', () => {
        const note = notes.find((n) => n.pairing === 'textLink on pageBg');
        expect(note).toBeDefined();
        const ratio = parseFloat(note?.ratio ?? '');
        expect(ratio).toBeGreaterThan(8);
    });

    it('textLink on surface has a high contrast ratio (> 8:1)', () => {
        const note = notes.find((n) => n.pairing === 'textLink on surface');
        expect(note).toBeDefined();
        const ratio = parseFloat(note?.ratio ?? '');
        expect(ratio).toBeGreaterThan(8);
    });

    it('textLink on pageBg passes AA (ratio >= 4.5)', () => {
        const note = notes.find((n) => n.pairing === 'textLink on pageBg');
        expect(note).toBeDefined();
        expect(note?.pass).toBe(true);
    });

    it('textLink on surface passes AA (ratio >= 4.5)', () => {
        const note = notes.find((n) => n.pairing === 'textLink on surface');
        expect(note).toBeDefined();
        expect(note?.pass).toBe(true);
    });
});
