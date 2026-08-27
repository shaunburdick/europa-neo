/**
 * The pure console reducer — Feature 005 (T022).
 *
 * Single source of state transitions (data-model.md §1): folds
 * `ConsoleAction`s — every `PlayerAction` gesture plus every
 * `NetEvent` from the network adapter — into the next immutable
 * `ConsoleState`, returning any side effects for the runtime to
 * apply. The reducer never performs I/O itself.
 *
 * Guarantees enforced here (data-model.md §1 "Validation rules"):
 *   - `latestView.tick` is monotonically non-decreasing; out-of-order
 *     ticks are dropped silently (spec edge case).
 *   - `inputEnabled === (status === 'live')` after EVERY reduce step.
 *   - `feedback` is TTL-lazy-cleaned on entry and FIFO-evicted at
 *     `CONSOLE_CONSTANTS.maxFeedbackMessages`.
 *   - `rejectedOrders` is FIFO-evicted at
 *     `CONSOLE_CONSTANTS.maxRejectedOrders`.
 *
 * Purity: no wall-clock reads — time arrives via `ReduceOptions.nowMs`
 * (the store's `performance.now()` default is the sanctioned UI
 * boundary). The only module-level mutable state is the ActionId
 * counter and its pending-order bookkeeping, both console-internal
 * correlation concerns documented below (mirroring the runtime's
 * seq↔actionId map at the network boundary).
 *
 * JSDoc references: FR-001 (fog-filtered rendering input), FR-002
 * (region pipe orders), FR-003 (subcell targeting), FR-004 (reserves),
 * FR-005 (surrender), FR-006 (server-authoritative orders), FR-007
 * (feedback + announcements), FR-008 (reconnect), FR-009 (connection
 * status surface), FR-010 (spectator read-only), FR-011 (QoL).
 */

import { CONSOLE_CONSTANTS, DEFAULT_CAMERA, DEFAULT_QOL_SETTINGS } from '../config';
import { actionToOrder } from './action-to-order';
import { formatActionConfirmation, formatRejection } from './format';
import type {
    ActionId,
    ConsoleAction,
    ConsoleState,
    FeedbackMessage,
    Order,
    PlayerAction,
    ReduceOptions,
    ReducerEffect,
    RejectedOrder,
} from './types';

// ----------------------------------------------------------------------------
// Internal bookkeeping (console-owned correlation state)
// ----------------------------------------------------------------------------

/**
 * Internal: monotonically increasing ActionId source. Console-internal
 * counter, distinct from networking's `SequenceNumber` (the runtime
 * maps between them at the network boundary). Starts at 1 so id 0 is
 * never issued (falsy-id bugs are a classic).
 */
let lastActionId = 0;

/**
 * Internal: orders awaiting their `orderAck`, keyed by ActionId.
 * The contract's `RejectedOrder.order` field requires the original
 * order at rejection time, but `ConsoleState` deliberately carries no
 * pending-order map (fixed contractual shape) — so the reducer keeps
 * this bounded correlation table, exactly like the runtime keeps
 * `seqToActionId`. Capped well above `maxRejectedOrders`; entries are
 * removed on ack.
 */
const pendingOrders = new Map<ActionId, Order>();

/** Cap for {@link pendingOrders} to bound module-level memory. */
const PENDING_ORDERS_CAP = 64;

/**
 * Allocate the next ActionId and register its order for ack
 * correlation. Module-internal; not part of the public surface.
 */
function stampOrder(order: Order): { readonly actionId: ActionId; readonly order: Order } {
    lastActionId += 1;
    const actionId = lastActionId as ActionId;
    pendingOrders.set(actionId, order);
    // Bound the table: drop the oldest entries beyond the cap.
    while (pendingOrders.size > PENDING_ORDERS_CAP) {
        const oldest = pendingOrders.keys().next();
        if (oldest.done === true) {
            break;
        }
        pendingOrders.delete(oldest.value);
    }
    return { actionId, order };
}

/**
 * Take a pending order out of the correlation table (ack received).
 */
function takePendingOrder(actionId: ActionId): Order | undefined {
    const order = pendingOrders.get(actionId);
    pendingOrders.delete(actionId);
    return order;
}

