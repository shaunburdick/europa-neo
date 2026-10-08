/**
 * Minimap — Feature 005 (T081).
 *
 * The US5 overview widget (spec US5 AC-1, FR-010): a 96×96 canvas
 * showing the full board at thumbnail size with the player's current
 * viewport highlighted as a translucent rectangle; clicking centers
 * the camera on the clicked position.
 *
 * Geometry: cells map into the minimap by
 * `scale = SIZE / max(boardWidth, boardHeight)`. The viewport rectangle
 * inverts the shared centered-origin transform and clips to board bounds.
 * Clicks target a cell center and use the corner-reachable pan formula;
 * physical zoom remains 32–96 CSS px/cell with effective maximum
 * `min(96, fitZoom * 3)`.
 *
 * Accessibility: `role="img"` + `aria-label="Minimap"` describe the
 * thumbnail for screen readers; navigation itself remains fully
 * keyboard-operable through the arrow keys / grid overlay.
 *
 * JSDoc reference: US5 AC-1.
 */

import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { terrainColor, VOID_COLOR } from '../render/palette';
import { computeViewportOffset } from '../render/viewport-offset';
import type { CameraState, CellRenderInfo, Coord } from '../state/types';
import { clampCamera, panForCellCenter } from './zoom';

/** Minimap edge length in CSS pixels. */
export const MINIMAP_SIZE_PX = 96;

/** Board dimensions + viewport geometry the minimap needs. */
export interface MinimapGeometry {
    /** Board width in cells. */
    readonly width: number;
    /** Board height in cells. */
    readonly height: number;
}

/**
 * Cells-per-minimap-pixel scale factor. Pure.
 *
 * @param board Board dimensions in cells.
 */
export function minimapScale(board: MinimapGeometry): number {
    return MINIMAP_SIZE_PX / Math.max(board.width, board.height);
}

/**
 * The visible-viewport rectangle in minimap pixels
 * (`{ x, y, w, h }`). Pure.
 *
 * @param camera       Current camera.
 * @param board        Board dimensions in cells.
 * @param viewportSize Visible container size in CSS pixels; defaults
 *                     to the full board at current zoom.
 */
