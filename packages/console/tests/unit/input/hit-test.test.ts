/** Hit-testing rejects exterior margins while preserving in-board targeting. */

import { describe, expect, it } from 'vitest';

import { hitTest } from '../../../src/input/hit-test';
import { computeViewportOffset } from '../../../src/render/viewport-offset';
import type { CameraState } from '../../../src/state/types';

const BOARD = { width: 16, height: 16 };
const VIEWPORT = { width: 640, height: 640 };
const CAMERA: CameraState = { zoom: 32, pan: { x: 0, y: 0 }, minZoom: 32, maxZoom: 96 };
const OFFSET = computeViewportOffset(CAMERA.zoom, CAMERA.pan, BOARD, VIEWPORT.width, VIEWPORT.height);

describe('hitTest board bounds', () => {
    it.each([
        { x: 63, y: 320 },
        { x: 577, y: 320 },
        { x: 320, y: 63 },
        { x: 320, y: 577 },
    ])('returns no cell for an exterior margin point %o', (point) => {
        expect(hitTest(point, CAMERA, BOARD.width, OFFSET).cell).toBeNull();
    });

    it('retains correct targeting for an in-board point under the shared transform', () => {
        const screen = {
            x: -OFFSET.x + 3.25 * CAMERA.zoom,
            y: -OFFSET.y + 7.75 * CAMERA.zoom,
        };
        const target = hitTest(screen, CAMERA, BOARD.width, OFFSET);
        expect(target.cell).toEqual({ x: 3, y: 7 });
        expect(target.subcell).toEqual({ x: 0.25, y: 0.75 });
    });
});
