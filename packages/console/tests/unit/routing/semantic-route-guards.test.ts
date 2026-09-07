/**
 * Feature 013 — semantic route guard invariants.
 *
 * Proves two non-negotiable properties that must survive every future
 * refactoring of the routing layer:
 *
 *   1. **No-I/O recovery**: `executeRouteEntry` returns `null` for every
 *      non-actionable entry kind (`resolve`, `unavailable`, `redirect`,
 *      `welcome`, `lobby`, `profile`). The caller must never construct or
 *      connect a match client until the adapter emits `player` or `spectator`.
 *
 *   2. **Intent preservation**: the adapter never changes an explicit `join`
 *      or `spectate` intent — a `join` route that lands on a full match
 *      becomes `unavailable` (not a spectator entry), and an explicit
 *      `spectate` route that lands on an open match stays `unavailable`
 *      (not a player entry).
 *
 * This suite uses the same production imports as the runtime:
 *   - `validateMatchId` from `src/routing/route`
 *   - `adaptRoute`, `executeRouteEntry` from `src/routing/route-adapter`
 *
 * @see specs/013-console-semantic-url-scheme/spec.md  FR-006, FR-007
 */

import { describe, expect, test } from 'vitest';

import type { MatchRouteIntent, Route } from '../../../src/routing/route';
import { validateMatchId } from '../../../src/routing/route';
import { adaptRoute, executeRouteEntry } from '../../../src/routing/route-adapter';
import { entryOf, matchIdOf, snapshotOf } from '../../fixtures/lobbyTransports';

const MATCH_ID = matchIdOf('room-alpha');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a match Route from a pathname (e.g. `/match/room-alpha/join`). */
function matchRoute(pathname: string): Extract<Route, { kind: 'match' }> {
    const segments = pathname.split('/').slice(1);
    const intent: MatchRouteIntent =
        segments[2] === 'join' ? 'join' : segments[2] === 'spectate' ? 'spectate' : 'adaptive';
    const decoded = validateMatchId(segments[1] ?? '');
    if (!decoded.ok) throw new Error(`invalid match ID in test pathname: ${pathname}`);
    return { kind: 'match', pathname, matchId: decoded.value, intent };
}

/** Commands that throw on every call — proves the guard never invokes them. */
function forbiddenCommands() {
    return {
        joinMatch: () => {
            throw new Error('route resolution must not join before eligibility is known');
        },
        spectateMatch: () => {
            throw new Error('route resolution must not spectate before eligibility is known');
        },
    };
}

// ---------------------------------------------------------------------------
// 1. No-I/O recovery — executeRouteEntry returns null for non-actionable kinds
// ---------------------------------------------------------------------------

