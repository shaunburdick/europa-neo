/**
 * Root React component — Feature 005 (T047, extended by T053–T056).
 *
 * Composes the render surface:
 *   - the Canvas 2D visual layer ({@link MapCanvas} painting into a
 *     `<canvas>` on every MapView change; the rAF loop that will drive
 *     this in production lands with the Phase 8 runtime),
 *   - the ARIA grid overlay ({@link GridOverlay} — a11y source of
 *     truth, WCAG 1.3.1 / 4.1.2),
 *   - a HUD section (status + tick; FR-008's full banner arrives with
 *     US5) carrying the bundled app-version footer (feature 009
 *     FR-007 — real DOM text, all connection states),
 *   - the order palette ({@link OrderBar}, T055) after the HUD in Tab
 *     order (Q-A04),
 *   - the hidden `aria-live` announcer mount ({@link LiveRegionAnnouncer}
 *     from T021) so tick/order announcements have a home from day one.
 *
 * State source, in priority order:
 *   1. the `store` prop (interactive mode: the US2 input controllers
 *      attach and dispatch through it),
 *   2. the `state` prop (production snapshot passing),
 *   3. the test injection seam (`setConsoleStateForTesting`, T048) —
 *      the MVP standalone-render path (Q-C02),
 *   4. {@link INITIAL_CONSOLE_STATE} fallback.
 *
 * Interactive mode (store present) additionally wires:
 *   - {@link RegionSelectController} on the board area (pointer pipe
 *     orders + hover tracking, T053), feeding each move to
 *   - {@link OrderDraftController} on the document (keyboard orders,
 *     T054), whose outcomes flow through the store's effect sink to
 *     the order bridge (T056, wired by the host/runtime).
 *
 * The ErrorBoundary wrapper arrives in Phase 8 (T085) per research.md
 * §6; until then render errors surface as React's own boundary-less
 * failure, which is acceptable for the MVP demo surface.
 */

import { APP_VERSION } from '@europa/version';
import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { LiveRegionAnnouncer } from '../a11y/live-region';
import { RegionSelectController } from '../input/region-select';
import { CURSOR_STALE_MS } from '../input/subcell-target';
import { peekInjectedConsoleState } from '../internal/test-state';
import { HotkeyController } from '../qol/hotkeys';
import { Minimap } from '../qol/minimap';
import { subscribeReducedMotion } from '../qol/reduced-motion';
import { useContainerSize } from '../qol/use-container-size';
import { ZoomPanController } from '../qol/zoom';
import { isAwaitingMatchStart } from '../state/awaiting-start';
import { buildMapView } from '../state/build-map-view';
import { INITIAL_CONSOLE_STATE } from '../state/reducer';
import type { ConsoleStore } from '../state/store';
import type { ConsoleState, CursorTarget, MapView, MapViewId, ReservesPct } from '../state/types';
import { OrderBar } from '../ui/order-bar';
import { ParticipantStrip } from '../ui/participants';
import { ReservesPanel } from '../ui/reserves-panel';
import { TargetingOverlay } from '../ui/targeting-overlay';
import { WaitingOverlay } from '../ui/waiting-overlay';
import { MapCanvas } from './canvas';
import { GridOverlay } from './grid-overlay';
import { liveLabels, nextLabelExpiryMs } from './label-overlay';
import { SurrenderModal } from './SurrenderModal';

/** Props for {@link App}. */
export interface AppProps {
    /**
     * Live console store. When provided, the app subscribes to it and
     * attaches the input controllers (pointer + keyboard orders).
     */
    readonly store?: ConsoleStore;
    /**
     * Static console state (snapshot rendering). Ignored when `store`
     * is provided. Omitted by the MVP standalone-render tests, which
     * inject via `setConsoleStateForTesting` instead (T048).
     */
    readonly state?: ConsoleState;
    /**
     * Host-owned surrender confirmation (contract
     * `ConsoleConfig.onSurrenderRequest`). When provided, the console
     * delegates to the host instead of opening its built-in modal.
     */
    readonly onSurrenderRequest?: (() => void) | undefined;
    /**
     * Programmatic surrender-modal trigger (contract
     * `Console.requestSurrender`, T087). The runtime bumps this epoch
     * counter each time the host calls `requestSurrender()` without a
     * host callback; an increment past 0 opens the built-in
     * {@link SurrenderModal}. Static boots omit it (no runtime).
     */
    readonly surrenderRequestEpoch?: number;
}

/** Subscription shim for static boots (no store to subscribe to). */
function noopSubscribe(): () => void {
    return () => undefined;
}

/** Last-known pointer sample kept in React state for aim display. */
interface CursorSample {
    readonly target: CursorTarget;
    readonly atMs: number;
}

