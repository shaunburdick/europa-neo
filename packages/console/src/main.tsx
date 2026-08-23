import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createDemoPlayerView, createStubConsoleState } from './internal/test-state';
import { App } from './render/App';

import './styles/index.css';

/**
 * SPA entry point (T013, wired to the real App by T047). Mounts the
 * console's root React tree into the `#root` element declared by
 * `index.html`.
 *
 * MVP state source: a deterministic demo `PlayerView` (T048's
 * `createStubConsoleState` + `createDemoPlayerView`) so the console
 * boots standalone with no live server — the Phase 3 scope note.
 * The Phase 8 runtime (`createConsole`, T086) replaces this stub
 * with live store state.
 */

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Europa Neo console: #root element not found in document.');
}

const stubState = createStubConsoleState(createDemoPlayerView());

createRoot(rootElement).render(
  <StrictMode>
    <App state={stubState} />
  </StrictMode>,
);