/**
 * Allocate a globally-unique ActionId for orders issued OUTSIDE the
 * reducer — the runtime's `Console.sendOrder(order)` wire path
 * (T087). Shares the reducer's {@link lastActionId} counter so a
 * host-issued id can never collide with a gesture-issued id in the
 * seq→ActionId ack-correlation chain (T031/T056).
 *
 * Host-issued ids are deliberately NOT registered in
 * {@link pendingOrders}: there is no PlayerAction feedback path for
 * them, so their acks produce feedback messages only (the reducer's
 * orderAck arm handles unknown ids gracefully — see FR-007).
 *
 * @returns A fresh, never-before-issued ActionId.
 */
export function allocateActionId(): ActionId {
    lastActionId += 1;
    return lastActionId as ActionId;
}

// ----------------------------------------------------------------------------
// Initial state
// ----------------------------------------------------------------------------

/**
 * The initial console state (data-model.md §1). Used by the runtime
 * before the first `reduce` call; exposed so tests can compare.
 */
export const INITIAL_CONSOLE_STATE: ConsoleState = {
    status: 'idle',
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
        matchId: null,
        sessionToken: null,
        playerId: null,
        displayName: '',
        opponents: [],
    },
    inputEnabled: false,
    exclusiveMode: false,
};

// ----------------------------------------------------------------------------
// Feedback helpers (also exercised directly by tests)
// ----------------------------------------------------------------------------

/**
 * Append a feedback message with a fresh id + creation timestamp,
 * evicting expired entries first and FIFO-evicting beyond
 * `CONSOLE_CONSTANTS.maxFeedbackMessages`. Pure modulo `nowMs`.
 *
 * @param current Existing feedback queue.
 * @param message Message fields minus id/createdAtMs.
 * @param nowMs Monotonic clock reading.
 */
export function appendFeedback(
    current: readonly FeedbackMessage[],
    message: Omit<FeedbackMessage, 'id' | 'createdAtMs'>,
    nowMs: number,
): readonly FeedbackMessage[] {
    const live = current.filter((m) => nowMs - m.createdAtMs <= m.ttlMs);
    const appended: FeedbackMessage = {
        ...message,
        id: `fb-${nowMs}-${live.length}-${message.text.length}`,
        createdAtMs: nowMs,
    };
    const next = [...live, appended];
    return next.slice(-CONSOLE_CONSTANTS.maxFeedbackMessages);
}

/**
 * Record a rejected order, capped at the most recent
 * `CONSOLE_CONSTANTS.maxRejectedOrders` entries (FIFO eviction).
 * Pure modulo `nowMs`.
 *
 * @param current Existing rejection history.
 * @param rejection Rejection fields minus atMs.
 * @param nowMs Monotonic clock reading.
 */
export function appendRejection(
    current: readonly RejectedOrder[],
    rejection: Omit<RejectedOrder, 'atMs'>,
    nowMs: number,
): readonly RejectedOrder[] {
    const next = [...current, { ...rejection, atMs: nowMs }];
    return next.slice(-CONSOLE_CONSTANTS.maxRejectedOrders);
}

// ----------------------------------------------------------------------------
// Action discrimination
// ----------------------------------------------------------------------------

/**
 * Every `NetEvent` discriminant (contracts/console-state.ts union).
 * Kept as an explicit union so `Extract` narrows precisely; adding a
 * NetEvent variant without updating this union is a compile error at
 * the reducer's switch (exhaustiveness guard).
 */
type NetEventKind =
    | 'connecting'
    | 'helloAck'
    | 'joined'
    | 'reconnected'
    | 'tick'
    | 'orderAck'
    | 'terminal'
    | 'pong'
    | 'error'
    | 'socketClosed'
    | 'reconnecting';

/** Runtime discriminant set mirroring {@link NetEventKind}. */
const NET_EVENT_KINDS: ReadonlySet<NetEventKind> = new Set([
    'connecting',
    'helloAck',
    'joined',
    'reconnected',
    'tick',
    'orderAck',
    'terminal',
    'pong',
    'error',
    'socketClosed',
    'reconnecting',
]);

/** The NetEvent side of the ConsoleAction union. */
type NetEvent = Extract<ConsoleAction, { readonly kind: NetEventKind }>;

/**
 * Type guard discriminating NetEvent variants from PlayerAction
 * variants inside the ConsoleAction union. NetEvents carry `kind`
 * values that no PlayerAction uses, so the discriminant set is exact.
 */
function isNetEvent(action: ConsoleAction): action is NetEvent {
    return NET_EVENT_KINDS.has(action.kind as NetEventKind);
}

