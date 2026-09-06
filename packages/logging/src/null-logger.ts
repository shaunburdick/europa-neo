import type { Logger } from './logger';

/**
 * No-op logger. Used as default when no logger is provided.
 *
 * Calling any method produces no output and no side effects.
 * This is the canonical definition — consumers in networking,
 * matchmaking, and test harnesses should import from
 * `@europa/logging` (or the networking re-export).
 */
export const NULL_LOGGER: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
};
