/** Fit-camera lifecycle integration tests (spec 005 v1.10 T119/T123). */

import { afterEach, describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';

import { CONSOLE_CONSTANTS, DEFAULT_CAMERA } from '../../../src/config';
import { effectiveMaxZoom } from '../../../src/qol/zoom';
import { App } from '../../../src/render/App';
import { computeViewportOffset } from '../../../src/render/viewport-offset';
import { INITIAL_CONSOLE_STATE } from '../../../src/state/reducer';
import type { ConsoleStore } from '../../../src/state/store';
import { createConsoleStore } from '../../../src/state/store';
import type { CameraState, PlayerView } from '../../../src/state/types';
import { buildCellView, buildPlayerView, createLiveConsoleState } from '../../fixtures/player-view';
import '../../../src/styles/index.css';

afterEach(() => {
    cleanup();
});

function readyView(): PlayerView {
    return buildPlayerView({
        width: 8,
        playerId: 1,
        visibleCells: [buildCellView({ coord: { x: 0, y: 0 }, elevation: 50, troops: 10, owner: 1 })],
    });
}

function readyStore(): ConsoleStore {
    return createConsoleStore(createLiveConsoleState(readyView()));
}

async function waitForFit(store: ConsoleStore): Promise<void> {
    await expect
        .poll(() => store.getState().camera.zoom, { message: 'fit baseline should initialize' })
        .toBeGreaterThan(CONSOLE_CONSTANTS.minCellPx);
}

function readFitFromViewport(): {
    readonly fitZoom: number;
    readonly offset: { readonly x: number; readonly y: number };
} {
    const boardArea = document.querySelector<HTMLElement>('.europa-board-area');
    const grid = document.querySelector<HTMLElement>('#map');
    if (boardArea === null || grid === null) {
        throw new Error('Expected measured board and rendered grid');
    }
    const rect = boardArea.getBoundingClientRect();
    const boardCells = 8;
    const fitZoom = Math.min(96, Math.max(32, Math.min(rect.width, rect.height) / boardCells));
    const offset = computeViewportOffset(fitZoom, { x: 0, y: 0 }, boardCells, rect.width, rect.height);
    return { fitZoom, offset };
}

function expectRenderedFitTransform(camera: CameraState): void {
    const grid = document.querySelector<HTMLElement>('#map');
    expect(grid).not.toBeNull();
    const rect = document.querySelector<HTMLElement>('.europa-board-area')?.getBoundingClientRect();
    expect(rect).toBeDefined();
    const offset = computeViewportOffset(camera.zoom, camera.pan, 8, rect?.width ?? 0, rect?.height ?? 0);
    expect((grid as HTMLElement).style.transform).toBe(`translate(${-offset.x}px, ${-offset.y}px)`);
}

describe('App fit-camera initialization', () => {
    test('initializes a ready view once viewport measurement arrives and aligns the rendered transform', async () => {
        await page.viewport(900, 650);
        const store = readyStore();
        await render(<App store={store} />);
        await waitForFit(store);

        const camera = store.getState().camera;
        const { fitZoom } = readFitFromViewport();
        expect(camera.minZoom).toBe(CONSOLE_CONSTANTS.minCellPx);
        expect(camera.maxZoom).toBe(effectiveMaxZoom(fitZoom));
        expect(camera.zoom).toBe(fitZoom);
        expect(document.querySelector('[data-europa-zoom-level="true"]')?.textContent).toBe('100%');
        expectRenderedFitTransform(camera);

        store.dispatch({ kind: 'setCamera', camera: { ...camera, zoom: camera.maxZoom } });
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(store.getState().camera.zoom).toBe(fitZoom);
        expect(store.getState().camera.minZoom).toBe(CONSOLE_CONSTANTS.minCellPx);
    });

    test('initializes when the viewport is measured before the ready view arrives', async () => {
        await page.viewport(900, 650);
        const store = createConsoleStore(INITIAL_CONSOLE_STATE);
        await render(<App store={store} />);
        await expect
            .poll(() => document.querySelector<HTMLElement>('.europa-board-area')?.getBoundingClientRect().width)
            .toBeGreaterThan(0);
        expect(store.getState().camera.zoom).toBe(CONSOLE_CONSTANTS.minCellPx);

        store.dispatch({ kind: 'tick', view: readyView() });
        await waitForFit(store);
        expectRenderedFitTransform(store.getState().camera);
    });

    test('resizes and reapplies fit while the camera still matches the last auto-fit', async () => {
        await page.viewport(900, 650);
        const store = readyStore();
        await render(<App store={store} />);
        await waitForFit(store);
        const initialCamera = store.getState().camera;
        const initialFit = readFitFromViewport().fitZoom;
        expect(initialCamera.zoom).toBe(initialFit);

        const boardArea = document.querySelector<HTMLElement>('.europa-board-area');
        if (boardArea === null) {
            throw new Error('Expected board area to resize');
        }
        const beforeWidth = boardArea.getBoundingClientRect().width;
        await page.viewport(820, 600);
        await expect
            .poll(() => boardArea.getBoundingClientRect().width, { message: 'board viewport should resize' })
            .not.toBe(beforeWidth);

        const resizedFit = readFitFromViewport().fitZoom;
        expect(resizedFit).not.toBe(initialFit);
        await expect
            .poll(() => store.getState().camera.zoom, { message: 'unchanged auto-fit camera should refit' })
            .toBe(resizedFit);
        const resizedCamera = store.getState().camera;
        expect(resizedCamera.maxZoom).toBe(effectiveMaxZoom(resizedFit));
        expect(resizedCamera.pan).toEqual(initialCamera.pan);
    });

    test('resizing after an actual camera change preserves user zoom or pan', async () => {
        await page.viewport(900, 650);
        const store = readyStore();
        await render(<App store={store} />);
        await waitForFit(store);
        const fit = store.getState().camera;
        const userCamera: CameraState = {
            ...fit,
            zoom: Math.min(fit.maxZoom, fit.zoom + 8),
            pan: { x: 12, y: -9 },
        };
        store.dispatch({ kind: 'setCamera', camera: userCamera });

        const boardArea = document.querySelector<HTMLElement>('.europa-board-area');
        if (boardArea === null) {
            throw new Error('Expected board area to resize');
        }
        const beforeWidth = boardArea.getBoundingClientRect().width;
        await page.viewport(820, 600);
        await expect
            .poll(() => boardArea.getBoundingClientRect().width, { message: 'board viewport should resize' })
            .not.toBe(beforeWidth);
        expect(store.getState().camera).toEqual(userCamera);
    });

    test('reports when the physical minimum prevents the whole board from fitting', async () => {
        await page.viewport(900, 240);
        const store = readyStore();
        await render(<App store={store} />);
        await expect
            .poll(() => document.querySelector('#zoom .europa-sidebar__hint')?.textContent)
            .toBe('Full board does not fit at the 32px minimum.');
        expect(store.getState().camera.zoom).toBe(CONSOLE_CONSTANTS.minCellPx);
        expect(store.getState().camera.minZoom).toBe(CONSOLE_CONSTANTS.minCellPx);
    });

    test('renders a storeless spectator snapshot at measured fit without mutating it', async () => {
        await page.viewport(900, 650);
        const snapshot = createLiveConsoleState(readyView());
        const originalCamera = snapshot.camera;
        await render(<App state={snapshot} />);

        await expect.poll(() => document.querySelector('[data-europa-zoom-level="true"]')?.textContent).toBe('100%');
        const { fitZoom } = readFitFromViewport();
        const expectedCamera: CameraState = {
            ...originalCamera,
            zoom: fitZoom,
            minZoom: CONSOLE_CONSTANTS.minCellPx,
            maxZoom: effectiveMaxZoom(fitZoom),
        };
        expectRenderedFitTransform(expectedCamera);
        expect(document.querySelector<HTMLElement>('#map')?.style.width).toBe(`${fitZoom * 8}px`);
        expect(snapshot.camera).toBe(originalCamera);

        const orderButtons = [...document.querySelectorAll<HTMLButtonElement>('#orders button')];
        expect(orderButtons.length).toBeGreaterThan(0);
        for (const button of orderButtons) {
            expect(button.disabled).toBe(true);
            button.click();
        }
        expect(snapshot.camera).toBe(originalCamera);
    });

    test('preserves a non-default camera on a storeless snapshot', async () => {
        await page.viewport(900, 650);
        const snapshot = createLiveConsoleState(readyView());
        const externalCamera: CameraState = { ...DEFAULT_CAMERA, zoom: 40, pan: { x: 12, y: -8 } };
        const externalState = { ...snapshot, camera: externalCamera };
        await render(<App state={externalState} />);

        const grid = document.querySelector<HTMLElement>('#map');
        expect(grid).not.toBeNull();
        await expect.poll(() => grid?.style.width).toBe('320px');
        const rect = document.querySelector<HTMLElement>('.europa-board-area')?.getBoundingClientRect();
        expect(rect).toBeDefined();
        const offset = computeViewportOffset(40, externalCamera.pan, 8, rect?.width ?? 0, rect?.height ?? 0);
        expect(grid?.style.transform).toBe(`translate(${-offset.x}px, ${-offset.y}px)`);
        expect(externalState.camera).toBe(externalCamera);
    });
});
