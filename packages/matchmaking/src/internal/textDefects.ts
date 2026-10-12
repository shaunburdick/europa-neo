/**
 * Text-defect classification — shared by handle validation (feature
 * 010) and matchmaking displayName validation (feature 006 FR-018).
 *
 * One pure classifier so both boundaries reject the identical defect
 * classes in the identical precedence (spec 006 v1.8 FR-018 mirrors
 * spec 010 Clarifications v1.5): trim → code-point count → class scan.
 * The patterns moved here from `handleValidation.ts` unchanged.
 *
 * Pure module: no clock reads, no randomness (constitution Principle
 * II).
 */

/**
 * Machine-readable rejection reason for one validated text field.
 * `empty` and `too_long` are measured in Unicode code points after
 * trimming; the three class reasons name the rejected character class.
 */
export type TextDefectReason = 'empty' | 'too_long' | 'control_character' | 'bidi_control' | 'lone_surrogate';

/**
 * Matches Unicode category Cc (control characters): C0 range
 * (U+0000–U+001F, which includes interior tabs/newlines — trimming
 * only strips edges), DEL (U+007F), and the C1 range
 * (U+0080–U+009F). Format characters (Cf) deliberately do NOT match —
 * zero-width spaces remain valid content, and the nine bidi controls
 * get their own pattern so each rejection class carries a distinct
 * machine-readable reason.
 */
const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;

/**
 * Matches the nine bidirectional formatting controls: U+202A–U+202E
 * (LRE, RLE, PDF, LRO, RLO — the bidi overrides) and U+2066–U+2069
 * (LRI, RLI, FSI, PDI — the isolates). All are category Cf, so
 * {@linkcode CONTROL_CHARACTER_PATTERN} does not catch them; they are
 * rejected because participant labels are identity and these invisible
 * characters can visually reorder a label's rendering for other players
 * (spoofing vector). The adjacent line separators U+2028/U+2029
 * (category Zl) sit just OUTSIDE this range and are NOT covered.
 */
const BIDI_CONTROL_PATTERN = /[\u202A-\u202E\u2066-\u2069]/u;

/**
 * Matches one surrogate code point (category Cs, U+D800–U+DFFF).
 * NEVER applied to a whole string: with or without the `u` flag a
 * raw-string test cannot tell a lone surrogate from the UTF-16 units
 * of a well-formed astral pair (and would reject every 🚀). Applied
 * PER ELEMENT of an `Array.from` iteration instead — that iteration
 * yields exactly one element per CODE POINT, collapsing well-formed
 * pairs into single astral characters, so any element still matching
 * is necessarily LONE (lone surrogates mutate to U+FFFD on UTF-8
 * encode and corrupt logs/storage downstream).
 */
const SURROGATE_CODE_POINT_PATTERN = /[\uD800-\uDFFF]/u;

/**
 * Classify a raw client-submitted text field against the shared
 * defect classes.
 *
 * Pipeline: trim ECMAScript whitespace from both edges → reject empty
 * remainders → reject remainders longer than `maxCodePoints` code
 * points → reject any Cc control character → reject any bidi
 * formatting control → reject any lone surrogate code point.
 *
 * Precedence is fixed and listed above: an input violating several
 * classes at once is reported under the FIRST matching class, keeping
 * existing inputs' reasons stable across the v1.5 hardening.
 *
 * @param raw - The text exactly as submitted (pre-validation).
 * @param minCodePoints - Minimum accepted length post-trim.
 * @param maxCodePoints - Maximum accepted length post-trim.
 * @returns The first matching defect, or `null` when the input is valid.
 */
export function classifyTextDefect(raw: string, minCodePoints: number, maxCodePoints: number): TextDefectReason | null {
    const trimmed = raw.trim();
    // One code point per element (astral pairs collapse into single
    // elements) — drives BOTH the length check and the lone-surrogate
    // scan below.
    const codePoints = Array.from(trimmed);
    const charCount = codePoints.length;

    if (charCount < minCodePoints) {
        return 'empty';
    }
    if (charCount > maxCodePoints) {
        return 'too_long';
    }
    if (CONTROL_CHARACTER_PATTERN.test(trimmed)) {
        return 'control_character';
    }
    if (BIDI_CONTROL_PATTERN.test(trimmed)) {
        return 'bidi_control';
    }
    if (codePoints.some((codePoint) => SURROGATE_CODE_POINT_PATTERN.test(codePoint))) {
        return 'lone_surrogate';
    }
    return null;
}
