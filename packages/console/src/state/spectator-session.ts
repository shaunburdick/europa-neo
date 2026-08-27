/**
 * Spectator session fold — feature 010 (T-016, US4 AC-2 / FR-012 /
 * FR-023 / SC-005).
 *
 * Pure state transitions for LOBBY-INITIATED SPECTATOR legs. A
 * spectator rides the existing feature-004 wire exactly like a player
 * (`joinMatch` with `role: 'spectator'` → full-visibility views in
 * `joinAck`/`tick` payloads — fog's `{ spectator: true }` branch,
 * computed server-side), but it must never reach the PLAYER reducer:
 * that machine's `joined` arm demands a seat and flips input live.
 * Instead this module folds the same envelopes into a
 * {@link ConsoleState}-shaped snapshot that the existing App renders
 * STATICALLY (no store): with no store there are no input controllers,
 * no order bridge, and no `sendOrder` sink — read-only by
 * CONSTRUCTION, not by hiding (SC-005 zero accepted orders).
 *
 * Status mapping (existing `ConsoleConnectionStatus` union, unchanged):
 * `'connecting'` → `'spectating'` on attach → `'game_over'` on
 * terminal; transport loss after attach reads `'reconnecting'`. The
 * reducer's `inputEnabled ⟺ status === 'live'` invariant is preserved
 * vacuously — this snapshot never holds `'live'`.
 *
 * Authority + privacy rules mirrored from the player path:
 *   - names come only from the server's `players` array (FR-023:
 *     spectators MAY see all participant handles), stored ascending in
 *     `session.opponents` so {@link ./seat-labels} renders them;
 *   - `playerId` stays `null` forever (a spectator joinAck whose
 *     `playerId` is non-null is IGNORED defensively — a spectator
 *     connection never adopts a seat);
 *   - the bearer `sessionToken` is deliberately NOT copied into the
 *     render-state session (v1 spectators do not reconnect; the token
 *     never enters the render tree).
 *
 * Purity: no I/O, no clocks — `nowMs` arrives per call (the sanctioned
 * UI boundary), mirroring the player reducer's discipline.
 */

import { DEFAULT_CAMERA, DEFAULT_QOL_SETTINGS } from '../config';
import { appendFeedback } from './reducer';
import type { ConsoleState, FeedbackMessage, MatchId, NetworkPayload, PlayerView, ProtocolEnvelope } from './types';

/** Documented-cast alias: the join ack payload (per networking contract). */
type JoinAckPayload = Extract<NetworkPayload, { readonly sessionToken: string }>;
/** Documented-cast alias: tick/snapshot view payloads. */
type ViewPayload = Extract<NetworkPayload, { readonly view: unknown; readonly tick: number }>;
/** Documented-cast alias: terminal result payload. */
type TerminalPayload = Extract<NetworkPayload, { readonly result: import('@europa/engine').MatchResult }>;
/** Documented-cast alias: error payload. */
type ErrorPayload = Extract<NetworkPayload, { readonly code: string }>;

/**
 * Seed state for a spectator leg: connecting to `matchId`, no seat, no
 * view yet. Pure.
 *
 * @param matchId The target match.
 */
export function initialSpectatorState(matchId: MatchId): ConsoleState {
    return {
        status: 'connecting',
        latestView: null,
        initialWorld: null,
        camera: DEFAULT_CAMERA,
        hover: null,
        selection: null,
        lastCursorScreen: null,
        feedback: [],
        rejectedOrders: [],
        qol: DEFAULT_QOL_SETTINGS,
        session: {
            matchId,
            sessionToken: null,
            playerId: null,
            displayName: '',
            opponents: [],
        },
        inputEnabled: false,
        exclusiveMode: false,
    };
}

