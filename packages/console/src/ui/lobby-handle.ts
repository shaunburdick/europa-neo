/**
 * Client-side handle validation — feature 010 (T-015).
 *
 * A pure, browser-safe MIRROR of the server's FR-004/FR-005 validation
 * (`@europa/matchmaking` `src/internal/handleValidation.ts`, hardened
 * per spec Clarifications v1.5). Purpose: instant, offline feedback in
 * the identity form so obviously invalid submissions never pay a
 * server round-trip. The SERVER REMAINS AUTHORITATIVE — this mirror
 * exists only to reject early and identically; a submission that
 * passes here can still be rejected by the uniqueness check
 * (`handle_taken`) or any future server-side rule.
 *
 * Mirror status: matchmaking does not export `validateHandle` /
 * `HANDLE_MIN_CHARS` / `HANDLE_MAX_CHARS` from its public barrel (the
 * validator is an internal), so the rules are mirrored here and pinned
 * by `tests/unit/ui/lobby-ui-logic.test.ts`, which imports the real
 * server validator and asserts both accept/reject the same fixture
 * corpus. If the server rules change, that pin fails first.
 *
 * Rules (rejection precedence matches the server exactly):
 *
 *   1. trim ECMAScript whitespace → empty remainder        → `'empty'`
 *   2. more than {@link LOBBY_HANDLE_MAX_CHARS} code points → `'too_long'`
 *   3. any Unicode Cc control character                     → `'control_character'`
 *   4. any bidi formatting control (U+202A–U+202E, U+2066–U+2069) → `'bidi_control'`
 *   5. any lone surrogate code point                        → `'lone_surrogate'`
 *
 * Character counts are UNICODE CODE POINTS (`Array.from` iteration),
 * not UTF-16 units — astral emoji count as one character each.
 * Well-formed surrogate pairs stay valid; zero-width spaces (Cf)
 * remain valid content; only the nine bidi controls above are
 * rejected beyond Cc (spec Clarifications v1.5).
 *
 * Pure module: no DOM, no clocks, no randomness.
 */

/** Minimum accepted handle length in Unicode code points (post-trim). Mirrors matchmaking's `HANDLE_MIN_CHARS`. */
export const LOBBY_HANDLE_MIN_CHARS = 1;

/** Maximum accepted handle length in Unicode code points (post-trim). Mirrors matchmaking's `HANDLE_MAX_CHARS`. */
export const LOBBY_HANDLE_MAX_CHARS = 24;

/**
 * Why a draft was rejected — mirrors the server's machine-readable
 * `detail.reason` values one-to-one (`'empty' | 'too_long' |
 * 'control_character' | 'bidi_control' | 'lone_surrogate'`) so the UI
 * text and the wire's eventual error can never disagree about class.
 */
export type LobbyHandleIssue = 'empty' | 'too_long' | 'control_character' | 'bidi_control' | 'lone_surrogate';

/** Matches Unicode category Cc (see the server mirror's pattern note). */
const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;

/** Matches the nine bidirectional formatting controls (v1.5 ruling). */
const BIDI_CONTROL_PATTERN = /[\u202A-\u202E\u2066-\u2069]/u;

/**
 * Matches ONE surrogate code point — applied per element of an
 * `Array.from` iteration only (never to a whole string), so
 * well-formed astral pairs collapse into single elements and pass.
 */
const SURROGATE_CODE_POINT_PATTERN = /[\uD800-\uDFFF]/u;

/** Result of a successful local validation: the trimmed display handle. */
export type ValidHandleDraft = { readonly ok: true; readonly value: string };

/** Result of a failed local validation: the issue class + actionable message. */
export interface InvalidHandleDraft {
    readonly ok: false;
    /** Machine-readable rejection class (mirrors the server's `detail.reason`). */
    readonly issue: LobbyHandleIssue;
    /** Human-readable, actionable English message (announced + rendered inline). */
    readonly message: string;
}

/** Either validation outcome for one handle draft. */
export type HandleDraftValidation = ValidHandleDraft | InvalidHandleDraft;

/**
 * Validate a raw handle submission against the mirrored FR-004 rules
 * (as hardened by spec Clarifications v1.5).
 *
 * @param raw The handle exactly as submitted (pre-validation).
 * @returns The trimmed display handle on success, or the rejection
 *   class plus an actionable message. Rejection precedence is fixed:
 *   empty → too_long → control_character → bidi_control →
 *   lone_surrogate (identical to the server's pipeline).
 */
export function validateHandleDraft(raw: string): HandleDraftValidation {
    const trimmed = raw.trim();
    // One element per CODE POINT (astral pairs collapse) — drives both
    // the length check and the lone-surrogate scan below.
    const codePoints = Array.from(trimmed);
    const charCount = codePoints.length;

    if (charCount < LOBBY_HANDLE_MIN_CHARS) {
        return {
            ok: false,
            issue: 'empty',
            message: 'Enter a name with at least one non-whitespace character.',
        };
    }
    if (charCount > LOBBY_HANDLE_MAX_CHARS) {
        return {
            ok: false,
            issue: 'too_long',
            message: `Names must be at most ${String(LOBBY_HANDLE_MAX_CHARS)} characters (yours is ${String(charCount)}).`,
        };
    }
    if (CONTROL_CHARACTER_PATTERN.test(trimmed)) {
        return {
            ok: false,
            issue: 'control_character',
            message: 'Names must not contain control characters.',
        };
    }
    if (BIDI_CONTROL_PATTERN.test(trimmed)) {
        return {
            ok: false,
            issue: 'bidi_control',
            message: 'Names must not contain bidirectional formatting characters.',
        };
    }
    const hasLoneSurrogate = codePoints.some((codePoint) => SURROGATE_CODE_POINT_PATTERN.test(codePoint));
    if (hasLoneSurrogate) {
        return {
            ok: false,
            issue: 'lone_surrogate',
            message: 'Names must not contain unpaired surrogate characters.',
        };
    }
    return { ok: true, value: trimmed };
}
