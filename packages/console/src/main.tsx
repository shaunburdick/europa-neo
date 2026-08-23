import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createDemoPlayerView, createStubConsoleState } from './internal/test-state';
import { App } from './render/App';

import './styles/index.css';

/**
 * SPA entry point (T013, wired to the real App by T047; E2E harness
 * branch added by T052). Mounts the console's root React tree into
 * the `#root` element declared by `index.html`.
 *
 * Boot modes:
 *   - `?e2e` present: the interactive demo runtime (store + input
 *     controllers + order bridge + recording fake client) so
 *     Playwright specs can drive real gestures (T052/T060).
 *   - default: a deterministic stub `ConsoleState` (T048's
 *     `createStubConsoleState` + `createDemoPlayerView`) so the
 *     console boots standalone with no live server — the Phase 3
 *     scope note. The Phase 8 runtime (`createConsole`, T086)
 *     replaces this stub with live store state.
 */

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Europa Neo console: #root element not found in document.');
}

const isE2E = new URLSearchParams(window.location.search).has('e2e');

if (isE2E) {
  // Dynamic import keeps the harness (and its fake client) in a
  // separate chunk that production boots never fetch.
  void import('./internal/demo-runtime').then((module) => module.mountDemoRuntime(rootElement));
} else {
  const stubState = createStubConsoleState(createDemoPlayerView());
  createRoot(rootElement).render(
    <StrictMode>
      <App state={stubState} />
    </StrictMode>,
  );
}
