/**
 * Token-table pin for the pipe slope color tokens (spec 005 FR-013, issue #30).
 *
 * Asserts the four additive pipe tokens exist and reuse the canonical
 * green/accent/red/textMuted values (zero new hex literals), and that the
 * color group stays sorted alphabetically — the emitter's determinism
 * invariant (spec 012 FR-004: `packages/design/scripts/build-css.ts` walks
 * keys in sorted order so `dist/design.css` is byte-identical per build).
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

describe('token table determinism invariant (spec 012 FR-004)', () => {
    it('keeps the color group keys sorted alphabetically', () => {
        const keys = Object.keys(TOKENS.color);
        const sorted = [...keys].sort((left, right) => left.localeCompare(right));
        expect(keys).toEqual(sorted);
    });
});
