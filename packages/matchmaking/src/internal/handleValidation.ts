/**
 * Handle validation & normalization — Feature 010 (T-005)
 *
 * Pure FR-004/FR-005 logic for guest-player handles:
 *
 *   - {@linkcode validateHandle} enforces the v1 validation default
 *     (spec Clarifications v1.0): 1–24 Unicode CHARACTERS after
 *     trimming, at least one non-whitespace character, no control
 *     characters — hardened per Clarifications v1.5 to also reject
 *     bidi formatting controls and lone surrogates (see the ruling
 *     paragraph below). Character counts are UNICODE CODE POINTS
 *     (`Array.from` iteration), not UTF-16 units — astral emoji count
 *     as one character each (pinned by `VALID_HANDLES` /
 *     `INVALID_HANDLES` in `tests/fixtures/lobbyIdentities.ts`).
 *   - {@linkcode normalizeHandleKey} derives the uniqueness key for
 *     FR-005's trimmed, case-insensitive comparison.
 *
 * Case-folding ruling (spec Clarifications v1.4): the uniqueness key is
 * the trimmed handle lowercased with JavaScript's locale-independent
 * built-in `String.prototype.toLowerCase()` — default Unicode case
 * mappings only. What folds: case-based default mappings (`Å→å`,
 * `Ö→ö`, and expansions such as `İ` U+0130 → `i` + combining dot).
 * What does not fold: `ß` is never expanded to `SS` (`Straße` and
 * `STRASSE` stay distinct), and locale-specific conventions (Turkish
 * dotless-i, …) are deliberately not applied so every self-hosted
 * instance normalizes identically (constitution Principle II). ECMAScript
 * has no full case folding (`ß→ss`), so "case-insensitive" is defined
 * by this mapping and nothing richer.
 *
 * Validation-hardening ruling (spec Clarifications v1.5, Wave-2 audit
 * LOW-6/LOW-7): beyond Cc controls, two additional classes are
 * rejected at this single source:
 *
 *   - Bidirectional formatting controls — U+202A–U+202E (LRE/RLE/
 *     PDF/LRO/RLO overrides) and U+2066–U+2069 (LRI/RLI/FSI/PDI
 *     isolates). Participant labels are identity (FR-020); these
 *     invisible characters visually reorder how a handle renders for
 *     OTHER players while looking benign to the submitter, so they
 *     are rejected before they ever reach a seat label or lobby row.
 *   - Lone (unpaired) surrogate code points (category Cs,
 *     U+D800–U+DFFF without a partner). They mutate to U+FFFD on
 *     UTF-8 encoding and corrupt server logs and downstream storage.
 *     Well-formed surrogate pairs remain single valid characters —
 *     astral emoji stay welcome (pinned by `VALID_HANDLES`).
 *
 * Other format-category (Cf) characters — notably zero-width spaces
 * such as U+200B — REMAIN valid content; only the nine bidi controls
 * above changed status.
 *
 * Clause subsumption note: FR-004's "at least one non-whitespace
 * character" is implied by the post-trim length check — `trim()`
 * removes ALL edge whitespace, so any non-empty remainder necessarily
 * begins with a non-whitespace character. No separate check exists.
 *
 * The accepted display handle is the TRIMMED submission with casing
 * preserved verbatim (FR-005); callers store exactly what this module
 * returns as the success payload.
 *
 * Tunables ({@linkcode HANDLE_MIN_CHARS} / {@linkcode HANDLE_MAX_CHARS})
 * live here because feature-010 owns them; `src/constants.ts` remains
 * the feature-006 tunable home.
 *
 * Pure module: no clock reads, no randomness (constitution Principle II).
 */

import type { Result } from '../contracts/lobby-api';
import type { LobbyError, LobbyErrorCode } from '../contracts/lobby-types';

// ----------------------------------------------------------------------------
// Tunables
// ----------------------------------------------------------------------------

/** Minimum accepted handle length in Unicode code points (post-trim). */
export const HANDLE_MIN_CHARS = 1;

/** Maximum accepted handle length in Unicode code points (post-trim). */
export const HANDLE_MAX_CHARS = 24;

/**
 * Matches Unicode category Cc (control characters): C0 range
 * (U+0000–U+001F, which includes interior tabs/newlines — trimming
 * only strips edges), DEL (U+007F), and the C1 range
 * (U+0080–U+009F). Format characters (Cf) deliberately do NOT match —
 * zero-width spaces remain valid content, and the nine bidi controls
 * rejected per Clarifications v1.5 get their own pattern below so
 * each rejection class carries a distinct machine-readable reason.
 */
const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;

/**
 * Matches the nine bidirectional formatting controls (spec
 * Clarifications v1.5): U+202A–U+202E (LRE, RLE, PDF, LRO, RLO — the
 * bidi overrides) and U+2066–U+2069 (LRI, RLI, FSI, PDI — the
 * isolates). All are category Cf, so {@linkcode CONTROL_CHARACTER_PATTERN}
 * does not catch them; they are rejected because participant labels
 * are identity (FR-020) and these invisible characters can visually
 * reorder a handle's rendering for other players (spoofing vector).
 * The adjacent line separators U+2028/U+2029 (category Zl) sit just
 * OUTSIDE this range and are NOT covered by this ruling.
 */
const BIDI_CONTROL_PATTERN = /[\u202A-\u202E\u2066-\u2069]/u;

