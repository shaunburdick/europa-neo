/**
 * Handle validation & normalization — Feature 010 (T-005)
 *
 * Pure FR-004/FR-005 logic for guest-player handles:
 *
 *   - {@linkcode validateHandle} enforces the v1 validation default
 *     (spec Clarifications v1.0): 1–24 Unicode CHARACTERS after
 *     trimming, at least one non-whitespace character, no control
 *     characters. Character counts are UNICODE CODE POINTS
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
 * (U+0080–U+009F). Format characters (Cf, e.g. U+200B zero-width
 * space) deliberately do NOT match — the fixture corpus pins them as
 * valid content.
 */
const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;

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
 * Validate a raw client-submitted handle against FR-004.
 *
 * Pipeline: trim ECMAScript whitespace from both edges → reject empty
 * remainders → reject remainders longer than
 * {@linkcode HANDLE_MAX_CHARS} code points → reject any Cc control
 * character → accept the trimmed remainder as the display handle.
 *
 * @param raw - The handle exactly as submitted (pre-validation).
 * @returns `{ ok: true, data }` where `data` is the trimmed display
 *   handle (casing preserved), or `{ ok: false, error }` with code
 *   `handle_invalid` and an actionable message plus machine-readable
 *   `detail.reason` (`'empty' | 'too_long' | 'control_character'`).
 */
export function validateHandle(raw: string): Result<string, LobbyError> {
    const trimmed = raw.trim();
    const charCount = Array.from(trimmed).length;

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
