/**
 * Connection-state translation — Feature 005 (T030).
 *
 * Maps feature 004's `ConnectionState` union onto the console's
 * UI-facing `ConsoleConnectionStatus` union (spec US5 AC-3).
 *
 * ⚠️ ADAPTED TO THE SHIPPED FEATURE 004 UNION (PM directive: verify
 * real export names / shapes before importing). The task text's
 * mapping table was written against the spec draft, which imagined
 * `connecting` / `live` / `reconnecting` / `spectating` members. The
 * shipped `@europa/networking` `ConnectionState` is:
 *
 *     'pending' | 'greeted' | 'joined' | 'rejoined'
 *   | 'disconnected' | 'expired' | 'terminal' | 'closed'
 *
 * The faithful mapping (console-types.ts §"Connection status" prose):
 *
 *   ConnectionState    ConsoleConnectionStatus   Rationale
 *   ───────────────    ──────────────────────    ──────────────────────
 *   'pending'      →   'connecting'          WS open, no hello yet
 *   'greeted'      →   'connecting'          hello done, join pending
 *   'joined'       →   'live'                ticks flowing, input on
 *   'rejoined'     →   'live'                resync then ticks flow
 *   'disconnected' →   'reconnecting'        socket lost; auto-reconnect
 *                                            in progress (US5 AC-3)
 *   'expired'      →   'expired'             grace window elapsed
 *   'terminal'     →   'game_over'           MatchResult delivered
 *   'closed'       →   'closed'              explicit close
 *
 * `'idle'` and `'spectating'` are console-local statuses that are NOT
 * derivable from a `ConnectionState`: 'idle' precedes the first
 * connect() and 'spectating' comes from the seat role (a spectator's
 * connection state is 'joined'), so the runtime layers them on top of
 * this mapping.
 */

import type { ConnectionState, ConsoleConnectionStatus } from '../state/types';

/**
 * Translate the server-side connection state into the console status
 * the UI renders (banner / spinner / input lock). Exhaustive over the
 * shipped networking union — adding a member there without a case
 * here is a compile error. Pure.
 *
 * @param state Feature 004 connection state.
 * @returns The console-facing status.
 */
export function consoleStatusFromConnectionState(state: ConnectionState): ConsoleConnectionStatus {
    switch (state) {
        case 'pending':
        case 'greeted':
            return 'connecting';
        case 'joined':
        case 'rejoined':
            return 'live';
        case 'disconnected':
            return 'reconnecting';
        case 'expired':
            return 'expired';
        case 'terminal':
            return 'game_over';
        case 'closed':
            return 'closed';
        default:
            return state;
    }
}
