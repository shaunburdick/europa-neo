import { describe, expect, it, vi } from 'vitest';

import { buildJoinUrl, buildMatchUrl, buildSpectateUrl, parseRoute } from '../../../src/routing/route';
import type { LobbyCommandResult, RouteEntryCommands } from '../../../src/routing/route-adapter';
import { adaptRoute, executeRouteEntry } from '../../../src/routing/route-adapter';
import { entryOf, matchIdOf, snapshotOf } from '../../fixtures/lobbyTransports';

const MATCH_ID = 'room alpha';
const matchId = matchIdOf(MATCH_ID);

function routeFor(url: string) {
    return parseRoute(new URL(url).pathname);
}

function successfulCommands(): RouteEntryCommands & {
    joinMatch: ReturnType<typeof vi.fn>;
    spectateMatch: ReturnType<typeof vi.fn>;
} {
    return {
        joinMatch: vi.fn<(...args: [typeof matchId]) => Promise<LobbyCommandResult>>().mockResolvedValue({
            ok: true,
            transition: 'waiting',
        }),
        spectateMatch: vi.fn<(...args: [typeof matchId]) => Promise<LobbyCommandResult>>().mockResolvedValue({
            ok: true,
            transition: 'match',
        }),
    };
}

describe('route entry adapter', () => {
    it('adapts an open waiting adaptive route to a player entry and executes join', async () => {
        const route = routeFor(buildMatchUrl('https://example.test', MATCH_ID));
        const snapshot = snapshotOf([entryOf({ matchId, seatsFilled: 1, capacity: 2, status: 'waiting' })]);
        const commands = successfulCommands();

        const entry = adaptRoute(route, snapshot);
        expect(entry).toMatchObject({ kind: 'player', matchId, intent: 'adaptive' });
        await expect(executeRouteEntry(entry, commands)).resolves.toEqual({ ok: true, transition: 'waiting' });
        expect(commands.joinMatch).toHaveBeenCalledOnce();
        expect(commands.joinMatch).toHaveBeenCalledWith(matchId);
        expect(commands.spectateMatch).not.toHaveBeenCalled();
    });

    it('adapts an in-progress adaptive route to a spectator entry and executes spectate', async () => {
        const route = routeFor(buildMatchUrl('https://example.test', MATCH_ID));
        const snapshot = snapshotOf([entryOf({ matchId, seatsFilled: 2, capacity: 2, status: 'in_progress' })]);
        const commands = successfulCommands();

        const entry = adaptRoute(route, snapshot);
        expect(entry).toMatchObject({ kind: 'spectator', matchId, intent: 'adaptive' });
        await expect(executeRouteEntry(entry, commands)).resolves.toEqual({ ok: true, transition: 'match' });
        expect(commands.spectateMatch).toHaveBeenCalledOnce();
        expect(commands.spectateMatch).toHaveBeenCalledWith(matchId);
        expect(commands.joinMatch).not.toHaveBeenCalled();
    });

    it('does not downgrade a full waiting adaptive route to spectator', () => {
        const route = routeFor(buildMatchUrl('https://example.test', MATCH_ID));
        const snapshot = snapshotOf([entryOf({ matchId, seatsFilled: 2, capacity: 2, status: 'waiting' })]);
        const commands = successfulCommands();

        const entry = adaptRoute(route, snapshot);
        expect(entry).toMatchObject({ kind: 'unavailable', matchId, intent: 'adaptive', reason: 'full' });
        expect(executeRouteEntry(entry, commands)).toBeNull();
        expect(commands.joinMatch).not.toHaveBeenCalled();
        expect(commands.spectateMatch).not.toHaveBeenCalled();
    });

    it('never downgrades an explicit join route when the match is in progress', () => {
        const route = routeFor(buildJoinUrl('https://example.test', MATCH_ID));
        const snapshot = snapshotOf([entryOf({ matchId, seatsFilled: 1, status: 'in_progress' })]);
        const commands = successfulCommands();

        const entry = adaptRoute(route, snapshot);
        expect(entry).toMatchObject({ kind: 'unavailable', matchId, intent: 'join', reason: 'not-joinable' });
        expect(executeRouteEntry(entry, commands)).toBeNull();
        expect(commands.joinMatch).not.toHaveBeenCalled();
        expect(commands.spectateMatch).not.toHaveBeenCalled();
    });

    it('never claims a seat for an explicit spectate route', () => {
        const route = routeFor(buildSpectateUrl('https://example.test', MATCH_ID));
        const snapshot = snapshotOf([entryOf({ matchId, seatsFilled: 1, status: 'waiting' })]);
        const commands = successfulCommands();

        const entry = adaptRoute(route, snapshot);
        expect(entry).toMatchObject({ kind: 'unavailable', matchId, intent: 'spectate', reason: 'not-joinable' });
        expect(executeRouteEntry(entry, commands)).toBeNull();
        expect(commands.joinMatch).not.toHaveBeenCalled();
        expect(commands.spectateMatch).not.toHaveBeenCalled();
    });

    it('keeps a match unresolved without a snapshot and performs no I/O', () => {
        const route = routeFor(buildMatchUrl('https://example.test', MATCH_ID));
        const commands = successfulCommands();

        const entry = adaptRoute(route, null);
        expect(entry).toMatchObject({ kind: 'resolve', matchId });
        expect(executeRouteEntry(entry, commands)).toBeNull();
        expect(commands.joinMatch).not.toHaveBeenCalled();
        expect(commands.spectateMatch).not.toHaveBeenCalled();
    });

    it.each([
        ['/lobby', { kind: 'lobby', pathname: '/lobby' }],
        ['/', { kind: 'redirect', pathname: '/lobby' }],
        ['/profile', { kind: 'profile' }],
    ] as const)('does not invoke commands for %s entries', (pathname, expected) => {
        const route = parseRoute(pathname);
        const commands = successfulCommands();

        const entry = adaptRoute(route, snapshotOf([]));
        expect(entry).toMatchObject(expected);
        expect(executeRouteEntry(entry, commands)).toBeNull();
        expect(commands.joinMatch).not.toHaveBeenCalled();
        expect(commands.spectateMatch).not.toHaveBeenCalled();
    });

    it('does not invoke commands for a missing match', () => {
        const route = routeFor(buildMatchUrl('https://example.test', MATCH_ID));
        const commands = successfulCommands();

        const entry = adaptRoute(route, snapshotOf([]));
        expect(entry).toMatchObject({ kind: 'unavailable', matchId, reason: 'not-found' });
        expect(executeRouteEntry(entry, commands)).toBeNull();
        expect(commands.joinMatch).not.toHaveBeenCalled();
        expect(commands.spectateMatch).not.toHaveBeenCalled();
    });

    it('adapts a profile route to a profile entry regardless of snapshot', () => {
        const route = parseRoute('/profile');
        const commands = successfulCommands();

        const entryNull = adaptRoute(route, null);
        expect(entryNull).toEqual({ kind: 'profile', route });

        const entrySnapshot = adaptRoute(route, snapshotOf([]));
        expect(entrySnapshot).toEqual({ kind: 'profile', route });

        expect(executeRouteEntry(entryNull, commands)).toBeNull();
        expect(executeRouteEntry(entrySnapshot, commands)).toBeNull();
        expect(commands.joinMatch).not.toHaveBeenCalled();
        expect(commands.spectateMatch).not.toHaveBeenCalled();
    });

    it('forwards the exact decoded MatchId to the selected command', async () => {
        const encodedId = 'room alpha';
        const exactId = matchIdOf(encodedId);
        const route = routeFor(buildJoinUrl('https://example.test', encodedId));
        const commands = successfulCommands();

        const entry = adaptRoute(route, snapshotOf([entryOf({ matchId: exactId })]));
        await executeRouteEntry(entry, commands);

        expect(commands.joinMatch).toHaveBeenCalledWith(exactId);
        expect(commands.joinMatch.mock.calls[0]?.[0]).toBe(encodedId);
    });
});
