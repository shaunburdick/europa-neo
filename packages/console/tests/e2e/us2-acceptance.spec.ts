/**
 * US2 E2E acceptance test — Feature 005 (T052).
 *
 * Covers Q-E01..Q-E04: drives the interactive console (booted by the
 * `?e2e` demo runtime with a recording FakeMatchClient) through the
 * original pipe-control repertoire and asserts the exact wire orders:
 *   · click eastern half of a cell → OrderSetPipe;
 *   · right-click the same cell → OrderSetPipesExclusive;
 *   · press `i` → the matching north pipe order;
 *   · press `space` → OrderClearAllPipes;
 *   · press `l` with Alt held → OrderSetPipesExclusive with 'E'.
 *
 * Every order is issuable with mouse OR keyboard alone (Q-A05).
 */

import { expect, type Page, test } from '@playwright/test';
import { DEFAULT_CAMERA } from '../../src/config';
import type { EuropaE2EHandle } from '../../src/internal/demo-runtime';

/** The demo board's friendly cell used throughout (troops, no pipes). */
const CELL = { x: 4, y: 8 };

/** Screen offset of fraction `(fx, fy)` inside CELL relative to the canvas. */
function cellOffset(fx: number, fy: number): { x: number; y: number } {
  return { x: (CELL.x + fx) * DEFAULT_CAMERA.zoom, y: (CELL.y + fy) * DEFAULT_CAMERA.zoom };
}

/** Read the captured wire orders from the E2E harness. */
async function capturedOrders(page: Page): Promise<EuropaE2EHandle['orders']> {
  return page.evaluate(() => {
    const handle = window.__europaE2E;
    if (handle === undefined) {
      throw new Error('E2E harness not mounted — did the ?e2e boot fail?');
    }
    return handle.orders.map((recorded) => ({
      actionId: recorded.actionId,
      order: JSON.parse(JSON.stringify(recorded.order)) as typeof recorded.order,
    }));
  });
}

test('US2 pipe repertoire reaches the wire in original semantics', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(String(error));
  });

  await page.goto('/?e2e');
  await expect(page.locator('[role="grid"]')).toBeVisible();
  // Harness ready.
  await expect.poll(() => page.evaluate(() => window.__europaE2E !== undefined)).toBe(true);

  // The ARIA grid overlays the canvas and is the topmost pointer
  // target; clicks there bubble to the board-area controller.
  const board = page.locator('#map');

  // Q-E01: primary click on the eastern half toggles the east pipe on.
  await board.click({ position: cellOffset(0.75, 0.5) });
  let orders = await capturedOrders(page);
  expect(orders).toHaveLength(1);
  expect(orders[0]?.order).toEqual({
    kind: 'setPipe',
    player: 1,
    cell: CELL,
    direction: 'E',
  });

  // Q-E02: right-click issues the mutually exclusive variant.
  await board.click({ button: 'right', position: cellOffset(0.75, 0.5) });
  orders = await capturedOrders(page);
  expect(orders).toHaveLength(2);
  expect(orders[1]?.order).toEqual({
    kind: 'setPipesExclusive',
    player: 1,
    cell: CELL,
    direction: 'E',
  });

  // Q-E03: `i` issues the north pipe order for the selected cell
  // (the click above also established the keyboard anchor).
  await page.keyboard.press('i');
  orders = await capturedOrders(page);
  expect(orders).toHaveLength(3);
  expect(orders[2]?.order).toEqual({
    kind: 'setPipe',
    player: 1,
    cell: CELL,
    direction: 'N',
  });

  // Q-E04: space clears all pipes on the focused cell.
  await page.keyboard.press(' ');
  orders = await capturedOrders(page);
  expect(orders).toHaveLength(4);
  expect(orders[3]?.order).toEqual({
    kind: 'clearAllPipes',
    player: 1,
    cell: CELL,
  });

  // Alt+l issues the exclusive EAST variant from the keyboard alone.
  await page.keyboard.press('Alt+l');
  orders = await capturedOrders(page);
  expect(orders).toHaveLength(5);
  expect(orders[4]?.order).toEqual({
    kind: 'setPipesExclusive',
    player: 1,
    cell: CELL,
    direction: 'E',
  });

  expect(consoleErrors).toEqual([]);
});
