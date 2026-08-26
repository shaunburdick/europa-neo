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
 * validator must do with each corpus entry. ONE deliberate exception:
 * the v1.5 closed-set sweeps below enumerate ALL nine bidi control
 * code points and the four surrogate range boundaries — exhaustive
 * coverage of a closed set, not mirrored logic.
 *
 * Expected outputs are hard-coded literals (test-reviewer Rule 1): the
 * accepted-value table below STATES what each valid entry trims to
 * instead of recomputing `.trim()`, so a broken implementation cannot
 * be laundered through mirrored logic.
 *
 * The discretionary pairs pin the v1.4 spec ruling: uniqueness keys use
 * locale-independent `String.prototype.toLowerCase()`, so `ß`/`SS` and
 * `İ`/`i` variants remain DISTINCT handles. The v1.5 sweeps pin the
 * validation-hardening ruling: bidi formatting controls and lone
 * surrogates are rejected with distinct machine-readable reasons while
 * well-formed surrogate pairs and ordinary Cf characters stay valid.
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
// Validation hardening (spec Clarifications v1.5 — audit LOW-6/LOW-7)
// ----------------------------------------------------------------------------

/** The five bidi override controls, U+202A–U+202E (LRE/RLE/PDF/LRO/RLO). */
const BIDI_OVERRIDE_RANGE = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e] as const;

/** The four bidi isolate controls, U+2066–U+2069 (LRI/RLI/FSI/PDI). */
const BIDI_ISOLATE_RANGE = [0x2066, 0x2067, 0x2068, 0x2069] as const;

/** All NINE bidi formatting controls covered by the v1.5 ruling. */
const ALL_BIDI_CONTROLS: readonly number[] = [...BIDI_OVERRIDE_RANGE, ...BIDI_ISOLATE_RANGE];

/** The four corners of the surrogate space (category Cs, U+D800–U+DFFF). */
const SURROGATE_BOUNDARIES = [0xd800, 0xdbff, 0xdc00, 0xdfff] as const;

describe('validateHandle — v1.5 bidi-control rejection (audit LOW-6)', () => {
    it('rejects EVERY bidi control code point with reason bidi_control (closed-set sweep)', () => {
        expect(ALL_BIDI_CONTROLS).toHaveLength(9);
        for (const codePoint of ALL_BIDI_CONTROLS) {
            const handle = `x${String.fromCodePoint(codePoint)}y`;
            const result = validateHandle(handle);
            expect(result, `U+${codePoint.toString(16).toUpperCase()}`).toEqual({
                ok: false,
                error: { code: 'handle_invalid', message: expect.any(String), detail: { reason: 'bidi_control' } },
            });
        }
    });

    it('rejects the corpus bidi entries with reason bidi_control', () => {
        for (const entry of INVALID_HANDLES) {
            if (!ALL_BIDI_CONTROLS.some((cp) => entry.handle.includes(String.fromCodePoint(cp)))) {
                continue;
            }
            const result = validateHandle(entry.handle);
            expect(result.ok, entry.rule).toBe(false);
            if (!result.ok) {
                expect(result.error.detail, entry.rule).toEqual({ reason: 'bidi_control' });
            }
        }
    });

    it('still accepts ordinary Cf format characters — only bidi controls were reclassified', () => {
        // U+200B zero-width space and U+00AD soft hyphen are Cf but NOT
        // bidi controls; they remain valid content per the v1.5 letter.
        expect(validateHandle('\u200Bzerowidth')).toEqual({ ok: true, data: '\u200Bzerowidth' });
        expect(validateHandle('soft\u00ADhyphen')).toEqual({ ok: true, data: 'soft\u00ADhyphen' });
    });
});

describe('validateHandle — v1.5 lone-surrogate rejection (audit LOW-7)', () => {
    it('rejects every surrogate range boundary when unpaired, with reason lone_surrogate', () => {
        for (const codeUnit of SURROGATE_BOUNDARIES) {
            const handle = `a${String.fromCharCode(codeUnit)}b`;
            const result = validateHandle(handle);
            expect(result, `U+${codeUnit.toString(16).toUpperCase()}`).toEqual({
                ok: false,
                error: { code: 'handle_invalid', message: expect.any(String), detail: { reason: 'lone_surrogate' } },
            });
        }
    });

    it('rejects broken-pair arrangements where a surrogate hides next to complete pairs', () => {
        // Two adjacent HIGH surrogates never pair; a LOW surrogate after
        // a COMPLETE pair is still lone. Pairing is by code point, not
        // adjacency — naive "high must be followed by low" checks miss
        // both shapes.
        for (const handle of ['\uD83D\uD83Dx', '🚀\uDEAD']) {
            const result = validateHandle(handle);
            expect(result, JSON.stringify(handle)).toEqual({
                ok: false,
                error: { code: 'handle_invalid', message: expect.any(String), detail: { reason: 'lone_surrogate' } },
            });
        }
    });

    it('keeps well-formed surrogate pairs valid — astral emoji count as single characters', () => {
        expect(validateHandle('🚀ok')).toEqual({ ok: true, data: '🚀ok' });
        expect(validateHandle('🚀'.repeat(HANDLE_MAX_CHARS))).toEqual({
            ok: true,
            data: '🚀'.repeat(HANDLE_MAX_CHARS),
        });
    });

    it('rejects the corpus lone-surrogate entries with reason lone_surrogate', () => {
        for (const entry of INVALID_HANDLES) {
            const hasLoneSurrogate = Array.from(entry.handle).some((codePoint) => /[\uD800-\uDFFF]/u.test(codePoint));
            if (!hasLoneSurrogate) {
                continue;
            }
            const result = validateHandle(entry.handle);
            expect(result.ok, entry.rule).toBe(false);
            if (!result.ok) {
                expect(result.error.detail, entry.rule).toEqual({ reason: 'lone_surrogate' });
            }
        }
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
