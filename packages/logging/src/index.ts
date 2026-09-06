/**
 * Public surface of the `@europa/logging` package.
 *
 * Provides a zero-dependency structured logger for server-side
 * processes: the {@link Logger} interface, {@link createLogger} factory,
 * {@link NULL_LOGGER} no-op, {@link sanitizeLogText} utility, and
 * {@link LogContext} type.
 *
 * @packageDocumentation
 */
export type { CreateLoggerOptions, LogContext, Logger, LogLevel } from './logger';
export { createLogger } from './logger';
export { NULL_LOGGER } from './null-logger';
export { sanitizeLogText } from './sanitize';
