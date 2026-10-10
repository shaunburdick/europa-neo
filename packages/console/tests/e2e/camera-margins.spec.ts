/** E2E regression: blank board-exterior margins must not issue orders. */

import { expect, type Page, test } from '@playwright/test';

interface DemoSnapshot {
    readonly orderCount: number;
    readonly selection: { readonly x: number; readonly y: number } | null;
    readonly cameraPan: { readonly x: number; readonly y: number };
}

type BoardEdge = 'left' | 'top' | 'right' | 'bottom';
type Corner = 'top-left' | 'bottom-right';

interface Point {
    readonly x: number;
    readonly y: number;
}

async function demoSnapshot(page: Page): Promise<DemoSnapshot> {
    const snapshot = await page.evaluate(() => {
        const handle = (
            window as unknown as {
                __europaE2E?: {
                    readonly orders: readonly unknown[];
                    readonly store: {
                        getState(): {
                            readonly selection: { readonly x: number; readonly y: number } | null;
                            readonly camera: { readonly pan: { readonly x: number; readonly y: number } };
                        };
                    };
                };
            }
        ).__europaE2E;
        if (handle === undefined) {
            return null;
        }
        const state = handle.store.getState();
        return { orderCount: handle.orders.length, selection: state.selection, cameraPan: state.camera.pan };
    });
    if (snapshot === null) {
        throw new Error('The demo E2E runtime did not mount');
    }
    return snapshot;
}

async function centerBoardCorner(page: Page, corner: Corner): Promise<void> {
    const position = corner === 'top-left' ? { x: 1, y: 1 } : { x: 95, y: 95 };
    const minimap = page.getByRole('img', { name: 'Minimap' });
    const box = await minimap.boundingBox();
    expect(box, 'minimap has a measurable bounding box').not.toBeNull();
    if (box === null) {
        throw new Error('Minimap geometry is unavailable');
    }
    // Dispatch on the canvas itself because its tooltip wrapper can be the
    // physical hit target; the real React click handler still runs.
    await minimap.dispatchEvent('click', {
        clientX: box.x + position.x,
        clientY: box.y + position.y,
    });
    await expect
        .poll(async () => {
            const { cameraPan } = await demoSnapshot(page);
            return corner === 'top-left' ? cameraPan.x > 0 && cameraPan.y > 0 : cameraPan.x < 0 && cameraPan.y < 0;
        })
        .toBe(true);
}

async function marginPoint(page: Page, edge: BoardEdge): Promise<Point> {
    const area = await page.locator('.europa-board-area').boundingBox();
    const map = await page.locator('#map').boundingBox();
    expect(area, 'board area has a measurable bounding box').not.toBeNull();
    expect(map, 'transformed board grid has a measurable bounding box').not.toBeNull();
    if (area === null || map === null) {
        throw new Error('Board geometry is unavailable');
    }

    switch (edge) {
        case 'left': {
            const gap = map.x - area.x;
            expect(gap, 'board leaves a left exterior margin').toBeGreaterThan(0);
            return { x: area.x + gap / 2, y: area.y + area.height / 2 };
        }
        case 'top': {
            const gap = map.y - area.y;
            expect(gap, 'board leaves a top exterior margin').toBeGreaterThan(0);
            return { x: area.x + area.width / 2, y: area.y + gap / 2 };
        }
        case 'right': {
            const gap = area.x + area.width - (map.x + map.width);
            expect(gap, 'board leaves a right exterior margin').toBeGreaterThan(0);
            return { x: area.x + area.width - gap / 2, y: area.y + area.height / 2 };
        }
        case 'bottom': {
            const gap = area.y + area.height - (map.y + map.height);
            expect(gap, 'board leaves a bottom exterior margin').toBeGreaterThan(0);
            return { x: area.x + area.width / 2, y: area.y + area.height - gap / 2 };
        }
    }
}

async function expectMarginInputDoesNotOrder(page: Page, edge: BoardEdge): Promise<void> {
    const point = await marginPoint(page, edge);
    const before = (await demoSnapshot(page)).orderCount;

    await page.mouse.move(point.x, point.y);
    await page.mouse.click(point.x, point.y);
    await page.keyboard.press('i');

    await expect.poll(async () => (await demoSnapshot(page)).orderCount).toBe(before);
}

test('pointer clicks and order keys in exterior margins do not send orders', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?e2e');
    const grid = page.getByRole('grid', { name: 'Game board' });
    await expect(grid).toBeVisible();
    await expect(page.locator('.europa-sidebar')).toBeVisible();
    await grid.focus();
    await expect.poll(async () => (await demoSnapshot(page)).selection).toEqual({ x: 8, y: 8 });
    expect((await demoSnapshot(page)).orderCount).toBe(0);

    await centerBoardCorner(page, 'top-left');
    await expectMarginInputDoesNotOrder(page, 'left');
    await expectMarginInputDoesNotOrder(page, 'top');

    await centerBoardCorner(page, 'bottom-right');
    await expectMarginInputDoesNotOrder(page, 'right');
    await expectMarginInputDoesNotOrder(page, 'bottom');
});
