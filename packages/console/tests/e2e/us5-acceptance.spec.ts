/**
 * US5 E2E acceptance test — Feature 005 (T078).
 *
 * Covers Q-E10..Q-E12 + the surrender and reconnect flows, driven
 * through the FakeMatchClient harness (?e2e boot):
 *   · zoom: wheel over the board scales the camera within the
 *     contractual clamp while orders keep flowing (US5 AC-1);
 *   · reconnect: a socket-close event flips the console to an
 *     explicit "Reconnecting…" state with input disabled; the
 *     resync restores live input (US5 AC-3);
 *   · surrender: the confirm modal gates the wire order — Cancel
 *     sends nothing, Confirm issues `OrderSurrender` (US5 AC-2).
 *
 * Harness note: the fake client has no real socket, so connection
 * transitions are driven by dispatching the same NetEvents feature
 * 004's adapter would produce (`socketClosed`, `reconnected`) — the
 * reducer/UI path under test is identical.
 */

import { expect, type Page, test } from '@playwright/test';
import { DEFAULT_CAMERA } from '../../src/config';
import type { EuropaE2EHandle } from '../../src/internal/demo-runtime';

/** Read the captured wire orders from the E2E harness. */
async function capturedOrders(page: Page): Promise<EuropaE2EHandle['orders']> {
    return page.evaluate(() => {
        const handle = window.__europaE2E;
        if (handle === undefined) {
            throw new Error('E2E harness not mounted');
        }
        return handle.orders.map((recorded) => ({
            actionId: recorded.actionId,
            order: JSON.parse(JSON.stringify(recorded.order)) as typeof recorded.order,
        }));
    });
}

test('US5 zoom, reconnect status, and gated surrender', async ({ page }) => {
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

    // --- Q-E10: wheel zoom scales the board and stays clamped ---
    const canvasBox = await page.locator('canvas.europa-canvas').boundingBox();
    if (canvasBox === null) {
        throw new Error('board canvas has no bounding box');
    }
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.mouse.wheel(0, -480); // several notches in
    await expect
        .poll(() => page.evaluate(() => window.__europaE2E?.store.getState().camera.zoom ?? 0))
        .toBeGreaterThan(DEFAULT_CAMERA.zoom);
    const zoomAfterWheel = await page.evaluate(() => window.__europaE2E?.store.getState().camera.zoom ?? 0);
    expect(zoomAfterWheel).toBeLessThanOrEqual(DEFAULT_CAMERA.maxZoom);

    // Input targeting stays accurate at the new zoom: clicking a cell
    // still issues a pipe order for the cell under the cursor. The
    // probe fraction (0.25, 0.5) sits firmly inside the W region under
    // nearest-edge classification (horizontal distance 0.25 vs vertical
    // 0), so sub-pixel click rounding cannot flip it.
    const zoomNow = await page.evaluate(() => window.__europaE2E?.store.getState().camera.zoom ?? DEFAULT_CAMERA.zoom);
    const panNow = await page.evaluate(() => window.__europaE2E?.store.getState().camera.pan ?? { x: 0, y: 0 });
    // Cell (3, 10) at fraction (0.25, 0.5) in screen space.
    const screenX = panNow.x + 3.25 * zoomNow;
    const screenY = panNow.y + 10.5 * zoomNow;
    const boardBox = await page.locator('.europa-board-area').boundingBox();
    if (boardBox === null) {
        throw new Error('board area has no bounding box');
    }
    await page.mouse.click(boardBox.x + screenX, boardBox.y + screenY, { button: 'left' });
    const ordersAfterZoomClick = await capturedOrders(page);
    const lastOrder = ordersAfterZoomClick.at(-1)?.order;
    expect(lastOrder).toMatchObject({ kind: 'setPipe', cell: { x: 3, y: 10 }, direction: 'W' });

    // --- US5 AC-3: explicit reconnecting status with input disabled ---
    await page.evaluate(() => {
        window.__europaE2E?.store.dispatch({
            kind: 'socketClosed',
            code: 1006,
            reason: 'e2e-simulated-drop',
        });
    });
    const banner = page.locator('[role="alert"]');
    await expect(banner).toHaveText(/Reconnecting/i);
    await expect(page.locator('#order-bar button').first()).toBeDisabled();

    // Resync (feature 004 snapshot on reconnect) restores live input.
    await page.evaluate(() => {
        const handle = window.__europaE2E;
        if (handle === undefined) {
            throw new Error('harness missing');
        }
        const view = handle.store.getState().latestView;
        if (view === null) {
            throw new Error('no view to resync with');
        }
        handle.store.dispatch({ kind: 'reconnected', view });
    });
    await expect(banner).toHaveCount(0);
    await expect(page.locator('#order-bar button').first()).toBeEnabled();

    // --- US5 AC-2: surrender is gated behind confirmation ---
    await page.locator('#surrender button').click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Cancel sends nothing.
    await page.locator('[role="dialog"] button:has-text("Cancel")').click();
    await expect(dialog).toHaveCount(0);
    const beforeConfirm = await capturedOrders(page);
    expect(beforeConfirm.some((recorded) => recorded.order.kind === 'surrender')).toBe(false);

    // Confirm issues OrderSurrender on the wire.
    await page.locator('#surrender button').click();
    await expect(dialog).toBeVisible();
    await page.locator('[role="dialog"] button:has-text("Confirm surrender")').click();
    await expect(dialog).toHaveCount(0);
    const afterConfirm = await capturedOrders(page);
    const surrender = afterConfirm.find((recorded) => recorded.order.kind === 'surrender');
    expect(surrender?.order).toEqual({ kind: 'surrender', player: 1 });

    expect(consoleErrors).toEqual([]);
});
