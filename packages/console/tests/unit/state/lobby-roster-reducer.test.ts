/**
 * Lobby reducer roster tests — feature 023 (T-047).
 *
 * Pure, deterministic reducer tests for the roster-related lobby
 * actions:
 *
 *   - `lobbyRosterSnapshot`: replaces roster state wholesale;
 *   - connection reset (`lobbyConnectionChanged` to `'idle'` /
 *     `'failed'`): clears roster state;
 *
 * No timers, no transport, no randomness — pure reducer folds only.
 */

import type { LobbyRevision, RosterSnapshot } from '@europa/matchmaking';
import { describe, expect, it } from 'vitest';

import { INITIAL_LOBBY_STATE, reduceLobby } from '../../../src/state/lobby-reducer';
import type { LobbyState, RosterState } from '../../../src/state/lobby-state';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function rosterSnapshot(
    revision: number,
    players: ReadonlyArray<{ readonly handle: string; readonly status: 'in_lobby' | 'in_game' | 'spectating' }>,
): RosterSnapshot {
    return {
        revision: revision as unknown as LobbyRevision,
        players,
    };
}

function rosterState(
    players: ReadonlyArray<{ readonly handle: string; readonly status: 'in_lobby' | 'in_game' | 'spectating' }>,
    connected = true,
): RosterState {
    return {
        players,
        connected,
    };
}

/** A named state to start from. */
const NAMED_STATE: LobbyState = reduceLobby(INITIAL_LOBBY_STATE, {
    kind: 'lobbyIdentityResolved',
    handle: 'Nova',
});

// ----------------------------------------------------------------------------
// T-047: Reducer tests
// ----------------------------------------------------------------------------

describe('lobbyRosterSnapshot', () => {
    it('replaces roster state wholesale', () => {
        const snapshot = rosterSnapshot(1, [
            { handle: 'Alice', status: 'in_lobby' },
            { handle: 'Bob', status: 'in_game' },
        ]);
        const state = reduceLobby(NAMED_STATE, {
            kind: 'lobbyRosterSnapshot',
            snapshot,
        });

        expect(state.roster.players).toHaveLength(2);
        expect(state.roster.players[0].handle).toBe('Alice');
        expect(state.roster.players[1].handle).toBe('Bob');
        expect(state.roster.connected).toBe(true);
    });

    it('overwrites previous roster state', () => {
        // First: apply a snapshot with 3 players.
        let state = reduceLobby(NAMED_STATE, {
            kind: 'lobbyRosterSnapshot',
            snapshot: rosterSnapshot(1, [
                { handle: 'Alice', status: 'in_lobby' },
                { handle: 'Bob', status: 'in_game' },
                { handle: 'Charlie', status: 'spectating' },
            ]),
        });
        expect(state.roster.players).toHaveLength(3);

        // Then: apply a snapshot with 1 player (wholesale replacement).
        state = reduceLobby(state, {
            kind: 'lobbyRosterSnapshot',
            snapshot: rosterSnapshot(5, [{ handle: 'Zara', status: 'in_lobby' }]),
        });
        expect(state.roster.players).toHaveLength(1);
        expect(state.roster.players[0].handle).toBe('Zara');
    });

    it('sets connected to true', () => {
        const disconnectedState = {
            ...NAMED_STATE,
            roster: rosterState([], false),
        };
        const state = reduceLobby(disconnectedState, {
            kind: 'lobbyRosterSnapshot',
            snapshot: rosterSnapshot(1, [{ handle: 'Alice', status: 'in_lobby' }]),
        });
        expect(state.roster.connected).toBe(true);
    });
});

describe('connection reset clears roster', () => {
    it('lobbyConnectionChanged to idle resets roster', () => {
        // Start with roster data.
        let state = reduceLobby(NAMED_STATE, {
            kind: 'lobbyRosterSnapshot',
            snapshot: rosterSnapshot(1, [{ handle: 'Alice', status: 'in_lobby' }]),
        });
        expect(state.roster.players).toHaveLength(1);

        // Connection goes idle.
        state = reduceLobby(state, {
            kind: 'lobbyConnectionChanged',
            connection: 'idle',
        });
        expect(state.roster.players).toHaveLength(0);
        expect(state.roster.connected).toBe(false);
    });

    it('lobbyConnectionChanged to failed resets roster', () => {
        let state = reduceLobby(NAMED_STATE, {
            kind: 'lobbyRosterSnapshot',
            snapshot: rosterSnapshot(1, [{ handle: 'Alice', status: 'in_lobby' }]),
        });

        state = reduceLobby(state, {
            kind: 'lobbyConnectionChanged',
            connection: 'failed',
        });
        expect(state.roster.players).toHaveLength(0);
        expect(state.roster.connected).toBe(false);
    });

    it('lobbyConnectionChanged to ready does NOT reset roster', () => {
        let state = reduceLobby(NAMED_STATE, {
            kind: 'lobbyRosterSnapshot',
            snapshot: rosterSnapshot(1, [{ handle: 'Alice', status: 'in_lobby' }]),
        });

        state = reduceLobby(state, {
            kind: 'lobbyConnectionChanged',
            connection: 'ready',
        });
        expect(state.roster.players).toHaveLength(1);
        expect(state.roster.connected).toBe(true);
    });
});

describe('purity', () => {
    it('input state is never mutated', () => {
        const originalPlayers = [...NAMED_STATE.roster.players];
        const snapshot = rosterSnapshot(1, [{ handle: 'Alice', status: 'in_lobby' }]);

        reduceLobby(NAMED_STATE, {
            kind: 'lobbyRosterSnapshot',
            snapshot,
        });

        // NAMED_STATE's roster should be unchanged.
        expect(NAMED_STATE.roster.players).toEqual(originalPlayers);
    });
});
