/**
 * Guest Identity & Handle Fixtures — Feature 010 test fixture (T-004)
 *
 * Builders and data corpora for everything identity-shaped in the
 * feature-010 contracts (`src/contracts/lobby-types.ts`):
 *
 *   - {@link nextGuestPlayerId} / {@link buildIdentityClaim} /
 *     {@link buildIdentityState} — deterministic constructors so tests
 *     never hand-roll branded literals.
 *   - {@link VALID_HANDLES} / {@link INVALID_HANDLES} — table-driven
 *     corpora where every entry names the FR-004/FR-005 clause it
 *     exercises, ready for Wave-2 validation table tests (T-005).
 *   - {@link HANDLE_CONFLICT_GROUPS} — variant groups that MUST collide
 *     under trimmed, case-insensitive uniqueness (FR-005).
 *   - {@link DISCRETIONARY_HANDLES} — Unicode case-folding edge cases
 *     the spec letter does not settle; suites must pin whichever
 *     behavior T-005 implements instead of blanket-asserting.
 *
 * Corpus discipline (test-reviewer Rule 1): these are DATA, not logic.
 * Nothing here re-implements trimming, length counting, or case
 * folding — production owns that. Each entry only declares what the
 * spec says it should classify, so a broken implementation cannot be
 * laundered through a mirrored helper.
 *
 * Pure module: no clock reads, no randomness (constitution Principle II).
 */

import type { GuestIdentityClaim, GuestPlayerId, IdentityState, LobbyErrorCode } from '../../src/contracts/lobby-types';

// ----------------------------------------------------------------------------
// Branded id minting
// ----------------------------------------------------------------------------

/** Monotonic counter behind {@link nextGuestPlayerId} (per module load). */
let guestPlayerIdCounter = 0;

/**
 * Mint a fresh opaque `GuestPlayerId`. Deterministic within a process
 * (`guest-0001`, `guest-0002`, …); tests that need absolute stability
 * should pass explicit ids into builders instead of relying on call
 * order. The value is non-semantic by construction — safe to use in
 * leakage assertions precisely because it never belongs in a view.
 */
export function nextGuestPlayerId(): GuestPlayerId {
    guestPlayerIdCounter += 1;
    return `guest-${String(guestPlayerIdCounter).padStart(4, '0')}` as GuestPlayerId;
}

// ----------------------------------------------------------------------------
// Identity builders
// ----------------------------------------------------------------------------

/** Overrides for {@link buildIdentityClaim}; omitted fields keep defaults. */
export type IdentityClaimOverrides = Partial<GuestIdentityClaim>;

/**
 * Build a `GuestIdentityClaim` (client-presented resume INPUT). Default
 * carries both fields — the "returning browser" shape; delete fields
 * via an explicit `undefined` override for first-visit shapes.
 */
export function buildIdentityClaim(overrides: IdentityClaimOverrides = {}): GuestIdentityClaim {
    return Object.freeze({
        guestPlayerId: nextGuestPlayerId(),
        handle: 'Nova',
        ...overrides,
    });
}

/** Overrides for {@link buildIdentityState}; omitted fields keep defaults. */
export type IdentityStateOverrides = Partial<IdentityState>;

/**
 * Build an `IdentityState` (server-resolved SAFE projection). Default
 * is the named state `{ handle: 'Nova', hasIdentity: true }`; pass
 * `handle: null` for the freshly-established, unnamed shape (US1 AC-1).
 */
export function buildIdentityState(overrides: IdentityStateOverrides = {}): IdentityState {
    return Object.freeze({
        handle: 'Nova',
        hasIdentity: true,
        ...overrides,
    });
}

// ----------------------------------------------------------------------------
// Handle corpora (spec FR-004/FR-005)
// ----------------------------------------------------------------------------

/** One corpus entry: a raw handle plus the spec clause it exercises. */
export interface HandleCase {
    /** The handle exactly as a client would submit it (pre-validation). */
    readonly handle: string;
    /** Human-readable FR-004/FR-005 clause this case pins. */
    readonly rule: string;
}

/** A corpus entry expected to FAIL validation, with the mapped error code. */
export interface InvalidHandleCase extends HandleCase {
    /** The `LobbyErrorCode` the facade must return for this case. */
    readonly expectedCode: LobbyErrorCode;
}

/**
 * Handles that MUST pass FR-004 validation. Length-sensitive entries
 * are built with `.repeat()` because the rule counts UNICODE CODE
 * POINTS, not UTF-16 units: 24 astral emoji are 24 characters (valid)
 * while measuring 48 under a naive `.length` check — this corpus pins
 * code-point semantics for T-005's implementation.
 */
export const VALID_HANDLES: readonly HandleCase[] = [
    { handle: 'Nova', rule: 'FR-004 baseline: plain ASCII, well within 1–24' },
    { handle: 'x', rule: 'FR-004 minimum length: exactly 1 character' },
    { handle: 'Ångström', rule: 'FR-004: precomposed Latin letters beyond ASCII are valid' },
    { handle: '玩家一号', rule: 'FR-004: CJK text is valid Unicode content' },
    { handle: '🚀🚀🚀', rule: 'FR-004: astral-plane code points (surrogate pairs) are single characters' },
    {
        handle: '🚀'.repeat(24),
        rule: 'FR-004 boundary: exactly 24 code points (48 UTF-16 units) is valid — counts code points',
    },
    { handle: 'a'.repeat(24), rule: 'FR-004 boundary: exactly 24 ASCII characters is valid' },
    { handle: '  Padded Nova  ', rule: 'FR-004: valid AFTER trimming leading/trailing whitespace' },
    { handle: '\tnova\r\n', rule: 'FR-004: line/tab whitespace at the edges is trimmed away' },
    {
        handle: '\u200Bzerowidth',
        rule: 'FR-004 letter: U+200B is format category Cf, not a control char (Cc) and not ECMAScript whitespace',
    },
    {
        handle: 'so\u00A0far',
        rule: 'FR-004: interior U+00A0 NBSP is neither control nor trimmed (only edges are)',
    },
];

