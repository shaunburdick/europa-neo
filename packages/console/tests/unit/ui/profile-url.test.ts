/**
 * readReturnTo unit tests — feature 015 (T009).
 *
 * Validates the stateless returnTo deep-link parameter extractor:
 * safe decoded pathname on valid input, null on absent/empty/unsafe
 * values, and correct handling of edge cases (encoding, traversal,
 * protocol-relative, external URLs).
 */

import { describe, expect, it } from 'vitest';

import { readReturnTo } from '../../../src/ui/profile-url';

describe('readReturnTo', () => {
    // ── Valid cases ──────────────────────────────────────────────

    it('decodes a simple lobby path', () => {
        expect(readReturnTo('?returnTo=%2Flobby')).toBe('/lobby');
    });

    it('decodes a match join path with segments', () => {
        expect(readReturnTo('?returnTo=%2Fmatch%2Fabc123%2Fjoin')).toBe('/match/abc123/join');
    });

    it('decodes a match spectate path', () => {
        expect(readReturnTo('?returnTo=%2Fmatch%2Fabc123%2Fspectate')).toBe('/match/abc123/spectate');
    });

    it('decodes a bare root slash', () => {
        expect(readReturnTo('?returnTo=%2F')).toBe('/');
    });

    it('finds returnTo among other query parameters (trailing)', () => {
        expect(readReturnTo('?other=value&returnTo=%2Flobby')).toBe('/lobby');
    });

    it('finds returnTo among other query parameters (leading)', () => {
        expect(readReturnTo('?returnTo=%2Flobby&other=value')).toBe('/lobby');
    });

    // ── Unsafe / rejected cases ──────────────────────────────────

    it('rejects an external URL (contains ://)', () => {
        expect(readReturnTo('?returnTo=https%3A%2F%2Fevil.com%2Fpath')).toBeNull();
    });

    it('rejects a protocol-relative path (starts with //)', () => {
        expect(readReturnTo('?returnTo=%2F%2Fevil.com')).toBeNull();
    });

    it('rejects path traversal segments (contains ..)', () => {
        expect(readReturnTo('?returnTo=%2F..%2Fsecret')).toBeNull();
    });

    it('rejects an empty returnTo value', () => {
        expect(readReturnTo('?returnTo=')).toBeNull();
    });

    it('returns null when the search string is empty', () => {
        expect(readReturnTo('')).toBeNull();
    });

    it('rejects a value without a leading slash', () => {
        expect(readReturnTo('?returnTo=not-a-path')).toBeNull();
    });

    it('rejects a value with multiple leading slashes (protocol-relative)', () => {
        expect(readReturnTo('?returnTo=%2F%2F%2F')).toBeNull();
    });

    // ── Edge cases ───────────────────────────────────────────────

    it('correctly decodes percent-encoded slashes within the path', () => {
        expect(readReturnTo('?returnTo=%2Fmatch%2Fabc%2Fjoin')).toBe('/match/abc/join');
    });

    it('returns null for malformed percent-encoding (throws URIError)', () => {
        expect(readReturnTo('?returnTo=malformed%ZZ')).toBeNull();
    });

    it('accepts a search string without a leading question mark', () => {
        expect(readReturnTo('returnTo=%2Flobby')).toBe('/lobby');
    });

    it('returns null when returnTo parameter is absent entirely', () => {
        expect(readReturnTo('?other=value')).toBeNull();
    });

    it('rejects a path containing .. in a non-traversal position', () => {
        expect(readReturnTo('?returnTo=%2Ffoo..bar')).toBeNull();
    });

    it('rejects a path with :// buried after a slash', () => {
        expect(readReturnTo('?returnTo=%2Fhttp%3A%2F%2Fevil.com')).toBeNull();
    });
});