// ----------------------------------------------------------------------------
// The reducer
// ----------------------------------------------------------------------------

/**
 * Advance the console state by one action. Pure (see module JSDoc).
 *
 * @param state Current state (seed from {@link INITIAL_CONSOLE_STATE}).
 * @param action A player gesture or a network event.
 * @param options Clock injection (`nowMs`) — required.
 * @returns The next state plus side effects for the runtime.
 */
export function reduce(
    state: ConsoleState,
    action: ConsoleAction,
    options: ReduceOptions,
): { readonly state: ConsoleState; readonly effects: readonly ReducerEffect[] } {
    const { nowMs } = options;

    // Lazy TTL cleanup first: expired feedback disappears on the next
    // dispatch after its ttl elapses (data-model.md §7 lifecycle).
    const baseState: ConsoleState = {
        ...state,
        feedback: state.feedback.filter((m) => nowMs - m.createdAtMs <= m.ttlMs),
    };

    const partial = isNetEvent(action)
        ? reduceNetEvent(baseState, action, nowMs)
        : reducePlayerAction(baseState, action, nowMs);

    // Invariant (data-model.md §17): inputEnabled ⟺ status === 'live'.
    const nextState: ConsoleState = {
        ...partial.state,
        inputEnabled: partial.state.status === 'live',
    };

    return { state: nextState, effects: partial.effects };
}

// ----------------------------------------------------------------------------
// PlayerAction branch
// ----------------------------------------------------------------------------

/**
 * Handle a PlayerAction. Order-producing gestures require live input:
 * when `status !== 'live'` they are dropped defensively (the input
 * layer should already gate them — FR-006/FR-010). Local-only gestures
 * are always legal.
 */
function reducePlayerAction(
    state: ConsoleState,
    action: PlayerAction,
    nowMs: number,
): { readonly state: ConsoleState; readonly effects: readonly ReducerEffect[] } {
    switch (action.kind) {
        // --- Order-producing gestures (FR-002..FR-006) ---
        case 'setPipe':
        case 'clearPipe':
        case 'setPipesExclusive':
        case 'clearAllPipes':
        case 'setReserves':
        case 'paratroop':
        case 'gun':
        case 'surrender': {
            if (state.status !== 'live') {
                return { state, effects: [] };
            }
            const { playerId } = state.session;
            if (playerId === null) {
                return { state, effects: [] };
            }
            const order = actionToOrder(action, playerId, state.session);
            if (order === null) {
                return { state, effects: [] };
            }
            const stamped = stampOrder(order);
            const text = formatActionConfirmation(action, orderCellOf(action));
            return {
                state: {
                    ...state,
                    feedback: appendFeedback(
                        state.feedback,
                        { text, kind: 'info', ttlMs: CONSOLE_CONSTANTS.feedbackTtlMs },
                        nowMs,
                    ),
                },
                effects: [
                    { kind: 'sendOrder', actionId: stamped.actionId, order: stamped.order },
                    { kind: 'announce', text, politeness: 'polite' },
                ],
            };
        }

        // --- Local-only gestures ---
        case 'selectCell':
            return { state: { ...state, selection: action.cell }, effects: [] };
        case 'hoverCell':
            return { state: { ...state, hover: action.cell }, effects: [] };
        case 'setCamera':
            return { state: { ...state, camera: action.camera }, effects: [] };
        case 'setQol': {
            const qol = { ...state.qol, ...action.patch };
            return {
                state: { ...state, qol },
                effects: [{ kind: 'persistQol', settings: qol }],
            };
        }
        case 'setExclusiveMode':
            return { state: { ...state, exclusiveMode: action.enabled }, effects: [] };

        // Exhaustiveness guard: an unhandled PlayerAction variant fails
        // to compile here (never is assignable to the return type).
        default:
            return action;
    }
}

/**
 * Best-effort cell extraction for confirmation messages (paratroop/
 * gun confirmations cite the source cell; surrender cites nothing).
 * Pure.
 */
function orderCellOf(action: PlayerAction): import('@europa/engine').Coord {
    switch (action.kind) {
        case 'paratroop':
        case 'gun':
            return action.source;
        case 'surrender':
        case 'selectCell':
        case 'hoverCell':
        case 'setCamera':
        case 'setQol':
        case 'setExclusiveMode':
            return { x: 0, y: 0 };
        default:
            return action.cell;
    }
}

// ----------------------------------------------------------------------------
// NetEvent branch
// ----------------------------------------------------------------------------

