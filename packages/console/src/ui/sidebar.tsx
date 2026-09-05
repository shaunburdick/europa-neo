/**
 * Sidebar — issue #76 (T100, FR-014/FR-015/FR-021/FR-022).
 *
 * The fixed-width right column of the two-column match view. Owned by
 * `App` (FR-022) so player and spectator share one render path; the
 * sidebar composes the 8 contractual sections in vertical order
 * (FR-015):
 *
 *   1. Status   — connection status, tick counter, local player
 *   2. Players  — per-seat authoritative labels + color indicators
 *   3. Orders   — exclusive/clear mode toggle (OrderBar)
 *   4. Reserve  — reserves slider + quick-select digits (ReservesPanel)
 *   5. Overview — minimap with live viewport rectangle
 *   6. Zoom     — percentage level indicator + in/out/reset controls
 *   7. Surrender — forfeit trigger
 *   8. Help     — help overlay toggle
 *
 * Spectator parity (FR-021): when `interactive` is false (no store),
 * order-producing controls (Orders, Reserve, Surrender) render
 * disabled or visually inert — no orders can be sent (the structural
 * invariant: spectators have no store, no order bridge).
 *
 * Zoom semantics (FR-017): the indicator shows `zoom / defaultCellPx`
 * as a percentage (display layer only — `CameraState.zoom` stays in
 * cell-pixels). The in/out/reset buttons dispatch clamped cameras via
 * the same pure helpers as the wheel/pan controller (zoom.ts).
 *
 * JSDoc references: FR-014..FR-022 + data-model.md §18.
 */

import type { JSX, RefObject } from 'react';

import { CONSOLE_CONSTANTS } from '../config';
import { Minimap } from '../qol/minimap';
import { Tooltip } from '../qol/tooltip';
import { boardCenterScreen, clampCamera, zoomedCamera, zoomPercent } from '../qol/zoom';
import type { CameraState, CellRenderInfo, ConsoleState, ReservesPct } from '../state/types';
import { OrderBar } from './order-bar';
import { ParticipantStrip } from './participants';
import { ReservesPanel } from './reserves-panel';

/** Props for {@link Sidebar}. */
export interface SidebarProps {
    /**
     * The resolved console state. The sidebar reads the slices it
     * renders (status, session, exclusiveMode, inputEnabled, selection,
     * camera) directly from here — one prop, no per-slice drift.
     */
    readonly state: ConsoleState;
    /** Current tick, or `null` before the first view (Status section). */
    readonly tick: number | null;
    /** Reserves digit on the focused cell (Reserve section). */
    readonly selectionReserves: ReservesPct;
    /** Board width in cells (Overview + Zoom sections). */
    readonly boardWidth: number;
    /** Board height in cells (Overview + Zoom sections). */
    readonly boardHeight: number;
    /** Visible cells for the minimap thumbnail (Overview section). */
    readonly cells: readonly CellRenderInfo[];
    /** Visible container size for the minimap viewport rect. */
    readonly viewportSize?: { readonly width: number; readonly height: number } | undefined;
    /** Dispatch sink for camera changes (minimap click + zoom buttons). */
    readonly onSetCamera: (camera: CameraState) => void;
    /** Toggle exclusive-pipe mode (Orders section). */
    readonly onToggleExclusive: () => void;
    /** Clear all pipes on the focused cell (Orders section). */
    readonly onClearPipes: () => void;
    /** Set the reserves digit on the focused cell (Reserve section). */
    readonly onSetReserves: (percent: ReservesPct) => void;
    /** Surrender trigger (host delegate or built-in modal opener). */
    readonly onSurrenderRequest: () => void;
    /** Help overlay toggle (Help section). */
    readonly onHelpToggle: () => void;
    /** Help button ref — focus return when the overlay closes. */
    readonly helpButtonRef?: RefObject<HTMLButtonElement | null> | undefined;
    /**
     * Whether a live store is present. `false` = spectator/static boot:
     * order-producing controls render disabled/inert (FR-021).
     */
    readonly interactive: boolean;
}

/**
 * The fixed-width right sidebar: 8 sections in contractual vertical
 * order (FR-015), composed from existing `ConsoleState` slices.
 *
 * @param props See {@link SidebarProps}.
 */
