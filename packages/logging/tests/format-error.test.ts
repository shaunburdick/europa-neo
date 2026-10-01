import { describe, expect, it } from 'vitest';
import { formatError } from '../src';

describe('formatError', () => {
    it('returns the message from a normal Error', () => {
        expect(formatError(new Error('connection failed'))).toBe('connection failed');
    });

    it('coerces non-Error values using String semantics', () => {
        expect(formatError(17)).toBe('17');
        expect(formatError({ toString: () => 'plain thrown value' })).toBe('plain thrown value');
    });

    it('returns the fallback when an Error message getter throws', () => {
        const error = new Error('not observed');
        Object.defineProperty(error, 'message', {
            configurable: true,
            get(): string {
                throw new Error('hostile getter');
            },
        });

        expect(formatError(error)).toBe('[unprintable]');
    });

    it('returns the fallback when a non-Error value cannot be coerced', () => {
        const hostile = {
            [Symbol.toPrimitive](): never {
                throw new Error('hostile coercion');
            },
        };

        expect(formatError(hostile)).toBe('[unprintable]');
    });

    it('returns the fallback when Error detection throws', () => {
        const hostile = new Proxy(
            {},
            {
                getPrototypeOf(): object | null {
                    throw new Error('hostile prototype');
                },
            },
        );

        expect(formatError(hostile)).toBe('[unprintable]');
    });
});
