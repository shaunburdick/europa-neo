import { describe, expect, it } from 'vitest';
import type { Logger } from '../src/logger';
import { NULL_LOGGER } from '../src/null-logger';

describe('NULL_LOGGER', () => {
    it('is a valid Logger object', () => {
        const logger: Logger = NULL_LOGGER;
        expect(logger).toBeDefined();
    });

    it('debug produces no output', () => {
        expect(() => NULL_LOGGER.debug('test')).not.toThrow();
    });

    it('info produces no output', () => {
        expect(() => NULL_LOGGER.info('test')).not.toThrow();
    });

    it('warn produces no output', () => {
        expect(() => NULL_LOGGER.warn('test')).not.toThrow();
    });

    it('error produces no output', () => {
        expect(() => NULL_LOGGER.error('test')).not.toThrow();
    });

    it('all methods accept context without side effects', () => {
        const ctx = { matchId: 'm-abc', tick: 42 };
        expect(() => NULL_LOGGER.debug('d', ctx)).not.toThrow();
        expect(() => NULL_LOGGER.info('i', ctx)).not.toThrow();
        expect(() => NULL_LOGGER.warn('w', ctx)).not.toThrow();
        expect(() => NULL_LOGGER.error('e', ctx)).not.toThrow();
    });

    it('all methods return undefined (void)', () => {
        expect(NULL_LOGGER.debug('d')).toBeUndefined();
        expect(NULL_LOGGER.info('i')).toBeUndefined();
        expect(NULL_LOGGER.warn('w')).toBeUndefined();
        expect(NULL_LOGGER.error('e')).toBeUndefined();
    });
});
