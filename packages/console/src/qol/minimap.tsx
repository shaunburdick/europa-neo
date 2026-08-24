/**
 * Minimap — Feature 005 (T081).
 *
 * The US5 overview widget (spec US5 AC-1, FR-010): a 96×96 canvas
 * showing the full board at thumbnail size with the player's current
 * viewport highlighted as a translucent rectangle; clicking centers
 * the camera on the clicked position.
 *
 * Geometry: cells map into the minimap by
 * `scale = SIZE / max(boardWidth, boardHeight)`; the viewport rect is
 * the screen-space window `[-pan/zoom … +viewportSize/zoom]` scaled
 * down. Clicking maps back through the scale and dispatches
 * `{ kind: 'setCamera', camera }` with the pan that centers the
 * clicked cell (`pan = viewportCenter − cell × zoom`, clamped per
 * data-model.md §4 via {@link clampCamera}).
 *
 * Accessibility: `role="img"` + `aria-label="Minimap"` describe the
 * thumbnail for screen readers; navigation itself remains fully
 * keyboard-operable through the arrow keys / grid overlay.
 *
 * JSDoc reference: US5 AC-1.
 */

import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { VOID_COLOR } from '../render/palette';
import type { CameraState, CellRenderInfo, Coord } from '../state/types';
import { clampCamera } from './zoom';

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
  // `|| 0` normalizes -0 (negative pan of 0) to +0 so snapshots and
  // deep-equality stay stable.
  return {
    x: (-camera.pan.x / camera.zoom) * scale || 0,
    y: (-camera.pan.y / camera.zoom) * scale || 0,
    w: (view.width / camera.zoom) * scale,
    h: (view.height / camera.zoom) * scale,
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
   * Map a click to its board cell and dispatch the centering camera.
   * Formula (task T081): `pan = viewportCenter − clickedCell × zoom`.
   */
  function handleClick(event: React.MouseEvent<HTMLCanvasElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = event.currentTarget.width / rect.width;
    const scaleY = event.currentTarget.height / rect.height;
    const px = (event.clientX - rect.left) * scaleX;
    const py = (event.clientY - rect.top) * scaleY;
    const scale = minimapScale({ width: boardWidth, height: boardHeight });
    const cellX = Math.floor(px / scale);
    const cellY = Math.floor(py / scale);
    const view = viewportSize ?? {
      width: boardWidth * camera.zoom,
      height: boardHeight * camera.zoom,
    };
    const next = clampCamera(
      {
        ...camera,
        pan: {
          x: view.width / 2 - cellX * camera.zoom,
          y: view.height / 2 - cellY * camera.zoom,
        },
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
    ctx.fillStyle = info.terrain === 'water' ? '#1d4ed8' : '#3f4a35';
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
    ctx.fillStyle = '#f9fafb';
    const dot = info.isCity ? Math.max(3, scale) : Math.max(2, scale * 0.8);
    ctx.fillRect(
      info.coord.x * scale + (scale - dot) / 2,
      info.coord.y * scale + (scale - dot) / 2,
      dot,
      dot,
    );
  }

  // Viewport rectangle (translucent white).
  const rect = viewportRect(camera, { width: boardWidth, height: boardHeight }, viewportSize);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(rect.w, 2), Math.max(rect.h, 2));
}

/** Re-exported type alias keeping the props surface self-descriptive. */
export type MinimapCoord = Coord;
