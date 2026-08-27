/**
 * Lobby reducer unit tests — feature 010 (T-014).
 *
 * Pure, deterministic folds: every transition the lobby layer supports,
 * driven through {@link reduceLobby} with no timers, no transport, no
 * randomness. Coverage targets the product-weighted rules:
 *
 *   - connection lifecycle projection incl. failure-banner set/clear,
 *   - identity resolution (unnamed/named/restoring + sticky everNamed),
 *   - snapshot adoption (revision + entries + activeMatchId),
 *   - per-action loading/error/retry slots,
 *   - explicit view-mode transitions (seat grants in, return out),
 *   - the SUPERSESSION gate: `identity_invalid` after a NAMED session
 *     flags "session moved elsewhere"; pre-condition rejections sharing
 *     the code (unnamed/no-handle) must NOT,
 *   - identity-death codes resetting the posture (fresh-session rule),
 *   - purity (input state never mutated).
 */

import type { LobbyRevision, LobbySnapshot, MatchId } from '@europa/matchmaking';
import { describe, expect, it } from 'vitest';

import type { LobbyConnectionState } from '../../../src/net/ws-lobby-client';
import { INITIAL_LOBBY_STATE, reduceLobby } from '../../../src/state/lobby-reducer';
import type { LobbyActionError, LobbyFailure, LobbyState } from '../../../src/state/lobby-state';

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const MATCH_A = 'match-a' as MatchId;
const MATCH_B = 'match-b' as MatchId;

function snapshotOf(revision: number, activeMatchId: MatchId | null = null): LobbySnapshot {
    return {
        revision: revision as LobbyRevision,
        entries: [
            {
                matchId: MATCH_A,
                seatsFilled: 1,
                capacity: 2,
                status: 'waiting',
                boardSize: 32,
                tickIntervalMs: 250,
            },
        ],
        activeMatchId,
    };
}

function actionError(code: LobbyActionError['code'], message = 'rejected'): LobbyActionError {
    return { code, message, detail: null };
}

function failureOf(code: LobbyFailure['code'], source: LobbyFailure['source'] = 'server'): LobbyFailure {
    return { source, code, message: `failure: ${code}`, detail: null };
}

/** A state with a NAMED, established session (the supersession prerequisite). */
const NAMED_STATE: LobbyState = reduceLobby(INITIAL_LOBBY_STATE, {
    kind: 'lobbyIdentityResolved',
    handle: 'Nova',
});

/** A state established but never named (identity confirmed, handle null). */
const UNNAMED_STATE: LobbyState = reduceLobby(INITIAL_LOBBY_STATE, {
    kind: 'lobbyIdentityResolved',
    handle: null,
});

// ----------------------------------------------------------------------------
// Connection lifecycle
// ----------------------------------------------------------------------------

describe('lobbyConnectionChanged', () => {
    it('projects every transport lifecycle value verbatim', () => {
        const states: LobbyConnectionState[] = [
            'idle',
            'connecting',
            'ready',
            'reconnecting',
            'failed',
            'disconnected',
            'closed',
        ];
        let state = INITIAL_LOBBY_STATE;
        for (const connection of states) {
            state = reduceLobby(state, { kind: 'lobbyConnectionChanged', connection });
            expect(state.connection).toBe(connection);
        }
    });

    it("'ready' clears any prior failure banner", () => {
        const failed = reduceLobby(INITIAL_LOBBY_STATE, { kind: 'lobbyConnectionChanged', connection: 'failed' });
        expect(failed.failure?.code).toBe('connection_failed');
        const recovered = reduceLobby(failed, { kind: 'lobbyConnectionChanged', connection: 'ready' });
        expect(recovered.failure).toBeNull();
        expect(recovered.connection).toBe('ready');
    });

    it("'failed' raises a terminal connection failure", () => {
        const state = reduceLobby(INITIAL_LOBBY_STATE, { kind: 'lobbyConnectionChanged', connection: 'failed' });
        expect(state.failure).toEqual({
            source: 'connection',
            code: 'connection_failed',
            message: 'Lobby connection failed.',
            detail: null,
        });
    });

    it("'disconnected' raises a retryable connection-lost failure", () => {
        const state = reduceLobby(INITIAL_LOBBY_STATE, { kind: 'lobbyConnectionChanged', connection: 'disconnected' });
        expect(state.failure?.code).toBe('connection_lost');
        expect(state.failure?.source).toBe('connection');
    });

    it("transient states ('connecting'/'reconnecting') neither raise nor clear a banner", () => {
        const failed = reduceLobby(INITIAL_LOBBY_STATE, { kind: 'lobbyConnectionChanged', connection: 'failed' });
        const reconnecting = reduceLobby(failed, { kind: 'lobbyConnectionChanged', connection: 'reconnecting' });
        expect(reconnecting.failure?.code).toBe('connection_failed');
        const healthy = reduceLobby(NAMED_STATE, { kind: 'lobbyConnectionChanged', connection: 'reconnecting' });
        expect(healthy.failure).toBeNull();
    });
});

