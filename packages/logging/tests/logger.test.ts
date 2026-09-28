import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../src/logger';
import { createLogger } from '../src/logger';

/** Get the first element of an array, throwing a clear error if empty. */
function first<T>(arr: readonly T[]): T {
    const val = arr[0];
    if (val === undefined) {
        throw new Error('expected array to have at least one element');
    }
    return val;
}

/** Get the second element of an array, throwing a clear error if too short. */
function second<T>(arr: readonly T[]): T {
    const val = arr[1];
    if (val === undefined) {
        throw new Error('expected array to have at least two elements');
    }
    return val;
}

describe('createLogger', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env['LOG_LEVEL'];
        delete process.env['LOG_FORMAT'];
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        process.env = originalEnv;
    });

    describe('JSON mode (default)', () => {
        it('writes valid JSON to stdout with timestamp, level, message', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });

            logger.info('hello world');

            expect(lines).toHaveLength(1);
            const parsed = JSON.parse(first(lines)) as Record<string, unknown>;
            expect(parsed).toHaveProperty('timestamp');
            expect(typeof parsed.timestamp).toBe('string');
            expect(parsed.level).toBe('info');
            expect(parsed.message).toBe('hello world');
        });

        it('nests context fields under a "context" key', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });

            logger.info('match started', { matchId: 'm-abc', playerCount: 2 });

            const parsed = JSON.parse(first(lines)) as Record<string, unknown>;
            expect(parsed.message).toBe('match started');
            expect(parsed.context).toEqual({ matchId: 'm-abc', playerCount: 2 });
        });

        it('omits context key entirely when no context fields are provided', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });

            logger.info('simple message');

            const parsed = JSON.parse(first(lines)) as Record<string, unknown>;
            expect(parsed).not.toHaveProperty('context');
            expect(Object.keys(parsed)).toEqual(['timestamp', 'level', 'message']);
        });

        it('writes warn/error to stderr', () => {
            const stderrLines: string[] = [];
            const stdoutLines: string[] = [];
            const stderr = (data: string) => {
                stderrLines.push(data);
            };
            const stdout = (data: string) => {
                stdoutLines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout, stderr, level: 'debug' });

            logger.warn('warning msg');
            logger.error('error msg');

            expect(stdoutLines).toHaveLength(0);
            expect(stderrLines).toHaveLength(2);

            const warnParsed = JSON.parse(first(stderrLines)) as Record<string, unknown>;
            expect(warnParsed.level).toBe('warn');
            expect(warnParsed.message).toBe('warning msg');

            const errParsed = JSON.parse(second(stderrLines)) as Record<string, unknown>;
            expect(errParsed.level).toBe('error');
            expect(errParsed.message).toBe('error msg');
        });
    });

    describe('Pretty mode', () => {
        it('formats output as [timestamp] LEVEL  message { ctx }', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'pretty', stdout });

            logger.info('match started', { matchId: 'm-abc', playerCount: 2 });

            expect(lines).toHaveLength(1);
            const line = first(lines);
            // levelPad = "INFO".padEnd(8) = "INFO    " (4 spaces)
            // Line: [ts] INFO     message { ctx }
            expect(line).toMatch(
                /^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\]\s+INFO\s{5}match started \{ matchId: "m-abc", playerCount: 2 \}\n$/,
            );
        });

        it('formats debug with DEBUG prefix', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'pretty', stdout, level: 'debug' });

            logger.debug('tick completed', { tick: 42 });

            expect(lines).toHaveLength(1);
            const line = first(lines);
            // levelPad = "DEBUG".padEnd(8) = "DEBUG   " (3 spaces)
            expect(line).toMatch(/^\[.+?\]\s+DEBUG\s{4}tick completed \{ tick: 42 \}\n$/);
        });

        it('formats warn/error with WARN/ERROR prefix to stderr', () => {
            const stderrLines: string[] = [];
            const stdoutArr: string[] = [];
            const stderr = (data: string) => {
                stderrLines.push(data);
            };
            const stdoutFn = (data: string) => {
                stdoutArr.push(data);
            };
            const logger = createLogger({ format: 'pretty', stdout: stdoutFn, stderr, level: 'debug' });

            logger.warn('seat fill failed');
            logger.error('server failed');

            expect(stdoutArr).toHaveLength(0);
            // levelPad = "WARN".padEnd(8) = "WARN    " (4 spaces)
            expect(first(stderrLines)).toMatch(/^\[.+?\]\s+WARN\s{5}seat fill failed\n$/);
            // levelPad = "ERROR".padEnd(8) = "ERROR   " (3 spaces)
            expect(second(stderrLines)).toMatch(/^\[.+?\]\s+ERROR\s{4}server failed\n$/);
        });

        it('omits context braces when context is empty', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'pretty', stdout });

            logger.info('no context');

            expect(first(lines)).toContain('no context');
            expect(first(lines)).not.toContain('{');
        });
    });

    describe('Level filtering', () => {
        it('drops messages below the configured level', () => {
            const allLines: string[] = [];
            const combinedStdout = (data: string) => {
                allLines.push(data);
            };
            const combinedStderr = (data: string) => {
                allLines.push(data);
            };
            const combinedLogger = createLogger({
                level: 'warn',
                format: 'json',
                stdout: combinedStdout,
                stderr: combinedStderr,
            });

            combinedLogger.debug('debug msg');
            combinedLogger.info('info msg');
            combinedLogger.warn('warn msg');
            combinedLogger.error('error msg');

            expect(allLines).toHaveLength(2);
            const warnParsed = JSON.parse(first(allLines)) as Record<string, unknown>;
            expect(warnParsed.level).toBe('warn');
            const errParsed = JSON.parse(second(allLines)) as Record<string, unknown>;
            expect(errParsed.level).toBe('error');
        });

        it('includes all levels when LOG_LEVEL=debug', () => {
            const allLines: string[] = [];
            const stdout = (data: string) => {
                allLines.push(data);
            };
            const stderr = (data: string) => {
                allLines.push(data);
            };
            const logger = createLogger({ level: 'debug', format: 'json', stdout, stderr });

            logger.debug('d');
            logger.info('i');
            logger.warn('w');
            logger.error('e');

            expect(allLines).toHaveLength(4);
        });

        it('defaults to "info" when LOG_LEVEL is unset', () => {
            const allLines: string[] = [];
            const stdout = (data: string) => {
                allLines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });

            logger.debug('debug msg');
            logger.info('info msg');

            expect(allLines).toHaveLength(1);
        });
    });

    describe('Environment variable handling', () => {
        it('reads LOG_LEVEL from process.env', () => {
            process.env['LOG_LEVEL'] = 'error';
            const allLines: string[] = [];
            const stdout = (data: string) => {
                allLines.push(data);
            };
            const stderr = (data: string) => {
                allLines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout, stderr });

            logger.warn('should be dropped');
            logger.error('should appear');

            expect(allLines).toHaveLength(1);
        });

        it('reads LOG_FORMAT from process.env', () => {
            process.env['LOG_FORMAT'] = 'pretty';
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ stdout });

            logger.info('formatted');

            expect(first(lines)).toMatch(/^\[.+?\]\s+INFO\s{5}formatted\n$/);
        });
    });

    describe('Invalid values', () => {
        it('defaults to "info" and emits warning for invalid LOG_LEVEL', () => {
            const stderrLines: string[] = [];
            const stdoutLines: string[] = [];
            const stderr = (data: string) => {
                stderrLines.push(data);
            };
            const stdout = (data: string) => {
                stdoutLines.push(data);
            };
            const logger = createLogger({ level: 'verbose', format: 'json', stdout, stderr });

            expect(stderrLines).toHaveLength(1);
            expect(stderrLines[0]).toContain('unknown LOG_LEVEL "verbose"');
            expect(stderrLines[0]).toContain('defaulting to "info"');

            // Should use "info" default: debug dropped, info passes
            logger.debug('debug');
            logger.info('info');
            expect(stdoutLines).toHaveLength(1);
        });

        it('defaults to "json" and emits warning for invalid LOG_FORMAT', () => {
            const stderrLines: string[] = [];
            const stdoutLines: string[] = [];
            const stderr = (data: string) => {
                stderrLines.push(data);
            };
            const stdout = (data: string) => {
                stdoutLines.push(data);
            };
            const logger = createLogger({ format: 'xml', stdout, stderr });

            expect(stderrLines).toHaveLength(1);
            expect(stderrLines[0]).toContain('unknown LOG_FORMAT "xml"');
            expect(stderrLines[0]).toContain('defaulting to "json"');

            logger.info('test');
            // Should be JSON format
            const parsed = JSON.parse(first(stdoutLines)) as Record<string, unknown>;
            expect(parsed.level).toBe('info');
        });
    });

    describe('Edge cases', () => {
        it('produces valid JSON with empty message', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });

            logger.info('');

            const parsed = JSON.parse(first(lines)) as Record<string, unknown>;
            expect(parsed.message).toBe('');
        });

        it('strips reserved context keys, keeping only valid context under "context"', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });

            logger.info('msg', { timestamp: 'fake', level: 'fake', message: 'fake', extra: 'yes' });

            const parsed = JSON.parse(first(lines)) as Record<string, unknown>;
            expect(typeof parsed.timestamp).toBe('string');
            expect(parsed.timestamp).not.toBe('fake');
            expect(parsed.level).toBe('info');
            expect(parsed.message).toBe('msg');
            expect(parsed.context).toEqual({ extra: 'yes' });
        });

        it('coerces non-string msg via String() at runtime', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });

            // TypeScript enforces string, but at runtime someone might pass a number
            (logger as unknown as Logger).info(42 as unknown as string);

            const parsed = JSON.parse(first(lines)) as Record<string, unknown>;
            expect(parsed.message).toBe('42');
        });

        it('handles large context objects without depth limiting', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });

            const deep = { a: { b: { c: { d: 'e' } } } };
            logger.info('deep', deep);

            const parsed = JSON.parse(first(lines)) as Record<string, unknown>;
            expect(parsed.context).toEqual({ a: { b: { c: { d: 'e' } } } });
        });
    });

    describe('Logger interface methods', () => {
        it('debug writes to stdout in debug mode', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ level: 'debug', format: 'json', stdout });

            logger.debug('test', { key: 'val' });

            const parsed = JSON.parse(first(lines)) as Record<string, unknown>;
            expect(parsed.level).toBe('debug');
            expect(parsed.context).toEqual({ key: 'val' });
        });

        it('all four methods are callable', () => {
            const noop = () => {};
            const logger = createLogger({ stdout: noop, stderr: noop, level: 'debug' });

            expect(() => logger.debug('d')).not.toThrow();
            expect(() => logger.info('i')).not.toThrow();
            expect(() => logger.warn('w')).not.toThrow();
            expect(() => logger.error('e')).not.toThrow();
        });
    });

    describe('Fail-soft serialization (EUR-137)', () => {
        it('handles cyclic context value without throwing', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });

            const cyclic: Record<string, unknown> = {};
            cyclic.self = cyclic;
            logger.info('test', { cyclic });

            expect(lines).toHaveLength(1);
            const parsed = JSON.parse(first(lines)) as Record<string, unknown>;
            expect(parsed.level).toBe('info');
            expect(parsed.message).toBe('test');
            // Failure fallback: context key present but empty (vs. absent
            // when the caller passed no context at all).
            expect(parsed).toHaveProperty('context', {});
        });

        it('handles BigInt context value without throwing', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });

            logger.info('test', { big: BigInt(42) });

            expect(lines).toHaveLength(1);
            const parsed = JSON.parse(first(lines)) as Record<string, unknown>;
            expect(parsed.level).toBe('info');
            expect(parsed.message).toBe('test');
            // Failure fallback: context key present but empty (vs. absent
            // when the caller passed no context at all).
            expect(parsed).toHaveProperty('context', {});
        });

        it('handles throwing toJSON() without throwing', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });

            const throwingObj = {
                toJSON: () => {
                    throw new Error('nope');
                },
            };
            logger.info('test', { bad: throwingObj });

            expect(lines).toHaveLength(1);
            const parsed = JSON.parse(first(lines)) as Record<string, unknown>;
            expect(parsed.level).toBe('info');
            expect(parsed.message).toBe('test');
            // Failure fallback: context key present but empty (vs. absent
            // when the caller passed no context at all).
            expect(parsed).toHaveProperty('context', {});
        });

        it('emits diagnostic warning to stderr on first serialization failure', () => {
            const stderrLines: string[] = [];
            const stdoutLines: string[] = [];
            const stdout = (data: string) => {
                stdoutLines.push(data);
            };
            const stderr = (data: string) => {
                stderrLines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout, stderr });

            const cyclic: Record<string, unknown> = {};
            cyclic.self = cyclic;
            logger.info('test', { cyclic });

            expect(stdoutLines).toHaveLength(1);
            expect(stderrLines).toHaveLength(1);
            expect(stderrLines[0]).toContain('[logging] JSON.stringify failed');
        });

        it('emits warning only once across multiple serialization failures', () => {
            const stderrLines: string[] = [];
            const stdoutLines: string[] = [];
            const stdout = (data: string) => {
                stdoutLines.push(data);
            };
            const stderr = (data: string) => {
                stderrLines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout, stderr });

            const cyclic: Record<string, unknown> = {};
            cyclic.self = cyclic;
            logger.info('first', { cyclic });
            logger.info('second', { cyclic });

            expect(stdoutLines).toHaveLength(2);
            const warnings = stderrLines.filter((line) => line.includes('[logging] JSON.stringify failed'));
            expect(warnings).toHaveLength(1);
        });

        it('sanitizes diagnostic warning when toJSON() throws with newline in message', () => {
            const stderrLines: string[] = [];
            const stdoutLines: string[] = [];
            const stdout = (data: string) => {
                stdoutLines.push(data);
            };
            const stderr = (data: string) => {
                stderrLines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout, stderr });

            const throwingObj = {
                toJSON: () => {
                    throw new Error('line1\nline2');
                },
            };
            logger.info('test', { bad: throwingObj });

            expect(stdoutLines).toHaveLength(1);
            expect(stderrLines).toHaveLength(1);
            expect(stderrLines[0]).toContain('[logging] JSON.stringify failed');
            // The newline in the error message must be sanitized
            expect(stderrLines[0]).not.toContain('line1\nline2');
            expect(stderrLines[0]).toContain('line1 line2');
        });

        it('still writes the log line when the thrown stringify error has a throwing message accessor', () => {
            const stderrLines: string[] = [];
            const stdoutLines: string[] = [];
            const stdout = (data: string) => {
                stdoutLines.push(data);
            };
            const stderr = (data: string) => {
                stderrLines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout, stderr });

            // An `Error` whose `message` getter throws: reading
            // `err.message` for the diagnostic must not escape the catch
            // and swallow the log line (spec 014: a log line is always
            // written, even when the failure diagnostic itself fails).
            const hostileError = new Error('never readable');
            Object.defineProperty(hostileError, 'message', {
                configurable: true,
                get() {
                    throw new Error('message accessor exploded');
                },
            });
            const throwingObj = {
                toJSON: () => {
                    throw hostileError;
                },
            };
            logger.info('test', { bad: throwingObj });

            // The log line itself survives with the empty-context fallback.
            expect(stdoutLines).toHaveLength(1);
            const parsed = JSON.parse(first(stdoutLines)) as Record<string, unknown>;
            expect(parsed['level']).toBe('info');
            expect(parsed['message']).toBe('test');
            expect(parsed).toHaveProperty('context', {});
            // The diagnostic is still emitted, using the never-throwing
            // coercion fallback for the unreadable error.
            expect(stderrLines).toHaveLength(1);
            expect(stderrLines[0]).toContain('[logging] JSON.stringify failed');
            expect(stderrLines[0]).toContain('[unknown error]');
        });
    });

    describe('Pretty-mode sanitization (EUR-137)', () => {
        it('replaces newlines in message with spaces', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'pretty', stdout });

            logger.info('line1\nline2');

            expect(lines).toHaveLength(1);
            // \n (Cc) is replaced with a single space by sanitizeLogText
            expect(first(lines)).toContain('line1 line2');
            expect(first(lines)).not.toContain('\nline2');
        });

        it('strips ANSI escape sequences from message', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'pretty', stdout });

            logger.info('normal \x1b[31mred\x1b[0m');

            expect(lines).toHaveLength(1);
            // \x1b (ESC, Cc) is replaced with space; remaining [31m/[0m
            // text is plain ASCII and passes through sanitizeLogText.
            expect(first(lines)).toContain('normal  [31mred [0m');
            // Raw ESC character must not survive
            expect(first(lines)).not.toContain('\x1b');
        });

        it('sanitizes string context values with \\r\\n', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'pretty', stdout });

            logger.info('msg', { key: 'val\r\nue' });

            expect(lines).toHaveLength(1);
            expect(first(lines)).toContain('val  ue');
            expect(first(lines)).not.toContain('\r');
        });

        it('sanitizes string context values with bidi override characters', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'pretty', stdout });

            logger.info('msg', { key: 'normal\u202Edlrow' });

            expect(lines).toHaveLength(1);
            expect(first(lines)).toContain('normal dlrow');
            expect(first(lines)).not.toContain('\u202E');
        });

        it('sanitizes context key containing newline', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'pretty', stdout });

            logger.info('msg', { 'key\ninjected': 'val' });

            expect(lines).toHaveLength(1);
            // The newline in the key must be replaced with a space
            expect(first(lines)).toContain('key injected');
            expect(first(lines)).not.toContain('\ninjected');
        });

        it('sanitizes context key containing ANSI escape sequence', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'pretty', stdout });

            logger.info('msg', { '\x1b[31mredKey\x1b[0m': 'val' });

            expect(lines).toHaveLength(1);
            // The ESC character must be stripped; remaining text passes through
            expect(first(lines)).not.toContain('\x1b');
            expect(first(lines)).toContain('[31mredKey [0m');
        });

        it('sanitizes context value with hostile toString()', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'pretty', stdout });

            const hostile = {
                toString: () => '\x1b[31mred\x1b[0m',
            };
            logger.info('msg', { bad: hostile });

            expect(lines).toHaveLength(1);
            // toString() result is sanitized — no raw ESC
            expect(first(lines)).not.toContain('\x1b');
            expect(first(lines)).toContain('[31mred [0m');
        });
    });

    describe('Fail-soft boundaries (EUR-137)', () => {
        it('renders [unprintable] when a context value has a hostile toString()', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'pretty', stdout });
            const hostile = {
                toString: () => {
                    throw new Error('hostile toString');
                },
            };

            expect(() => logger.info('msg', { bad: hostile })).not.toThrow();

            expect(lines).toHaveLength(1);
            expect(first(lines)).toContain('{ bad: [unprintable] }');
        });

        it('renders [unprintable message] when the message object has a hostile toString()', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });
            const hostileMessage = {
                toString: () => {
                    throw new Error('hostile message');
                },
            };

            expect(() => (logger as unknown as Logger).info(hostileMessage as unknown as string)).not.toThrow();

            expect(lines).toHaveLength(1);
            const parsed = JSON.parse(first(lines)) as Record<string, unknown>;
            expect(parsed).toHaveProperty('message', '[unprintable message]');
            expect(parsed.level).toBe('info');
        });

        it('renders [unprintable message] when the message object has a hostile Symbol.toPrimitive', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });
            const hostileMessage = {
                [Symbol.toPrimitive]: () => {
                    throw new Error('hostile toPrimitive');
                },
            };

            expect(() => (logger as unknown as Logger).info(hostileMessage as unknown as string)).not.toThrow();

            expect(lines).toHaveLength(1);
            const parsed = JSON.parse(first(lines)) as Record<string, unknown>;
            expect(parsed).toHaveProperty('message', '[unprintable message]');
        });

        it('falls back to an empty context when the context object has a throwing getter', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });
            const hostileCtx = {
                get boom(): string {
                    throw new Error('hostile getter');
                },
            };

            expect(() => logger.info('msg', hostileCtx)).not.toThrow();

            expect(lines).toHaveLength(1);
            const parsed = JSON.parse(first(lines)) as Record<string, unknown>;
            expect(parsed).toHaveProperty('message', 'msg');
            // Failure fallback: context key present but empty (vs. absent
            // when the caller passed no context at all).
            expect(parsed).toHaveProperty('context', {});
        });

        it('renders no context when the context object has a throwing getter in pretty mode', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'pretty', stdout });
            const hostileCtx = {
                get boom(): string {
                    throw new Error('hostile getter');
                },
            };

            expect(() => logger.info('msg', hostileCtx)).not.toThrow();

            expect(lines).toHaveLength(1);
            expect(first(lines)).toContain('msg');
            expect(first(lines)).not.toContain('{');
        });

        it('does not propagate errors from a throwing writer in JSON mode', () => {
            const throwingWriter = (data: string): void => {
                throw new Error(`sink down: ${data}`);
            };
            const logger = createLogger({
                format: 'json',
                stdout: throwingWriter,
                stderr: throwingWriter,
                level: 'debug',
            });

            expect(() => logger.debug('d')).not.toThrow();
            expect(() => logger.info('i')).not.toThrow();
            expect(() => logger.warn('w')).not.toThrow();
            expect(() => logger.error('e')).not.toThrow();
        });

        it('does not propagate errors from a throwing writer in pretty mode', () => {
            const throwingWriter = (data: string): void => {
                throw new Error(`sink down: ${data}`);
            };
            const logger = createLogger({
                format: 'pretty',
                stdout: throwingWriter,
                stderr: throwingWriter,
                level: 'debug',
            });

            expect(() => logger.debug('d')).not.toThrow();
            expect(() => logger.info('i')).not.toThrow();
            expect(() => logger.warn('w')).not.toThrow();
            expect(() => logger.error('e')).not.toThrow();
        });

        it('does not propagate errors from a throwing writer during startup warnings', () => {
            const throwingWriter = (data: string): void => {
                throw new Error(`sink down: ${data}`);
            };

            expect(() =>
                createLogger({ level: 'verbose', format: 'xml', stdout: throwingWriter, stderr: throwingWriter }),
            ).not.toThrow();
        });

        it('swallows an unexpected internal failure instead of throwing at the caller', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });
            // Force a failure on a path no fallback owns: the last-resort
            // guard must swallow it and drop the line, never propagate.
            const toISOString = vi.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
                throw new Error('clock broken');
            });
            try {
                expect(() => logger.info('msg')).not.toThrow();
            } finally {
                toISOString.mockRestore();
            }

            expect(lines).toHaveLength(0);
        });
    });

    describe('Hostile diagnostic env values (EUR-137)', () => {
        it('sanitizes an invalid LOG_LEVEL value containing newline and ANSI escapes', () => {
            const stderrLines: string[] = [];
            const stderr = (data: string) => {
                stderrLines.push(data);
            };
            vi.stubEnv('LOG_LEVEL', 'verbose\n\x1b[31mforged\x1b[0m');

            createLogger({ format: 'json', stdout: () => {}, stderr });

            expect(stderrLines).toHaveLength(1);
            const warning = first(stderrLines);
            expect(warning).toContain('unknown LOG_LEVEL');
            expect(warning).toContain('"verbose  [31mforged [0m"');
            expect(warning).toContain('defaulting to "info"');
            // Exactly one newline — the warning's own terminator. The
            // forged newline and ESC must not survive sanitization.
            expect(warning.split('\n')).toHaveLength(2);
            expect(warning).not.toContain('\x1b');
        });

        it('sanitizes an invalid LOG_FORMAT value containing a newline', () => {
            const stderrLines: string[] = [];
            const stderr = (data: string) => {
                stderrLines.push(data);
            };
            vi.stubEnv('LOG_FORMAT', 'xml\nforged line');

            createLogger({ stdout: () => {}, stderr });

            expect(stderrLines).toHaveLength(1);
            const warning = first(stderrLines);
            expect(warning).toContain('unknown LOG_FORMAT');
            expect(warning).toContain('"xml forged line"');
            expect(warning).toContain('defaulting to "json"');
            // Exactly one newline — the warning's own terminator.
            expect(warning.split('\n')).toHaveLength(2);
        });
    });
});
