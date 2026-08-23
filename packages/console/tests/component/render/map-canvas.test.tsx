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
import { VOID_COLOR } from '../../../src/render/palette';
import { expectNoDomA11yViolations } from '../../setup';
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
    const zoom = DEFAULT_CAMERA.zoom;
    expect(canvas?.width).toBe(view.config.boardSize * zoom);
    expect(canvas?.height).toBe(view.config.boardSize * zoom);

    const ctx = canvas?.getContext('2d');
    expect(ctx).not.toBeNull();

    const voidRgb = hexToRgb(VOID_COLOR);
    const visibleKeys = new Set(view.visibleCells.map((cell) => `${cell.coord.x},${cell.coord.y}`));

    let paintedVisible = 0;
    let paintedVoid = 0;
    for (let y = 0; y < view.config.boardSize; y++) {
      for (let x = 0; x < view.config.boardSize; x++) {
        const pixel = ctx?.getImageData(x * zoom + zoom / 2, y * zoom + zoom / 2, 1, 1).data;
        if (pixel === undefined) {
          continue;
        }
        const isVoid =
          Math.abs(pixel[0] - voidRgb[0]) < 6 &&
          Math.abs(pixel[1] - voidRgb[1]) < 6 &&
          Math.abs(pixel[2] - voidRgb[2]) < 6;
        if (visibleKeys.has(`${x},${y}`)) {
          if (!isVoid) {
            paintedVisible++;
          }
        } else if (isVoid) {
          paintedVoid++;
        }
      }
    }

    // Every visible cell got painted; every out-of-horizon cell is void.
    expect(paintedVisible).toBe(view.visibleCells.length);
    const totalCells = view.config.boardSize * view.config.boardSize;
    expect(paintedVoid).toBe(totalCells - view.visibleCells.length);
  });

  test('the booted board passes an axe scan', async () => {
    setConsoleStateForTesting(createStubConsoleState(createDemoPlayerView()));
    await render(<App />);

    await expectNoDomA11yViolations(document);
  });
});
