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

    it('keeps the shadows group keys sorted alphabetically', () => {
        const keys = Object.keys(TOKENS.shadows);
        const sorted = [...keys].sort((left, right) => left.localeCompare(right));
        expect(keys).toEqual(sorted);
    });

    it('keeps the motion group keys sorted alphabetically', () => {
        const keys = Object.keys(TOKENS.motion);
        const sorted = [...keys].sort((left, right) => left.localeCompare(right));
        expect(keys).toEqual(sorted);
    });

    it('keeps the typography group keys sorted alphabetically', () => {
        const keys = Object.keys(TOKENS.typography);
        const sorted = [...keys].sort((left, right) => left.localeCompare(right));
        expect(keys).toEqual(sorted);
    });

    it('keeps the focusRing group keys sorted alphabetically', () => {
        const keys = Object.keys(TOKENS.focusRing);
        const sorted = [...keys].sort((left, right) => left.localeCompare(right));
        expect(keys).toEqual(sorted);
    });
});

describe('shadow tokens (Feature 062 FR-001)', () => {
    it('defines all six shadow tokens with non-none values', () => {
        expect(TOKENS.shadows.board).not.toBe('none');
        expect(TOKENS.shadows.modal).not.toBe('none');
        expect(TOKENS.shadows.plate).not.toBe('none');
        expect(TOKENS.shadows.cardHover).toBeDefined();
        expect(TOKENS.shadows.cardActive).toBeDefined();
        expect(TOKENS.shadows.hud).toBeDefined();
    });

    it('pins the exact shadow values', () => {
        expect(TOKENS.shadows.board).toBe('inset 0 1px 4px rgba(0, 0, 0, 0.3)');
        expect(TOKENS.shadows.cardActive).toBe('0 2px 4px rgba(0, 0, 0, 0.25)');
        expect(TOKENS.shadows.cardHover).toBe('0 4px 12px rgba(0, 0, 0, 0.3)');
        expect(TOKENS.shadows.hud).toBe('0 2px 8px rgba(0, 0, 0, 0.25)');
        expect(TOKENS.shadows.modal).toBe('0 8px 32px rgba(0, 0, 0, 0.4)');
        expect(TOKENS.shadows.plate).toBe('0 2px 8px rgba(0, 0, 0, 0.2)');
    });
});

describe('motion tokens (Feature 062 FR-002)', () => {
    it('defines all new motion tokens', () => {
        expect(TOKENS.motion.duration).toBe('120ms');
        expect(TOKENS.motion.transitionFast).toBe('80ms');
        expect(TOKENS.motion.transitionDefault).toBe('120ms');
        expect(TOKENS.motion.transitionSlow).toBe('200ms');
        expect(TOKENS.motion.transitionSpring).toBe('300ms');
        expect(TOKENS.motion.easingOut).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
        expect(TOKENS.motion.easingInOut).toBe('ease-in-out');
    });

    it('preserves existing motion tokens', () => {
        expect(TOKENS.motion.durationMs).toBe(120);
        expect(TOKENS.motion.easing).toBe('ease');
        expect(TOKENS.motion.easingLinear).toBe('linear');
        expect(TOKENS.motion.spinDuration).toBe('1.2s');
    });
});

describe('color token additions (Feature 062 FR-003)', () => {
    it('defines the four new color tokens', () => {
        expect(TOKENS.color.textLink).toBe('#f59e0b');
        expect(TOKENS.color.accentActive).toBe('#d97706');
        expect(TOKENS.color.divider).toBe('#374151');
        expect(TOKENS.color.cardHoverBorder).toBe('#f59e0b');
    });
});

describe('typography token additions (Feature 062 FR-004)', () => {
    it('defines the five new typography tokens', () => {
        expect(TOKENS.typography.heading).toBe('1.5rem');
        expect(TOKENS.typography.subheading).toBe('1.2rem');
        expect(TOKENS.typography.trackingTight).toBe('-0.025em');
        expect(TOKENS.typography.trackingNormal).toBe('0');
        expect(TOKENS.typography.trackingWide).toBe('0.05em');
    });
});

describe('focus ring token additions (Feature 062 FR-005)', () => {
    it('defines the two new focus ring tokens', () => {
        expect(TOKENS.focusRing.darkColor).toBe('#111827');
        expect(TOKENS.focusRing.lightColor).toBe('#ffffff');
    });

    it('preserves existing focus ring token', () => {
        expect(TOKENS.focusRing.color).toBe('#ffffff');
    });
});
