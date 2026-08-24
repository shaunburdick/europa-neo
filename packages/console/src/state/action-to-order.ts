/**
 * PlayerAction → Order translation — Feature 005 (T023).
 *
 * Implements the mapping table from data-model.md §11: the eight
 * order-producing `PlayerAction` variants map 1:1 onto the engine's
 * `Order` union; the five local-only variants (`selectCell`,
 * `hoverCell`, `setCamera`, `setQol`, `setExclusiveMode`) produce no
 * order and return `null`.
 *
 * The console never constructs an `Order` anywhere else — this module
 * is the single gesture→wire translation point (spec US2/US3/US4),
 * which keeps the wire format testable without the net layer.
 *
 * Pure: no I/O, no clock reads, no mutation.
 */

import type { ConsoleSession, Order, PlayerAction, PlayerId } from './types';

/**
 * Translate a `PlayerAction` into the engine `Order` it produces.
 *
 * Returns `null` when:
 *   - the action is a local-only variant (no wire equivalent), or
 *   - the session is not seated (`session.playerId === null`, i.e.
 *     spectator / pre-join), or
 *   - the session's seat differs from the `playerId` the caller
 *     claims (defensive consistency check — orders are always
 *     stamped with the seated player's id).
 *
 * @param action   The player gesture to translate.
 * @param playerId The local player id the caller believes is seated.
 * @param session  Current console session (source of truth for seating).
 * @returns The engine `Order`, or `null` when no order should be sent.
 */
export function actionToOrder(action: PlayerAction, playerId: PlayerId, session: ConsoleSession): Order | null {
    // Spectators and pre-join sessions cannot produce orders (spec US3:
    // input suppressed outside 'live'; FR-006 server is final authority).
    if (session.playerId === null || session.playerId !== playerId) {
        return null;
    }

    switch (action.kind) {
        // --- Order-producing gestures (data-model.md §11 mapping table) ---
        case 'setPipe':
            return { kind: 'setPipe', player: playerId, cell: action.cell, direction: action.direction };
        case 'clearPipe':
            return {
                kind: 'clearPipe',
                player: playerId,
                cell: action.cell,
                direction: action.direction,
            };
        case 'setPipesExclusive':
            return {
                kind: 'setPipesExclusive',
                player: playerId,
                cell: action.cell,
                direction: action.direction,
            };
        case 'clearAllPipes':
            return { kind: 'clearAllPipes', player: playerId, cell: action.cell };
        case 'setReserves':
            return { kind: 'setReserves', player: playerId, cell: action.cell, percent: action.percent };
        case 'paratroop':
            return { kind: 'paratroop', player: playerId, source: action.source, target: action.target };
        case 'gun':
            return { kind: 'gun', player: playerId, source: action.source, target: action.target };
        case 'surrender':
            return { kind: 'surrender', player: playerId };

        // --- Local-only gestures (no wire equivalent) ---
        case 'selectCell':
        case 'hoverCell':
        case 'setCamera':
        case 'setQol':
        case 'setExclusiveMode':
            return null;

        // Exhaustiveness guard: adding a PlayerAction variant without a
        // case above is a compile error, not a silent drop.
        default:
            return action;
    }
}
