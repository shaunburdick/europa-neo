/**
 * Unit tests — awaiting-match-start derivation (post-playtest fix).
 *
 * Proves the pure predicate behind the waiting-for-opponent overlay
 * across every status transition and view shape:
 *   - only `status === 'live'` can await;
 *   - within 'live', a null view OR a tick-0 view (the unstarted
 *     join-snapshot fingerprint) awaits;
 *   - the first real tick broadcast (tick ≥ 1) clears it.
 *
 * Also proves the N-aware waiting copy added by 012 (FR-005) —
 * `formatWaitingMessage(k, N)` — across the exhaustive table of valid
 * (k, N) pairs (2: 1/2; 3: 1/3, 2/3; 4: 1/4, 2/4, 3/4), the hidden
 * k === N boundary, and that the `isAwaitingMatchStart` predicate is
 * unchanged by 012.
 *
 * The fixture views come from the shared deterministic builders
 * (tests/fixtures/player-view.ts, quickstart Q-U06). The expected copy
 * strings mirror specs/012-3-4-player-support/contracts/waiting-copy.ts.
 */

import { describe, expect, test } from 'vitest';

import { formatWaitingMessage, isAwaitingMatchStart } from '../../../src/state/awaiting-start';
import { INITIAL_CONSOLE_STATE } from '../../../src/state/reducer';
import type { ConsoleState } from '../../../src/state/types';
import { buildPlayerView } from '../../fixtures/player-view';

/** Seed a state with a given status + latest view. Pure. */
function withStatusView(status: ConsoleState['status'], view: ReturnType<typeof buildPlayerView> | null): ConsoleState {
    return {
        ...INITIAL_CONSOLE_STATE,
        status,
        inputEnabled: status === 'live',
        latestView: view,
    };
}

describe('isAwaitingMatchStart (waiting-for-opponent derivation)', () => {
    test('non-live statuses never await — even with no view at all', () => {
        const statuses: readonly ConsoleState['status'][] = [
            'idle',
            'connecting',
            'reconnecting',
            'expired',
            'spectating',
            'game_over',
            'closed',
        ];
        for (const status of statuses) {
            expect(isAwaitingMatchStart(withStatusView(status, null))).toBe(false);
        }
    });

    test('live with no PlayerView yet awaits (defensive viewless-live path)', () => {
        expect(isAwaitingMatchStart(withStatusView('live', null))).toBe(true);
    });

    test('live with the tick-0 join snapshot awaits (match still filling)', () => {
        const snapshot = buildPlayerView({ width: 32, height: 32, tick: 0 });
        expect(isAwaitingMatchStart(withStatusView('live', snapshot))).toBe(true);
    });

    test('the first tick broadcast (tick ≥ 1) clears the await', () => {
        for (const tick of [1, 2, 42]) {
            const view = buildPlayerView({ width: 32, height: 32, tick });
            expect(isAwaitingMatchStart(withStatusView('live', view))).toBe(false);
        }
    });

    test('a mid-match join snapshot (tick > 0) never awaits', () => {
        const snapshot = buildPlayerView({ width: 32, height: 32, tick: 137 });
        expect(isAwaitingMatchStart(withStatusView('live', snapshot))).toBe(false);
    });

    test('transition sequence: joined → waiting → started → disconnected', () => {
        // Boot: connecting, nothing received.
        let state = withStatusView('connecting', null);
        expect(isAwaitingMatchStart(state)).toBe(false);

        // Join accepted while filling: live + tick-0 snapshot → waiting.
        state = withStatusView('live', buildPlayerView({ width: 32, height: 32, tick: 0 }));
        expect(isAwaitingMatchStart(state)).toBe(true);

        // Auto-start fired: first broadcast arrives → overlay hides.
        state = withStatusView('live', buildPlayerView({ width: 32, height: 32, tick: 1 }));
        expect(isAwaitingMatchStart(state)).toBe(false);

        // Transport loss: reconnecting banner owns the UI, not the overlay.
        state = { ...state, status: 'reconnecting' };
        expect(isAwaitingMatchStart(state)).toBe(false);
    });

    test('initial console state does not await (idle)', () => {
        expect(isAwaitingMatchStart(INITIAL_CONSOLE_STATE)).toBe(false);
    });
});

