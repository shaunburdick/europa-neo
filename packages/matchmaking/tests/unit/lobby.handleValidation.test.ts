/**
 * Unit tests for FR-004/FR-005 handle validation & normalization —
 * Feature 010 (T-005)
 *
 * Driven ENTIRELY by the shared corpora in
 * `tests/fixtures/lobbyIdentities.ts` (T-004): every accepted/rejected
 * classification comes from `VALID_HANDLES` / `INVALID_HANDLES`, every
 * collision claim from `HANDLE_CONFLICT_GROUPS`, and the discretionary
 * case-folding pins from `DISCRETIONARY_HANDLES`. This suite never
 * re-declares handle cases; it only states what the production
 * validator must do with each corpus entry.
 *
 * Expected outputs are hard-coded literals (test-reviewer Rule 1): the
 * accepted-value table below STATES what each valid entry trims to
 * instead of recomputing `.trim()`, so a broken implementation cannot
 * be laundered through mirrored logic.
 *
 * The discretionary pairs pin the v1.4 spec ruling: uniqueness keys use
 * locale-independent `String.prototype.toLowerCase()`, so `ß`/`SS` and
 * `İ`/`i` variants remain DISTINCT handles.
 */

import { describe, expect, it } from 'vitest';
import { HANDLE_MAX_CHARS, normalizeHandleKey, validateHandle } from '../../src/internal/handleValidation';
import { createIdentityRegistry } from '../../src/internal/identityRegistry';
import {
    DISCRETIONARY_HANDLES,
    type DiscretionaryHandleCase,
    HANDLE_CONFLICT_GROUPS,
    INVALID_HANDLES,
    VALID_HANDLES,
} from '../fixtures/lobbyIdentities';

// ----------------------------------------------------------------------------
// Hard-coded expected outputs for VALID_HANDLES (stated, not computed)
// ----------------------------------------------------------------------------

/** Corpus boundary length shared by the repeat-built entries. */
const BOUNDARY_CHARS = 24;

/**
 * Maps every `VALID_HANDLES` entry to the exact display handle the
 * validator must accept. Keys are the raw submissions verbatim;
 * values are concrete expected outputs — including the trimmed forms
 * of the padded entries and the preserved U+200B / interior-NBSP
 * content the corpus calls out.
 */
const EXPECTED_ACCEPTED: Readonly<Record<string, string>> = {
    Nova: 'Nova',
    x: 'x',
    Ångström: 'Ångström',
    玩家一号: '玩家一号',
    '🚀🚀🚀': '🚀🚀🚀',
    ['🚀'.repeat(BOUNDARY_CHARS)]: '🚀'.repeat(BOUNDARY_CHARS),
    ['a'.repeat(BOUNDARY_CHARS)]: 'a'.repeat(BOUNDARY_CHARS),
    '  Padded Nova  ': 'Padded Nova',
    '\tnova\r\n': 'nova',
    '\u200Bzerowidth': '\u200Bzerowidth',
    'so\u00A0far': 'so\u00A0far',
};

// ----------------------------------------------------------------------------
// Validation table (FR-004)
// ----------------------------------------------------------------------------

describe('validateHandle — FR-004 acceptance table', () => {
    it('accepts every VALID_HANDLES corpus entry and returns its stated display form', () => {
        for (const entry of VALID_HANDLES) {
            const result = validateHandle(entry.handle);
            const expected = EXPECTED_ACCEPTED[entry.handle];
            expect(result, entry.rule).toEqual({ ok: true, data: expected });
        }
    });

    it('rejects every INVALID_HANDLES corpus entry with code handle_invalid and an actionable message', () => {
        for (const entry of INVALID_HANDLES) {
            const result = validateHandle(entry.handle);
            expect(result.ok, entry.rule).toBe(false);
            if (result.ok) {
                continue;
            }
            expect(result.error.code, entry.rule).toBe(entry.expectedCode);
            expect(result.error.message.length > 0, entry.rule).toBe(true);
        }
    });
});

describe('validateHandle — machine-readable detail (v1.3 detail ruling)', () => {
    it('reports reason empty for whitespace-only input', () => {
        const result = validateHandle('   ');
        expect(result).toEqual({
            ok: false,
            error: { code: 'handle_invalid', message: expect.any(String), detail: { reason: 'empty' } },
        });
    });

    it('reports reason too_long with received and max code-point counts', () => {
        const result = validateHandle('b'.repeat(HANDLE_MAX_CHARS + 1));
        expect(result).toEqual({
            ok: false,
            error: {
                code: 'handle_invalid',
                message: expect.any(String),
                detail: { reason: 'too_long', receivedChars: HANDLE_MAX_CHARS + 1, maxChars: HANDLE_MAX_CHARS },
            },
        });
    });

    it('reports reason control_character for embedded control characters', () => {
        const result = validateHandle('bad\u0000name');
        expect(result).toEqual({
            ok: false,
            error: { code: 'handle_invalid', message: expect.any(String), detail: { reason: 'control_character' } },
        });
    });
});

