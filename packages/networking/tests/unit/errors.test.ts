/**
 * Error Hierarchy Smoke Tests — Feature 004 (Phase 2)
 *
 * Covers construction, detail handling under
 * `exactOptionalPropertyTypes`, and the `isNetworkError` guard.
 */

import { describe, expect, it } from 'vitest';

import { isNetworkError, NetworkError } from '../../src/errors';

describe('NetworkError', () => {
    it('is an Error carrying code and message', () => {
        const err = new NetworkError('rate_limited', 'too many orders');
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('NetworkError');
        expect(err.code).toBe('rate_limited');
        expect(err.message).toBe('too many orders');
    });

    it('omits detail entirely when not provided', () => {
        const err = new NetworkError('malformed_payload', 'bad frame');
        expect('detail' in err).toBe(false);
        expect(err.detail).toBeUndefined();
    });

    it('carries structured detail when provided', () => {
        const err = new NetworkError('version_mismatch', 'major drift', {
            expected: '0.1.0',
            received: '9.0.0',
        });
        expect(err.detail).toEqual({ expected: '0.1.0', received: '9.0.0' });
    });

    it('accepts every JSON-primitive detail value type', () => {
        const err = new NetworkError('internal_error', 'boom', {
            s: 'text',
            n: 42,
            b: true,
        });
        expect(err.detail).toEqual({ s: 'text', n: 42, b: true });
    });
});

describe('isNetworkError', () => {
    it('returns true for NetworkError instances', () => {
        expect(isNetworkError(new NetworkError('rate_limited', 'x'))).toBe(true);
    });

    it('returns false for plain Errors and non-errors', () => {
        expect(isNetworkError(new Error('plain'))).toBe(false);
        expect(isNetworkError('rate_limited')).toBe(false);
        expect(isNetworkError(null)).toBe(false);
        expect(isNetworkError(undefined)).toBe(false);
        expect(isNetworkError({ code: 'rate_limited' })).toBe(false);
    });

    it('narrows the type in catch blocks', () => {
        const caught: unknown = (() => {
            try {
                throw new NetworkError('token_expired', 'grace elapsed');
            } catch (error) {
                return error;
            }
        })();
        if (isNetworkError(caught)) {
            expect(caught.code).toBe('token_expired');
        } else {
            throw new Error('guard failed to narrow');
        }
    });
});
