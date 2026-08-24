/**
 * HUD / screen-reader message formatting — Feature 005 (T027).
 *
 * Translates player actions and engine rejections into short,
 * jargon-free strings for the HUD feedback queue and aria-live
 * announcements (FR-007, data-model.md §7). Pure.
 */

import type { Coord, PlayerAction, ValidationError } from './types';

/**
 * Format the transient confirmation shown when an order-producing
 * action is dispatched ("Pipe N at (5, 7)", "Reserved 70% at (3, 4)").
 * Pure.
 *
 * @param action The dispatched action.
 * @param cell   The cell to cite (source cell for paratroop/gun;
 *               `{x:0,y:0}` placeholder for surrender, which cites
 *               no cell).
 */
export function formatActionConfirmation(action: PlayerAction, cell: Coord): string {
    const at = `(${cell.x}, ${cell.y})`;
    switch (action.kind) {
        case 'setPipe':
            return `Pipe ${action.direction} at ${at}`;
        case 'clearPipe':
            return `Clear pipe ${action.direction} at ${at}`;
        case 'setPipesExclusive':
            return `Exclusive pipe ${action.direction} at ${at}`;
        case 'clearAllPipes':
            return `Cleared all pipes at ${at}`;
        case 'setReserves':
            return `Reserved ${action.percent * 10}% at ${at}`;
        case 'paratroop':
            return `Paratroop (${action.source.x}, ${action.source.y}) → (${action.target.x}, ${action.target.y})`;
        case 'gun':
            return `Gun fire (${action.source.x}, ${action.source.y}) → (${action.target.x}, ${action.target.y})`;
        case 'surrender':
            return 'Surrender requested';
        case 'selectCell':
        case 'hoverCell':
        case 'setCamera':
        case 'setQol':
        case 'setExclusiveMode':
            return '';
    }
}

/**
 * Translate an engine `ValidationError` into a screen-reader-friendly
 * string (no engine jargon; FR-007). Every variant of the union is
 * handled — adding a variant without a message is a compile error.
 * Pure.
 */
export function formatRejection(reason: ValidationError): string {
    switch (reason.kind) {
        case 'out_of_bounds':
            return 'Target cell is off the board';
        case 'water_target':
            return "Can't target a water cell";
        case 'not_owner':
            return "You don't own that cell";
        case 'paratroop_range':
            return 'Target is out of range (max 2 cells)';
        case 'no_source_troops':
            return 'Source cell has no troops';
        case 'already_surrendered':
            return 'You have already surrendered';
        case 'invalid_percent':
            return 'Reserves must be between 0% and 90%';
        case 'unknown_player':
            return 'Unknown player';
        case 'match_terminal':
            return 'The match is already over';
        default:
            return reason;
    }
}