/**
 * Handles that MUST fail FR-004 validation. Every entry expects the
 * `handle_invalid` error code; suites drive the production validator
 * with this table and assert `expectedCode` verbatim.
 */
export const INVALID_HANDLES: readonly InvalidHandleCase[] = [
    { handle: '', rule: 'FR-004: empty string has no characters', expectedCode: 'handle_invalid' },
    { handle: '   ', rule: 'FR-004: whitespace-only trims to empty', expectedCode: 'handle_invalid' },
    {
        handle: '\t\n\r',
        rule: 'FR-004: whitespace-only (tabs/newlines) trims to empty',
        expectedCode: 'handle_invalid',
    },
    {
        handle: '\u00A0\u2003\u3000',
        rule: 'FR-004: NBSP/em-space/ideographic-space are ECMAScript whitespace; trims to empty',
        expectedCode: 'handle_invalid',
    },
    {
        handle: '\uFEFF',
        rule: 'FR-004: BOM is ECMAScript whitespace under trim; trims to empty',
        expectedCode: 'handle_invalid',
    },
    {
        handle: 'b'.repeat(25),
        rule: 'FR-004 boundary: 25 ASCII characters is overlong',
        expectedCode: 'handle_invalid',
    },
    {
        handle: '🚀'.repeat(25),
        rule: 'FR-004 boundary: 25 astral code points is overlong despite measuring 50 under UTF-16 .length',
        expectedCode: 'handle_invalid',
    },
    {
        handle: 'bad\u0000name',
        rule: 'FR-004: embedded NUL (Cc) is a control character',
        expectedCode: 'handle_invalid',
    },
    {
        handle: 'bad\tname',
        rule: 'FR-004: INTERIOR tab is a control character (trim only strips edges)',
        expectedCode: 'handle_invalid',
    },
    { handle: 'bad\nname', rule: 'FR-004: interior newline is a control character', expectedCode: 'handle_invalid' },
    {
        handle: 'bad\rname',
        rule: 'FR-004: interior carriage return is a control character',
        expectedCode: 'handle_invalid',
    },
    {
        handle: '\u001B[31mred',
        rule: 'FR-004: ESC (Cc) is a control character — ANSI-escape injection',
        expectedCode: 'handle_invalid',
    },
    { handle: '\u007F', rule: 'FR-004: DEL (Cc) is a control character', expectedCode: 'handle_invalid' },
    {
        handle: '\u0080\u0081x',
        rule: 'FR-004: C1 range (U+0080–U+009F) are control characters',
        expectedCode: 'handle_invalid',
    },
];

/**
 * A group of submitted variants that MUST resolve to ONE active handle
 * under FR-005 (trimmed, case-insensitive comparison). `displayForm`
 * is the canonical accepted casing — the value the lobby should show
 * after the FIRST variant wins (FR-005: displayed casing is preserved,
 * later conflicting submissions are rejected with `handle_taken`).
 */
export interface HandleConflictGroup {
    /** Raw submissions that all normalize onto the same active handle. */
    readonly variants: readonly string[];
    /** The canonical displayed casing (group member 0) for assertions. */
    readonly displayForm: string;
    /** Why these collide, for suite failure messages. */
    readonly note: string;
}

/**
 * Uniqueness-collision groups for FR-005 table tests (T-005/T-009
 * concurrency cases). The first group reproduces the spec edge-case
 * triple verbatim: `" Nova "`, `"nova"`, and `"NOVA"` conflict.
 */
export const HANDLE_CONFLICT_GROUPS: readonly HandleConflictGroup[] = [
    {
        variants: ['Nova', '  nova ', 'NOVA', ' NoVa\t'],
        displayForm: 'Nova',
        note: 'Spec edge case: trimmed case-insensitive comparison collides all casing/padding variants',
    },
    {
        variants: ['Ångström', 'ångström', 'ÅNGSTRÖM'],
        displayForm: 'Ångström',
        note: 'Non-ASCII letters fold case-insensitively too (FR-005 is Unicode-aware)',
    },
    {
        variants: ['x', 'X'],
        displayForm: 'x',
        note: 'Minimal collision pair: single characters differing only by case',
    },
];

/**
 * A Unicode case-folding edge case the spec letter does NOT settle.
 * Suites must pin the implemented behavior explicitly (and document
 * the ruling) rather than assuming either outcome.
 */
export interface DiscretionaryHandleCase {
    /** The submitted variants whose equality is implementation-defined. */
    readonly variants: readonly [string, string];
    /** What is ambiguous and why, for suite documentation. */
    readonly question: string;
}

/**
 * Case-folding edges deliberately EXCLUDED from the normative corpora:
 * full Unicode case folding and naive ASCII lowercasing disagree on
 * these, and FR-005 says only "case-insensitive". Wave-2 suites should
 * assert whatever T-005 actually implements and record the ruling in
 * the spec's Implementation Notes.
 */
export const DISCRETIONARY_HANDLES: readonly DiscretionaryHandleCase[] = [
    {
        variants: ['Straße', 'STRASSE'],
        question:
            'Full case folding folds ß→ss (equal); toLowerCase keeps them distinct. Which folding does T-005 use?',
    },
    {
        variants: ['İstanbul', 'istanbul'],
        question:
            'U+0130 lowercases to i+U+0307 (two code points) under toLowerCase — not equal to plain "istanbul"; locale-aware folding differs again.',
    },
];
