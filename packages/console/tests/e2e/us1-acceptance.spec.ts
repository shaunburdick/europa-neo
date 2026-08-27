/**
 * US1 E2E acceptance test — Feature 005 (T042).
 *
 * Covers Q-C01 + Q-C02 + Q-E01 (visual check): boots the Vite dev
 * server via Playwright's webServer, navigates to the console, and
 * asserts the standalone MVP: page loads in < 1 s (after a warm-up
 * navigation so Vite's on-demand transform cost is not measured),
 * the canvas is visible, zero console errors, and the first paint
 * shows exactly the demo view's visible cells (pixel sampling).
 * A screenshot is captured for the review record.
 *
 * Feature 010 note: the bare `/` route is now the PUBLIC LOBBY
 * landing (FR-001/FR-017), so this spec targets `/?e2e` — the demo
 * runtime that provides exactly the deterministic stub board this
 * acceptance measures. The lobby's own E2E coverage lands with its
 * feature's tasks.
 */

import { expect, test } from '@playwright/test';
import { DEFAULT_CAMERA } from '../../src/config';
import { createDemoPlayerView, DEMO_BOARD_SIZE } from '../../src/internal/test-state';
import { VOID_COLOR } from '../../src/render/palette';

/** Parse `#rrggbb` into an [r, g, b] triple. */
function hexToRgb(hex: string): [number, number, number] {
    return [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16),
    ];
}

test('US1 MVP boots standalone and paints the demo board', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            consoleErrors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        consoleErrors.push(String(error));
    });

    // Warm-up navigation: Vite transforms modules on first request;
    // the < 1 s budget applies to a steady-state load (Q-C01).
    await page.goto('/?e2e');
    await expect(page.locator('[role="grid"]')).toBeVisible();

    // Measured load. The board canvas is targeted specifically — the
    // demo runtime attaches a store, so the HUD minimap's own <canvas>
    // is present too (strict-mode would flag a bare 'canvas' locator).
    const startedAt = Date.now();
    await page.reload();
    await expect(page.locator('canvas.europa-canvas')).toBeVisible();
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThan(1000);

    // First paint shows exactly the demo view's visible cells.
    const view = createDemoPlayerView();
    const expectedVisible = view.visibleCells.length;
    const voidRgb = hexToRgb(VOID_COLOR);
    const { zoom } = DEFAULT_CAMERA;

    const counted = await page.evaluate(
        ({ size, cellPx, voidColor }) => {
            const canvas = document.querySelector('canvas');
            if (canvas === null) {
                return -1;
            }
            const ctx = canvas.getContext('2d');
            if (ctx === null) {
                return -1;
            }
            let nonVoid = 0;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const pixel = ctx.getImageData(x * cellPx + cellPx / 2, y * cellPx + cellPx / 2, 1, 1).data;
                    const isVoid =
                        Math.abs(pixel[0] - voidColor[0]) < 6 &&
                        Math.abs(pixel[1] - voidColor[1]) < 6 &&
                        Math.abs(pixel[2] - voidColor[2]) < 6;
                    if (!isVoid) {
                        nonVoid++;
                    }
                }
            }
            return nonVoid;
        },
        { size: DEMO_BOARD_SIZE, cellPx: zoom, voidColor: voidRgb },
    );

    expect(counted).toBe(expectedVisible);

    // Visual record for review.
    await page.screenshot({ path: 'test-results/us1-board.png', fullPage: true });

    expect(consoleErrors).toEqual([]);
});