describe('no-I/O recovery', () => {
    test('resolve entry (null snapshot) executes nothing', () => {
        const route = matchRoute('/match/room-alpha');
        const entry = adaptRoute(route, null);

        expect(entry.kind).toBe('resolve');
        expect(executeRouteEntry(entry, forbiddenCommands())).toBeNull();
    });

    test('unavailable entry for a running match executes nothing', () => {
        const route = matchRoute('/match/room-alpha/join');
        const entry = adaptRoute(
            route,
            snapshotOf([entryOf({ matchId: MATCH_ID, status: 'in_progress', seatsFilled: 2, capacity: 2 })]),
        );

        expect(entry.kind).toBe('unavailable');
        expect(executeRouteEntry(entry, forbiddenCommands())).toBeNull();
    });

    test('unavailable entry for a full waiting match executes nothing', () => {
        const route = matchRoute('/match/room-alpha');
        const entry = adaptRoute(
            route,
            snapshotOf([entryOf({ matchId: MATCH_ID, status: 'waiting', seatsFilled: 2, capacity: 2 })]),
        );

        expect(entry.kind).toBe('unavailable');
        expect(executeRouteEntry(entry, forbiddenCommands())).toBeNull();
    });

    test('unavailable entry for a missing match executes nothing', () => {
        const route = matchRoute('/match/room-alpha');
        const entry = adaptRoute(route, snapshotOf([]));

        expect(entry.kind).toBe('unavailable');
        expect(executeRouteEntry(entry, forbiddenCommands())).toBeNull();
    });

    test('redirect entry for unknown pathname executes nothing', () => {
        const route: Route = { kind: 'unknown', pathname: '/bogus', reason: 'unsupported-path' };
        const entry = adaptRoute(route, null);

        expect(entry.kind).toBe('redirect');
        expect(executeRouteEntry(entry, forbiddenCommands())).toBeNull();
    });

    test('welcome entry executes nothing', () => {
        const route: Route = { kind: 'welcome', pathname: '/' };
        const entry = adaptRoute(route, null);

        expect(entry.kind).toBe('welcome');
        expect(executeRouteEntry(entry, forbiddenCommands())).toBeNull();
    });

    test('lobby entry executes nothing', () => {
        const route: Route = { kind: 'lobby', pathname: '/lobby' };
        const entry = adaptRoute(route, snapshotOf([]));

        expect(entry.kind).toBe('lobby');
        expect(executeRouteEntry(entry, forbiddenCommands())).toBeNull();
    });

    test('profile entry executes nothing', () => {
        const route: Route = { kind: 'profile', pathname: '/profile' };
        const entry = adaptRoute(route, null);

        expect(entry.kind).toBe('profile');
        expect(executeRouteEntry(entry, forbiddenCommands())).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 2. Intent preservation — the adapter never reclassifies explicit intents
// ---------------------------------------------------------------------------

describe('intent preservation', () => {
    test('explicit join on a full match becomes unavailable, not spectator', () => {
        const route = matchRoute('/match/room-alpha/join');
        const entry = adaptRoute(
            route,
            snapshotOf([entryOf({ matchId: MATCH_ID, status: 'waiting', seatsFilled: 2, capacity: 2 })]),
        );

        expect(entry).toMatchObject({ kind: 'unavailable', intent: 'join', reason: 'full' });
        expect(executeRouteEntry(entry, forbiddenCommands())).toBeNull();
    });

    test('explicit join on an in-progress match becomes unavailable, not spectator', () => {
        const route = matchRoute('/match/room-alpha/join');
        const entry = adaptRoute(
            route,
            snapshotOf([entryOf({ matchId: MATCH_ID, status: 'in_progress', seatsFilled: 2, capacity: 2 })]),
        );

        expect(entry).toMatchObject({ kind: 'unavailable', intent: 'join', reason: 'not-joinable' });
        expect(executeRouteEntry(entry, forbiddenCommands())).toBeNull();
    });

    test('explicit spectate on an open waiting match becomes unavailable, not player', () => {
        const route = matchRoute('/match/room-alpha/spectate');
        const entry = adaptRoute(
            route,
            snapshotOf([entryOf({ matchId: MATCH_ID, status: 'waiting', seatsFilled: 1, capacity: 2 })]),
        );

        expect(entry).toMatchObject({ kind: 'unavailable', intent: 'spectate', reason: 'not-joinable' });
        expect(executeRouteEntry(entry, forbiddenCommands())).toBeNull();
    });

    test('adaptive on an open waiting match resolves to player', () => {
        const route = matchRoute('/match/room-alpha');
        const entry = adaptRoute(
            route,
            snapshotOf([entryOf({ matchId: MATCH_ID, status: 'waiting', seatsFilled: 1, capacity: 2 })]),
        );

        expect(entry).toMatchObject({ kind: 'player', intent: 'adaptive', matchId: MATCH_ID });
    });

    test('adaptive on an in-progress match resolves to spectator', () => {
        const route = matchRoute('/match/room-alpha');
        const entry = adaptRoute(
            route,
            snapshotOf([entryOf({ matchId: MATCH_ID, status: 'in_progress', seatsFilled: 2, capacity: 2 })]),
        );

        expect(entry).toMatchObject({ kind: 'spectator', intent: 'adaptive', matchId: MATCH_ID });
    });

    test('matchId is preserved across all entry kinds', () => {
        const openRoute = matchRoute('/match/room-alpha');
        const openEntry = adaptRoute(
            openRoute,
            snapshotOf([entryOf({ matchId: MATCH_ID, status: 'waiting', seatsFilled: 1, capacity: 2 })]),
        );
        const closedRoute = matchRoute('/match/room-alpha/join');
        const closedEntry = adaptRoute(
            closedRoute,
            snapshotOf([entryOf({ matchId: MATCH_ID, status: 'in_progress', seatsFilled: 2, capacity: 2 })]),
        );
        const noSnapshotEntry = adaptRoute(matchRoute('/match/room-alpha'), null);

        expect(openEntry).toMatchObject({ matchId: MATCH_ID });
        expect(closedEntry).toMatchObject({ matchId: MATCH_ID });
        expect(noSnapshotEntry).toMatchObject({ matchId: MATCH_ID });
    });
});