/**
 * Matches one surrogate code point (category Cs, U+D800–U+DFFF).
 * NEVER applied to a whole handle: with or without the `u` flag a
 * raw-string test cannot tell a lone surrogate from the UTF-16 units
 * of a well-formed astral pair (and would reject every 🚀). Applied
 * PER ELEMENT of an `Array.from` iteration instead — that iteration
 * yields exactly one element per CODE POINT, collapsing well-formed
 * pairs into single astral characters, so any element still matching
 * is necessarily LONE (audit LOW-7: lone surrogates mutate to U+FFFD
 * on UTF-8 encode and corrupt logs/storage downstream).
 */
const SURROGATE_CODE_POINT_PATTERN = /[\uD800-\uDFFF]/u;

// ----------------------------------------------------------------------------
// Error construction
// ----------------------------------------------------------------------------

/** Optional machine-readable specifics carried by a {@linkcode LobbyError}. */
export type LobbyErrorDetail = Readonly<Record<string, string | number | boolean>>;

/**
 * Build a `LobbyError` value (the error payload of every failing lobby
 * call — expected failures are values, never thrown exceptions,
 * FR-018). Mirrors feature 006's `makeError` convention shape-for-shape
 * so clients reuse one rendering strategy across both surfaces.
 *
 * @param code - Machine-readable code from the closed `LobbyErrorCode` union.
 * @param message - Human-readable English; localizable via `code`.
 * @param detail - Optional machine-readable specifics (v1.3 wire ruling).
 * @returns The frozen error payload.
 */
export function makeLobbyError(code: LobbyErrorCode, message: string, detail?: LobbyErrorDetail): LobbyError {
    if (detail === undefined) {
        return Object.freeze({ code, message });
    }
    return Object.freeze({ code, message, detail });
}

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

/**
 * Validate a raw client-submitted handle against FR-004 (as hardened
 * by spec Clarifications v1.5).
 *
 * Pipeline: trim ECMAScript whitespace from both edges → reject empty
 * remainders → reject remainders longer than
 * {@linkcode HANDLE_MAX_CHARS} code points → reject any Cc control
 * character → reject any bidi formatting control (U+202A–U+202E,
 * U+2066–U+2069) → reject any lone surrogate code point → accept the
 * trimmed remainder as the display handle.
 *
 * Rejection precedence is fixed and listed above: an input violating
 * several classes at once is reported under the FIRST matching class,
 * keeping existing inputs' reasons stable across the v1.5 hardening.
 *
 * @param raw - The handle exactly as submitted (pre-validation).
 * @returns `{ ok: true, data }` where `data` is the trimmed display
 *   handle (casing preserved), or `{ ok: false, error }` with code
 *   `handle_invalid` and an actionable message plus machine-readable
 *   `detail.reason` (`'empty' | 'too_long' | 'control_character' |
 *   'bidi_control' | 'lone_surrogate'`).
 */
export function validateHandle(raw: string): Result<string, LobbyError> {
    const trimmed = raw.trim();
    // One code point per element (astral pairs collapse into single
    // elements) — drives BOTH the length check and the lone-surrogate
    // scan below.
    const codePoints = Array.from(trimmed);
    const charCount = codePoints.length;

    if (charCount < HANDLE_MIN_CHARS) {
        return {
            ok: false,
            error: makeLobbyError('handle_invalid', 'Handle must contain at least one non-whitespace character.', {
                reason: 'empty',
            }),
        };
    }
    if (charCount > HANDLE_MAX_CHARS) {
        return {
            ok: false,
            error: makeLobbyError(
                'handle_invalid',
                `Handle must be at most ${HANDLE_MAX_CHARS} characters (yours is ${charCount}).`,
                { reason: 'too_long', receivedChars: charCount, maxChars: HANDLE_MAX_CHARS },
            ),
        };
    }
    if (CONTROL_CHARACTER_PATTERN.test(trimmed)) {
        return {
            ok: false,
            error: makeLobbyError('handle_invalid', 'Handle must not contain control characters.', {
                reason: 'control_character',
            }),
        };
    }
    if (BIDI_CONTROL_PATTERN.test(trimmed)) {
        return {
            ok: false,
            error: makeLobbyError('handle_invalid', 'Handle must not contain bidirectional formatting characters.', {
                reason: 'bidi_control',
            }),
        };
    }
    const hasLoneSurrogate = codePoints.some((codePoint) => SURROGATE_CODE_POINT_PATTERN.test(codePoint));
    if (hasLoneSurrogate) {
        return {
            ok: false,
            error: makeLobbyError('handle_invalid', 'Handle must not contain unpaired surrogate characters.', {
                reason: 'lone_surrogate',
            }),
        };
    }
    return { ok: true, data: trimmed };
}

// ----------------------------------------------------------------------------
// Normalization
// ----------------------------------------------------------------------------

/**
 * Derive the FR-005 uniqueness key for an ALREADY-ACCEPTED (trimmed)
 * handle: locale-independent lowercasing per the v1.4 ruling documented
 * in the module header. Keys live in the identity registry's reserved-
 * handle map and are never displayed or projected.
 *
 * @param acceptedHandle - The trimmed display handle (output of a
 *   successful {@linkcode validateHandle}); passing untrimmed input is
 *   a caller bug and yields an unstable key.
 * @returns The case-folded uniqueness key.
 */
export function normalizeHandleKey(acceptedHandle: string): string {
    return acceptedHandle.toLowerCase();
}