// ----------------------------------------------------------------------------
// Normalization key (FR-005)
// ----------------------------------------------------------------------------

describe('normalizeHandleKey — FR-005 case-insensitive comparison', () => {
    it('folds plain case so casing variants share one key', () => {
        expect(normalizeHandleKey('Nova')).toBe('nova');
        expect(normalizeHandleKey('NOVA')).toBe('nova');
        expect(normalizeHandleKey('Ångström')).toBe('ångström');
    });

    it('does not trim (callers pass already-accepted handles)', () => {
        // Stated precondition: keys derive from ACCEPTED handles only.
        expect(normalizeHandleKey('Nova')).not.toBe(' nova');
    });
});

// ----------------------------------------------------------------------------
// Conflict groups (FR-005 uniqueness through the registry)
// ----------------------------------------------------------------------------

describe('handle conflict groups — trimmed case-insensitive uniqueness', () => {
    it('lets the first variant win with the canonical display form and rejects all other variants', () => {
        for (const group of HANDLE_CONFLICT_GROUPS) {
            const [firstVariant] = group.variants;
            if (firstVariant === undefined) {
                throw new Error(`conflict group has no variants: ${group.note}`);
            }
            const registry = createIdentityRegistry();
            const winner = registry.createIdentity();
            const claimed = registry.setHandle(winner.id, firstVariant);
            expect(claimed, group.note).toEqual({ ok: true, data: group.displayForm });

            const rival = registry.createIdentity();
            for (const variant of group.variants) {
                const result = registry.setHandle(rival.id, variant);
                expect(result.ok, `${group.note} — variant ${JSON.stringify(variant)}`).toBe(false);
                if (!result.ok) {
                    expect(result.error.code).toBe('handle_taken');
                }
            }

            // The loser's rejection must not displace the winner (spec edge case).
            expect(registry.projectIdentity(winner.id)).toEqual({ handle: group.displayForm, hasIdentity: true });
        }
    });
});

// ----------------------------------------------------------------------------
// Discretionary case-folding pins (spec Clarifications v1.4)
// ----------------------------------------------------------------------------

/** Fetch one discretionary case by a variant it must contain; fail loudly if the corpus changed shape. */
function requireDiscretionaryCase(needle: string): DiscretionaryHandleCase {
    const found = DISCRETIONARY_HANDLES.find((entry) => entry.variants.includes(needle));
    if (found === undefined) {
        throw new Error(`discretionary corpus lost its ${JSON.stringify(needle)} entry`);
    }
    return found;
}

describe('discretionary case-folding — pinned v1.4 ruling (toLowerCase, no full folding)', () => {
    it('keeps ß and SS distinct: Straße and STRASSE can coexist', () => {
        const discretionaryCase = requireDiscretionaryCase('Straße');
        const [distinguished, sibling] = discretionaryCase.variants;
        if (distinguished === undefined || sibling === undefined) {
            throw new Error('discretionary case lost its variant pair');
        }
        const registry = createIdentityRegistry();
        const first = registry.createIdentity();
        const second = registry.createIdentity();

        const firstResult = registry.setHandle(first.id, distinguished);
        const secondResult = registry.setHandle(second.id, sibling);

        expect(firstResult, discretionaryCase.question).toEqual({ ok: true, data: 'Straße' });
        expect(secondResult, discretionaryCase.question).toEqual({ ok: true, data: 'STRASSE' });
    });

    it('keeps İ and i distinct: İstanbul and istanbul can coexist', () => {
        const discretionaryCase = requireDiscretionaryCase('İstanbul');
        const [distinguished, sibling] = discretionaryCase.variants;
        if (distinguished === undefined || sibling === undefined) {
            throw new Error('discretionary case lost its variant pair');
        }
        const registry = createIdentityRegistry();
        const first = registry.createIdentity();
        const second = registry.createIdentity();

        const firstResult = registry.setHandle(first.id, distinguished);
        const secondResult = registry.setHandle(second.id, sibling);

        expect(firstResult, discretionaryCase.question).toEqual({ ok: true, data: 'İstanbul' });
        expect(secondResult, discretionaryCase.question).toEqual({ ok: true, data: 'istanbul' });
    });

    it('still folds ordinary case across scripts (the ruling is case-insensitivity, not byte equality)', () => {
        const registry = createIdentityRegistry();
        const first = registry.createIdentity();
        const second = registry.createIdentity();

        expect(registry.setHandle(first.id, 'Player')).toEqual({ ok: true, data: 'Player' });
        expect(registry.setHandle(second.id, 'PLAYER').ok).toBe(false);
    });
});
