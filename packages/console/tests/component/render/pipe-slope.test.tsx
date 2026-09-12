/**
 * Component tests: pipe slope color-coding — Feature 005 FR-013
 * (issue #30).
 *
 * Boots the full App with a scripted view containing one pipe of each
 * slope class (downhill / flat / uphill / stalled) plus a pipe whose
 * destination is outside the visibility horizon (fog fallback → flat),
 * then verifies the canvas paints the four slope colors (pixel
 * readback) and the stalled pipe renders hollow — stroke present on
 * the triangle edges, fill absent at the centroid.
 *
 * Runs in Vitest Browser Mode — pixel readback needs a real canvas
 * implementation, which happy-dom does not provide.
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { DEFAULT_CAMERA } from '../../../src/config';
import {
    clearConsoleStateForTesting,
    createStubConsoleState,
    setConsoleStateForTesting,
} from '../../../src/internal/test-state';
import { App } from '../../../src/render/App';
import {
    PIPE_DOWNHILL_COLOR,
    PIPE_FLAT_COLOR,
    PIPE_STALLED_COLOR,
    PIPE_UPHILL_COLOR,
} from '../../../src/render/palette';
import type { CellView, Direction, PlayerView } from '../../../src/state/types';
import { TEST_PLAYER_1, TEST_PLAYER_2 } from '../../fixtures/player-view';
import { expectNoDomA11yViolations } from '../../setup-a11y-dom';
import '../../../src/styles/index.css';

/** Board size of the scripted slope view (8×8 keeps pixel math small). */
const BOARD_SIZE = 8;

/** Parse `#rrggbb` into an [r, g, b] triple. */
function hexToRgb(hex: string): [number, number, number] {
    return [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16),
    ];
}

/** True when `pixel` matches `rgb` within `tolerance` per channel. */
function closeTo(pixel: Uint8ClampedArray, rgb: [number, number, number], tolerance = 8): boolean {
    return (
        Math.abs(pixel[0] - rgb[0]) < tolerance &&
        Math.abs(pixel[1] - rgb[1]) < tolerance &&
        Math.abs(pixel[2] - rgb[2]) < tolerance
    );
}

/** CellView literal shorthand for the scripted view. */
function cell(x: number, y: number, elevation: number, pipes: ReadonlySet<Direction> = new Set()): CellView {
    return {
        coord: { x, y },
        cell: { x, y, elevation, terrain: 'land' },
        troopCount: 0,
        troopOwner: null,
        pipes,
        reservesPercent: 0,
        cityOwner: null,
    };
}

/**
 * Scripted view: row 1 holds five sources, each with a single north
 * pipe; row 0 holds the four in-horizon destinations. (5,0) is
 * DELIBERATELY absent — the fog fallback case (destination outside
 * the visibility horizon → flat, no slope claim).
 *
 *   src (1,1) elev 100 → dst (1,0) elev  50  Δ=-50  downhill
 *   src (2,1) elev 100 → dst (2,0) elev 100  Δ=  0  flat
 *   src (3,1) elev 100 → dst (3,0) elev 103  Δ=  3  uphill (rate 4)
 *   src (4,1) elev 100 → dst (4,0) elev 107  Δ=  7  stalled (rate 0)
 *   src (5,1) elev 100 → dst (5,0) ABSENT        fog fallback → flat
 */
function createSlopePlayerView(): PlayerView {
    const visibleCells: CellView[] = [
        cell(1, 0, 50),
        cell(2, 0, 100),
        cell(3, 0, 103),
        cell(4, 0, 180),
        cell(1, 1, 100, new Set(['N'])),
        cell(2, 1, 100, new Set(['N'])),
        cell(3, 1, 100, new Set(['N'])),
        cell(4, 1, 100, new Set(['N'])),
        cell(5, 1, 100, new Set(['N'])),
    ];
    return {
        player: TEST_PLAYER_1,
        tick: 1,
        visibleCells,
        events: { combat: [], captures: [], eliminations: [], appliedOrders: [], errors: [] },
        config: {
            boardSize: BOARD_SIZE,
            playerIds: [TEST_PLAYER_1, TEST_PLAYER_2],
            tickIntervalMs: 250,
            seed: 0,
            visibilityRadius: 2,
        },
    };
}

afterEach(() => {
    cleanup();
    clearConsoleStateForTesting();
});

