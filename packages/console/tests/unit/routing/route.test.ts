import { describe, expect, it } from 'vitest';
import {
    buildJoinUrl,
    buildLobbyUrl,
    buildMatchUrl,
    buildProfileUrl,
    buildSpectateUrl,
    parseRoute,
} from '../../../src/routing/route';

describe('semantic route parser', () => {
    it.each(['/match/%', '/match/%A', '/match/%GG', '/match/%E0%A4%A/join'])(
        'rejects malformed escapes in %s',
        (pathname) => {
            expect(parseRoute(pathname)).toEqual({ kind: 'unknown', pathname, reason: 'malformed-encoding' });
        },
    );

    it.each([
        ['/match/a%2Fb', 'decoded-slash'],
        ['/match/a%5Cb/join', 'decoded-slash'],
    ] as const)('rejects decoded path separators in %s', (pathname, reason) => {
        expect(parseRoute(pathname)).toEqual({ kind: 'unknown', pathname, reason });
    });

    it.each([
        '/match/.',
        '/match/..',
        '/match/%2E',
        '/match/%2E%2E',
        '/match/a..b',
        '/match/%00',
        '/match/%1F/join',
        '/match/%7F/spectate',
    ])('rejects dot-like and control characters in %s', (pathname) => {
        expect(parseRoute(pathname)).toEqual({ kind: 'unknown', pathname, reason: 'unsafe-character' });
    });

    it.each(['/match/', '/match//', '/match//join'])('rejects an empty match ID in %s', (pathname) => {
        expect(parseRoute(pathname)).toEqual({ kind: 'unknown', pathname, reason: 'empty-match-id' });
    });

    it.each([
        ['/match/m-123/extra', 'unsupported-path'],
        ['/match/m-123/unknown', 'unsupported-path'],
        ['/match/m-123/join/extra', 'wrong-segment-count'],
        ['/match/m-123/spectate/extra', 'wrong-segment-count'],
    ] as const)('classifies extra or invalid segments in %s deterministically', (pathname, reason) => {
        expect(parseRoute(pathname)).toEqual({ kind: 'unknown', pathname, reason });
    });

    it.each([
        ['m-123', buildMatchUrl, '/match/m-123', 'adaptive'],
        ['room alpha', buildJoinUrl, '/match/room%20alpha/join', 'join'],
        ['room blue', buildSpectateUrl, '/match/room%20blue/spectate', 'spectate'],
    ] as const)('round-trips the semantic URL for %s', (matchId, buildUrl, pathname, intent) => {
        const url = buildUrl('https://example.test:8443/ignored/path', matchId);

        expect(url).toBe(`https://example.test:8443${pathname}`);
        expect(parseRoute(new URL(url).pathname)).toEqual({
            kind: 'match',
            pathname,
            matchId,
            intent,
        });
    });

    it('classifies /profile as a profile route', () => {
        expect(parseRoute('/profile')).toEqual({ kind: 'profile', pathname: '/profile' });
    });

    it('ignores query parameters when classifying /profile', () => {
        const parsedUrl = new URL('https://example.test/profile?returnTo=%2Fmatch%2Fabc');
        expect(parseRoute(parsedUrl.pathname)).toEqual({
            kind: 'profile',
            pathname: '/profile',
        });
    });

    it('classifies /profile/ (trailing slash) as unknown', () => {
        expect(parseRoute('/profile/')).toEqual({ kind: 'unknown', pathname: '/profile/', reason: 'unsupported-path' });
    });

    it('builds the canonical profile URL and preserves only the origin', () => {
        expect(buildProfileUrl('https://example.test:8443/ignored/path?token=secret')).toBe(
            'https://example.test:8443/profile',
        );
    });

    it('builds the canonical lobby URL and preserves only the origin', () => {
        expect(buildLobbyUrl('https://example.test:8443/ignored/path?token=secret')).toBe(
            'https://example.test:8443/lobby',
        );
    });

    it('returns the same classification for repeated parsing of identical input', () => {
        const pathname = '/match/room%20alpha/join';
        const expected = {
            kind: 'match' as const,
            pathname,
            matchId: 'room alpha',
            intent: 'join' as const,
        };

        expect(parseRoute(pathname)).toEqual(expected);
        expect(parseRoute(pathname)).toEqual(expected);
    });

    it('classifies / as a welcome route', () => {
        expect(parseRoute('/')).toEqual({ kind: 'welcome', pathname: '/' });
    });

    it('ignores query parameters when classifying /', () => {
        const parsedUrl = new URL('https://example.test/?foo=bar');
        expect(parseRoute(parsedUrl.pathname)).toEqual({ kind: 'welcome', pathname: '/' });
    });
});
