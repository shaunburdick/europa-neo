/**
 * US4 a11y acceptance test — Feature 005 (T067).
 *
 * Covers Q-A05 (US4 portion) + WCAG 2.5.8 (Target Size — new in 2.2):
 *   (a) the 0-9 digit buttons are at least 24×24 CSS pixels;
 *   (b) the slider has a visible focus ring (≥ 3:1 contrast per
 *       WCAG 2.4.7 — white 2px outline on the #111827 chrome);
 *   (c) the `aria-live="polite"` region announces the new reserve
 *       value ("Reserved 70% at (5, 7)") after the digit gesture.
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
// The global stylesheet is loaded here so WCAG geometry assertions
// (target size, focus-ring outline) evaluate the REAL shipped styles.
import '../../src/styles/index.css';
import { buildCellView, buildPlayerView } from '../fixtures/player-view';

/** Interactive boot result handed to each test. */
interface InteractiveBoot {
  readonly store: ConsoleStore;
}

/**
 * Boot the full interactive console against a small friendly board
 * (same shape as the US2/US3 acceptance boots).
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
    ],
  });
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
  const client = new FakeMatchClient();
  const bridge = createOrderBridge({ client, store });
  forward = (effect) => bridge.handleEffect(effect);

  await render(createElement(App, { store }));
  return { store };
}

afterEach(() => {
  cleanup();
});

describe('US4 a11y acceptance (T067)', () => {
  test('(a) digit buttons meet the 24×24 CSS-pixel target minimum', async () => {
    await bootInteractiveConsole();
    const user = userEvent.setup();

    // Focus the grid and anchor on the friendly city cell.
    await user.keyboard('{Tab}');
    await user.keyboard('{Tab}');
    // The reserves panel renders for the focused cell.
    const digits = Array.from(document.querySelectorAll<HTMLElement>('.europa-reserves__digit'));
    expect(digits).toHaveLength(10);
    for (const button of digits) {
      const rect = button.getBoundingClientRect();
      expect(rect.width).toBeGreaterThanOrEqual(24);
      expect(rect.height).toBeGreaterThanOrEqual(24);
    }
  });

  test('(b) the slider shows a high-contrast focus ring when focused', async () => {
    await bootInteractiveConsole();
    const user = userEvent.setup();

    await user.keyboard('{Tab}');
    await user.keyboard('{Tab}');
    const slider = document.querySelector<HTMLInputElement>('#reserves-slider');
    expect(slider).not.toBeNull();
    const sliderNode = slider as HTMLInputElement;
    sliderNode.focus();
    const style = getComputedStyle(sliderNode);
    // White (#ffffff ≈ 16:1 on #111827) 2px outline — far above the
    // WCAG 2.4.7 3:1 minimum.
    expect(style.outlineStyle).not.toBe('none');
    expect(Number.parseInt(style.outlineWidth, 10)).toBeGreaterThanOrEqual(2);
    expect(style.outlineColor).toMatch(/255,\s*255,\s*255/);
  });

  test('(c) pressing 7 announces "Reserved 70% at (5, 5)" politely', async () => {
    await bootInteractiveConsole();
    const user = userEvent.setup();

    await user.keyboard('{Tab}');
    await user.keyboard('{Tab}');
    expect(document.querySelector('#reserves-slider')).not.toBeNull();
    await user.keyboard('7');

    const liveRegion = document.querySelector('#feedback [role="status"][aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.textContent).toContain('Reserved 70% at (5, 5)');
  });
});
