/** Feature 013 T015 security regressions at the routing and identity seams. */

import { describe, expect, it, vi } from 'vitest';

import { buildJoinUrl, buildMatchUrl, buildSpectateUrl, parseRoute } from '../../../src/routing/route';
import { adaptRoute, executeRouteEntry, type RouteEntryCommands } from '../../../src/routing/route-adapter';
import type { LobbyCommandResult } from '../../../src/state/lobby-controller';
import { entryOf, matchIdOf, snapshotOf } from '../../fixtures/lobbyTransports';

const TARGET = matchIdOf('target-match');
const DECOY = matchIdOf('decoy-match');

describe('semantic route security boundary', () => {
    it.each([
        '/match/..%2Fpackage.json',
        '/match/%2e%2e%2fpackage.json/join',
        '/match/%2Fetc%2Fpasswd',
        '/match/%5C%5Cserver%5Cshare',
    ])('rejects traversal or encoded separator %s before lookup', (pathname) => {
        const route = parseRoute(pathname);

        expect(route.kind).toBe('unknown');
        expect(route).toMatchObject({ pathname });
        expect(executeRouteEntry(adaptRoute(route, snapshotOf([])), forbiddenCommands())).toBeNull();
    });

    it.each(['/match/%00', '/match/%1f', '/match/.%2e', '/match/%E0%A4%A'])(
        'rejects unsafe or malformed match IDs without a connection: %s',
        (pathname) => {
            const route = parseRoute(pathname);
            expect(route.kind).toBe('unknown');
            expect(executeRouteEntry(adaptRoute(route, snapshotOf([])), forbiddenCommands())).toBeNull();
        },
    );

    it('does not copy credentials or transport values into generated links', () => {
        const origin = 'https://example.test:8443/app?name=Alice&token=secret&ws=wss%3A%2F%2Fother.test';

        expect(buildMatchUrl(origin, 'target match')).toBe('https://example.test:8443/match/target%20match');
        expect(buildJoinUrl(origin, 'target match')).toBe('https://example.test:8443/match/target%20match/join');
        expect(buildSpectateUrl(origin, 'target match')).toBe(
            'https://example.test:8443/match/target%20match/spectate',
        );
    });

    it('keeps bootstrap pathname authority separate from credential-bearing queries', () => {
        const route = parseRoute(
            new URL(
                'https://example.test/match/target-match/join?match=decoy&name=Alice&token=secret&ws=wss%3A%2F%2Fother.test',
            ).pathname,
        );

        expect(route).toEqual({
            kind: 'match',
            pathname: '/match/target-match/join',
            matchId: 'target-match',
            intent: 'join',
        });
    });

    it('rejects IDs that could escape the generated match path', () => {
        expect(() => buildMatchUrl('https://example.test', '../decoy')).toThrow('decoded-slash');
        expect(() => buildMatchUrl('https://example.test', 'target/decoy')).toThrow('decoded-slash');
        expect(() => buildMatchUrl('https://example.test', '')).toThrow('must not be empty');
    });

    it('selects and forwards only the exact path match, never a decoy entry', async () => {
        const joinMatch = vi.fn().mockResolvedValue({ ok: true, transition: 'waiting' as const });
        const commands = { joinMatch, spectateMatch: vi.fn() };
        const route = parseRoute('/match/target-match/join');
        const entry = adaptRoute(
            route,
            snapshotOf([entryOf({ matchId: DECOY, seatsFilled: 1 }), entryOf({ matchId: TARGET, seatsFilled: 1 })]),
        );

        await executeRouteEntry(entry, commands);

        expect(entry).toMatchObject({ kind: 'player', matchId: TARGET, intent: 'join' });
        expect(joinMatch).toHaveBeenCalledExactlyOnceWith(TARGET);
        expect(commands.spectateMatch).not.toHaveBeenCalled();
    });

    it('leaves authorization and identity/seat claims to the existing command authority', async () => {
        const route = parseRoute('/match/target-match/join');
        const entry = adaptRoute(route, snapshotOf([entryOf({ matchId: TARGET, seatsFilled: 1 })]));
        const commands: RouteEntryCommands = {
            joinMatch: vi.fn<(...args: [typeof TARGET]) => Promise<LobbyCommandResult>>().mockResolvedValue({
                ok: false,
                error: { code: 'not_joinable', message: 'server rejected the claim', detail: null },
            }),
            spectateMatch: vi.fn(),
        };

        expect(entry).toMatchObject({ kind: 'player', matchId: TARGET });
        await expect(executeRouteEntry(entry, commands)).resolves.toEqual({
            ok: false,
            error: { code: 'not_joinable', message: 'server rejected the claim', detail: null },
        });
        expect(commands.joinMatch).toHaveBeenCalledExactlyOnceWith(TARGET);
    });

    it.each(['/match/target-match', '/match/target-match/join', '/match/target-match/spectate'])(
        'never opens a match connection while route state is unresolved: %s',
        (pathname) => {
            const route = parseRoute(pathname);
            const entry = adaptRoute(route, null);

            expect(entry.kind).toBe('resolve');
            expect(executeRouteEntry(entry, forbiddenCommands())).toBeNull();
        },
    );
});

function forbiddenCommands() {
    return {
        joinMatch: () => {
            throw new Error('unsafe route must not claim a seat');
        },
        spectateMatch: () => {
            throw new Error('unsafe route must not open a match connection');
        },
    };
}
