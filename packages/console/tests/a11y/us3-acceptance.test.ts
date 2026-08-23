/**
 * US3 a11y acceptance test — Feature 005 (T059).
 *
 * Covers Q-A05 (US3 portion): boots the interactive console and
 * asserts:
 *   (a) the targeting overlay announces its aim via an
 *       `aria-live="polite"` status node ("Paratroop target: (x, y)");
 *   (b) the announcement cites the focused cell (no-launch posture);
 *   (c) pressing `p` with the keyboard ONLY (no mouse motion ever)
 *       issues NO paratroop — the subcell defaults to center, which
 *       means no launch (research.md §13 ambiguity #3).
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { createElement } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';
import { FakeMatchClient } from '../../src/internal/fake-match-client';
import { App } from '../../src/render/App';
import { createOrderBridge } from '../../src/state/order-actions';
import { type ConsoleStore, createConsoleStore } from '../../src/state/store';
import type { Direction, ReducerEffect } from '../../src/state/types';
import { buildCellView, buildPlayerView } from '../fixtures/player-view';

/** Interactive boot result handed to each test. */
interface InteractiveBoot {
  readonly client: FakeMatchClient;
  readonly store: ConsoleStore;
}

/**
 * Boot the full interactive console against a small friendly board
 * (same shape as the US2 acceptance boot).
 */
async function bootInteractiveConsole(): Promise<InteractiveBoot> {
  const view = buildPlayerView({
    width: 10,
    height: 10,
    playerId: 1,
    visibleCells: [
      buildCellView({
        coord: { x: 5, y: 5 },
        elevation: 60,
        troops: 12,
        owner: 1,
        isCity: true,
        pipes: new Set<Direction>(['E']),
      }),
      buildCellView({ coord: { x: 5, y: 6 }, elevation: 45, troops: 3, owner: 1 }),
      buildCellView({ coord: { x: 4, y: 5 }, terrain: 'water' }),
    ],
  });
  const client = new FakeMatchClient();
  let forward: ((effect: ReducerEffect) => void) | null = null;
  const store = createConsoleStore(
    {
      status: 'live',
      inputEnabled: true,
      latestView: view,
      camera: { zoom: 32, pan: { x: 0, y: 0 }, minZoom: 12, maxZoom: 96 },
      hover: null,
      selection: null,
      lastCursorScreen: null,
      feedback: [],
      rejectedOrders: [],
      qol: {
        soundOn: false,
        animation: 'full',
        tooltips: true,
        theme: 'system',
        ownerColorRing: true,
      },
      session: {
        matchId: null,
        sessionToken: null,
        playerId: 1,
        displayName: 'Player 1',
        opponents: ['Player 2'],
      },
      exclusiveMode: false,
    },
    (effect) => {
      forward?.(effect);
    },
  );
  const bridge = createOrderBridge({ client, store });
  forward = (effect) => bridge.handleEffect(effect);

  await render(createElement(App, { store }));
  return { client, store };
}

afterEach(() => {
  cleanup();
});

/**
 * Dispatch a pointermove at fraction `(fx, fy)` of cell `(cx, cy)`
 * relative to the live board area (client coords are converted through
 * the element's bounding rect, mirroring real pointer input), then let
 * React commit the resulting state update.
 */
async function movePointerOver(cx: number, cy: number, fx: number, fy: number): Promise<void> {
  const boardArea = document.querySelector('.europa-board-area') as HTMLElement | null;
  expect(boardArea).not.toBeNull();
  const rect = (boardArea as HTMLElement).getBoundingClientRect();
  boardArea?.dispatchEvent(
    new PointerEvent('pointermove', {
      clientX: rect.left + (cx + fx) * 32,
      clientY: rect.top + (cy + fy) * 32,
      bubbles: true,
    }),
  );
  // Raw dispatchEvent bypasses React's event system; give the
  // scheduled render a macrotask to commit.
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('US3 a11y acceptance (T059)', () => {
  test('(a) overlay announces the binned target politely', async () => {
    const { store } = await bootInteractiveConsole();
    const user = userEvent.setup();

    // Establish the anchor via keyboard (Tab ×2 → grid, center cell).
    await user.keyboard('{Tab}');
    await user.keyboard('{Tab}');
    expect(store.getState().selection).toEqual({ x: 5, y: 5 });

    // Move the pointer into the NE ring-2 bin of the focused cell.
    await movePointerOver(5, 5, 0.85, 0.15);

    // The overlay's polite status node announces the projected target.
    const status = document.querySelector('.europa-targeting [role="status"]');
    expect(status).not.toBeNull();
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent).toBe('Paratroop target: (7, 3)');
  });

  test('(b) centered posture announces the focused cell (no launch)', async () => {
    await bootInteractiveConsole();
    const user = userEvent.setup();

    await user.keyboard('{Tab}');
    await user.keyboard('{Tab}');

    // Pointer rests at the exact center of the focused cell.
    await movePointerOver(5, 5, 0.5, 0.5);

    const status = document.querySelector('.europa-targeting [role="status"]');
    expect(status?.textContent).toBe('No launch — cursor centered on (5, 5)');
  });

  test('(c) keyboard-only `p` never launches (center default)', async () => {
    const { client } = await bootInteractiveConsole();
    const user = userEvent.setup();

    // Keyboard only: Tab to the grid (anchor established), then fire.
    await user.keyboard('{Tab}');
    await user.keyboard('{Tab}');
    await user.keyboard('p');

    // Subcell defaults to center without mouse motion → no launch,
    // nothing sent, nothing announced as an order confirmation.
    expect(client.orders).toHaveLength(0);
    const orderFeedback = Array.from(document.querySelectorAll('[data-europa-live]')).filter(
      (node) => node.textContent?.includes('Paratroop'),
    );
    expect(orderFeedback).toHaveLength(0);
  });
});