// ----------------------------------------------------------------------------
// Identity resolution
// ----------------------------------------------------------------------------

describe('lobbyIdentityResolved', () => {
    it('a non-null handle names the session and latches everNamed', () => {
        expect(NAMED_STATE.identityStatus).toBe('named');
        expect(NAMED_STATE.handle).toBe('Nova');
        expect(NAMED_STATE.everNamed).toBe(true);
    });

    it('a null handle leaves the session unnamed without latching everNamed', () => {
        expect(UNNAMED_STATE.identityStatus).toBe('unnamed');
        expect(UNNAMED_STATE.handle).toBeNull();
        expect(UNNAMED_STATE.everNamed).toBe(false);
    });

    it('a rename updates the handle verbatim (no normalization in state)', () => {
        const renamed = reduceLobby(NAMED_STATE, { kind: 'lobbyIdentityResolved', handle: '  NoVa  ' });
        expect(renamed.handle).toBe('  NoVa  ');
        expect(renamed.identityStatus).toBe('named');
    });

    it('everNamed survives a transient drop back to unnamed (grace-window restore)', () => {
        const dropped = reduceLobby(NAMED_STATE, { kind: 'lobbyIdentityResolved', handle: null });
        expect(dropped.everNamed).toBe(true);
        expect(dropped.identityStatus).toBe('unnamed');
    });
});

// ----------------------------------------------------------------------------
// Snapshots
// ----------------------------------------------------------------------------

describe('lobbySnapshotApplied', () => {
    it('adopts the snapshot wholesale and mirrors its activeMatchId', () => {
        const state = reduceLobby(INITIAL_LOBBY_STATE, {
            kind: 'lobbySnapshotApplied',
            snapshot: snapshotOf(7, MATCH_B),
        });
        expect(state.snapshot?.revision).toBe(7);
        expect(state.snapshot?.entries).toHaveLength(1);
        expect(state.activeMatchId).toBe(MATCH_B);
    });

    it('a lobby-bound snapshot clears the mirrored activeMatchId but never moves the view', () => {
        const inMatch = reduceLobby(NAMED_STATE, { kind: 'lobbyEnteredMatch', matchId: MATCH_A });
        const released = reduceLobby(inMatch, {
            kind: 'lobbySnapshotApplied',
            snapshot: snapshotOf(8, null),
        });
        expect(released.activeMatchId).toBeNull();
        expect(released.viewMode).toBe('match');
    });
});

// ----------------------------------------------------------------------------
// Per-action lifecycle
// ----------------------------------------------------------------------------

