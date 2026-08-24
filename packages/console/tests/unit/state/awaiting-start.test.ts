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
 * The fixture views come from the shared deterministic builders
 * (tests/fixtures/player-view.ts, quickstart Q-U06).
 */

import { describe, expect, test } from 'vitest';

import { isAwaitingMatchStart } from '../../../src/state/awaiting-start';
import { INITIAL_CONSOLE_STATE } from '../../../src/state/reducer';
import type { ConsoleState } from '../../../src/state/types';
import { buildPlayerView } from '../../fixtures/player-view';

/** Seed a state with a given status + latest view. Pure. */
function withStatusView(
  status: ConsoleState['status'],
  view: ReturnType<typeof buildPlayerView> | null,
): ConsoleState {
  return {
    ...INITIAL_CONSOLE_STATE,
    status,
    inputEnabled: status === 'live',
    latestView: view,
  };
}

describe('isAwaitingMatchStart (waiting-for-opponent derivation)', () => {
  test('non-live statuses never await — even with no view at all', () => {
    const statuses: ReadonlyArray<ConsoleState['status']> = [
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
