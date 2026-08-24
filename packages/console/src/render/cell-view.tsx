/**
 * Per-cell React component — Feature 005 (T044).
 *
 * Renders ONE visible cell as an absolutely-positioned DOM element
 * carrying both the visual layer (inline styles; the Canvas 2D pass
 * in `canvas.ts` paints the same data for the dense board) and the
 * accessibility attributes that make the cell exist for assistive
 * tech (research.md §2: the DOM overlay is the a11y source of truth).
 *
 * A11y contract (WCAG 4.1.2 Name, Role, Value):
 *   - `role="gridcell"` with explicit `aria-rowindex` / `aria-colindex`
 *     (1-based per ARIA practice) — the grid is sparse, so indices
 *     are stated rather than implied by DOM position.
 *   - `aria-label` built by {@link formatCellAriaLabel}: coordinates,
 *     troop count, owner name, city flag, pipe directions — never
 *     color alone (constitution Principle VI).
 *
 * Visual contract (data-model.md §3): water renders blue; land is
 * shaded by elevation; cities get a distinct outline; pipes render as
 * CSS triangles at the matching cell edges; reserves render as a
 * small percentage badge.
 */

import type { JSX } from 'react';
import type { CameraState, CellRenderInfo, Direction, PlayerId } from '../state/types';
import { CHIP_BACKGROUND, CHIP_TEXT, CITY_COLOR, FOCUS_RING_COLOR, terrainColor } from './palette';

/** Props for {@link CellView}. */
export interface CellViewProps {
    /** The pure render data for this cell (data-model.md §3). */
    readonly info: CellRenderInfo;
    /** Active camera — supplies the cell size (zoom) in CSS pixels. */
    readonly camera: CameraState;
    /** Per-player cosmetic colors (MapView.playerColors). */
    readonly playerColors: Readonly<Record<PlayerId, string>>;
    /**
     * Whether this cell currently holds the keyboard focus ring
     * (roving focus via `aria-activedescendant` on the grid).
     */
    readonly focused?: boolean;
    /**
     * Click handler (wired to order dispatch from Phase 4 onward).
     * `| undefined` so callers may pass through optional values under
     * `exactOptionalPropertyTypes`.
     */
    readonly onClick?: ((info: CellRenderInfo) => void) | undefined;
    /** Pointer-enter handler (hover highlight). */
    readonly onPointerEnter?: ((info: CellRenderInfo) => void) | undefined;
}

/**
 * Build the accessible name for one cell.
 *
 * Format (Phase 3 Independent Test item c / Q-B04):
 * `Cell (5, 7), 32 troops, Player 1, city, pipes: N, E` — segments
 * omitted when not applicable (`city` only for cities, `pipes:` only
 * when the cell has pipes, owner rendered as `unowned` when empty).
 * Pure.
 */
export function formatCellAriaLabel(info: CellRenderInfo): string {
    const parts: string[] = [`Cell (${info.coord.x}, ${info.coord.y})`, `${info.troops} troops`];
    parts.push(info.owner !== null ? `Player ${info.owner}` : 'unowned');
    if (info.isCity) {
        parts.push('city');
    }
    if (info.pipes.size > 0) {
        const ordered = DIRECTION_ORDER.filter((direction) => info.pipes.has(direction));
        parts.push(`pipes: ${ordered.join(', ')}`);
    }
    return parts.join(', ');
}

/** Canonical pipe listing order in accessible names. */
const DIRECTION_ORDER: readonly Direction[] = ['N', 'E', 'S', 'W'];

/**
 * Stable DOM id for a cell's gridcell node — the target of the
 * grid container's `aria-activedescendant`. Pure.
 */
export function cellElementId(coord: { readonly x: number; readonly y: number }): string {
    return `europa-cell-${coord.x}-${coord.y}`;
}

/**
 * Render one visible board cell (visual + a11y attributes).
 * Presentational only: all state arrives via props.
 */
export function CellView({
    info,
    camera,
    playerColors,
    focused = false,
    onClick,
    onPointerEnter,
}: CellViewProps): JSX.Element {
    const { zoom } = camera;
    const classes = ['europa-cell'];
    if (focused) {
        classes.push('europa-cell--focused');
    }

    return (
        <div
            role="gridcell"
            id={cellElementId(info.coord)}
            aria-rowindex={info.coord.y + 1}
            aria-colindex={info.coord.x + 1}
            aria-label={formatCellAriaLabel(info)}
            className={classes.join(' ')}
            style={{
                left: info.coord.x * zoom,
                top: info.coord.y * zoom,
                width: zoom,
                height: zoom,
                backgroundColor: terrainColor(info.terrain, info.elevation),
                ...(info.isCity ? { outline: `2px solid ${CITY_COLOR}`, outlineOffset: -2 } : {}),
                ...(focused ? { outline: `3px solid ${FOCUS_RING_COLOR}`, outlineOffset: -3 } : {}),
            }}
            onClick={onClick === undefined ? undefined : () => onClick(info)}
            onPointerEnter={onPointerEnter === undefined ? undefined : () => onPointerEnter(info)}
            onKeyDown={
                onClick === undefined
                    ? undefined
                    : (event) => {
                          // Keyboard activation parity for the click handler
                          // (WCAG 2.1.1). Under the roving-focus model DOM focus
                          // rests on the grid container — whose own keydown
                          // dispatches Enter/Space — so this only fires if a
                          // cell ever gains direct DOM focus.
                          if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onClick(info);
                          }
                      }
            }
        >
            {[...info.pipes].map((direction) => (
                <span key={direction} aria-hidden="true" className={`europa-pipe europa-pipe--${direction}`} />
            ))}
            {info.isCity ? <span aria-hidden="true" className="europa-cell__city-dot" /> : null}
            {info.troops > 0 && info.owner !== null ? (
                <span
                    aria-hidden="true"
                    className="europa-cell__troops"
                    style={{
                        backgroundColor: CHIP_BACKGROUND,
                        color: CHIP_TEXT,
                        borderColor: playerColors[info.owner] ?? CHIP_TEXT,
                    }}
                >
                    {info.troops}
                </span>
            ) : null}
            {info.reservesPct > 0 ? (
                <span
                    aria-hidden="true"
                    className="europa-cell__reserves"
                    style={{ backgroundColor: CHIP_BACKGROUND, color: CHIP_TEXT }}
                >
                    {info.reservesPct * 10}%
                </span>
            ) : null}
        </div>
    );
}