/**
 * Handle a NetEvent (FR-007..FR-010). Each variant mirrors the wire
 * mapping in data-model.md §12.
 */
function reduceNetEvent(
    state: ConsoleState,
    event: NetEvent,
    nowMs: number,
): { readonly state: ConsoleState; readonly effects: readonly ReducerEffect[] } {
    switch (event.kind) {
        case 'connecting':
            return {
                state: {
                    ...state,
                    status: 'connecting',
                    session: { ...state.session, matchId: event.matchId },
                },
                effects: [],
            };

        case 'helloAck':
            // Handshake done; still awaiting join → stays 'connecting'.
            return { state, effects: [] };

        case 'joined': {
            // Feature 010 (T-016, FR-020): the local seat's label is the
            // SERVER's own echo of this player's accepted handle (the
            // players array entry at our assigned seat) — never a
            // client-side assertion. Falls back to the prior value when
            // the server omits the entry.
            const ownName = event.players.find((player) => player.id === event.playerId)?.displayName;
            return {
                state: {
                    ...state,
                    status: 'live',
                    latestView: event.view,
                    session: {
                        ...state.session,
                        sessionToken: event.sessionToken,
                        playerId: event.playerId,
                        displayName: ownName ?? state.session.displayName,
                        opponents: event.players.filter((p) => p.id !== event.playerId).map((p) => p.displayName),
                    },
                },
                effects: [],
            };
        }

        case 'reconnected':
            return {
                state: { ...state, status: 'live', latestView: event.view },
                effects: [{ kind: 'announce', text: 'Reconnected to match', politeness: 'polite' }],
            };

        case 'tick': {
            // Monotonic non-decreasing guard: drop out-of-order ticks.
            if (state.latestView !== null && event.view.tick < state.latestView.tick) {
                return { state, effects: [] };
            }
            return { state: { ...state, latestView: event.view }, effects: [] };
        }

        case 'orderAck': {
            if (event.result.ok) {
                takePendingOrder(event.actionId);
                return {
                    state: {
                        ...state,
                        feedback: appendFeedback(
                            state.feedback,
                            {
                                text: 'Order acknowledged',
                                kind: 'success',
                                ttlMs: CONSOLE_CONSTANTS.feedbackTtlMs,
                            },
                            nowMs,
                        ),
                    },
                    effects: [],
                };
            }
            const rejectedOrder = takePendingOrder(event.actionId);
            const { reason } = event.result;
            const text = formatRejection(reason);
            const withRejection: ConsoleState =
                rejectedOrder === undefined
                    ? state
                    : {
                          ...state,
                          rejectedOrders: appendRejection(
                              state.rejectedOrders,
                              {
                                  actionId: event.actionId,
                                  order: rejectedOrder,
                                  reason,
                                  atTick: state.latestView?.tick ?? 0,
                              },
                              nowMs,
                          ),
                      };
            return {
                state: {
                    ...withRejection,
                    feedback: appendFeedback(
                        withRejection.feedback,
                        { text, kind: 'warning', ttlMs: CONSOLE_CONSTANTS.feedbackTtlMs },
                        nowMs,
                    ),
                },
                effects: [{ kind: 'announce', text, politeness: 'assertive' }],
            };
        }

        case 'terminal':
            return {
                state: { ...state, status: 'game_over' },
                effects: [{ kind: 'announce', text: 'Match over', politeness: 'assertive' }],
            };

        case 'pong':
            // Heartbeat echo carries no UI state change.
            return { state, effects: [] };

        case 'error': {
            const text = `Connection error (${event.code}): ${event.message}`;
            return {
                state: {
                    ...state,
                    feedback: appendFeedback(
                        state.feedback,
                        { text, kind: 'error', ttlMs: CONSOLE_CONSTANTS.feedbackTtlMs },
                        nowMs,
                    ),
                },
                effects: [{ kind: 'announce', text, politeness: 'assertive' }],
            };
        }

        case 'socketClosed':
            // Auto-reconnect is on by default (US5 AC-3); surface the gap.
            return { state: { ...state, status: 'reconnecting' }, effects: [] };

        case 'reconnecting':
            return {
                state: { ...state, status: 'reconnecting' },
                effects: [{ kind: 'scheduleReconnect', delayMs: event.nextRetryMs }],
            };

        // Exhaustiveness guard over the NetEvent union.
        default:
            return event;
    }
}
