import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createDemoPlayerView, createStubConsoleState } from './internal/test-state';
import { App } from './render/App';
import { ErrorBoundary } from './render/ErrorBoundary';

import './styles/index.css';

/**
 * SPA entry point (T013, wired to the real App by T047; E2E harness
 * branch added by T052; error boundary added by T085; live full-stack
 * branch added by the integration wave). Mounts the console's root
 * React tree into the `#root` element declared by `index.html`.
 *
 * Boot modes:
 *   - `?e2e` present: the interactive demo runtime (store + input
 *     controllers + order bridge + recording fake client) so
 *     Playwright specs can drive real gestures (T052/T060).
 *   - `?live` present: the live full-stack runtime — real browser
 *     WebSocket client against a real match server (`?ws`, `?match`,
 *     `?name`, optional `?token`). Integration-wave harness.
 *   - default: a deterministic stub `ConsoleState` (T048's
 *     `createStubConsoleState` + `createDemoPlayerView`) so the
 *     console boots standalone with no live server.
 *
 * All modes wrap the root in {@link ErrorBoundary} (Q-B08): an
 * uncaught render error surfaces as an accessible fallback with a
 * Reload action instead of a blank page.
 */

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('Europa Neo console: #root element not found in document.');
}

const bootParams = new URLSearchParams(window.location.search);
const isE2E = bootParams.has('e2e');
const isLive = bootParams.has('live');

if (isE2E) {
    // Dynamic import keeps the harness (and its fake client) in a
    // separate chunk that production boots never fetch.
    void import('./internal/demo-runtime').then((module) => module.mountDemoRuntime(rootElement));
} else if (isLive) {
    // Same chunking discipline: the live harness rides its own lazy
    // chunk (which pulls in the real WebSocket client).
    void import('./internal/live-runtime').then((module) => module.mountLiveRuntime(rootElement));
} else {
    const stubState = createStubConsoleState(createDemoPlayerView());
    createRoot(rootElement).render(
        <StrictMode>
            <ErrorBoundary>
                <App state={stubState} />
            </ErrorBoundary>
        </StrictMode>,
    );
}
