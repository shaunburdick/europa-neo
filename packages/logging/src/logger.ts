import { sanitizeLogText } from './sanitize';

/**
 * Log severity levels in ascending order of importance.
 *
 * Messages below the configured {@link createLogger | LOG_LEVEL} threshold
 * are silently dropped — never serialized, never written.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Ordered list of log levels from least to most severe.
 * The array index IS the numeric severity — higher index = more severe.
 */
const LEVEL_ORDER: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** Numeric severity for each level, built once at module load. */
const LEVEL_INDEX: ReadonlyMap<LogLevel, number> = new Map(LEVEL_ORDER.map((level, index) => [level, index]));

/**
 * Typed context object attached to a log line.
 *
 * Callers pass arbitrary key-value pairs; in JSON mode they are nested
 * under a `context` key (omitted entirely when no context is passed,
 * and `{}` when the context could not be read or serialized — see
 * {@link createLogger}). In pretty mode they appear inline after the
 * message. Reserved keys (`timestamp`, `level`, `message`) are silently
 * stripped — they never appear in the context object.
 */
export interface LogContext {
    readonly [key: string]: unknown;
}

/**
 * Minimal logger interface. Server-side packages never call `console.*`
 * directly — the host or test harness provides a logger.
 *
 * The default in production is this package's {@link createLogger}; in
 * tests a no-op {@link NULL_LOGGER}.
 */