/**
 * The console root component: canvas + ARIA overlay + HUD + order bar
 * + reserves panel + minimap + live-region mount, driven by the
 * resolved ConsoleState.
 */
export function App({ store, state, onSurrenderRequest, surrenderRequestEpoch }: AppProps): JSX.Element {
    const fallbackState = state ?? peekInjectedConsoleState() ?? INITIAL_CONSOLE_STATE;
    const resolvedState = useSyncExternalStore(
        store ? store.subscribe : noopSubscribe,
        store ? store.getState : (): ConsoleState => fallbackState,
    );

    // Derive the per-frame snapshot (data-model.md §2). The previous
    // committed snapshot feeds `prevView` so the diff machinery
    // (changedThisTick) and the transient "%" labels (US4) activate on
    // real changes; the ref is updated post-commit (never during
    // render) so StrictMode double-invocations stay consistent. nowMs
    // is read at this UI boundary (sanctioned clock, same as the
    // store's dispatch default); expiry enforcement happens in the
    // paint path via liveLabels.
    const lastMapViewRef = useRef<MapView | null>(null);
    const mapView = useMemo(() => {
        const view = resolvedState.latestView;
        if (view === null) {
            return null;
        }
        return buildMapView({
            id: `mv-${view.tick}` as MapViewId,
            view,
            camera: resolvedState.camera,
            hover: resolvedState.hover,
            selection: resolvedState.selection,
            exclusiveMode: resolvedState.exclusiveMode,
            prevView: lastMapViewRef.current,
            nowMs: performance.now(),
        });
    }, [resolvedState]);
    useEffect(() => {
        lastMapViewRef.current = mapView;
    }, [mapView]);

    // Label expiry scheduler (T071): when a label is live, schedule a
    // repaint at its deadline so the chip disappears on time even with
    // no further state changes. Re-armed whenever the label set changes.
    const [labelEpoch, setLabelEpoch] = useState(0);
    const labels = mapView?.labels ?? [];
    useEffect(() => {
        const expiryMs = nextLabelExpiryMs(labels, performance.now());
        if (expiryMs === null) {
            return undefined;
        }
        const remaining = Math.max(0, expiryMs - performance.now());
        const timer = window.setTimeout(() => {
            setLabelEpoch((epoch) => epoch + 1);
        }, remaining + 1);
        return () => {
            window.clearTimeout(timer);
        };
    }, [labels]);

    // Canvas visual layer: size the bitmap to the board and paint the
    // current snapshot synchronously on change (rAF loop = Phase 8).
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const mapCanvasRef = useRef<MapCanvas | null>(null);
    if (mapCanvasRef.current === null) {
        mapCanvasRef.current = new MapCanvas();
    }
    // Reduced-motion preference (US5 T083): live subscription to the
    // OS flag; feeds the painter's effect filter.
    const [reducedMotion, setReducedMotion] = useState(false);
    useEffect(() => subscribeReducedMotion(setReducedMotion), []);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas === null || mapView === null) {
            return;
        }
        const { zoom } = mapView.camera;
        canvas.width = mapView.width * zoom;
        canvas.height = mapView.height * zoom;
        const ctx = canvas.getContext('2d');
        if (ctx === null) {
            return;
        }
        // Expired labels never reach the pixels (T071 lifecycle); the
        // flashing effect kinds are skipped under reduced motion (T083).
        const frame: MapView = {
            ...mapView,
            labels: liveLabels(mapView.labels, performance.now()),
        };
        mapCanvasRef.current?.paint(frame, ctx, { reducedMotion });
    }, [mapView, labelEpoch, reducedMotion]);

    // Hidden aria-live regions (WCAG 4.1.3 status messages). One
    // announcer per mount; cleared on unmount. Mirrored into state so
    // the targeting overlay can share the announcement channel.
    const liveHostRef = useRef<HTMLDivElement | null>(null);
    const announcerRef = useRef<LiveRegionAnnouncer | null>(null);
    const [announcer, setAnnouncer] = useState<LiveRegionAnnouncer | null>(null);
    useEffect(() => {
        const host = liveHostRef.current;
        if (host !== null && announcerRef.current === null) {
            announcerRef.current = new LiveRegionAnnouncer(host);
            setAnnouncer(announcerRef.current);
        }
        return () => {
            announcerRef.current?.clear();
            announcerRef.current = null;
            setAnnouncer(null);
        };
    }, []);

    // Interactive mode: pointer + keyboard + camera controllers. The
    // hotkey controller (US5 T079, configurable mapping) receives every
    // cursor sample so keyboard paratroop/gun aims stay fresh
    // (research.md §13 #3); the same feed drives the US3 targeting
    // overlay's aim dot. The zoom/pan controller binds the canvas so
    // wheel zooms toward the cursor and middle-drag pans (US5 AC-1);
    // it stops propagation on pan start so region-select never sees a
    // pan gesture as an exclusive-pipe click.
    const boardAreaRef = useRef<HTMLDivElement | null>(null);
    const [cursorSample, setCursorSample] = useState<CursorSample | null>(null);
    useEffect(() => {
        if (store === undefined) {
            return undefined;
        }
        const boardArea = boardAreaRef.current;
        if (boardArea === null) {
            return undefined;
        }
        // Zoom/pan attaches FIRST (same element as region-select) so its
        // stopImmediatePropagation on middle-button pan start shields the
        // later-registered pipe handlers from the pan gesture.
        const zoomPan = new ZoomPanController(boardArea, store).attach();
        const hotkeys = new HotkeyController(store);
        const region = new RegionSelectController(boardArea, store, {
            onCursor: (target, atMs) => {
                hotkeys.notePointer(target, atMs);
                setCursorSample({ target, atMs });
            },
        });
        const regionHandle = region.attach();
        hotkeys.attach();
        return () => {
            regionHandle.dispose();
            hotkeys.dispose();
            zoomPan.dispose();
        };
    }, [store]);

    // Surrender modal state (US5 T084): opened by the HUD button,
    // delegating to the host when `onSurrenderRequest` is provided.
    // The runtime's programmatic `requestSurrender()` (T087) opens the
    // same modal by bumping `surrenderRequestEpoch`.
    const [surrenderOpen, setSurrenderOpen] = useState(false);
    useEffect(() => {
        if ((surrenderRequestEpoch ?? 0) > 0) {
            setSurrenderOpen(true);
        }
    }, [surrenderRequestEpoch]);

    const zoom = mapView?.camera.zoom ?? 32;
    const { selection } = resolvedState;

    // Waiting-for-opponent overlay (post-playtest fix): joined but the
    // match has not yet delivered its first tick broadcast (still
    // filling). Store-derived predicate — no timers; it drops by itself
    // on the first real tick or any status change, so it can never
    // stack with the reconnecting banner or game-over surfaces.
    // Interactive mode only: static boots render snapshots, not
    // connection lifecycles.
    const awaitingStart = store !== undefined && isAwaitingMatchStart(resolvedState);

    // Real container sizing for the minimap's viewport rectangle
    // (integration wave T-I3): without it the indicator defaults to the
    // full board, which lies whenever the visible window is smaller.
    const boardSize = useContainerSize(boardAreaRef);

    // Current reserves digit on the focused cell (drives the US4
    // panel's slider/pressed state). Unknown cells read as 0.
    const selectionReserves: ReservesPct =
        (selection !== null && resolvedState.latestView !== null
            ? resolvedState.latestView.visibleCells.find((c) => c.coord.x === selection.x && c.coord.y === selection.y)
                  ?.reservesPercent
            : undefined) ?? 0;

    // Aim display: the last-known cursor subcell while fresh, else the
    // cell center ("no launch" posture). The age check reads the UI
    // clock at render time — the sanctioned boundary (same as the
    // store's dispatch default), never inside logic modules.
    const aimSubcell =
        cursorSample !== null && performance.now() - cursorSample.atMs <= CURSOR_STALE_MS
            ? (cursorSample.target.subcell ?? { x: 0.5, y: 0.5 })
            : { x: 0.5, y: 0.5 };

    return (
        <>
            {/* Skip link is the first Tab stop (WCAG 2.4.1 Bypass Blocks;
          Q-A04 order: skip-link → map → hud → order-bar[US2]). The id
          matches KeyboardNavigator's TabbableRegion id. */}
            <a id="skip-link" className="skip-link" href="#main">
                Skip to main content
            </a>
            {/* Reconnecting banner (US5 AC-3, FR-008): an assertive live
          region so the status change interrupts; input is disabled
          by the reducer's inputEnabled invariant while offline. */}
            {resolvedState.status === 'reconnecting' ? (
                <div role="alert" className="europa-banner">
                    Reconnecting to match…
                </div>
            ) : null}
            <main id="main" className="europa-main">
                <div ref={boardAreaRef} className="europa-board-area">
                    <canvas
                        ref={canvasRef}
                        role="img"
                        aria-label="Game board visual"
                        className="europa-canvas"
                        style={{ width: (mapView?.width ?? 10) * zoom, height: (mapView?.height ?? 10) * zoom }}
                    />
                    {mapView !== null && mapView.cells.size > 0 ? (
                        <GridOverlay
                            mapView={mapView}
                            onCellClick={
                                store === undefined
                                    ? undefined
                                    : (info) => store.dispatch({ kind: 'selectCell', cell: info.coord })
                            }
                            onFocusedCoordChange={
                                store === undefined
                                    ? undefined
                                    : (coord) => store.dispatch({ kind: 'selectCell', cell: coord })
                            }
                        />
                    ) : null}
                    {store !== undefined && mapView !== null && selection !== null ? (
                        <TargetingOverlay
                            cell={selection}
                            zoom={mapView.camera.zoom}
                            subcell={aimSubcell}
                            abilityLabel="Paratroop target"
                            announcer={announcer ?? undefined}
                        />
                    ) : null}
                    {awaitingStart ? (
                        <WaitingOverlay announcer={announcer ?? undefined} reducedMotion={reducedMotion} />
                    ) : null}
                </div>
                <section id="hud" aria-label="Status bar" tabIndex={0} className="europa-hud">
                    <span className="europa-hud__item">Status: {resolvedState.status}</span>
                    <span className="europa-hud__item">Tick: {mapView?.tick ?? '—'}</span>
                    {/* Version footer (feature 009 FR-007): the BUNDLED
              constant, v-prefixed per the Clarifications presentation
              ruling — never the server's hello-ack field (AD-5: a stale
              tab must not display a version it is not running). Renders
              in every connection state because it depends on no state
              at all; plain span = no pointer/keyboard interception. */}
                    <span className="europa-hud__item europa-hud__version">v{APP_VERSION}</span>
                    {/* Participant strip (feature 010 T-016, FR-020): per-seat
              authoritative labels from the session. Session-derived, so
              it is tick-stable (SC-008) and renders for spectators too
              (static boots — FR-023 allows all handles there). */}
                    <ParticipantStrip session={resolvedState.session} />
                    {store !== undefined && mapView !== null ? (
                        <Minimap
                            boardWidth={mapView.width}
                            boardHeight={mapView.height}
                            camera={resolvedState.camera}
                            cells={[...mapView.cells.values()]}
                            // exactOptionalPropertyTypes: only carry the size when measured.
                            {...(boardSize === null ? {} : { viewportSize: boardSize })}
                            onSetCamera={(camera) => store.dispatch({ kind: 'setCamera', camera })}
                        />
                    ) : null}
                </section>
                <OrderBar
                    exclusiveMode={resolvedState.exclusiveMode}
                    inputEnabled={resolvedState.inputEnabled}
                    onToggleExclusive={
                        store === undefined
                            ? undefined
                            : () =>
                                  store.dispatch({
                                      kind: 'setExclusiveMode',
                                      enabled: !resolvedState.exclusiveMode,
                                  })
                    }
                    onClearPipes={
                        store === undefined || selection === null
                            ? undefined
                            : () => store.dispatch({ kind: 'clearAllPipes', cell: selection })
                    }
                />
                {/* Surrender trigger (US5 AC-2 / FR-009). Placed AFTER the
            order palette so the contractual Q-A04 head sequence
            (skip-link → map → hud → order-bar) is unchanged; the
            confirm gate lives in SurrenderModal (or the host's
            onSurrenderRequest delegate). */}
                {store !== undefined ? (
                    <section id="surrender" aria-label="Surrender controls" className="europa-surrender">
                        <button
                            type="button"
                            className="europa-hud__surrender europa-focus-ring"
                            disabled={!resolvedState.inputEnabled}
                            onClick={() => {
                                if (onSurrenderRequest !== undefined) {
                                    onSurrenderRequest();
                                    return;
                                }
                                setSurrenderOpen(true);
                            }}
                        >
                            Surrender…
                        </button>
                    </section>
                ) : null}
                {store !== undefined && selection !== null ? (
                    <ReservesPanel
                        cell={selection}
                        currentPercent={selectionReserves}
                        disabled={!resolvedState.inputEnabled}
                        onSetReserves={(percent) => store.dispatch({ kind: 'setReserves', cell: selection, percent })}
                    />
                ) : null}
                {/* FR-007 feedback surface: the reducer's confirmation queue
            rendered as transient toasts. The polite live region makes
            every confirmation audible without moving focus (Q-A05). */}
                <section id="feedback" aria-label="Order feedback" className="europa-feedback">
                    <div
                        role="status"
                        aria-live="polite"
                        aria-atomic="true"
                        data-europa-live="polite"
                        className="europa-visually-hidden"
                    >
                        {resolvedState.feedback.map((message) => message.text).join('. ')}
                    </div>
                    <ul className="europa-feedback__list">
                        {resolvedState.feedback.map((message) => (
                            <li
                                key={message.id}
                                className={`europa-feedback__item europa-feedback__item--${message.kind}`}
                            >
                                {message.text}
                            </li>
                        ))}
                    </ul>
                </section>
            </main>
            {store !== undefined ? (
                <SurrenderModal
                    open={surrenderOpen}
                    onCancel={() => {
                        setSurrenderOpen(false);
                    }}
                    onConfirm={() => {
                        setSurrenderOpen(false);
                        store.dispatch({ kind: 'surrender' });
                    }}
                />
            ) : null}
            <div ref={liveHostRef} />
        </>
    );
}
