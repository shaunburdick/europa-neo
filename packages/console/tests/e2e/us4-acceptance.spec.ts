/**
 * US4 E2E acceptance test — Feature 005 (T068).
 *
 * Covers Q-E05: drives the console via Playwright with the
 * FakeMatchClient harness (?e2e boot):
 *   · focus a friendly cell, press `7` → `OrderSetReserves` with
 *     `percent: 7` is captured on the wire;
 *   · the harness's server echo acks the order and broadcasts the
 *     applied tick — the transient "70%" `MapLabel` is raised by the
 *     MapView diff and painted onto the canvas (pixel-sampled);
 *   · press `0` → `percent: 0` is captured and applied.
 */

import { expect, type Page, test } from '@playwright/test';
import { DEFAULT_CAMERA } from '../../src/config';
import type { EuropaE2EHandle } from '../../src/internal/demo-runtime';
import { CHIP_BACKGROUND } from '../../src/render/palette';

/** The demo board's friendly reserves target (P1, 21 troops). */
const CELL = { x: 3, y: 10 };

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

/** Read one canvas pixel as an [r, g, b] triple. */
async function pixelAt(page: Page, x: number, y: number): Promise<[number, number, number]> {
    return page.evaluate(
        ([px, py]) => {
            const canvas = document.querySelector('canvas');
            if (canvas === null) {
                throw new Error('canvas not mounted');
            }
            const ctx = canvas.getContext('2d');
            if (ctx === null) {
                throw new Error('no 2d context');
            }
            const { data } = ctx.getImageData(px, py, 1, 1);
            return [data[0], data[1], data[2]];
        },
        [x, y],
    );
}

/** Parse `#rrggbb` into an [r, g, b] triple. */
function hexToRgb(hex: string): [number, number, number] {
    return [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16),
    ];
}

test('US4 digit keys set and clear reserves with a visible label', async ({ page }) => {
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

    // Anchor the keyboard focus on the friendly cell. The click itself
    // issues one pipe order (order index 0).
    const board = page.locator('#map');
    await board.click({
        position: {
            x: (CELL.x + 0.5) * DEFAULT_CAMERA.zoom,
            y: (CELL.y + 0.25) * DEFAULT_CAMERA.zoom,
        },
    });
    let orders = await capturedOrders(page);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.order).toMatchObject({ kind: 'setPipe', cell: CELL });

    // Q-E05: press `7` → OrderSetReserves percent 7 hits the wire.
    await page.keyboard.press('7');
    orders = await capturedOrders(page);
    expect(orders).toHaveLength(2);
    expect(orders[1]?.order).toEqual({
        kind: 'setReserves',
        player: 1,
        cell: CELL,
        percent: 7,
    });

    // The server echo applies the value; the authoritative view now
    // carries reservesPercent 7.
    await expect
        .poll(() =>
            page.evaluate(() => {
                const view = window.__europaE2E?.store.getState().latestView;
                const cell = view?.visibleCells.find((c) => c.coord.x === 3 && c.coord.y === 10);
                return cell?.reservesPercent ?? -1;
            }),
        )
        .toBe(7);

    // The transient "70%" chip paints at the top edge of the cell
    // (MapView diff raised it against the previous snapshot). Sample
    // near the chip's left edge — its center carries the white glyph.
    const chip = hexToRgb(CHIP_BACKGROUND);
    const chipX = CELL.x * DEFAULT_CAMERA.zoom + 6;
    const chipY = CELL.y * DEFAULT_CAMERA.zoom + 4;
    await expect.poll(async () => pixelAt(page, chipX, chipY)).toEqual(chip);

    // Press `0` → reserves cleared (percent 0) on the wire.
    await page.keyboard.press('0');
    orders = await capturedOrders(page);
    expect(orders).toHaveLength(3);
    expect(orders[2]?.order).toEqual({
        kind: 'setReserves',
        player: 1,
        cell: CELL,
        percent: 0,
    });
    await expect
        .poll(() =>
            page.evaluate(() => {
                const view = window.__europaE2E?.store.getState().latestView;
                const cell = view?.visibleCells.find((c) => c.coord.x === 3 && c.coord.y === 10);
                return cell?.reservesPercent ?? -1;
            }),
        )
        .toBe(0);

    expect(consoleErrors).toEqual([]);
});
