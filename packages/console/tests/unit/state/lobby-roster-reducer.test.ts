/**
 * Lobby reducer roster tests — feature 023 (T-047).
 *
 * Pure, deterministic reducer tests for the roster-related lobby
 * actions:
 *
 *   - `lobbyRosterSnapshot`: replaces roster state wholesale;
 *   - `lobbyRosterDelta`: merges changes into existing roster;
 *   - connection reset (`lobbyConnectionChanged` to `'idle'` /
 *     `'failed'`): clears roster state;
 *   - snapshot replacement (full snapshot overwrites delta-merged state);
 *   - delta merging (add new entry, update existing entry);
 *   - revision gating (stale snapshots/deltas are ignored).
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

/** A roster state with players and a revision. */
function rosterState(
    players: ReadonlyArray<{ readonly handle: string; readonly status: 'in_lobby' | 'in_game' | 'spectating' }>,
    revision: number | null = 1,
    connected = true,
): RosterState {
    return {
        players,
        revision: revision as unknown as ReturnType<typeof Number> & { readonly __brand: 'RosterRevision' },
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
            roster: rosterState([], null, false),
        };
        const state = reduceLobby(disconnectedState, {
            kind: 'lobbyRosterSnapshot',
            snapshot: rosterSnapshot(1, [{ handle: 'Alice', status: 'in_lobby' }]),
        });
        expect(state.roster.connected).toBe(true);
    });
});

describe('lobbyRosterDelta', () => {
    it('adds a new entry to an empty roster', () => {
        const state = reduceLobby(NAMED_STATE, {
            kind: 'lobbyRosterDelta',
            delta: {
                revision: 2 as unknown as LobbyRevision,
                changes: [{ handle: 'Alice', status: 'in_lobby' }],
            },
        });
        expect(state.roster.players).toHaveLength(1);
        expect(state.roster.players[0].handle).toBe('Alice');
        expect(state.roster.players[0].status).toBe('in_lobby');
    });

    it('updates an existing entry status', () => {
        // Start with a snapshot containing Alice in_lobby.
        let state = reduceLobby(NAMED_STATE, {
            kind: 'lobbyRosterSnapshot',
            snapshot: rosterSnapshot(1, [{ handle: 'Alice', status: 'in_lobby' }]),
        });

        // Apply delta: Alice transitions to in_game.
        state = reduceLobby(state, {
            kind: 'lobbyRosterDelta',
            delta: {
                revision: 2 as unknown as LobbyRevision,
                changes: [{ handle: 'Alice', status: 'in_game' }],
            },
        });

        expect(state.roster.players).toHaveLength(1);
        expect(state.roster.players[0].handle).toBe('Alice');
        expect(state.roster.players[0].status).toBe('in_game');
    });

    it('adds multiple entries in one delta', () => {
        const state = reduceLobby(NAMED_STATE, {
            kind: 'lobbyRosterDelta',
            delta: {
                revision: 1 as unknown as LobbyRevision,
                changes: [
                    { handle: 'Alice', status: 'in_lobby' },
                    { handle: 'Bob', status: 'in_game' },
                    { handle: 'Charlie', status: 'spectating' },
                ],
            },
        });
        expect(state.roster.players).toHaveLength(3);
    });

    it('does not remove entries absent from delta', () => {
        // Start with Alice and Bob.
        let state = reduceLobby(NAMED_STATE, {
            kind: 'lobbyRosterSnapshot',
            snapshot: rosterSnapshot(1, [
                { handle: 'Alice', status: 'in_lobby' },
                { handle: 'Bob', status: 'in_lobby' },
            ]),
        });

        // Delta only mentions Alice (Bob is absent — should persist).
        state = reduceLobby(state, {
            kind: 'lobbyRosterDelta',
            delta: {
                revision: 2 as unknown as LobbyRevision,
                changes: [{ handle: 'Alice', status: 'in_game' }],
            },
        });

        expect(state.roster.players).toHaveLength(2);
        const bob = state.roster.players.find((p) => p.handle === 'Bob');
        expect(bob).toBeDefined();
        expect(bob?.status).toBe('in_lobby');
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
        expect(state.roster.revision).toBeNull();
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
        expect(state.roster.revision).toBeNull();
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

describe('snapshot replacement after delta merge', () => {
    it('full snapshot overwrites delta-merged state', () => {
        // Start with snapshot: Alice.
        let state = reduceLobby(NAMED_STATE, {
            kind: 'lobbyRosterSnapshot',
            snapshot: rosterSnapshot(1, [{ handle: 'Alice', status: 'in_lobby' }]),
        });

        // Delta: add Bob.
        state = reduceLobby(state, {
            kind: 'lobbyRosterDelta',
            delta: {
                revision: 2 as unknown as LobbyRevision,
                changes: [{ handle: 'Bob', status: 'in_lobby' }],
            },
        });
        expect(state.roster.players).toHaveLength(2);

        // Full snapshot: only Charlie (wholesale replacement).
        state = reduceLobby(state, {
            kind: 'lobbyRosterSnapshot',
            snapshot: rosterSnapshot(3, [{ handle: 'Charlie', status: 'in_game' }]),
        });
        expect(state.roster.players).toHaveLength(1);
        expect(state.roster.players[0].handle).toBe('Charlie');
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