describe('per-action loading/error/retry slots', () => {
    it("starts mark exactly their own slot 'loading'", () => {
        const state = reduceLobby(NAMED_STATE, { kind: 'lobbyActionStarted', action: 'joinMatch' });
        expect(state.actions.joinMatch.phase).toBe('loading');
        expect(state.actions.createMatch.phase).toBe('idle');
        expect(state.actions.setHandle.phase).toBe('idle');
    });

    it("success returns the slot to 'idle'; a seat grant flips the view to 'match'", () => {
        let state = reduceLobby(NAMED_STATE, { kind: 'lobbyActionStarted', action: 'createMatch' });
        state = reduceLobby(state, {
            kind: 'lobbyActionSucceeded',
            action: 'createMatch',
            transition: 'waiting',
        });
        expect(state.actions.createMatch).toEqual({ phase: 'idle', error: null });
        expect(state.viewMode).toBe('match');
    });

    it('non-seat successes (setHandle) never move the view', () => {
        let state = reduceLobby(NAMED_STATE, { kind: 'lobbyActionStarted', action: 'setHandle' });
        state = reduceLobby(state, { kind: 'lobbyActionSucceeded', action: 'setHandle' });
        expect(state.viewMode).toBe('lobby');
    });

    it('failures record code/message/detail in their own slot only', () => {
        const error: LobbyActionError = {
            code: 'handle_taken',
            message: 'That handle is in use.',
            detail: { normalized: 'nova' },
        };
        const state = reduceLobby(NAMED_STATE, { kind: 'lobbyActionFailed', action: 'setHandle', error });
        expect(state.actions.setHandle).toEqual({ phase: 'error', error });
        expect(state.actions.createMatch.phase).toBe('idle');
    });

    it('retrying simply starts again: the error is overwritten by loading', () => {
        let state = reduceLobby(NAMED_STATE, {
            kind: 'lobbyActionFailed',
            action: 'joinMatch',
            error: actionError('match_full'),
        });
        expect(state.actions.joinMatch.phase).toBe('error');
        state = reduceLobby(state, { kind: 'lobbyActionStarted', action: 'joinMatch' });
        expect(state.actions.joinMatch).toEqual({ phase: 'loading', error: null });
    });
});

// ----------------------------------------------------------------------------
// Supersession gate ("session moved elsewhere")
// ----------------------------------------------------------------------------

describe('supersession gate', () => {
    it("correlated identity_invalid AFTER a named session flags 'session moved elsewhere'", () => {
        const state = reduceLobby(NAMED_STATE, {
            kind: 'lobbyActionFailed',
            action: 'createMatch',
            error: actionError('identity_invalid'),
        });
        expect(state.superseded).toBe(true);
        expect(state.actions.createMatch.phase).toBe('error');
    });

    it('uncorrelated identity_invalid reports flag supersession too', () => {
        const state = reduceLobby(NAMED_STATE, {
            kind: 'lobbyFailureReported',
            failure: failureOf('identity_invalid'),
        });
        expect(state.superseded).toBe(true);
    });

    it('identity_invalid BEFORE any handle confirmation is an ordinary recoverable error', () => {
        // Facade mapping: "action before establishIdentity" and "create/join
        // without an accepted handle" share the code — they must NOT read as
        // "moved elsewhere" (US3 AC-4 keeps its actionable feedback).
        for (const seed of [INITIAL_LOBBY_STATE, UNNAMED_STATE]) {
            const correlated = reduceLobby(seed, {
                kind: 'lobbyActionFailed',
                action: 'joinMatch',
                error: actionError('identity_invalid'),
            });
            expect(correlated.superseded).toBe(false);
            expect(correlated.actions.joinMatch.phase).toBe('error');

            const uncorrelated = reduceLobby(seed, {
                kind: 'lobbyFailureReported',
                failure: failureOf('identity_invalid'),
            });
            expect(uncorrelated.superseded).toBe(false);
        }
    });

    it('other error codes never trigger supersession', () => {
        const codes = ['handle_taken', 'match_full', 'server_restarted', 'internal_error'] as const;
        for (const code of codes) {
            const state = reduceLobby(NAMED_STATE, {
                kind: 'lobbyActionFailed',
                action: 'joinMatch',
                error: actionError(code),
            });
            expect(state.superseded).toBe(false);
        }
    });

    it('acknowledgement clears the flag without touching anything else', () => {
        const superseded = reduceLobby(NAMED_STATE, {
            kind: 'lobbyActionFailed',
            action: 'createMatch',
            error: actionError('identity_invalid'),
        });
        const acked = reduceLobby(superseded, { kind: 'lobbySupersededAcknowledged' });
        expect(acked.superseded).toBe(false);
        expect(acked.handle).toBe('Nova');
        expect(acked.actions.createMatch.phase).toBe('error'); // untouched by the ack
    });
});

// ----------------------------------------------------------------------------
// Identity death (fresh-session rule)
// ----------------------------------------------------------------------------