describe('formatWaitingMessage (N-aware waiting copy, 012 FR-005)', () => {
    // Exhaustive table over every valid (k, N) pair the overlay can render
    // while a room is still filling (1 ≤ k < N). Mirrors the contract in
    // specs/012-3-4-player-support/contracts/waiting-copy.ts:
    //   remaining === 1 → singular "player"; remaining > 1 → plural "players".
    const cases: ReadonlyArray<{ readonly seatsFilled: number; readonly capacity: number; readonly expected: string }> =
        [
            // N = 2
            { seatsFilled: 1, capacity: 2, expected: 'Waiting for 1 more player… (1/2)' },
            // N = 3
            { seatsFilled: 1, capacity: 3, expected: 'Waiting for 2 more players… (1/3)' },
            { seatsFilled: 2, capacity: 3, expected: 'Waiting for 1 more player… (2/3)' },
            // N = 4
            { seatsFilled: 1, capacity: 4, expected: 'Waiting for 3 more players… (1/4)' },
            { seatsFilled: 2, capacity: 4, expected: 'Waiting for 2 more players… (2/4)' },
            { seatsFilled: 3, capacity: 4, expected: 'Waiting for 1 more player… (3/4)' },
        ];

    for (const { seatsFilled, capacity, expected } of cases) {
        test(`renders "${expected}" for ${seatsFilled}/${capacity}`, () => {
            expect(formatWaitingMessage(seatsFilled, capacity)).toBe(expected);
        });
    }

    test('singular/plural boundary: remaining === 1 uses singular "player"', () => {
        // The three singular cases (remaining === 1) are (1,2), (2,3), (3,4).
        expect(formatWaitingMessage(1, 2)).toBe('Waiting for 1 more player… (1/2)');
        expect(formatWaitingMessage(2, 3)).toBe('Waiting for 1 more player… (2/3)');
        expect(formatWaitingMessage(3, 4)).toBe('Waiting for 1 more player… (3/4)');
    });

    test('plural cases use "players" for remaining > 1', () => {
        expect(formatWaitingMessage(1, 3)).toBe('Waiting for 2 more players… (1/3)');
        expect(formatWaitingMessage(1, 4)).toBe('Waiting for 3 more players… (1/4)');
        expect(formatWaitingMessage(2, 4)).toBe('Waiting for 2 more players… (2/4)');
    });

    test('edge k === N is hidden by the overlay (never rendered) but deterministic', () => {
        // The contract requires 1 ≤ k < N. At k === N the room is full and
        // matchmaking auto-start fires, so the overlay self-hides and never
        // calls formatWaitingMessage. We still lock the boundary output for
        // regression completeness — it must stay a pure, deterministic string.
        expect(formatWaitingMessage(2, 2)).toBe('Waiting for 0 more players… (2/2)');
        expect(formatWaitingMessage(3, 3)).toBe('Waiting for 0 more players… (3/3)');
        expect(formatWaitingMessage(4, 4)).toBe('Waiting for 0 more players… (4/4)');
    });
});

describe('isAwaitingMatchStart contract unchanged (005 item 11; 012 is additive)', () => {
    test('predicate equivalence: status==="live" && (view===null || tick===0)', () => {
        // 012 adds formatWaitingMessage only; it must NOT alter the predicate.
        // Re-assert the exact contract from the spec / contract mirror so a
        // future edit cannot silently change the overlay trigger.
        const liveNull = withStatusView('live', null);
        expect(isAwaitingMatchStart(liveNull)).toBe(true);

        const liveTick0 = withStatusView('live', buildPlayerView({ width: 32, height: 32, tick: 0 }));
        expect(isAwaitingMatchStart(liveTick0)).toBe(true);

        const liveTick1 = withStatusView('live', buildPlayerView({ width: 32, height: 32, tick: 1 }));
        expect(isAwaitingMatchStart(liveTick1)).toBe(false);

        const idleNull = withStatusView('idle', null);
        expect(isAwaitingMatchStart(idleNull)).toBe(false);
    });
});
