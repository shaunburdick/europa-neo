/**
 * Token-table tests for semantic state colors, control heights, and pipe
 * slope colors (spec 005 FR-013, spec 012 design-system enhancement).
 *
 * Asserts the semantic state tokens exist with canonical values, the
 * controlHeight group is complete, the pipe tokens reuse canonical values,
 * and the color group stays sorted alphabetically — the emitter's
 * determinism invariant (spec 012 FR-004: `packages/design/scripts/build-css.ts`
 * walks keys in sorted order so `dist/design.css` is byte-identical per build).
 */

import { describe, expect, it } from 'vitest';

import { TOKENS } from '../src/tokens.js';

describe('pipe slope color tokens (spec 005 FR-013)', () => {
    it('defines all four pipe tokens reusing canonical values', () => {
        expect(TOKENS.color.pipeDownhill).toBe(TOKENS.color.green);
        expect(TOKENS.color.pipeFlat).toBe(TOKENS.color.accent);
        expect(TOKENS.color.pipeUphill).toBe(TOKENS.color.red);
        expect(TOKENS.color.pipeStalled).toBe(TOKENS.color.textMuted);
    });

    it('pins the exact canonical hex values', () => {
        expect(TOKENS.color.pipeDownhill).toBe('#059669');
        expect(TOKENS.color.pipeFlat).toBe('#f59e0b');
        expect(TOKENS.color.pipeUphill).toBe('#dc2626');
        expect(TOKENS.color.pipeStalled).toBe('#9ca3af');
    });
});

describe('semantic state color tokens', () => {
    it('pins the four base state fills', () => {
        expect(TOKENS.color.success).toBe('#059669');
        expect(TOKENS.color.warning).toBe('#dcaa37');
        expect(TOKENS.color.error).toBe('#dc6966');
        expect(TOKENS.color.info).toBe('#dca12e');
    });

    it('pins the bg/border/hover/active variants for each state', () => {
        expect(TOKENS.color.successBg).toBe('#11221d');
        expect(TOKENS.color.successBorder).toBe('#173f31');
        expect(TOKENS.color.successHover).toBe('#3aa07a');
        expect(TOKENS.color.successActive).toBe('#1b7154');

        expect(TOKENS.color.warningBg).toBe('#312512');
        expect(TOKENS.color.warningBorder).toBe('#5b4920');
        expect(TOKENS.color.warningHover).toBe('#e8c35e');
        expect(TOKENS.color.warningActive).toBe('#ad872f');

        expect(TOKENS.color.errorBg).toBe('#32191a');
        expect(TOKENS.color.errorBorder).toBe('#5b3231');
        expect(TOKENS.color.errorHover).toBe('#e89590');
        expect(TOKENS.color.errorActive).toBe('#ad5553');

        expect(TOKENS.color.infoBg).toBe('#302311');
        expect(TOKENS.color.infoBorder).toBe('#5b461d');
        expect(TOKENS.color.infoHover).toBe('#e8c35e');
        expect(TOKENS.color.infoActive).toBe('#ad872f');
    });

    it('success reuses the canonical green value', () => {
        expect(TOKENS.color.success).toBe(TOKENS.color.green);
    });
});

describe('control height tokens', () => {
    it('defines all four height steps with canonical pixel values', () => {
        expect(TOKENS.controlHeight.xs).toBe('16px');
        expect(TOKENS.controlHeight.sm).toBe('24px');
        expect(TOKENS.controlHeight.default).toBe('32px');
        expect(TOKENS.controlHeight.lg).toBe('40px');
    });
});

describe('token table determinism invariant (spec 012 FR-004)', () => {
    it('keeps the color group keys sorted alphabetically', () => {
        const keys = Object.keys(TOKENS.color);
        const sorted = [...keys].sort((left, right) => left.localeCompare(right));
        expect(keys).toEqual(sorted);
    });

    it('keeps the controlHeight group keys sorted alphabetically', () => {
        const keys = Object.keys(TOKENS.controlHeight);
        const sorted = [...keys].sort((left, right) => left.localeCompare(right));
        expect(keys).toEqual(sorted);
    });

    it('keeps the top-level group keys sorted alphabetically', () => {
        const keys = Object.keys(TOKENS);
        const sorted = [...keys].sort((left, right) => left.localeCompare(right));
        expect(keys).toEqual(sorted);
    });
});
