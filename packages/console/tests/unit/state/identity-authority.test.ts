/**
 * Identity authority + preservation unit tests — issue #74 (Wave 7).
 *
 * Two console-level guarantees under the universal `PlayerId` model:
 *
 *   1. A forged/unknown/mismatched identity grants NO order authority:
 *      the console stamps orders only with the server-resolved local
 *      identity, and local ownership checks compare the server-issued
 *      IDs (never a seat/index or a caller-supplied value).
 *   2. The server-issued identity is preserved across reconnect, tick,
 *      terminal, and a rematch (a later `joined` for a new match adopts
 *      the server's new id); participants and handles stay keyed by
 *      `PlayerId`, and the engine's raw-ID placeholder is never
 *      mistaken for a human handle.
 */

import { describe, expect, it } from 'vitest';

import { actionToOrder } from '../../../src/state/action-to-order';
import { localPreflightOrder } from '../../../src/state/local-preflight';
import { INITIAL_CONSOLE_STATE, reduce } from '../../../src/state/reducer';
import { applySpectatorEnvelope, initialSpectatorState } from '../../../src/state/spectator-session';
import type {
    ConsoleParticipant,
    ConsoleSession,
    ConsoleState,
    MatchId,
    NetworkPayload,
    PlayerView,
    ProtocolEnvelope,
} from '../../../src/state/types';
import {
    buildCellView,
    buildPlayerView,
    TEST_PLAYER_1,
    TEST_PLAYER_2,
    TEST_PLAYER_3,
} from '../../fixtures/player-view';

const NOW = 1_000;

/** A view whose only cell is owned by `owner`. */
function viewOwnedBy(owner: typeof TEST_PLAYER_1): PlayerView {
    return buildPlayerView({
        width: 4,
        height: 4,
        playerId: owner,
        visibleCells: [buildCellView({ coord: { x: 1, y: 1 }, troops: 3, owner })],
    });
}

/** A session with the given local identity and participants. */
function sessionWith(
    playerId: ConsoleSession['playerId'],
    participants: ReadonlyArray<ConsoleParticipant>,
): ConsoleSession {
    return { ...INITIAL_CONSOLE_STATE.session, playerId, participants };
}

describe('forged / mismatched identity grants no order authority', () => {
    it('actionToOrder refuses an order claimed for a different identity', () => {
        const session = sessionWith(TEST_PLAYER_1, [
            { id: TEST_PLAYER_1, name: 'Nova', isLocal: true },
            { id: TEST_PLAYER_2, name: 'Orion', isLocal: false },
        ]);
        // Forged: caller asserts PLAYER_2 while the server seated PLAYER_1.
        expect(
            actionToOrder({ kind: 'setReserves', cell: { x: 0, y: 0 }, percent: 3 }, TEST_PLAYER_2, session),
        ).toBeNull();
        // An entirely unknown identity is equally refused.
        expect(actionToOrder({ kind: 'surrender' }, TEST_PLAYER_3, session)).toBeNull();
        // The genuinely seated identity is accepted, stamped with that id.
        expect(actionToOrder({ kind: 'surrender' }, TEST_PLAYER_1, session)).toEqual({
            kind: 'surrender',
            player: TEST_PLAYER_1,
        });
    });

    it('actionToOrder refuses every order for a spectator (no seat)', () => {
        const spectator = sessionWith(null, [{ id: TEST_PLAYER_1, name: 'Nova', isLocal: false }]);
        expect(
            actionToOrder({ kind: 'setPipe', cell: { x: 0, y: 0 }, direction: 'N' }, TEST_PLAYER_1, spectator),
        ).toBeNull();
    });

    it('localPreflightOrder rejects a pipe on a cell owned by another identity', () => {
        const view = viewOwnedBy(TEST_PLAYER_1);
        const order = { kind: 'setPipe', player: TEST_PLAYER_1, cell: { x: 1, y: 1 }, direction: 'N' } as const;
        // Forged claimer does not own the cell.
        expect(localPreflightOrder(order, view, TEST_PLAYER_2)).toEqual({ kind: 'not_owner', coord: { x: 1, y: 1 } });
        // The actual owner passes the preflight.
        expect(localPreflightOrder(order, view, TEST_PLAYER_1)).toBeNull();
    });

    it('the reducer produces no order effects for an unseated session', () => {
        const spectator: ConsoleState = {
            ...INITIAL_CONSOLE_STATE,
            status: 'live',
            inputEnabled: true,
            latestView: viewOwnedBy(TEST_PLAYER_1),
            session: sessionWith(null, [{ id: TEST_PLAYER_1, name: 'Nova', isLocal: false }]),
        };
        const { effects } = reduce(
            spectator,
            { kind: 'setReserves', cell: { x: 1, y: 1 }, percent: 3 },
            { nowMs: NOW },
        );
        expect(effects).toEqual([]);
    });
});

