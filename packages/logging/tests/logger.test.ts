import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

        it('spreads context fields into the JSON envelope', () => {
            const lines: string[] = [];
            const stdout = (data: string) => {
                lines.push(data);
            };
            const logger = createLogger({ format: 'json', stdout });

            logger.info('match started', { matchId: 'm-abc', playerCount: 2 });

            const parsed = JSON.parse(first(lines)) as Record<string, unknown>;
            expect(parsed.matchId).toBe('m-abc');
            expect(parsed.playerCount).toBe(2);
            expect(parsed.message).toBe('match started');
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

        it('overwrites reserved context keys with logger fields', () => {
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
            expect(parsed.extra).toBe('yes');
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
            expect(parsed.a).toEqual({ b: { c: { d: 'e' } } });
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
            expect(parsed.key).toBe('val');
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
});