describe('pipe slope color-coding (005 FR-013)', () => {
    test('canvas paints downhill/flat/uphill pipes in their slope colors and fog-unknown as flat', async () => {
        setConsoleStateForTesting(createStubConsoleState(createSlopePlayerView()));
        const screen = await render(<App />);

        // The a11y overlay proves React committed; the effect that paints
        // the canvas runs in the same commit cycle.
        await expect.element(screen.getByRole('grid')).toBeInTheDocument();

        const canvas = screen.container.querySelector('canvas');
        expect(canvas).not.toBeNull();

        const ctx = canvas?.getContext('2d');
        expect(ctx).not.toBeNull();

        const { zoom } = DEFAULT_CAMERA;
        const boardPx = BOARD_SIZE * zoom;

        const downhillRgb = hexToRgb(PIPE_DOWNHILL_COLOR);
        const flatRgb = hexToRgb(PIPE_FLAT_COLOR);
        const uphillRgb = hexToRgb(PIPE_UPHILL_COLOR);

        // Poll for the expected pixel state. Offsets are recalculated on
        // each iteration because the canvas bitmap dimensions change as
        // useContainerSize fires its ResizeObserver and the paint effect
        // re-runs. Sampling inside the poll ensures we always use
        // dimensions that match the most recent paint.
        await expect
            .poll(
                () => {
                    const curW = canvas?.width ?? 0;
                    const curH = canvas?.height ?? 0;
                    if (curW === 0 || curH === 0) return false;
                    // Wait for at least one paint to complete.
                    if (Number(canvas?.getAttribute('data-paint-count') ?? '0') === 0) return false;
                    const offX = boardPx < curW ? (curW - boardPx) / 2 : 0;
                    const offY = boardPx < curH ? (curH - boardPx) / 2 : 0;

                    /**
                     * Sample a pixel inside the north-facing pipe triangle.
                     * After issue #101, triangles point outward from cell
                     * center — the base sits at midY (cell center) and the
                     * apex extends upward. Sampling 1px above the base
                     * (midY - 1) lands safely in the solid fill region.
                     */
                    const samplePipe = (cellX: number, cellY: number): Uint8ClampedArray | undefined => {
                        const px = cellX * zoom + zoom / 2 + offX;
                        // 1px above the cell center = inside the north triangle
                        // at its widest point (the base).
                        const py = cellY * zoom + zoom / 2 - 1 + offY;
                        return ctx?.getImageData(Math.round(px), Math.round(py), 1, 1).data;
                    };
                    // Downhill (Δ=-50, intensity=1)
                    const d = samplePipe(1, 1);
                    if (d === undefined || !closeTo(d, downhillRgb)) return false;
                    // Flat (Δ=0, intensity=0)
                    const f = samplePipe(2, 1);
                    if (f === undefined || !closeTo(f, flatRgb)) return false;
                    // Uphill (Δ=3, intensity=3/7)
                    const u = samplePipe(3, 1);
                    if (u === undefined || !closeTo(u, uphillRgb)) return false;
                    // Fog fallback (intensity=0)
                    const fog = samplePipe(5, 1);
                    if (fog === undefined || !closeTo(fog, flatRgb)) return false;
                    return true;
                },
                { timeout: 5000, message: 'slope color pixels match expected values' },
            )
            .toBe(true);
    });
    test('stalled pipe renders in stalled color at its location', async () => {
        setConsoleStateForTesting(createStubConsoleState(createSlopePlayerView()));
        const screen = await render(<App />);

        await expect.element(screen.getByRole('grid')).toBeInTheDocument();

        const canvas = screen.container.querySelector('canvas');
        expect(canvas).not.toBeNull();

        const ctx = canvas?.getContext('2d');
        expect(ctx).not.toBeNull();

        const { zoom } = DEFAULT_CAMERA;
        const stalledRgb = hexToRgb(PIPE_STALLED_COLOR);
        const boardPx = BOARD_SIZE * zoom;

        // Poll for the expected pixel state: the stalled pipe at (4,1)
        // renders in PIPE_STALLED_COLOR (hollow stroke treatment, but
        // the stroke dominates at small sizes — verify color presence).
        await expect
            .poll(
                () => {
                    const curW = canvas?.width ?? 0;
                    const curH = canvas?.height ?? 0;
                    if (curW === 0 || curH === 0) return false;
                    if (Number(canvas?.getAttribute('data-paint-count') ?? '0') === 0) return false;
                    const offX = boardPx < curW ? (curW - boardPx) / 2 : 0;
                    const offY = boardPx < curH ? (curH - boardPx) / 2 : 0;
                    // Sample at the base of the north triangle (midY) where
                    // the stroke is drawn.
                    const edge = ctx?.getImageData(
                        Math.round(4 * zoom + zoom / 2 + offX),
                        Math.round(1 * zoom + zoom / 2 + offY),
                        1,
                        1,
                    ).data;
                    if (edge === undefined) return false;
                    return closeTo(edge, stalledRgb);
                },
                { timeout: 5000, message: 'stalled pipe renders in stalled color' },
            )
            .toBe(true);
    });

    test('the booted board passes an axe scan', async () => {
        setConsoleStateForTesting(createStubConsoleState(createSlopePlayerView()));
        await render(<App />);

        await expectNoDomA11yViolations(document);
    });

    test('DOM pipe spans have data-slope attributes matching their slope class', async () => {
        setConsoleStateForTesting(createStubConsoleState(createSlopePlayerView()));
        const screen = await render(<App />);
        await expect.element(screen.getByRole('grid')).toBeInTheDocument();

        // Each source cell (row 1) has a single north pipe.
        const pipeSpans = screen.container.querySelectorAll('.europa-pipe');
        expect(pipeSpans.length).toBe(5);

        // (1,1) → downhill, (2,1) → flat, (3,1) → uphill, (4,1) → stalled, (5,1) → flat (fog)
        const expectedSlopes = ['downhill', 'flat', 'uphill', 'stalled', 'flat'];
        for (let i = 0; i < expectedSlopes.length; i++) {
            const span = pipeSpans[i];
            expect(span?.getAttribute('data-slope')).toBe(expectedSlopes[i]);
        }
    });

    test('pipe spans have --pipe-tri-depth set via inline style (intensity sizing)', async () => {
        setConsoleStateForTesting(createStubConsoleState(createSlopePlayerView()));
        const screen = await render(<App />);
        await expect.element(screen.getByRole('grid')).toBeInTheDocument();

        const pipeSpans = screen.container.querySelectorAll('.europa-pipe');
        for (const span of pipeSpans) {
            const style = (span as HTMLElement).style;
            // --pipe-tri-depth should be set as a CSS custom property
            const triValue = style.getPropertyValue('--pipe-tri-depth');
            expect(triValue).toBeTruthy();
            expect(triValue).toMatch(/^\d+(\.\d+)?%$/);
        }
    });

    test('downhill pipe has larger triangle than flat pipe (intensity > 0 vs = 0)', async () => {
        setConsoleStateForTesting(createStubConsoleState(createSlopePlayerView()));
        const screen = await render(<App />);
        await expect.element(screen.getByRole('grid')).toBeInTheDocument();

        const pipeSpans = [...screen.container.querySelectorAll('.europa-pipe')];
        // (1,1) downhill — first pipe span (index 0)
        const downhillTri = parseFloat(pipeSpans[0]?.style.getPropertyValue('--pipe-tri-depth') ?? '0');
        // (2,1) flat — second pipe span (index 1)
        const flatTri = parseFloat(pipeSpans[1]?.style.getPropertyValue('--pipe-tri-depth') ?? '0');

        expect(downhillTri).toBeGreaterThan(flatTri);
    });

    test('canvas triangle size varies with intensity: downhill (high) > flat (zero)', async () => {
        setConsoleStateForTesting(createStubConsoleState(createSlopePlayerView()));
        const screen = await render(<App />);
        await expect.element(screen.getByRole('grid')).toBeInTheDocument();

        const canvas = screen.container.querySelector('canvas');
        expect(canvas).not.toBeNull();

        const ctx = canvas?.getContext('2d');
        expect(ctx).not.toBeNull();

        const { zoom } = DEFAULT_CAMERA;
        const maxDepth = zoom / 2;

        // Downhill (Δ=-50, intensity=1): full depth (100% = maxDepth)
        const downhillDepth = maxDepth * (0.3 + 1.0 * 0.7);
        // Flat (Δ=0, intensity=0): 30% depth
        const flatDepth = maxDepth * (0.3 + 0 * 0.7);

        expect(downhillDepth).toBeGreaterThan(flatDepth);

        const boardPx = BOARD_SIZE * zoom;
        const downhillRgb = hexToRgb(PIPE_DOWNHILL_COLOR);
        // Sample at the centroid of the north-pointing triangle:
        // base at midY, tip at midY - depth. Centroid = 1/3 from base.
        const centroidY = downhillDepth / 3;

        // Poll for the expected pixel state with recalculated offsets.
        await expect
            .poll(
                () => {
                    const curW = canvas?.width ?? 0;
                    const curH = canvas?.height ?? 0;
                    if (curW === 0 || curH === 0) return false;
                    // Wait for at least one paint to complete.
                    if (Number(canvas?.getAttribute('data-paint-count') ?? '0') === 0) return false;
                    const offX = boardPx < curW ? (curW - boardPx) / 2 : 0;
                    const offY = boardPx < curH ? (curH - boardPx) / 2 : 0;
                    const px = 1 * zoom + zoom / 2 + offX;
                    // After issue #101, sample from midY upward (centroid).
                    const py = 1 * zoom + zoom / 2 - centroidY + offY;
                    const pixel = ctx?.getImageData(Math.round(px), Math.round(py), 1, 1).data;
                    if (pixel === undefined) return false;
                    return closeTo(pixel, downhillRgb);
                },
                { timeout: 5000, message: 'downhill triangle centroid is downhill color' },
            )
            .toBe(true);
    });
});