describe('server-issued identity is preserved by ID', () => {
    /** Seed a live session through a real `joined` event. */
    function joinedState(playerId: typeof TEST_PLAYER_1, view: PlayerView): ConsoleState {
        const connecting = reduce(
            INITIAL_CONSOLE_STATE,
            { kind: 'connecting', matchId: 'm-1' as never },
            { nowMs: NOW },
        ).state;
        return reduce(
            connecting,
            {
                kind: 'joined',
                sessionToken: 'tok' as never,
                playerId,
                view,
                players: [
                    { id: TEST_PLAYER_1, displayName: 'Nova' },
                    // Engine placeholder: displayName is the raw id (no handle).
                    { id: TEST_PLAYER_2, displayName: TEST_PLAYER_2 },
                ],
            },
            { nowMs: NOW },
        ).state;
    }

    it('keys participants and handles by the server id (raw id is not a handle)', () => {
        const state = joinedState(TEST_PLAYER_1, buildPlayerView({ width: 4, height: 4 }));
        expect(state.session.playerId).toBe(TEST_PLAYER_1);
        expect(state.session.participants).toEqual([
            { id: TEST_PLAYER_1, name: 'Nova', isLocal: true },
            { id: TEST_PLAYER_2, name: null, isLocal: false },
        ]);
        expect(state.session.playerNames.get(TEST_PLAYER_1)).toBe('Nova');
        // The engine placeholder (id-as-name) is NOT stored as a handle.
        expect(state.session.playerNames.has(TEST_PLAYER_2)).toBe(false);
    });

    it('preserves the identity across reconnect and tick view changes', () => {
        const base = joinedState(TEST_PLAYER_2, buildPlayerView({ width: 4, height: 4, tick: 1 }));
        const reconnected = reduce(
            base,
            { kind: 'reconnected', view: buildPlayerView({ width: 4, height: 4, tick: 9 }) },
            { nowMs: NOW },
        ).state;
        expect(reconnected.session.playerId).toBe(TEST_PLAYER_2);
        expect(reconnected.session.participants).toEqual(base.session.participants);
        expect(reconnected.latestView?.tick).toBe(9);

        const ticked = reduce(
            reconnected,
            { kind: 'tick', view: buildPlayerView({ width: 4, height: 4, tick: 10 }) },
            { nowMs: NOW },
        ).state;
        expect(ticked.session.playerId).toBe(TEST_PLAYER_2);
        expect(ticked.session.participants).toEqual(base.session.participants);
    });

    it('preserves the identity through terminal', () => {
        const base = joinedState(TEST_PLAYER_1, buildPlayerView({ width: 4, height: 4 }));
        const over = reduce(
            base,
            { kind: 'terminal', result: { kind: 'win', winner: TEST_PLAYER_1, tick: 42, reason: 'last_standing' } },
            { nowMs: NOW },
        ).state;
        expect(over.status).toBe('game_over');
        expect(over.session.playerId).toBe(TEST_PLAYER_1);
        expect(over.session.participants).toEqual(base.session.participants);
    });

    it('a rematch (later joined for a new match) adopts the server id, never a client-derived one', () => {
        const first = joinedState(TEST_PLAYER_1, buildPlayerView({ width: 4, height: 4 }));
        const over = reduce(
            first,
            { kind: 'terminal', result: { kind: 'win', winner: TEST_PLAYER_1, tick: 42, reason: 'last_standing' } },
            { nowMs: NOW },
        ).state;
        // The server seats us as a DIFFERENT identity in the rematch.
        const rematch = reduce(
            over,
            {
                kind: 'joined',
                sessionToken: 'tok-2' as never,
                playerId: TEST_PLAYER_3,
                view: buildPlayerView({
                    width: 4,
                    height: 4,
                    playerIds: [TEST_PLAYER_3, TEST_PLAYER_2],
                }),
                players: [
                    { id: TEST_PLAYER_3, displayName: 'Nova' },
                    { id: TEST_PLAYER_2, displayName: 'Orion' },
                ],
            },
            { nowMs: NOW },
        ).state;
        expect(rematch.session.playerId).toBe(TEST_PLAYER_3);
        expect(rematch.session.participants).toEqual([
            { id: TEST_PLAYER_3, name: 'Nova', isLocal: true },
            { id: TEST_PLAYER_2, name: 'Orion', isLocal: false },
        ]);
    });
});

