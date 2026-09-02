import { register } from '@europa/design/components';
import type { Route } from './routing/route';
import { parseRoute } from './routing/route';
import { adaptRoute } from './routing/route-adapter';

import '@europa/design/dist/design.css';
import './styles/index.css';
import './styles/logo.css';

/** Test-only direct match seam used by real-network fixture harnesses. */
interface TestMatchSeam {
    readonly wsUrl: string;
    readonly matchId: string;
    readonly displayName: string;
    readonly reconnectToken?: string;
}

declare global {
    interface Window {
        __europaTestMatch?: TestMatchSeam;
    }
}

/**
 * SPA entry point (T013, wired to the real App by T047; E2E harness
 * branch added by T052; error boundary added by T085; live full-stack
 * branch added by the integration wave; public-lobby DEFAULT added by
 * feature 010 T-015). Mounts the console's root React tree into the
 * `#root` element declared by `index.html`.
 *
 * Boot modes:
 *   - `?e2e` present: the interactive demo runtime (store + input
 *     controllers + order bridge + recording fake client) so
 *     Playwright specs can drive real gestures (T052/T060).
 *   - PRODUCTION: pathname routing selects the public lobby or keeps a
 *     semantic match route through the lobby runtime. Match entry is handed
 *     to the lobby adapter only after its authoritative snapshot is available
 *     (T009); this bootstrap never opens a match socket.
 *
 * All modes wrap the root in {@link ErrorBoundary} (Q-B08): an
 * uncaught render error surfaces as an accessible fallback with a
 * Reload action instead of a blank page.
 */

// Register all Europa Neo web components before any React render touches
// custom element tags. Idempotent — safe to call even if components are
// already defined.
register();

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('Europa Neo console: #root element not found in document.');
}

const bootParams = new URLSearchParams(window.location.search);
const isE2E = bootParams.has('e2e');

if (isE2E) {
    // Dynamic import keeps the harness (and its fake client) in a
    // separate chunk that production boots never fetch.
    void import('./internal/demo-runtime').then((module) => module.mountDemoRuntime(rootElement));
} else {
    bootstrapProductionRoute(rootElement);
}

/**
 * Select the production runtime from the browser pathname.
 *
 * Query parameters are intentionally not part of this decision. The only
 * query-selected boot mode is the test-only `?e2e` branch above; production
 * identity and transport remain owned by the existing runtime/session seams.
 *
 * @param root The SPA mount node.
 */
function bootstrapProductionRoute(root: HTMLElement): void {
    const route = parseRoute(window.location.pathname);
    if (route.kind === 'match' && window.__europaTestMatch !== undefined) {
        stripProductionQuery();
        void import('./internal/live-runtime').then((module) => module.mountLiveRuntime(root));
        return;
    }
    const entry = adaptRoute(route, null);

    switch (entry.kind) {
        case 'redirect':
            // Root and malformed/unknown paths have one canonical recovery
            // target. Replacing (rather than pushing) prevents a history loop.
            window.history.replaceState(window.history.state, '', '/lobby');
            mountLobby(root, undefined, route.kind === 'unknown' ? 'unknown' : undefined);
            return;
        case 'lobby':
            stripProductionQuery();
            mountLobby(root);
            return;
        case 'resolve':
            stripProductionQuery();
            mountLobby(root, entry.route);
            return;
        case 'player':
        case 'spectator':
        case 'profile':
            mountLobby(root);
            return;
        case 'unavailable':
            // A null snapshot can only produce `resolve` for a valid match;
            // keep this exhaustive guard safe if the adapter evolves.
            mountLobby(root);
            return;
    }
}

/** Mount the existing Feature 010 lobby runtime after route selection. */
function mountLobby(
    root: HTMLElement,
    route?: Extract<Route, { readonly kind: 'match' }>,
    recoveryKind?: 'unknown',
): void {
    void import('./internal/lobby-runtime').then((module) => module.mountLobbyRuntime(root, route, recoveryKind));
}

/** Remove production query values before any existing runtime can inspect them. */
function stripProductionQuery(): void {
    if (window.location.search !== '') {
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.hash}`);
    }
}
