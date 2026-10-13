export type TextDefectReason = 'empty' | 'too_long' | 'control_character' | 'bidi_control' | 'lone_surrogate';

const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;

const BIDI_CONTROL_PATTERN = /[\u202A-\u202E\u2066-\u2069]/u;

const SURROGATE_CODE_POINT_PATTERN = /[\uD800-\uDFFF]/u;

/** Trim → code-point count → class scan, in that precedence. `null` = valid. */
export function classifyTextDefect(raw: string, minCodePoints: number, maxCodePoints: number): TextDefectReason | null {
    const trimmed = raw.trim();
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
