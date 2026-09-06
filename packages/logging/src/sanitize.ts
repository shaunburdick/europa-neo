/**
 * Characters that must never survive into a launcher log line: the
 * Unicode `Cc` category (C0 controls U+0000–U+001F plus C1 controls
 * U+007F–U+009F) includes newline, tab, and ESC, so stripping it
 * prevents log forging (smuggled extra lines) and terminal escape
 * attacks from any wire-derived text a diagnostic might echo.
 */
const LOG_CONTROL_CHARS = /\p{Cc}/gu;

/** Hard cap for echoed free-form text so one huge field cannot flood the log. */
const LOG_TEXT_MAX_LENGTH = 200;

/**
 * Make wire-derived text safe to interpolate into a diagnostics line:
 * control characters become spaces and the result is trimmed and
 * length-capped. Plain string interpolation of the returned text is
 * then fine. Structural facts (ports, seat numbers, enum reasons) never
 * need this; apply it to anything not fully host-controlled.
 *
 * @param text      Raw text (error messages, handles, any untrusted string).
 * @param maxLength Truncation cap (default {@link LOG_TEXT_MAX_LENGTH}).
 * @returns Sanitized single-line text.
 */
export function sanitizeLogText(text: string, maxLength: number = LOG_TEXT_MAX_LENGTH): string {
    const flat = text.replace(LOG_CONTROL_CHARS, ' ').trim();
    return flat.length <= maxLength ? flat : `${flat.slice(0, Math.max(0, maxLength - 1))}…`;
}