export interface Logger {
    /** Log a debug-level message (lowest severity). */
    debug(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
    /** Log an informational message. */
    info(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
    /** Log a warning message. */
    warn(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
    /** Log an error message (highest severity). */
    error(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
}

/**
 * Configuration options for {@link createLogger}.
 *
 * All fields are optional — the defaults read from `process.env` at
 * call time (not import time), allowing tests to override env vars
 * before creating loggers.
 */
export interface CreateLoggerOptions {
    /**
     * Minimum severity level to emit.
     * @default process.env.LOG_LEVEL ?? "info"
     */
    readonly level?: string;
    /**
     * Output format: `"json"` for machine-parseable lines, `"pretty"` for
     * human-readable development output.
     * @default process.env.LOG_FORMAT ?? "json"
     */
    readonly format?: string;
    /**
     * Override the stdout writer (default: `process.stdout.write`).
     * Injected for testability — production code never uses this.
     */
    readonly stdout?: (data: string) => void;
    /**
     * Override the stderr writer (default: `process.stderr.write`).
     * Injected for testability — production code never uses this.
     */
    readonly stderr?: (data: string) => void;
}

/**
 * Literal rendered for a context value whose string coercion throws
 * (hostile `toString()`, `valueOf()`, or `Symbol.toPrimitive`).
 *
 * Plain ASCII with no control characters, so it needs no further
 * sanitizing before interpolation.
 */
const UNPRINTABLE_VALUE = '[unprintable]';

/**
 * Literal rendered for a log message that cannot be coerced to a
 * string. Plain ASCII — see {@link UNPRINTABLE_VALUE}.
 */
const UNPRINTABLE_MESSAGE = '[unprintable message]';

/**
 * Coerce an arbitrary runtime value to a string without ever throwing.
 *
 * The {@link Logger} interface types messages as `string`, but hostile
 * or buggy callers can pass objects whose `toString()` (or
 * `Symbol.toPrimitive`) throws — plain interpolation would then
 * propagate that error to the caller. Strings are returned verbatim;
 * everything else is coerced behind a guard.
 *
 * @param value    Arbitrary value (message, thrown error, …).
 * @param fallback Rendered when coercion itself throws.
 * @returns `value` as a string, or `fallback`.
 */
function coerceToString(value: unknown, fallback: string): string {
    if (typeof value === 'string') {
        return value;
    }
    try {
        return String(value);
    } catch {
        return fallback;
    }
}

/**
 * Render an arbitrary caught value for a log field without ever throwing.
 * Error messages are preferred over Error.toString() so existing diagnostics
 * retain their message-only behavior.
 *
 * @param error Arbitrary caught value.
 * @returns A printable message, or `[unprintable]` when inspection fails.
 */
export function formatError(error: unknown): string {
    try {
        if (error instanceof Error) {
            return coerceToString(error.message, '[unprintable]');
        }
        return coerceToString(error, '[unprintable]');
    } catch {
        return '[unprintable]';
    }
}

/**
 * Invoke a log sink, swallowing anything it throws.
 *
 * Logging is fail-soft by contract: a broken injected writer (or a
 * stdout/stderr stream in a bad state) must never propagate an error
 * to the caller of `logger.*()`. Failures are swallowed silently —
 * reporting through the same fallible channel could throw again and
 * defeat the purpose.
 *
 * @param writer Sink to invoke (stdout, stderr, or an injected writer).
 * @param data   Line to write.
 */
function writeSafely(writer: (data: string) => void, data: string): void {
    try {
        writer(data);
    } catch {
        // Intentionally swallowed — see JSDoc: a broken sink must not crash the host.
    }
}

/**
 * Copy a caller's context into a fresh object, dropping the reserved
 * keys (`timestamp`, `level`, `message`) that the envelope owns — the
 * logger's own fields always take precedence.
 *
 * Never throws: reading the caller's values can invoke hostile getters
 * or proxy traps, in which case the copy is abandoned (including any
 * partially copied fields) and reported as `unavailable: true`. JSON
 * mode then emits `context: {}` and pretty mode emits no braces, so a
 * broken context degrades instead of escaping to the caller.
 *
 * @param ctx Caller-supplied context, if any.
 * @returns The stripped fields plus an `unavailable` failure flag.
 */
function stripReservedKeys(ctx: Readonly<Record<string, unknown>> | undefined): {
    readonly fields: Record<string, unknown>;
    readonly unavailable: boolean;
} {
    if (ctx === undefined) {
        return { fields: {}, unavailable: false };
    }
    const fields: Record<string, unknown> = {};
    try {
        for (const [key, value] of Object.entries(ctx)) {
            if (key !== 'timestamp' && key !== 'level' && key !== 'message') {
                fields[key] = value;
            }
        }
    } catch {
        // Partial copies are discarded so the fallback is unambiguous.
        return { fields: {}, unavailable: true };
    }
    return { fields, unavailable: false };
}

/**
 * Resolve a log level string to a validated {@link LogLevel}.
 *
 * Returns `"info"` (the default) when the value is unrecognized,
 * and emits one warning to stderr at creation time per the spec's
 * edge-case handling. The raw value is sanitized first: env vars are
 * attacker-influenceable in some deployments, and an unsanitized
 * newline/ANSI/bidi sequence in the value would forge the warning line.
 *
 * @param raw       Raw string from environment or options.
 * @param stderr    Fail-soft writer for the one-time startup warning.
 * @returns A validated {@link LogLevel}.
 */
function resolveLevel(raw: string | undefined, stderr: (data: string) => void): LogLevel {
    if (raw === undefined || raw === '') {
        return 'info';
    }
    const normalized = raw.toLowerCase() as LogLevel;
    if (LEVEL_INDEX.has(normalized)) {
        return normalized;
    }
    stderr(`unknown LOG_LEVEL "${sanitizeLogText(raw)}", defaulting to "info"\n`);
    return 'info';
}

/**
 * Resolve a log format string to a validated format tag.
 *
 * Returns `"json"` (the default) when the value is neither `"json"` nor
 * `"pretty"`, and emits one warning to stderr per the spec's edge-case
 * handling. The raw value is sanitized before interpolation for the same
 * reason as in {@link resolveLevel}.
 *
 * @param raw       Raw string from environment or options.
 * @param stderr    Fail-soft writer for the one-time startup warning.
 * @returns `"json"` or `"pretty"`.
 */
function resolveFormat(raw: string | undefined, stderr: (data: string) => void): 'json' | 'pretty' {
    if (raw === 'json' || raw === 'pretty') {
        return raw;
    }
    if (raw !== undefined && raw !== '') {
        stderr(`unknown LOG_FORMAT "${sanitizeLogText(raw)}", defaulting to "json"\n`);
    }
    return 'json';
}

/**
 * Render a single context value for the pretty-print format.
 *
 * Never throws: non-string values are coerced behind a guard (see
 * {@link coerceToString}), so a hostile `toString()`/`valueOf()`/`Symbol.toPrimitive`
 * renders as {@link UNPRINTABLE_VALUE} instead of propagating.
 *
 * @param value Context value (arbitrary at runtime).
 * @returns Sanitized, printable representation of the value.
 */
function formatPrettyValue(value: unknown): string {
    if (typeof value === 'string') {
        return `"${sanitizeLogText(value)}"`;
    }
    return sanitizeLogText(coerceToString(value, UNPRINTABLE_VALUE));
}

/**
 * Serialize a context object to a single-line `{ key: value, ... }` string
 * for the pretty-print format. Excludes the reserved keys (`timestamp`,
 * `level`, `message`) which appear in the structured envelope.
 *
 * Never throws: each value is rendered by {@link formatPrettyValue},
 * which degrades hostile values to `[unprintable]`.
 *
 * @param ctx Context fields to serialize.
 * @returns Formatted context string, or empty string when no fields remain.
 */
function formatPrettyContext(ctx: Readonly<Record<string, unknown>>): string {
    const entries = Object.entries(ctx);
    if (entries.length === 0) {
        return '';
    }
    const body = entries.map(([key, value]) => `${sanitizeLogText(key)}: ${formatPrettyValue(value)}`).join(', ');
    return ` { ${body} }`;
}

/**
 * Create a structured logger that writes one line per call to stdout or
 * stderr.
 *
 * **JSON mode** (default, `LOG_FORMAT=json`):
 * ```json
 * {"timestamp":"...","level":"info","message":"...","context":{"key":"value"}}
 * ```
 * When no context is passed, the `context` key is omitted entirely;
 * when the context cannot be read (hostile getter) or serialized
 * (cyclic/BigInt/toJSON failure), it falls back to `"context": {}` —
 * the key's presence distinguishes "serialization failed" from "the
 * caller passed no context".
 *
 * **Pretty mode** (`LOG_FORMAT=pretty`):
 * ```
 * [2026-09-06T12:00:00.000Z] INFO   message { key: "value" }
 * ```
 *
 * Reads `LOG_LEVEL` and `LOG_FORMAT` from `process.env` at call time
 * (not import time), so tests can override env vars before creating
 * loggers.
 *
 * Logging is fail-soft end to end: no `logger.*()` call ever throws at
 * its caller, no matter how hostile the message, context, or injected
 * writer is.
 *
 * @param opts  Optional overrides for level, format, and output writers.
 * @returns A {@link Logger} instance.
 */
export function createLogger(opts?: CreateLoggerOptions): Logger {
    // Sinks are wrapped once, up front, so every write — including the
    // startup diagnostics below — is fail-soft end to end.
    const sinkStderr = opts?.stderr ?? ((data: string) => process.stderr.write(data));
    const sinkStdout = opts?.stdout ?? ((data: string) => process.stdout.write(data));
    const stderr = (data: string) => writeSafely(sinkStderr, data);
    const stdout = (data: string) => writeSafely(sinkStdout, data);

    const level = resolveLevel(opts?.level ?? process.env['LOG_LEVEL'], stderr);
    const format = resolveFormat(opts?.format ?? process.env['LOG_FORMAT'], stderr);
    const minSeverity = LEVEL_INDEX.get(level) ?? 1; // default 'info' = 1

    /** Track whether JSON.stringify has already failed for one-time diagnostics. */
    let stringifyFailed = false;

    /**
     * Write a single log line if the severity meets the threshold.
     *
     * Never throws: hostile messages, hostile context accessors,
     * unserializable values, and broken sinks all degrade to a
     * fallback, and the whole body sits behind a last-resort guard so
     * `logger.*()` calls cannot propagate errors to their caller.
     *
     * @param msgLevel Severity of this message.
     * @param msg      Caller-supplied message. Coerced to a string after
     *                 the severity check, so dropped messages never
     *                 touch the caller's object at all.
     * @param ctx      Optional context fields.
     */
    function write(msgLevel: LogLevel, msg: unknown, ctx?: Readonly<Record<string, unknown>>): void {
        // Last-resort guard: each failure path below has its own
        // fallback, but the invariant is that no logger.*() call ever
        // throws — anything unforeseen is swallowed rather than
        // propagated to the caller.
        try {
            const severity = LEVEL_INDEX.get(msgLevel) ?? 0;
            if (severity < minSeverity) {
                return;
            }

            const message = coerceToString(msg, UNPRINTABLE_MESSAGE);
            const timestamp = new Date().toISOString();

            // Strip reserved keys — logger's own fields take precedence.
            const { fields: contextFields, unavailable: contextUnavailable } = stripReservedKeys(ctx);

            // Warn and error go to stderr; debug and info go to stdout.
            const dest = msgLevel === 'warn' || msgLevel === 'error' ? stderr : stdout;

            if (format === 'pretty') {
                const levelPad = msgLevel.toUpperCase().padEnd(8, ' ');
                const ctxStr = formatPrettyContext(contextFields);
                dest(`[${timestamp}] ${levelPad} ${sanitizeLogText(message)}${ctxStr}\n`);
            } else {
                const envelope: Record<string, unknown> = {
                    timestamp,
                    level: msgLevel,
                    message,
                };
                // An unreadable caller context still counts as "context was
                // provided": emit `{}` rather than omitting the key.
                if (contextUnavailable || Object.keys(contextFields).length > 0) {
                    envelope['context'] = contextFields;
                }
                try {
                    dest(`${JSON.stringify(envelope)}\n`);
                } catch (err) {
                    if (!stringifyFailed) {
                        stringifyFailed = true;
                        // coerceToString (never throws) instead of reading
                        // `err.message` directly: an Error subclass whose
                        // `message` accessor throws would otherwise escape
                        // this catch, hit the last-resort guard, and DROP
                        // the log line — violating spec 014's "a log line
                        // is always written" fail-soft edge case.
                        const detail = coerceToString(err, '[unknown error]');
                        stderr(
                            `[logging] JSON.stringify failed on context, using fallback: ${sanitizeLogText(detail)}\n`,
                        );
                    }
                    // Fallback contract: emit an empty context instead of
                    // dropping the key, so consumers can distinguish a
                    // serialization failure from "caller passed no context".
                    envelope['context'] = {};
                    dest(`${JSON.stringify(envelope)}\n`);
                }
            }
        } catch {
            // Last-resort guard — see JSDoc: logging never throws at its caller.
        }
    }

    return {
        debug: (msg: string, ctx?: Readonly<Record<string, unknown>>): void => write('debug', msg, ctx),
        info: (msg: string, ctx?: Readonly<Record<string, unknown>>): void => write('info', msg, ctx),
        warn: (msg: string, ctx?: Readonly<Record<string, unknown>>): void => write('warn', msg, ctx),
        error: (msg: string, ctx?: Readonly<Record<string, unknown>>): void => write('error', msg, ctx),
    };
}
