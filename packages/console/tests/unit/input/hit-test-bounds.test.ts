/** Half-open board-boundary tests for pointer targeting (spec 005 FR-002). */

import { describe, expect, test } from 'vitest';
import { DEFAULT_CAMERA } from '../../../src/config';
import { hitTest } from '../../../src/input/hit-test';

const BOARD_SIZE = 16;

describe('hitTest board bounds', () => {
    test.each([
        ['negative x', { x: -1, y: DEFAULT_CAMERA.zoom }],
        ['negative y', { x: DEFAULT_CAMERA.zoom, y: -1 }],
        ['right edge', { x: BOARD_SIZE * DEFAULT_CAMERA.zoom, y: DEFAULT_CAMERA.zoom }],
        ['past right edge', { x: BOARD_SIZE * DEFAULT_CAMERA.zoom + 1, y: DEFAULT_CAMERA.zoom }],
        ['bottom edge', { x: DEFAULT_CAMERA.zoom, y: BOARD_SIZE * DEFAULT_CAMERA.zoom }],
        ['past bottom edge', { x: DEFAULT_CAMERA.zoom, y: BOARD_SIZE * DEFAULT_CAMERA.zoom + 1 }],
    ])('rejects %s outside [0, boardSize)', (_label, point) => {
        expect(hitTest(point, DEFAULT_CAMERA, BOARD_SIZE, { x: 0, y: 0 }).cell).toBeNull();
    });

    test('accepts the last cell when the point remains inside the half-open board', () => {
        const lastCell = BOARD_SIZE - 1;
        const result = hitTest(
            { x: (lastCell + 0.5) * DEFAULT_CAMERA.zoom, y: (lastCell + 0.5) * DEFAULT_CAMERA.zoom },
            DEFAULT_CAMERA,
            BOARD_SIZE,
            { x: 0, y: 0 },
        );
        expect(result.cell).toEqual({ x: lastCell, y: lastCell });
    });
});
