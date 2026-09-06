/**
 * E2E — board render visual regression (issue #76).
 *
 * Verifies the game board renders correctly in the demo mode (`?e2e`),
 * which provides a deterministic 16×16 board without needing a live
 * server or two-player match. Checks structural integrity of the board
 * area, grid cells, sidebar sections, canvas, and zoom controls.
 *
 * Determinism: all waits poll observable DOM conditions; the demo view
 * is seeded (tick 42, 22 visible cells in the south-west quadrant).
 */

import { expect, test } from '@playwright/test';

const DEMO_URL = '/?e2e';

test.describe('board render (demo mode)', () => {
    test.setTimeout(30_000);

    /** Navigate to the demo and wait for the board grid to appear. */
    async function openDemoBoard(page: {
        goto: (url: string) => Promise<unknown>;
        waitForSelector: (sel: string, opts?: { timeout: number }) => Promise<unknown>;
        getByRole: (
            role: string,
            opts?: Record<string, string>,
        ) => { first: () => { waitFor: (opts?: { timeout: number }) => Promise<unknown> } };
    }): Promise<void> {
        await page.goto(DEMO_URL);
        // Wait for the interactive grid overlay (the board area + grid
        // are rendered synchronously once the store hydrates the demo view).
        const grid = page.getByRole('grid', { name: 'Game board' });
        await grid.first().waitFor({ timeout: 10_000 });
    }

    test('board renders with visible terrain and sidebar', async ({ page }) => {
        await openDemoBoard(page);

        // 1. At least one grid cell is present.
        const cells = page.getByRole('gridcell');
        const cellCount = await cells.count();
        expect(cellCount).toBeGreaterThan(0);

        // 2. Board area has non-zero dimensions.
        const boardArea = page.locator('.europa-board-area');
        await expect(boardArea).toBeVisible();
        const boardBox = await boardArea.boundingBox();
        expect(boardBox).not.toBeNull();
        if (boardBox !== null) {
            expect(boardBox.width).toBeGreaterThan(0);
            expect(boardBox.height).toBeGreaterThan(0);
        }

        // 3. Sidebar is visible.
        const sidebar = page.locator('.europa-sidebar');
        await expect(sidebar).toBeVisible();

        // 4. Canvas element exists with non-zero dimensions.
        const canvas = page.locator('.europa-canvas');
        await expect(canvas).toBeVisible();
        const canvasBox = await canvas.boundingBox();
        expect(canvasBox).not.toBeNull();
        if (canvasBox !== null) {
            expect(canvasBox.width).toBeGreaterThan(0);
            expect(canvasBox.height).toBeGreaterThan(0);
        }

        // 5. Attach screenshot for manual review.
        const screenshot = await page.screenshot();
        await test.info().attach('board-render-demo.png', {
            body: screenshot,
            contentType: 'image/png',
        });
    });

    test('board cells are positioned within the board area', async ({ page }) => {
        await openDemoBoard(page);

        // Wait for grid cells to render.
        const cells = page.getByRole('gridcell');
        await expect.poll(async () => await cells.count(), { timeout: 10_000 }).toBeGreaterThan(0);

        const boardArea = page.locator('.europa-board-area');
        const boardBox = await boardArea.boundingBox();
        expect(boardBox).not.toBeNull();
        if (boardBox === null) {
            return;
        }

        // Check at least 3 cells are positioned within the board area
        // (with a generous tolerance for the grid overlay's absolute
        // positioning and zoom-induced overflow).
        const cellCount = await cells.count();
        const samplesToCheck = Math.min(3, cellCount);
        for (let i = 0; i < samplesToCheck; i++) {
            const cellBox = await cells.nth(i).boundingBox();
            expect(cellBox).not.toBeNull();
            if (cellBox === null) {
                continue;
            }
            // Cell must overlap with the board area (not be entirely outside).
            const overlapX = Math.max(
                0,
                Math.min(cellBox.x + cellBox.width, boardBox.x + boardBox.width) - Math.max(cellBox.x, boardBox.x),
            );
            const overlapY = Math.max(
                0,
                Math.min(cellBox.y + cellBox.height, boardBox.y + boardBox.height) - Math.max(cellBox.y, boardBox.y),
            );
            expect(overlapX).toBeGreaterThan(0);
            expect(overlapY).toBeGreaterThan(0);
        }
    });

    test('sidebar sections are all present', async ({ page }) => {
        await openDemoBoard(page);

        // All 8 sidebar sections (FR-015) are present.
        const sections = page.locator('.europa-sidebar > section');
        await expect(sections).toHaveCount(8);

        for (const label of ['Status', 'Players', 'Orders', 'Reserve', 'Overview', 'Zoom', 'Surrender', 'Help']) {
            await expect(page.locator(`section[aria-label="${label}"]`)).toBeVisible();
        }

        // "Match live" indicator is present (demo status is 'live').
        await expect(page.locator('.europa-sidebar__live-indicator')).toBeVisible();
        await expect(page.locator('.europa-sidebar__live-indicator')).toContainText('Match live');

        // Zoom controls are present: in (+), out (−), and reset (100%).
        const zoomSection = page.locator('#zoom');
        await expect(zoomSection.getByRole('button', { name: 'Zoom in' })).toBeVisible();
        await expect(zoomSection.getByRole('button', { name: 'Zoom out' })).toBeVisible();
        await expect(zoomSection.getByRole('button', { name: 'Reset zoom to 100%' })).toBeVisible();

        // Zoom level indicator shows 100%.
        await expect(page.locator('[data-europa-zoom-level="true"]')).toHaveText('100%');
    });
});