export function viewportRect(
    camera: CameraState,
    board: MinimapGeometry,
    viewportSize?: { readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } {
    const scale = minimapScale(board);
    const view = viewportSize ?? {
        width: board.width * camera.zoom,
        height: board.height * camera.zoom,
    };
    const offset = computeViewportOffset(camera.zoom, camera.pan, board, view.width, view.height);
    const left = offset.x / camera.zoom;
    const top = offset.y / camera.zoom;
    const right = left + view.width / camera.zoom;
    const bottom = top + view.height / camera.zoom;
    const x = Math.max(0, Math.min(board.width, left));
    const y = Math.max(0, Math.min(board.height, top));
    const clippedRight = Math.max(x, Math.min(board.width, right));
    const clippedBottom = Math.max(y, Math.min(board.height, bottom));
    // `|| 0` normalizes -0 for stable snapshots/deep-equality.
    return {
        x: x * scale || 0,
        y: y * scale || 0,
        w: (clippedRight - x) * scale,
        h: (clippedBottom - y) * scale,
    };
}

/** Props for {@link Minimap}. */
export interface MinimapProps {
    /** Board dimensions in cells. */
    readonly boardWidth: number;
    /** Board dimensions in cells. */
    readonly boardHeight: number;
    /** Current camera (drives the viewport rectangle). */
    readonly camera: CameraState;
    /** Visible cells to thumbnail (owner-colored dots). */
    readonly cells: readonly CellRenderInfo[];
    /** Visible container size in CSS pixels (viewport rect accuracy). */
    readonly viewportSize?: { readonly width: number; readonly height: number };
    /** Dispatch sink — receives the centered `setCamera` action. */
    readonly onSetCamera: (camera: CameraState) => void;
}

/**
 * The 96×96 board thumbnail with viewport indicator. Pure drawing of
 * deterministic data; no clock reads.
 */
export function Minimap({
    boardWidth,
    boardHeight,
    camera,
    cells,
    viewportSize,
    onSetCamera,
}: MinimapProps): JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas === null) {
            return;
        }
        const ctx = canvas.getContext('2d');
        if (ctx === null) {
            return;
        }
        paintMinimap(ctx, boardWidth, boardHeight, cells, camera, viewportSize);
    }, [boardWidth, boardHeight, cells, camera, viewportSize]);

    /**
     * Map a click to its board cell center and dispatch the centered camera.
     */
    function handleClick(event: React.MouseEvent<HTMLCanvasElement>): void {
        const rect = event.currentTarget.getBoundingClientRect();
        const scaleX = event.currentTarget.width / rect.width;
        const scaleY = event.currentTarget.height / rect.height;
        const px = (event.clientX - rect.left) * scaleX;
        const py = (event.clientY - rect.top) * scaleY;
        const scale = minimapScale({ width: boardWidth, height: boardHeight });
        const cellX = Math.min(boardWidth - 1, Math.max(0, Math.floor(px / scale)));
        const cellY = Math.min(boardHeight - 1, Math.max(0, Math.floor(py / scale)));
        const cell = { x: cellX, y: cellY };
        const pan = panForCellCenter(cell, camera.zoom, {
            width: boardWidth,
            height: boardHeight,
        });
        const next = clampCamera(
            {
                ...camera,
                pan,
            },
            { width: boardWidth, height: boardHeight },
        );
        onSetCamera(next);
    }

    return (
        <canvas
            ref={canvasRef}
            role="img"
            aria-label="Minimap"
            className="europa-minimap europa-focus-ring"
            width={MINIMAP_SIZE_PX}
            height={MINIMAP_SIZE_PX}
            style={{ width: MINIMAP_SIZE_PX, height: MINIMAP_SIZE_PX }}
            onClick={handleClick}
        />
    );
}

/**
 * Paint one minimap frame: void backdrop → land/water thumbnails →
 * owner dots → viewport rectangle. Deterministic strokes.
 */
function paintMinimap(
    ctx: CanvasRenderingContext2D,
    boardWidth: number,
    boardHeight: number,
    cells: readonly CellRenderInfo[],
    camera: CameraState,
    viewportSize: { readonly width: number; readonly height: number } | undefined,
): void {
    const scale = minimapScale({ width: boardWidth, height: boardHeight });
    ctx.fillStyle = VOID_COLOR;
    ctx.fillRect(0, 0, MINIMAP_SIZE_PX, MINIMAP_SIZE_PX);

    // Land/water thumbnails (elevation-shaded land reads as texture).
    for (const info of cells) {
        ctx.fillStyle = terrainColor(info.terrain, info.elevation);
        ctx.fillRect(
            Math.floor(info.coord.x * scale),
            Math.floor(info.coord.y * scale),
            Math.ceil(scale),
            Math.ceil(scale),
        );
    }
    // Owner dots (city cells slightly larger).
    for (const info of cells) {
        if (info.owner === null) {
            continue;
        }
        // design-exception: canvas fallback — spec Edge Cases § pit
        ctx.fillStyle = '#f9fafb';
        const dot = info.isCity ? Math.max(3, scale) : Math.max(2, scale * 0.8);
        ctx.fillRect(info.coord.x * scale + (scale - dot) / 2, info.coord.y * scale + (scale - dot) / 2, dot, dot);
    }

    // Viewport rectangle (translucent white).
    const rect = viewportRect(camera, { width: boardWidth, height: boardHeight }, viewportSize);
    // design-exception: canvas fallback — spec Edge Cases § pit
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, boardWidth * scale, boardHeight * scale);
    ctx.clip();
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(rect.w, 2), Math.max(rect.h, 2));
    ctx.restore();
}

/** Re-exported type alias keeping the props surface self-descriptive. */
export type MinimapCoord = Coord;
