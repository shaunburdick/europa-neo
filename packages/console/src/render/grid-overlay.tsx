/**
 * ARIA grid overlay — Feature 005 (T046).
 *
 * The accessibility source of truth for the board (research.md §2):
 * a `<div role="grid">` absolutely positioned over the canvas, with
 * one `role="gridcell"` per VISIBLE cell. Cells outside the visibility
 * horizon emit no node at all — they are void (fog FR-002; Phase 3
 * Independent Test item f).
 *
 * Structure follows the ARIA grid pattern so axe-core's
 * `aria-required-children` passes: `role="grid"` → `role="row"` →
 * `role="gridcell"`. Rows exist only for board rows containing at
 * least one visible cell; every row/cell states its explicit
 * `aria-rowindex` / `aria-colindex` because the grid is sparse.
 *
 * Keyboard model (WCAG 2.1.1): the grid container is the single Tab
 * stop; arrow keys move a roving focus coordinate rendered as a focus
 * ring and exposed via `aria-activedescendant`. Movement math is
 * delegated to {@link KeyboardNavigator} (Phase 2 T020) so the logic
 * stays unit-tested in one place.
 *
 * WCAG references: 1.3.1 Info and Relationships (the grid conveys the
 * same cells/troops/ownership relationships the canvas paints),
 * 4.1.2 Name, Role, Value (every gridcell has an accessible name).
 */

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';

import { KeyboardNavigator } from '../a11y/keyboard';
import { coordKey } from '../state/build-map-view';
import type { CellRenderInfo, Coord, MapView } from '../state/types';
import { CellView, cellElementId } from './cell-view';

/** Props for {@link GridOverlay}. */
export interface GridOverlayProps {
    /** The frame snapshot to render (data-model.md §2). */
    readonly mapView: MapView;
    /**
     * Click activation on a visible cell (pointer or Enter key).
     * The order pipeline consumes this from Phase 4 onward; optional
     * so the US1 MVP can mount without input wiring. `| undefined` so
     * callers may pass through optional values under
     * `exactOptionalPropertyTypes` (same pattern as CellViewProps).
     */
    readonly onCellClick?: ((info: CellRenderInfo) => void) | undefined;
    /**
     * Hover tracking; called with the entered cell's coord, or `null`
     * when the pointer leaves the grid.
     */
    readonly onCellHover?: ((coord: Coord | null) => void) | undefined;
    /**
     * Roving-focus notification (US2): fired whenever the grid's focus
     * coordinate MOVES (arrow keys / focus entry — never on blur
     * clearing). Interactive hosts mirror it into `state.selection` so
     * keyboard pipe/ability keys act on the ring's cell.
     */
    readonly onFocusedCoordChange?: ((coord: Coord | null) => void) | undefined;
}

/**
 * The ARIA grid overlay component. Renders the sparse row/cell DOM
 * over the canvas and owns the roving-focus keyboard behavior.
 */
