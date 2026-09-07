/**
 * Component tests: Canvas visual layer — Feature 005 (Q-B01 support).
 *
 * Boots the full App with a scripted demo state via the T048 test
 * seam and verifies the canvas is mounted and its FIRST PAINT shows
 * exactly the visible cells: every in-horizon cell center is painted,
 * every out-of-horizon cell center stays void.
 *
 * Runs in Vitest Browser Mode — pixel readback needs a real canvas
 * implementation, which happy-dom does not provide.
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { DEFAULT_CAMERA } from '../../../src/config';
import {
    clearConsoleStateForTesting,
    createDemoPlayerView,
    createStubConsoleState,
    setConsoleStateForTesting,
} from '../../../src/internal/test-state';
import { App } from '../../../src/render/App';
import { VOID_GRADIENT_CENTER, VOID_GRADIENT_EDGE } from '../../../src/render/palette';
import { expectNoDomA11yViolations } from '../../setup-a11y-dom';
import '../../../src/styles/index.css';

/** Parse `#rrggbb` into an [r, g, b] triple. */
function hexToRgb(hex: string): [number, number, number] {
    return [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16),
    ];
}

afterEach(() => {
    cleanup();
    clearConsoleStateForTesting();
});

describe('App first paint (Q-B01)', () => {
    test('canvas mounts sized to the board and paints all visible cells', async () => {
        const view = createDemoPlayerView();
        setConsoleStateForTesting(createStubConsoleState(view));
        const screen = await render(<App />);

        // The a11y overlay proves React committed; the effect that paints
        // the canvas runs in the same commit cycle.
        await expect.element(screen.getByRole('grid')).toBeInTheDocument();

        const canvas = screen.container.querySelector('canvas');
        expect(canvas).not.toBeNull();
        const ctx = canvas?.getContext('2d');
        expect(ctx).not.toBeNull();

        const { zoom } = DEFAULT_CAMERA;
        const visibleKeys = new Set(view.visibleCells.map((cell) => `${cell.coord.x},${cell.coord.y}`));
        const boardPx = view.config.boardSize * zoom;

        // Poll for the expected pixel state. Offsets are recalculated on
        // each iteration because the canvas bitmap dimensions change as
        // useContainerSize fires its ResizeObserver and the paint effect
        // re-runs. Sampling the pixel state inside the poll ensures we
        // always use dimensions that match the most recent paint.
        await expect
            .poll(
                () => {
                    const curW = canvas?.width ?? 0;
                    const curH = canvas?.height ?? 0;
                    if (curW === 0 || curH === 0) return false;
                    // Wait for at least one paint to complete.
                    if (Number(canvas?.getAttribute('data-paint-count') ?? '0') === 0) return false;
                    const curOffX = boardPx < curW ? (curW - boardPx) / 2 : 0;
                    const curOffY = boardPx < curH ? (curH - boardPx) / 2 : 0;
                    const centerRgb = hexToRgb(VOID_GRADIENT_CENTER);
                    const edgeRgb = hexToRgb(VOID_GRADIENT_EDGE);
                    let paintedVisible = 0;
                    let paintedVoid = 0;
                    let onScreenVisible = 0;
                    let onScreenTotal = 0;
                    for (let y = 0; y < view.config.boardSize; y++) {
                        for (let x = 0; x < view.config.boardSize; x++) {
                            const px = x * zoom + zoom / 2 + curOffX;
                            const py = y * zoom + zoom / 2 + curOffY;
                            if (px < 0 || py < 0 || px >= curW || py >= curH) {
                                continue;
                            }
                            onScreenTotal++;
                            const pixel = ctx?.getImageData(px, py, 1, 1).data;
                            if (pixel === undefined) {
                                continue;
                            }
                            const tolerance = 12;
                            const matchesCenter =
                                Math.abs(pixel[0] - centerRgb[0]) < tolerance &&
                                Math.abs(pixel[1] - centerRgb[1]) < tolerance &&
                                Math.abs(pixel[2] - centerRgb[2]) < tolerance;
                            const matchesEdge =
                                Math.abs(pixel[0] - edgeRgb[0]) < tolerance &&
                                Math.abs(pixel[1] - edgeRgb[1]) < tolerance &&
                                Math.abs(pixel[2] - edgeRgb[2]) < tolerance;
                            const isVoid = matchesCenter || matchesEdge;
                            if (visibleKeys.has(`${x},${y}`)) {
                                onScreenVisible++;
                                if (!isVoid) paintedVisible++;
                            } else if (isVoid) {
                                paintedVoid++;
                            }
                        }
                    }
                    const onScreenHorizon = onScreenTotal - onScreenVisible;
                    return paintedVisible === onScreenVisible && paintedVoid === onScreenHorizon;
                },
                { timeout: 5000, message: 'all visible cells painted, all out-of-horizon cells void' },
            )
            .toBe(true);
    });

    test('the booted board passes an axe scan', async () => {
        setConsoleStateForTesting(createStubConsoleState(createDemoPlayerView()));
        await render(<App />);

        await expectNoDomA11yViolations(document);
    });
});