describe('identity-death failures reset the posture', () => {
    it("'identity_expired' restores 'restoring' and drops the stale handle", () => {
        const state = reduceLobby(NAMED_STATE, {
            kind: 'lobbyFailureReported',
            failure: failureOf('identity_expired'),
        });
        expect(state.identityStatus).toBe('restoring');
        expect(state.handle).toBeNull();
        expect(state.everNamed).toBe(false);
        expect(state.failure?.code).toBe('identity_expired');
    });

    it("'server_restarted' does the same (in-memory boundary)", () => {
        const state = reduceLobby(NAMED_STATE, {
            kind: 'lobbyFailureReported',
            failure: failureOf('server_restarted'),
        });
        expect(state.identityStatus).toBe('restoring');
        expect(state.handle).toBeNull();
    });

    it('after a reset, identity_invalid can no longer flag supersession', () => {
        const expired = reduceLobby(NAMED_STATE, {
            kind: 'lobbyFailureReported',
            failure: failureOf('identity_expired'),
        });
        const state = reduceLobby(expired, {
            kind: 'lobbyActionFailed',
            action: 'joinMatch',
            error: actionError('identity_invalid'),
        });
        expect(state.superseded).toBe(false);
    });
});

// ----------------------------------------------------------------------------
// Explicit view transitions
// ----------------------------------------------------------------------------

describe('view-mode transitions', () => {
    it('lobbyEnteredMatch pins the view and an eagerly-known match id', () => {
        const state = reduceLobby(NAMED_STATE, { kind: 'lobbyEnteredMatch', matchId: MATCH_A });
        expect(state.viewMode).toBe('match');
        expect(state.activeMatchId).toBe(MATCH_A);
    });

    it('lobbyEnteredMatch with a null id pins the view only (create flow)', () => {
        const state = reduceLobby(NAMED_STATE, { kind: 'lobbyEnteredMatch', matchId: null });
        expect(state.viewMode).toBe('match');
        expect(state.activeMatchId).toBeNull();
    });

    it('lobbyReturned goes back to the lobby, clears the match, keeps the identity', () => {
        let state = reduceLobby(NAMED_STATE, { kind: 'lobbyEnteredMatch', matchId: MATCH_A });
        state = reduceLobby(state, { kind: 'lobbyActionStarted', action: 'leaveMatch' });
        state = reduceLobby(state, { kind: 'lobbyReturned' });
        expect(state.viewMode).toBe('lobby');
        expect(state.activeMatchId).toBeNull();
        expect(state.actions.leaveMatch).toEqual({ phase: 'idle', error: null });
        expect(state.handle).toBe('Nova');
        expect(state.identityStatus).toBe('named');
    });
});

// ----------------------------------------------------------------------------
// Retry acknowledgement + purity
// ----------------------------------------------------------------------------

describe('retryRequested and purity', () => {
    it('retryRequested clears only the failure banner', () => {
        const failed = reduceLobby(NAMED_STATE, { kind: 'lobbyConnectionChanged', connection: 'failed' });
        const retried = reduceLobby(failed, { kind: 'lobbyRetryRequested' });
        expect(retried.failure).toBeNull();
        expect(retried.connection).toBe('failed'); // truth restored by the next lifecycle event
        expect(retried.handle).toBe('Nova');
    });

    it('is pure: the input state object is never mutated', () => {
        const before = structuredClone(NAMED_STATE);
        reduceLobby(NAMED_STATE, {
            kind: 'lobbyActionFailed',
            action: 'spectateMatch',
            error: actionError('match_not_joinable'),
        });
        reduceLobby(NAMED_STATE, { kind: 'lobbySnapshotApplied', snapshot: snapshotOf(9, MATCH_A) });
        expect(NAMED_STATE).toEqual(before);
    });

    it('is deterministic: identical inputs produce identical outputs', () => {
        const action: Parameters<typeof reduceLobby>[1] = {
            kind: 'lobbyActionSucceeded',
            action: 'joinMatch',
            transition: 'match',
        };
        expect(reduceLobby(NAMED_STATE, action)).toEqual(reduceLobby(NAMED_STATE, action));
    });
});