describe('spectator state keys identity by server id and never seeds a seat', () => {
    const MATCH = 'm-1' as MatchId;

    /** Wrap a payload as the spectator fold's wire envelope. */
    function envelope(type: string, payload: unknown): ProtocolEnvelope<NetworkPayload> {
        return { type, version: '1.0.0', seq: 1, payload } as unknown as ProtocolEnvelope<NetworkPayload>;
    }

    function spectatorView(tick: number): PlayerView {
        return buildPlayerView({
            width: 4,
            height: 4,
            tick,
            playerId: TEST_PLAYER_1,
            playerIds: [TEST_PLAYER_1, TEST_PLAYER_2],
        });
    }

    it('records participants by server id and rejects a forged seat', () => {
        const joinAck = envelope('joinAck', {
            sessionToken: 'bearer-token-value',
            playerId: null,
            view: spectatorView(1),
            tick: 1,
            players: [
                { id: TEST_PLAYER_1, displayName: 'Nova' },
                { id: TEST_PLAYER_2, displayName: 'Orion' },
            ],
        });
        const attached = applySpectatorEnvelope(initialSpectatorState(MATCH), joinAck, NOW);
        expect(attached.status).toBe('spectating');
        expect(attached.session.playerId).toBeNull();
        expect(attached.session.participants).toEqual([
            { id: TEST_PLAYER_1, name: 'Nova', isLocal: false },
            { id: TEST_PLAYER_2, name: 'Orion', isLocal: false },
        ]);

        // A forged non-null seat on a spectator connection is ignored.
        const forged = envelope('joinAck', {
            sessionToken: 'bearer-token-value',
            playerId: TEST_PLAYER_1,
            view: spectatorView(9),
            tick: 9,
            players: [],
        });
        const state = initialSpectatorState(MATCH);
        expect(applySpectatorEnvelope(state, forged, NOW)).toBe(state);
    });

    it('preserves the participant identity map across tick views', () => {
        const joinAck = envelope('joinAck', {
            sessionToken: 'tok',
            playerId: null,
            view: spectatorView(1),
            tick: 1,
            players: [
                { id: TEST_PLAYER_1, displayName: 'Nova' },
                { id: TEST_PLAYER_2, displayName: 'Orion' },
            ],
        });
        const attached = applySpectatorEnvelope(initialSpectatorState(MATCH), joinAck, NOW);
        const ticked = applySpectatorEnvelope(attached, envelope('tick', { tick: 2, view: spectatorView(2) }), NOW);
        expect(ticked.session.participants).toEqual(attached.session.participants);
        expect(ticked.session.playerId).toBeNull();
        expect(ticked.latestView?.tick).toBe(2);
    });
});
