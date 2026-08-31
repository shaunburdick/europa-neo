/** Feature 013 T011 unit guards for intent preservation and no-I/O recovery. */

import { describe, expect, test } from 'vitest';

import { parseRoute } from '../../../src/routing/route';
import { adaptRoute, executeRouteEntry } from '../../../src/routing/route-adapter';
import { entryOf, matchIdOf, snapshotOf } from '../../fixtures/lobbyTransports';

const MATCH_ID = matchIdOf('room-alpha');

describe('semantic route no-connection guards', () => {
    test('an explicit join route for a running match remains unavailable', () => {
        const route = parseRoute('/match/room-alpha/join');
        const entry = adaptRoute(
            route,
            snapshotOf([entryOf({ matchId: MATCH_ID, status: 'in_progress', seatsFilled: 2, capacity: 2 })]),
        );

        expect(entry).toMatchObject({ kind: 'unavailable', intent: 'join', matchId: MATCH_ID });
        expect(executeRouteEntry(entry, forbiddenCommands())).toBeNull();
    });

    test('an unresolved match route performs no command until a snapshot exists', () => {
        const route = parseRoute('/match/room-alpha');
        const entry = adaptRoute(route, null);

        expect(entry).toMatchObject({ kind: 'resolve', matchId: MATCH_ID });
        expect(route).toMatchObject({ kind: 'match', intent: 'adaptive' });
        expect(executeRouteEntry(entry, forbiddenCommands())).toBeNull();
    });
});

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