export function Sidebar({
    state,
    tick,
    selectionReserves,
    boardWidth,
    boardHeight,
    cells,
    viewportSize,
    onSetCamera,
    onToggleExclusive,
    onClearPipes,
    onSetReserves,
    onSurrenderRequest,
    onHelpToggle,
    helpButtonRef,
    interactive,
}: SidebarProps): JSX.Element {
    const { status, session, exclusiveMode, inputEnabled, selection, camera } = state;
    const hasView = cells.length > 0;
    const board = { width: boardWidth, height: boardHeight };

    // Zoom actions anchor at the board center in screen space so the
    // visible content does not swim when zooming via the sidebar.
    const zoomIn = (): void => {
        onSetCamera(zoomedCamera(camera, -100, boardCenterScreen(camera, board), board));
    };
    const zoomOut = (): void => {
        onSetCamera(zoomedCamera(camera, 100, boardCenterScreen(camera, board), board));
    };
    const zoomReset = (): void => {
        onSetCamera(clampCamera({ ...camera, zoom: CONSOLE_CONSTANTS.defaultCellPx }, board));
    };

    return (
        <aside className="europa-sidebar" aria-label="Match controls">
            {/* 1. Status — connection status, tick counter, local player. */}
            <section id="status" aria-label="Status" className="europa-sidebar__section">
                <h2 className="europa-sidebar__heading">Status</h2>
                <Tooltip content="Current connection and game status">
                    <span className="europa-hud__item">Status: {status}</span>
                </Tooltip>
                <Tooltip content="Current game tick number">
                    <span className="europa-hud__item">Tick: {tick ?? '—'}</span>
                </Tooltip>
                <Tooltip content="Your seat in this match">
                    <span className="europa-hud__item">
                        You:{' '}
                        {session.displayName.length > 0
                            ? session.displayName
                            : session.playerId !== null
                              ? `Player ${String(session.playerId)}`
                              : 'Spectator'}
                    </span>
                </Tooltip>
            </section>

            {/* 2. Players — per-seat labels + color indicators. */}
            <section id="players" aria-label="Players" className="europa-sidebar__section">
                <h2 className="europa-sidebar__heading">Players</h2>
                <ParticipantStrip session={session} />
            </section>

            {/* 3. Orders — exclusive/clear mode toggle. */}
            <section id="orders" aria-label="Orders" className="europa-sidebar__section">
                <h2 className="europa-sidebar__heading">Orders</h2>
                <OrderBar
                    exclusiveMode={exclusiveMode}
                    inputEnabled={interactive && inputEnabled}
                    onToggleExclusive={interactive ? onToggleExclusive : undefined}
                    onClearPipes={interactive ? onClearPipes : undefined}
                />
            </section>

            {/* 4. Reserve — slider + quick-select digits for the focused cell. */}
            <section id="reserve" aria-label="Reserve" className="europa-sidebar__section">
                <h2 className="europa-sidebar__heading">Reserve</h2>
                {selection !== null ? (
                    <ReservesPanel
                        cell={selection}
                        currentPercent={selectionReserves}
                        disabled={!interactive || !inputEnabled}
                        onSetReserves={interactive ? onSetReserves : () => undefined}
                    />
                ) : (
                    <p className="europa-sidebar__hint">Select a cell to set its reserves.</p>
                )}
            </section>

            {/* 5. Overview — minimap with live viewport rectangle. */}
            <section id="overview" aria-label="Overview" className="europa-sidebar__section">
                <h2 className="europa-sidebar__heading">Overview</h2>
                {hasView ? (
                    <Tooltip content="Board overview — click to move viewport" position="below">
                        <Minimap
                            boardWidth={boardWidth}
                            boardHeight={boardHeight}
                            camera={camera}
                            cells={cells}
                            // exactOptionalPropertyTypes: only carry the size when measured.
                            {...(viewportSize === undefined ? {} : { viewportSize })}
                            onSetCamera={interactive ? onSetCamera : () => undefined}
                        />
                    </Tooltip>
                ) : (
                    <p className="europa-sidebar__hint">No board view yet.</p>
                )}
            </section>

            {/* 6. Zoom — percentage level indicator + in/out/reset controls. */}
            <section id="zoom" aria-label="Zoom" className="europa-sidebar__section">
                <h2 className="europa-sidebar__heading">Zoom</h2>
                <div className="europa-zoom">
                    <span className="europa-zoom__level" data-europa-zoom-level="true">
                        {zoomPercent(camera.zoom)}%
                    </span>
                    <fieldset className="europa-zoom__controls" aria-label="Zoom controls">
                        <button
                            type="button"
                            className="europa-focus-ring"
                            disabled={!interactive || !hasView}
                            onClick={zoomIn}
                            aria-label="Zoom in"
                        >
                            +
                        </button>
                        <button
                            type="button"
                            className="europa-focus-ring"
                            disabled={!interactive || !hasView}
                            onClick={zoomOut}
                            aria-label="Zoom out"
                        >
                            −
                        </button>
                        <button
                            type="button"
                            className="europa-focus-ring"
                            disabled={!interactive || !hasView}
                            onClick={zoomReset}
                            aria-label="Reset zoom to 100%"
                        >
                            100%
                        </button>
                    </fieldset>
                </div>
            </section>

            {/* 7. Surrender — forfeit trigger (disabled/inert for spectators). */}
            <section id="surrender" aria-label="Surrender" className="europa-sidebar__section">
                <h2 className="europa-sidebar__heading">Surrender</h2>
                <Tooltip content="Forfeit the current match">
                    <button
                        type="button"
                        className="europa-hud__surrender europa-focus-ring"
                        disabled={!interactive || !inputEnabled}
                        onClick={onSurrenderRequest}
                    >
                        Surrender…
                    </button>
                </Tooltip>
            </section>

            {/* 8. Help — help overlay toggle (? key). */}
            <section id="help" aria-label="Help" className="europa-sidebar__section">
                <h2 className="europa-sidebar__heading">Help</h2>
                <Tooltip content="Open help overlay (? key)">
                    <button
                        ref={helpButtonRef}
                        type="button"
                        className="europa-help-button europa-focus-ring"
                        disabled={!inputEnabled}
                        onClick={onHelpToggle}
                    >
                        ?
                    </button>
                </Tooltip>
            </section>
        </aside>
    );
}
