/**
 * Spectator session fold unit tests — feature 010 (T-016, US4 AC-2 /
 * FR-023 / SC-005).
 *
 * Pins the pure envelope → snapshot transitions for lobby-initiated
 * spectator legs: attach (status + full view + all handles), tick
 * monotonicity, terminal, error notices, transport loss, and the
 * defensive seat guard. Also proves the privacy/authority invariants:
 * the bearer sessionToken never enters render state and `playerId`
 * stays null forever.
 */

import { describe, expect, it } from 'vitest';
import {
    applySpectatorEnvelope,
    applySpectatorTransportLoss,
    initialSpectatorState,
    withNotice,
} from '../../../src/state/spectator-session';
import type { NetworkPayload, PlayerView, ProtocolEnvelope } from '../../../src/state/types';

const NOW = 5_000;
const MATCH = 'm-1' as import('../../../src/state/types').MatchId;

/** Minimal fog view at a tick (spectator views carry player 0 sentinel). */
function view(tick: number): PlayerView {
    return {
        player: 0,
        tick,
        visibleCells: [],
        events: { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
        config: { boardSize: 32, playerCount: 2, tickIntervalMs: 250, seed: 7, visibilityRadius: 4 },
    };
}

/** Engine-shaped players with authoritative display values. */
function players(): ReadonlyArray<{ readonly id: number; readonly displayName: string }> {
    return [
        { id: 1, displayName: 'Nova' },
        { id: 2, displayName: 'Orion' },
    ];
}

/** Wrap a payload into a wire envelope of the given kind. */
function envelope(type: string, payload: unknown): ProtocolEnvelope<NetworkPayload> {
    return { type, version: '1.0.0', seq: 1, payload } as unknown as ProtocolEnvelope<NetworkPayload>;
}

/** A spectator join ack: seatless, full view, authoritative names. */
function spectatorJoinAck(): ProtocolEnvelope<NetworkPayload> {
    return envelope('joinAck', {
        sessionToken: 'bearer-token-value',
        playerId: null,
        view: view(3),
        tick: 3,
        players: players(),
    });
}

describe('applySpectatorEnvelope', () => {
    it('starts connecting with no seat, no view, no token', () => {
        const state = initialSpectatorState(MATCH);
        expect(state.status).toBe('connecting');
        expect(state.latestView).toBeNull();
        expect(state.session.playerId).toBeNull();
        expect(state.session.sessionToken).toBeNull();
        expect(state.inputEnabled).toBe(false);
    });

    it('attach flips to spectating, installs the server view, and records ALL handles ascending', () => {
        const next = applySpectatorEnvelope(initialSpectatorState(MATCH), spectatorJoinAck(), NOW);
        expect(next.status).toBe('spectating');
        expect(next.latestView?.tick).toBe(3);
        expect(next.session.opponents).toEqual(['Nova', 'Orion']);
        // FR-024/NFR-003 posture: no seat is ever adopted.
        expect(next.session.playerId).toBeNull();
    });

    it('the bearer sessionToken never enters the render-state session', () => {
        const next = applySpectatorEnvelope(initialSpectatorState(MATCH), spectatorJoinAck(), NOW);
        expect(next.session.sessionToken).toBeNull();
    });

    it('a PLAYER join ack (non-null seat) is ignored — spectators never adopt seats', () => {
        const state = initialSpectatorState(MATCH);
        const playerJoin = envelope('joinAck', {
            sessionToken: 't',
            playerId: 1,
            view: view(9),
            tick: 9,
            players: players(),
        });
        expect(applySpectatorEnvelope(state, playerJoin, NOW)).toBe(state);
    });

    it('ticks install views monotonically; stale ticks are dropped', () => {
        let state = applySpectatorEnvelope(initialSpectatorState(MATCH), spectatorJoinAck(), NOW);
        state = applySpectatorEnvelope(state, envelope('tick', { tick: 4, view: view(4) }), NOW);
        expect(state.latestView?.tick).toBe(4);
        const stale = applySpectatorEnvelope(state, envelope('tick', { tick: 2, view: view(2) }), NOW);
        expect(stale).toBe(state);
    });

    it('terminal flips to game_over with a name-free notice', () => {
        let state = applySpectatorEnvelope(initialSpectatorState(MATCH), spectatorJoinAck(), NOW);
        state = applySpectatorEnvelope(
            state,
            envelope('terminal', { result: { kind: 'win', winner: 2, tick: 12, reason: 'last_standing' } }),
            NOW,
        );
        expect(state.status).toBe('game_over');
        expect(state.feedback.at(-1)?.text).toBe('Match over — player 2 wins.');
    });

    it('server errors land as feedback notices', () => {
        const next = applySpectatorEnvelope(
            initialSpectatorState(MATCH),
            envelope('error', { code: 'match_not_found', message: 'unknown match m-1' }),
            NOW,
        );
        expect(next.feedback.at(-1)?.kind).toBe('error');
        expect(next.feedback.at(-1)?.text).toContain('match_not_found');
    });
});

describe('applySpectatorTransportLoss', () => {
    it('maps a post-attach drop to reconnecting', () => {
        let state = applySpectatorEnvelope(initialSpectatorState(MATCH), spectatorJoinAck(), NOW);
        state = applySpectatorTransportLoss(state, 1006);
        expect(state.status).toBe('reconnecting');
    });

    it('leaves pre-attach and game-over states alone', () => {
        const fresh = initialSpectatorState(MATCH);
        expect(applySpectatorTransportLoss(fresh, 1006)).toBe(fresh);
        const over = applySpectatorEnvelope(initialSpectatorState(MATCH), spectatorJoinAck(), NOW);
        const done = applySpectatorEnvelope(
            over,
            envelope('terminal', { result: { kind: 'draw', tick: 12, reason: 'mutual_elimination' } }),
            NOW,
        );
        expect(applySpectatorTransportLoss(done, 1006)).toBe(done);
    });
});

describe('withNotice', () => {
    it('appends an error notice without touching other fields', () => {
        const state = initialSpectatorState(MATCH);
        const next = withNotice(state, 'Could not attach to the match.', NOW);
        expect(next.feedback).toHaveLength(1);
        expect(next.feedback[0]?.text).toBe('Could not attach to the match.');
        expect(next.status).toBe(state.status);
        expect(next.session).toEqual(state.session);
    });
});
