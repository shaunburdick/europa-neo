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
 * under a `context` key (omitted entirely when empty). In pretty mode
 * they appear inline after the message. Reserved keys (`timestamp`,
 * `level`, `message`) are silently stripped — they never appear in the
 * context object.
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
 * Resolve a log level string to a validated {@link LogLevel}.
 *
 * Returns `"info"` (the default) when the value is unrecognized,
 * and emits one warning to stderr at creation time per the spec's
 * edge-case handling.
 *
 * @param raw       Raw string from environment or options.
 * @param stderr    Writer for the one-time startup warning.
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
    stderr(`unknown LOG_LEVEL "${raw}", defaulting to "info"\n`);
    return 'info';
}

/**
 * Resolve a log format string to a validated format tag.
 *
 * Returns `"json"` (the default) when the value is neither `"json"` nor
 * `"pretty"`, and emits one warning to stderr per the spec's edge-case
 * handling.
 *
 * @param raw       Raw string from environment or options.
 * @param stderr    Writer for the one-time startup warning.
 * @returns `"json"` or `"pretty"`.
 */
function resolveFormat(raw: string | undefined, stderr: (data: string) => void): 'json' | 'pretty' {
    if (raw === 'json' || raw === 'pretty') {
        return raw;
    }
    if (raw !== undefined && raw !== '') {
        stderr(`unknown LOG_FORMAT "${raw}", defaulting to "json"\n`);
    }
    return 'json';
}

/**
 * Serialize a context object to a single-line `{ key: value, ... }` string
 * for the pretty-print format. Excludes the reserved keys (`timestamp`,
 * `level`, `message`) which appear in the structured envelope.
 *
 * @param ctx Context fields to serialize.
 * @returns Formatted context string, or empty string when no fields remain.
 */
function formatPrettyContext(ctx: Readonly<Record<string, unknown>>): string {
    const entries = Object.entries(ctx);
    if (entries.length === 0) {
        return '';
    }
    const body = entries
        .map(([key, value]) => {
            const formatted = typeof value === 'string' ? `"${value}"` : String(value);
            return `${key}: ${formatted}`;
        })
        .join(', ');
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
 * When no context fields are provided, the `context` key is omitted
 * entirely.
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
 * @param opts  Optional overrides for level, format, and output writers.
 * @returns A {@link Logger} instance.
 */
export function createLogger(opts?: CreateLoggerOptions): Logger {
    const stderr = opts?.stderr ?? ((data: string) => process.stderr.write(data));
    const level = resolveLevel(opts?.level ?? process.env['LOG_LEVEL'], stderr);
    const format = resolveFormat(opts?.format ?? process.env['LOG_FORMAT'], stderr);
    const minSeverity = LEVEL_INDEX.get(level) ?? 1; // default 'info' = 1

    const stdout = opts?.stdout ?? ((data: string) => process.stdout.write(data));

    /**
     * Write a single log line if the severity meets the threshold.
     *
     * @param msgLevel  Severity of this message.
     * @param message   Human-readable message string.
     * @param ctx       Optional context fields.
     */
    function write(msgLevel: LogLevel, message: string, ctx?: Readonly<Record<string, unknown>>): void {
        const severity = LEVEL_INDEX.get(msgLevel) ?? 0;
        if (severity < minSeverity) {
            return;
        }

        const timestamp = new Date().toISOString();
        const rawCtx = (ctx ?? {}) as Record<string, unknown>;
        // Strip reserved keys — logger's own fields take precedence.
        const contextFields: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rawCtx)) {
            if (key !== 'timestamp' && key !== 'level' && key !== 'message') {
                contextFields[key] = value;
            }
        }

        // Warn and error go to stderr; debug and info go to stdout.
        const dest = msgLevel === 'warn' || msgLevel === 'error' ? stderr : stdout;

        if (format === 'pretty') {
            const levelPad = msgLevel.toUpperCase().padEnd(8, ' ');
            const ctxStr = formatPrettyContext(contextFields);
            const line = `[${timestamp}] ${levelPad} ${message}${ctxStr}\n`;
            dest(line);
        } else {
            const envelope: Record<string, unknown> = {
                timestamp,
                level: msgLevel,
                message,
            };
            if (Object.keys(contextFields).length > 0) {
                envelope.context = contextFields;
            }
            dest(`${JSON.stringify(envelope)}\n`);
        }
    }

    return {
        debug: (msg: string, ctx?: Readonly<Record<string, unknown>>) => write('debug', String(msg), ctx),
        info: (msg: string, ctx?: Readonly<Record<string, unknown>>) => write('info', String(msg), ctx),
        warn: (msg: string, ctx?: Readonly<Record<string, unknown>>) => write('warn', String(msg), ctx),
        error: (msg: string, ctx?: Readonly<Record<string, unknown>>) => write('error', String(msg), ctx),
    };
}