export function GridOverlay({
    mapView,
    onCellClick,
    onCellHover,
    onFocusedCoordChange,
}: GridOverlayProps): JSX.Element {
    const keyboardNavigatorRef = useRef<KeyboardNavigator | null>(null);
    if (keyboardNavigatorRef.current === null) {
        keyboardNavigatorRef.current = new KeyboardNavigator();
    }
    const keyboardNavigator = keyboardNavigatorRef.current;

    // Roving focus coordinate: null until the grid receives focus,
    // then initialized at the board center (KeyboardNavigator contract).
    const [focusedCoord, setFocusedCoord] = useState<Coord | null>(null);

    // Keep the visual ring glued to programmatic selection changes
    // (click-to-select, Phase 8 runtime seeding). Same-reference writes
    // bail out of React rendering, so this cannot loop with the
    // notification below.
    useEffect(() => {
        if (mapView.selection !== null) {
            setFocusedCoord(mapView.selection);
        }
    }, [mapView.selection]);

    /**
     * Move the ring AND notify the host (selection mirroring). Blur
     * clearing bypasses this — losing focus must not drop the anchor.
     */
    function moveRovingFocus(coord: Coord | null): void {
        setFocusedCoord(coord);
        onFocusedCoordChange?.(coord);
    }

    // Group visible cells into rows keyed by y, each sorted by x.
    const rows = new Map<number, CellRenderInfo[]>();
    for (const info of mapView.cells.values()) {
        const row = rows.get(info.coord.y);
        if (row === undefined) {
            rows.set(info.coord.y, [info]);
        } else {
            row.push(info);
        }
    }
    const sortedRows = [...rows.entries()].sort(([a], [b]) => a - b);
    for (const [, row] of sortedRows) {
        row.sort((a, b) => a.coord.x - b.coord.x);
    }

    const { zoom } = mapView.camera;

    /** Move the roving focus one step in the pressed arrow direction. */
    function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
        const direction = ARROW_DIRECTIONS[event.key];
        if (direction !== undefined) {
            event.preventDefault();
            const current = focusedCoord ?? keyboardNavigator.getInitialFocus(mapView.width, mapView.height);
            moveRovingFocus(keyboardNavigator.moveFocus(current, direction, mapView));
            return;
        }
        if ((event.key === 'Enter' || event.key === ' ') && onCellClick !== undefined) {
            const target = focusedCoord === null ? null : (mapView.cells.get(coordKey(focusedCoord)) ?? null);
            if (target !== null) {
                event.preventDefault();
                onCellClick(target);
            }
        }
    }

    return (
        <div
            id="map"
            role="grid"
            aria-label="Game board"
            tabIndex={0}
            className="europa-grid"
            style={{ width: mapView.width * zoom, height: mapView.height * zoom }}
            aria-activedescendant={focusedCoord === null ? undefined : cellElementId(focusedCoord)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
                if (focusedCoord === null) {
                    // Resume at the existing selection when there is one (e.g.,
                    // the player clicked a cell, then Tabbed in); otherwise the
                    // board center per KeyboardNavigator's contract.
                    moveRovingFocus(
                        mapView.selection ?? keyboardNavigator.getInitialFocus(mapView.width, mapView.height),
                    );
                }
            }}
            onBlur={() => setFocusedCoord(null)}
            onPointerLeave={onCellHover === undefined ? undefined : () => onCellHover(null)}
        >
            {/*
                Rows are NON-positioned ARIA pass-throughs: they exist to
                satisfy the grid → row → gridcell structure (axe-core
                aria-required-children) and carry aria-rowindex. They must
                NOT be positioned containers — CellView positions itself
                at board-absolute (x·zoom, y·zoom) against .europa-grid
                (position:absolute in styles/index.css). A positioned row
                would add its own y·zoom on top of every cell's
                board-absolute top, doubling the vertical offset (live
                defect: rows drifted below the canvas as "bands").
            */}
            {sortedRows.map(([y, cells]) => (
                <div key={y} role="row" aria-rowindex={y + 1} className="europa-grid__row">
                    {cells.map((info) => (
                        <CellView
                            key={cellElementId(info.coord)}
                            info={info}
                            camera={mapView.camera}
                            playerColors={mapView.playerColors}
                            focused={
                                focusedCoord !== null &&
                                focusedCoord.x === info.coord.x &&
                                focusedCoord.y === info.coord.y
                            }
                            onClick={onCellClick}
                            onPointerEnter={onCellHover === undefined ? undefined : () => onCellHover(info.coord)}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

/** Arrow-key → FocusDirection mapping (KeyboardNavigator alphabet). */
const ARROW_DIRECTIONS: Readonly<Record<string, 'N' | 'S' | 'W' | 'E'>> = {
    ArrowUp: 'N',
    ArrowDown: 'S',
    ArrowLeft: 'W',
    ArrowRight: 'E',
};
