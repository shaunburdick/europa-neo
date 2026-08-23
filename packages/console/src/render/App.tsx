/**
 * Root React component — Feature 005 (T047).
 *
 * Composes the US1 MVP render surface:
 *   - the Canvas 2D visual layer ({@link MapCanvas} painting into a
 *     `<canvas>` on every MapView change; the rAF loop that will drive
 *     this in production lands with the Phase 8 runtime),
 *   - the ARIA grid overlay ({@link GridOverlay} — a11y source of
 *     truth, WCAG 1.3.1 / 4.1.2),
 *   - a HUD placeholder section (status + tick; FR-008's full banner
 *     arrives with US5),
 *   - the hidden `aria-live` announcer mount ({@link LiveRegionAnnouncer}
 *     from T021) so tick/order announcements have a home from day one.
 *
 * State source, in priority order:
 *   1. the `state` prop (production: the Phase 8 runtime passes the
 *      live store state here),
 *   2. the test injection seam (`setConsoleStateForTesting`, T048) —
 *      the MVP standalone-render path (Q-C02),
 *   3. {@link INITIAL_CONSOLE_STATE} fallback.
 *
 * The ErrorBoundary wrapper arrives in Phase 8 (T085) per research.md
 * §6; until then render errors surface as React's own boundary-less
 * failure, which is acceptable for the MVP demo surface.
 *
 * Module structure (render/): palette.ts (colors) → visibility-filter.ts
 * (horizon rule) → canvas.ts (visual painter) → cell-view.tsx (per-cell
 * DOM+a11y) → grid-overlay.tsx (ARIA grid) → this file (composition).
 */

import type { JSX } from 'react';
import { useEffect, useMemo, useRef } from 'react';

import { LiveRegionAnnouncer } from '../a11y/live-region';
import { peekInjectedConsoleState } from '../internal/test-state';
import { buildMapView } from '../state/build-map-view';
import { INITIAL_CONSOLE_STATE } from '../state/reducer';
import type { ConsoleState, MapViewId } from '../state/types';
import { MapCanvas } from './canvas';
import { GridOverlay } from './grid-overlay';

/** Props for {@link App}. */
export interface AppProps {
  /**
   * Live console state. Omitted by the MVP standalone-render tests,
   * which inject via `setConsoleStateForTesting` instead (T048).
   */
  readonly state?: ConsoleState;
}

/**
 * The console root component: canvas + ARIA overlay + HUD placeholder
 * + live-region mount, driven entirely by the resolved ConsoleState.
 */
export function App({ state }: AppProps): JSX.Element {
  const resolvedState = state ?? peekInjectedConsoleState() ?? INITIAL_CONSOLE_STATE;

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

  const zoom = mapView?.camera.zoom ?? 32;

  return (
    <>
      {/* Skip link is the first Tab stop (WCAG 2.4.1 Bypass Blocks;
          Q-A04 order: skip-link → map → hud → order-bar[US2]). The id
          matches KeyboardNavigator's TabbableRegion id. */}
      <a id="skip-link" className="skip-link" href="#main">
        Skip to main content
      </a>
      <main id="main" className="europa-main">
        <div className="europa-board-area">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Game board visual"
            className="europa-canvas"
            style={{ width: (mapView?.width ?? 10) * zoom, height: (mapView?.height ?? 10) * zoom }}
          />
          {mapView !== null && mapView.cells.size > 0 ? <GridOverlay mapView={mapView} /> : null}
        </div>
        <section id="hud" aria-label="Status bar" tabIndex={0} className="europa-hud">
          <span className="europa-hud__item">Status: {resolvedState.status}</span>
          <span className="europa-hud__item">Tick: {mapView?.tick ?? '—'}</span>
        </section>
      </main>
      <div ref={liveHostRef} />
    </>
  );
}