/**
 * Fold one inbound wire envelope into the next spectator snapshot.
 * Pure modulo `nowMs` (feedback timestamps). Unknown/irrelevant kinds
 * return the SAME state reference (cheap React bail-out).
 *
 * @param state Current spectator snapshot.
 * @param envelope Inbound envelope from the match adapter.
 * @param nowMs Monotonic clock reading for feedback stamps.
 */
export function applySpectatorEnvelope(
    state: ConsoleState,
    envelope: ProtocolEnvelope<NetworkPayload>,
    nowMs: number,
): ConsoleState {
    switch (envelope.type) {
        case 'joinAck': {
            const payload = envelope.payload as JoinAckPayload;
            // Defensive seat guard: a SPECTATOR join ack carries playerId
            // null. Anything else is not ours to interpret — ignoring it
            // keeps the leg seatless by construction (US4 AC-2).
            if (payload.playerId !== null) {
                return state;
            }
            return {
                ...state,
                status: 'spectating',
                latestView: payload.view,
                session: {
                    ...state.session,
                    // FR-023: all participant handles, ascending seat order
                    // (the engine's players array is indexed by PlayerId - 1).
                    opponents: payload.players.map((player) => player.displayName),
                },
            };
        }

        case 'snapshot':
        case 'tick': {
            const payload = envelope.payload as ViewPayload;
            const view = payload.view as PlayerView;
            // Monotonic guard, same rule as the player reducer.
            if (state.latestView !== null && view.tick < state.latestView.tick) {
                return state;
            }
            return { ...state, latestView: view };
        }

        case 'terminal': {
            const payload = envelope.payload as TerminalPayload;
            return {
                ...state,
                status: 'game_over',
                feedback: appendFeedback(
                    state.feedback,
                    {
                        text: spectatorTerminalText(payload.result),
                        kind: 'info',
                        ttlMs: Number.MAX_SAFE_INTEGER,
                    },
                    nowMs,
                ),
            };
        }

        case 'error': {
            const payload = envelope.payload as ErrorPayload;
            return withNotice(state, `Match error (${payload.code}): ${payload.message}`, nowMs);
        }

        default:
            return state;
    }
}

/**
 * Translate a transport-loss transition into the snapshot: after the
 * spectator attached, a socket drop reads as `reconnecting` (the App's
 * existing banner explains the gap); any other post-attach state falls
 * back to `connecting`. Pre-attach and game-over states are returned
 * unchanged. Local closes never reach this fold (the leg is disposed
 * with its host). Pure.
 *
 * @param state Current spectator snapshot.
 * @param code WebSocket close code (1006 = transport loss).
 */
export function applySpectatorTransportLoss(state: ConsoleState, code: number): ConsoleState {
    if (state.status === 'game_over' || state.status === 'connecting') {
        return state;
    }
    return { ...state, status: code === 1006 ? 'reconnecting' : 'connecting' };
}

/**
 * Append an error notice to the snapshot's feedback queue (the App's
 * existing FR-007 surface). Pure modulo `nowMs`.
 *
 * @param state Current spectator snapshot.
 * @param text Human-readable notice.
 * @param nowMs Monotonic clock reading.
 */
export function withNotice(state: ConsoleState, text: string, nowMs: number): ConsoleState {
    const message: Omit<FeedbackMessage, 'id' | 'createdAtMs'> = {
        text,
        kind: 'error',
        ttlMs: Number.MAX_SAFE_INTEGER,
    };
    return { ...state, feedback: appendFeedback(state.feedback, message, nowMs) };
}

/**
 * One-line summary of a terminal result for the feedback surface.
 * Deliberately name-free (results carry no handles) and id-free.
 * Pure.
 *
 * @param result The engine's terminal match result.
 */
function spectatorTerminalText(result: import('@europa/engine').MatchResult): string {
    switch (result.kind) {
        case 'win':
            return `Match over — player ${String(result.winner)} wins.`;
        case 'draw':
            return 'Match over — draw.';
        default:
            return 'Match over.';
    }
}
