/**
 * US3 E2E acceptance test — Feature 005 (T060).
 *
 * Covers Q-E06..Q-E08 + the subcell parity check:
 *   · move the cursor to subcell (0.85, 0.15) of a friendly source
 *     cell, press `p` → OrderParatroop captured with
 *     `target = (sourceX + 2, sourceY - 2)` (NE ring 2);
 *   · same posture with `g` → OrderGun to the identical destination;
 *   · aim whose binned target fails local preflight (off-horizon →
 *     out_of_bounds fail-closed) sends NO wire message;
 *   · the subcell parity fixture (tests/fixtures/original-subcell.json)
 *     loads and every pair matches `subcellToTargetCoord`.
 *
 * Note on "beyond ring 2" (Q-E08): the 5-bin rule clamps offsets to
 * ±2 by construction, so an over-range target cannot be expressed by
 * the cursor alone; the reachable preflight-rejection path is a
 * binned target outside the visibility horizon (fail-closed per
 * local-preflight.ts). This spec exercises that path.
 */

import { expect, type Page, test } from '@playwright/test';
import { DEFAULT_CAMERA } from '../../src/config';
import { subcellToTargetCoord } from '../../src/input/subcell';
import type { EuropaE2EHandle } from '../../src/internal/demo-runtime';
import parityPairs from '../fixtures/original-subcell.json' with { type: 'json' };

/** The demo board's friendly paratroop source (21 troops, P1). */
const SOURCE = { x: 3, y: 10 };

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

/**
 * Move the mouse to fraction `(fx, fy)` inside cell `(cx, cy)` of the
 * live board (viewport coords derived from the board's bounding box).
 */
async function hoverSubcell(
  page: Page,
  cx: number,
  cy: number,
  fx: number,
  fy: number,
): Promise<void> {
  const box = await page.locator('#map').boundingBox();
  if (box === null) {
    throw new Error('#map has no bounding box');
  }
  await page.mouse.move(
    box.x + (cx + fx) * DEFAULT_CAMERA.zoom,
    box.y + (cy + fy) * DEFAULT_CAMERA.zoom,
  );
}

test('US3 subcell targeting reaches the wire with original mapping', async ({ page }) => {
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
  await expect.poll(() => page.evaluate(() => window.__europaE2E !== undefined)).toBe(true);

  // Anchor the keyboard focus on the friendly source cell. The click
  // itself issues one pipe order (order index 0).
  const board = page.locator('#map');
  await board.click({
    position: {
      x: (SOURCE.x + 0.5) * DEFAULT_CAMERA.zoom,
      y: (SOURCE.y + 0.25) * DEFAULT_CAMERA.zoom,
    },
  });
  let orders = await capturedOrders(page);
  expect(orders).toHaveLength(1);
  expect(orders[0]?.order).toMatchObject({ kind: 'setPipe', cell: SOURCE });

  // Q-E06: NE ring-2 aim + `p` → paratroop to (sourceX+2, sourceY-2).
  await hoverSubcell(page, SOURCE.x, SOURCE.y, 0.85, 0.15);
  await page.keyboard.press('p');
  orders = await capturedOrders(page);
  expect(orders).toHaveLength(2);
  expect(orders[1]?.order).toEqual({
    kind: 'paratroop',
    player: 1,
    source: SOURCE,
    target: { x: SOURCE.x + 2, y: SOURCE.y - 2 },
  });

  // Q-E07: the identical posture with `g` guns the same destination.
  await page.keyboard.press('g');
  orders = await capturedOrders(page);
  expect(orders).toHaveLength(3);
  expect(orders[2]?.order).toEqual({
    kind: 'gun',
    player: 1,
    source: SOURCE,
    target: { x: SOURCE.x + 2, y: SOURCE.y - 2 },
  });

  // Q-E08: aim whose binned target is off-horizon is rejected by the
  // local preflight — NO wire message leaves the client.
  await hoverSubcell(page, SOURCE.x, SOURCE.y, 0.15, 0.85); // SW ring 2 → (1, 12): unseen
  await page.keyboard.press('p');
  orders = await capturedOrders(page);
  expect(orders).toHaveLength(3);

  expect(consoleErrors).toEqual([]);
});

test('subcell parity fixture matches the console mapping', async () => {
  // The fixture is data-only (transcribed coordinates from the
  // original's documented examples); the mapping under test is the
  // console's own reimplementation.
  expect(Array.isArray(parityPairs)).toBe(true);
  for (const pair of parityPairs) {
    const target = subcellToTargetCoord(pair.source, pair.cursorPx);
    expect(target, `${JSON.stringify(pair)}`).toEqual(pair.expectedTarget);
  }
});
