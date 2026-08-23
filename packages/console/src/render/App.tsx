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
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { LiveRegionAnnouncer } from '../a11y/live-region';
import { OrderDraftController } from '../input/order-draft';
import { RegionSelectController } from '../input/region-select';
import { peekInjectedConsoleState } from '../internal/test-state';
import { buildMapView } from '../state/build-map-view';
import { INITIAL_CONSOLE_STATE } from '../state/reducer';
import type { ConsoleStore } from '../state/store';
import type { ConsoleState, MapViewId } from '../state/types';
import { OrderBar } from '../ui/order-bar';
import { MapCanvas } from './canvas';
import { GridOverlay } from './grid-overlay';

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

  // Derive the per-frame snapshot (data-model.md §2). nowMs is pinned
  // to 0 because transient TTL expiry is enforced by the reducer/runtime
  // (Phase 8); the MVP paints whatever the current snapshot carries.
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
      prevView: null,
      nowMs: 0,
    });
  }, [resolvedState]);

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
    mapCanvasRef.current?.paint(mapView, ctx);
  }, [mapView]);

  // Hidden aria-live regions (WCAG 4.1.3 status messages). One
  // announcer per mount; cleared on unmount.
  const liveHostRef = useRef<HTMLDivElement | null>(null);
  const announcerRef = useRef<LiveRegionAnnouncer | null>(null);
  useEffect(() => {
    const host = liveHostRef.current;
    if (host !== null && announcerRef.current === null) {
      announcerRef.current = new LiveRegionAnnouncer(host);
    }
    return () => {
      announcerRef.current?.clear();
      announcerRef.current = null;
    };
  }, []);

  // Interactive mode: pointer + keyboard input controllers. The draft
  // controller receives every cursor sample so keyboard paratroop/gun
  // aims stay fresh (research.md §13 #3). (The US3 targeting overlay
  // will subscribe to the same feed.)
  const boardAreaRef = useRef<HTMLDivElement | null>(null);
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
      </main>
      <div ref={liveHostRef} />
    </>
  );
}
