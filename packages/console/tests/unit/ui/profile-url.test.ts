/**
 * readReturnTo unit tests — feature 015 (T009).
 *
 * Validates the stateless returnTo deep-link parameter extractor:
 * safe decoded pathname on valid input, null on absent/empty/unsafe
 * values, and correct handling of edge cases (encoding, traversal,
 * protocol-relative, external URLs).
 */

import { describe, expect, it } from 'vitest';

import { isSafeReturnTo, readReturnTo } from '../../../src/ui/profile-url';

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

    it('treats malformed percent-encoding as absent (single decode never throws)', () => {
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

    // ── AC-019 corpus additions (013 FR-034: single decode + widened guard) ──

    it('rejects a backslash open-redirect variant (URL-equivalent to //)', () => {
        // `/\evil.com` navigates like `//evil.com` for special schemes.
        expect(readReturnTo('?returnTo=%2F%5Cevil.com')).toBeNull();
    });

    it('rejects an embedded query string (returnTo is a pathname)', () => {
        expect(readReturnTo('?returnTo=%2Flobby%3Fws%3Devil')).toBeNull();
    });

    it('rejects a double-encoded value under single-decode semantics', () => {
        // `%252F%252Fevil.com` decodes ONCE to `%2F%2Fevil.com`, which
        // lacks the leading slash — absent, not decoded a second time
        // into the protocol-relative reject (013 FR-034).
        expect(readReturnTo('?returnTo=%252F%252Fevil.com')).toBeNull();
    });

    it('rejects an encoded traversal the single decode unmasks', () => {
        expect(readReturnTo('?returnTo=%2F%252e%252e%2Fadmin')).toBeNull();
    });
});

describe('isSafeReturnTo (the canonical 013 FR-034 guard)', () => {
    const corpus: readonly string[] = [
        '//evil.com',
        'https://evil.com',
        '/%2e%2e/x',
        '/../x',
        '/%2F%2Fevil.com',
        '/\\evil.com',
        '/lobby?ws=evil',
        'not-a-path',
        '',
        '/foo..bar',
        '/match/abc/join?x=1',
    ];

    it.each(corpus)('treats the AC-019 corpus value as absent: %s', (value) => {
        expect(isSafeReturnTo(value)).toBe(false);
    });

    it.each(['/lobby', '/', '/match/abc-123/join', '/match/abc-123/spectate'])(
        'accepts the safe pathname: %s',
        (value) => {
            expect(isSafeReturnTo(value)).toBe(true);
        },
    );
});
