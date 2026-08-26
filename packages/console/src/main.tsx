import { ErrorBoundary } from './render/ErrorBoundary';
import { hasDirectMatchRoute } from './state/lobby-view';

import './styles/index.css';

/**
 * SPA entry point (T013, wired to the real App by T047; E2E harness
 * branch added by T052; error boundary added by T085; live full-stack
 * branch added by the integration wave; public-lobby DEFAULT added by
 * feature 010 T-015). Mounts the console's root React tree into the
 * `#root` element declared by `index.html`.
 *
 * Boot modes:
 *   - `?live&ws=<url>&match=<id>&name=[&token=]` present: the live
 *     full-stack runtime — real browser WebSocket client against a
 *     real match server. COMPATIBILITY CONTRACT (feature 010
 *     `resolveInitialViewMode`): direct live-test routes bypass the
 *     lobby entirely and MUST keep working unchanged.
 *   - `?e2e` present: the interactive demo runtime (store + input
 *     controllers + order bridge + recording fake client) so
 *     Playwright specs can drive real gestures (T052/T060).
 *   - DEFAULT (feature 010 FR-001/FR-017): the public-lobby runtime —
 *     the landing page IS the application entry; visitors establish a
 *     guest identity, set a handle, and create/join/spectate public
 *     matches from `src/internal/lobby-runtime`.
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
// Direct live-test route ONLY when it carries its match coordinates —
// a bare `?live` is not a match route and falls through to the lobby
// (pinned by resolveInitialViewMode's compatibility contract).
const isLive = hasDirectMatchRoute(window.location.search);
const isE2E = bootParams.has('e2e');

if (isLive) {
    // Same chunking discipline: the live harness rides its own lazy
    // chunk (which pulls in the real WebSocket client).
    void import('./internal/live-runtime').then((module) => module.mountLiveRuntime(rootElement));
} else if (isE2E) {
    // Dynamic import keeps the harness (and its fake client) in a
    // separate chunk that production boots never fetch.
    void import('./internal/demo-runtime').then((module) => module.mountDemoRuntime(rootElement));
} else {
    // Feature 010: the landing page IS the default entry (FR-001) —
    // no pre-created match, no stub board (FR-017).
    void import('./internal/lobby-runtime').then((module) => module.mountLobbyRuntime(rootElement));
}
