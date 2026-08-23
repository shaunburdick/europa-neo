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
 *     US5),
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

import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { LiveRegionAnnouncer } from '../a11y/live-region';
import { OrderDraftController } from '../input/order-draft';
import { RegionSelectController } from '../input/region-select';
import { CURSOR_STALE_MS } from '../input/subcell-target';
import { peekInjectedConsoleState } from '../internal/test-state';
import { buildMapView } from '../state/build-map-view';
import { INITIAL_CONSOLE_STATE } from '../state/reducer';
import type { ConsoleStore } from '../state/store';
import type { ConsoleState, CursorTarget, MapView, MapViewId, ReservesPct } from '../state/types';
import { OrderBar } from '../ui/order-bar';
import { ReservesPanel } from '../ui/reserves-panel';
import { TargetingOverlay } from '../ui/targeting-overlay';
import { MapCanvas } from './canvas';
import { GridOverlay } from './grid-overlay';
import { liveLabels, nextLabelExpiryMs } from './label-overlay';

/** Props for {@link App}. */
export interface AppProps {
  /**
   * Live console store. When provided, the app subscribes to it and
   * attaches the US2 input controllers (pointer + keyboard orders).
   */
  readonly store?: ConsoleStore;
  /**
   * Static console state (snapshot rendering). Ignored when `store`
   * is provided. Omitted by the MVP standalone-render tests, which
   * inject via `setConsoleStateForTesting` instead (T048).
   */
  readonly state?: ConsoleState;
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
 * + live-region mount, driven by the resolved ConsoleState.
 */
export function App({ store, state }: AppProps): JSX.Element {
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
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || mapView === null) {
      return;
    }
    const zoom = mapView.camera.zoom;
    canvas.width = mapView.width * zoom;
    canvas.height = mapView.height * zoom;
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      return;
    }
    // Expired labels never reach the pixels (T071 lifecycle).
    const frame: MapView = {
      ...mapView,
      labels: liveLabels(mapView.labels, performance.now()),
    };
    mapCanvasRef.current?.paint(frame, ctx);
  }, [mapView, labelEpoch]);

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

  // Interactive mode: pointer + keyboard input controllers. The draft
  // controller receives every cursor sample so keyboard paratroop/gun
  // aims stay fresh (research.md §13 #3); the same feed drives the
  // US3 targeting overlay's aim dot.
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
    const draft = new OrderDraftController(store);
    const region = new RegionSelectController(boardArea, store, {
      onCursor: (target, atMs) => {
        draft.notePointer(target, atMs);
        setCursorSample({ target, atMs });
      },
    });
    const regionHandle = region.attach();
    draft.attach();
    return () => {
      regionHandle.dispose();
      draft.dispose();
    };
  }, [store]);

  const zoom = mapView?.camera.zoom ?? 32;
  const selection = resolvedState.selection;

  // Current reserves digit on the focused cell (drives the US4
  // panel's slider/pressed state). Unknown cells read as 0.
  const selectionReserves: ReservesPct =
    (selection !== null && resolvedState.latestView !== null
      ? resolvedState.latestView.visibleCells.find(
          (c) => c.coord.x === selection.x && c.coord.y === selection.y,
        )?.reservesPercent
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
        </div>
        <section id="hud" aria-label="Status bar" tabIndex={0} className="europa-hud">
          <span className="europa-hud__item">Status: {resolvedState.status}</span>
          <span className="europa-hud__item">Tick: {mapView?.tick ?? '—'}</span>
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
        {store !== undefined && selection !== null ? (
          <ReservesPanel
            cell={selection}
            currentPercent={selectionReserves}
            disabled={!resolvedState.inputEnabled}
            onSetReserves={(percent) =>
              store.dispatch({ kind: 'setReserves', cell: selection, percent })
            }
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
      <div ref={liveHostRef} />
    </>
  );
}
