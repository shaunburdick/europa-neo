import { describe, expect, it } from 'vitest';
import { parseRoute, type Route } from '../../../src/routing/route';

/**
 * Exercise the browser-visible route contract without mounting React or
 * opening a transport. Runtime selection belongs to later bootstrap tests;
 * this suite keeps the pathname authority and query isolation explicit.
 */
describe('semantic route contract', () => {
    it.each([['/'] as const, ['/lobby'] as const])('classifies %s as a non-match route', (pathname) => {
        const route = parseRoute(pathname);

        expect(route).toEqual({
            kind: pathname === '/' ? 'root' : 'lobby',
            pathname,
        });
    });

    it.each([
        ['/match/m-123', 'm-123', 'adaptive'],
        ['/match/m-123/join', 'm-123', 'join'],
        ['/match/m-123/spectate', 'm-123', 'spectate'],
    ] as const)('classifies the supported match shape %s', (pathname, matchId, intent) => {
        const route = parseRoute(pathname);

        expect(route).toEqual({ kind: 'match', pathname, matchId, intent });
    });

    it('preserves the browser-visible path while decoding a match ID for lookup', () => {
        const route = parseRoute('/match/room%20alpha/join');

        expect(route).toEqual({
            kind: 'match',
            pathname: '/match/room%20alpha/join',
            matchId: 'room alpha',
            intent: 'join',
        });
    });

    it.each([
        ['/match/', 'empty-match-id'],
        ['/match/m-123/extra', 'wrong-segment-count'],
        ['/settings', 'unsupported-path'],
        ['/match/m-123/unknown', 'unsupported-path'],
    ] as const)('classifies unsupported shape %s as recoverable unknown route', (pathname, reason) => {
        const route = parseRoute(pathname);

        expect(route).toEqual({ kind: 'unknown', pathname, reason });
    });

    it('does not let query parameters override pathname classification', () => {
        const pathsWithQueries: ReadonlyArray<readonly [string, Route]> = [
            [
                '/lobby?e2e',
                {
                    kind: 'lobby',
                    pathname: '/lobby',
                },
            ],
            [
                '/match/m-123?live&ws=wss%3A%2F%2Fexample.test&match=other&name=Alice&token=secret',
                {
                    kind: 'match',
                    pathname: '/match/m-123',
                    matchId: 'm-123',
                    intent: 'adaptive',
                },
            ],
        ];

        for (const [url, expected] of pathsWithQueries) {
            const parsedUrl = new URL(url, 'https://example.test');
            expect(parseRoute(parsedUrl.pathname)).toEqual(expected);
        }
    });

    it('keeps the test-only e2e query separate from production route parsing', () => {
        const e2eUrl = new URL('/?e2e', 'https://example.test');

        expect(e2eUrl.searchParams.has('e2e')).toBe(true);
        expect(parseRoute(e2eUrl.pathname)).toEqual({ kind: 'root', pathname: '/' });
    });

    it.each([
        '/?live&ws=wss%3A%2F%2Fexample.test&match=m-123&name=Alice',
        '/lobby?live&ws=wss%3A%2F%2Fexample.test&match=m-123&name=Alice',
        '/match/m-123?live&ws=wss%3A%2F%2Fexample.test&match=other&name=Alice&token=secret',
    ])('does not treat retired live query values as route identity: %s', (url) => {
        const parsedUrl = new URL(url, 'https://example.test');

        expect(parseRoute(parsedUrl.pathname)).not.toHaveProperty('matchId', parsedUrl.searchParams.get('match'));
        expect(parseRoute(parsedUrl.pathname).pathname).toBe(parsedUrl.pathname);
    });
});
