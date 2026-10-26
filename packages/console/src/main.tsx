/**
 * SPA entry point — TanStack Router migration (issue #75, T114).
 *
 * Mounts the TanStack Router-powered production route tree into the
 * `#root` element declared by `index.html`. The router receives a typed
 * context carrying the page-lifetime lobby controller and resolved
 * WebSocket URL, which the root layout route reads via
 * `useRouteContext` / `beforeLoad`.
 *
 * Boot modes:
 *   - `?e2e` present: the interactive demo runtime (store + input
 *     controllers + order bridge + recording fake client) so
 *     Playwright specs can drive real gestures (T052/T060).
 *   - `window.__europaTestMatch` defined: test-only direct-match seam
 *     used by real-network fixture harnesses — the seam is captured
 *     and the window global removed SYNCHRONOUSLY, then the
 *     live-runtime chunk is dynamically imported and mounted with the
 *     captured seam passed as an argument, bypassing the lobby and
 *     router entirely (005 FR-037, 015 FR-019).
 *   - PRODUCTION: TanStack Router handles pathname-based routing
 *     through the route tree (lobby, profile, match, welcome). The
 *     lobby controller and WebSocket URL are resolved before the router
 *     mounts and provided as typed router context.
 *
 * All modes wrap the root in {@link ErrorBoundary} (Q-B08): an
 * uncaught render error surfaces as an accessible fallback with a
 * Reload action instead of a blank page.
 *
 * @module
 */

import { createRouter, RouterProvider } from '@tanstack/react-router';
import type { JSX } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@europa/design/dist/design.css';
import './styles/index.css';
import './styles/logo.css';

import { ControlMappingSession } from './input/control-mapping';
import { ControlMappingProvider } from './input/control-mapping-context';
import { GamepadController } from './input/gamepad-controller';
import { type LobbyStoreDebugView, lobbyDebugHandle } from './internal/debug-views';
// Type-only: erased at compile time, so the dynamically-imported
// live-runtime chunk is NOT fetched by this static reference.
import type { TestMatchSeam } from './internal/live-runtime';
import { createWsLobbyClient } from './net/ws-lobby-client';
import { ErrorBoundary } from './render/ErrorBoundary';
import { routeTree } from './routing/route-tree';
import { createLobbyController } from './state/lobby-controller';
import { LobbyServerUrlError, resolveLobbyServerUrl } from './state/lobby-view';
import { ControlsEditorHostProvider } from './ui/controls-editor-host';

declare global {
    interface Window {
        /** Pre-load direct-match seam (test infrastructure only) — consumed and removed below. */
        __europaTestMatch?: TestMatchSeam;
    }
}

// ─── DOM mount point ────────────────────────────────────────────────────────

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('Europa Neo console: #root element not found in document.');
}

// ─── Boot mode selection ─────────────────────────────────────────────────────

const bootParams = new URLSearchParams(window.location.search);
const isE2E = bootParams.has('e2e');

if (isE2E) {
    // Dynamic import keeps the harness (and its fake client) in a
    // separate chunk that production boots never fetch.
    void import('./internal/demo-runtime').then((module) => module.mountDemoRuntime(rootElement));
} else if (window.__europaTestMatch !== undefined) {
    // Test-only direct-match seam: bypass the lobby and router entirely.
    // Preserves the existing real-network fixture harness entry.
    //
    // The seam MAY carry a reconnect bearer (005 FR-037, 015 FR-019):
    // capture it and remove the window global SYNCHRONOUSLY — before
    // the dynamic import below even starts — then pass the seam to the
    // runtime as an argument. Neither a pending nor a failed chunk
    // load can leave the credential readable on `window`.
    const testMatchSeam = window.__europaTestMatch;
    delete window.__europaTestMatch;
    stripProductionQuery();
    void import('./internal/live-runtime')
        .then((module) => module.mountLiveRuntime(rootElement, testMatchSeam))
        .catch((error: unknown) => {
            // The credential is already off `window` (captured above);
            // report the failed chunk load honestly instead of leaving
            // an unhandled rejection behind.
            console.error('[direct-match:boot] live-runtime chunk failed to load', error);
        });
} else {
    // Production path: resolve lobby infrastructure, then mount the
    // TanStack Router tree.
    bootstrapProductionRoute(rootElement);
}

// ─── Production bootstrap ────────────────────────────────────────────────────

/**
 * Resolve the lobby controller and WebSocket URL, then mount the
 * TanStack Router-powered application.
 *
 * The controller is created OUTSIDE React (page-lifetime — same
 * discipline as `LobbyRoot`'s page-lifetime wiring in
 * `internal/lobby-runtime.tsx`): no dispose-on-unmount race with
 * StrictMode's simulated remounts, and `connect()`'s own
 * already-establishing guard makes double invocation harmless.
 *
 * @param root The SPA mount node.
 */
function bootstrapProductionRoute(root: HTMLElement): void {
    // Capture the query BEFORE stripping (013 FR-025): stripping
    // rewrites the address bar, so the `ws=` transport override must
    // be read from the captured string. Correctness MUST NOT depend on
    // test infrastructure patching `history.replaceState` (AC-018).
    const bootSearch = window.location.search;
    stripProductionQuery();

    // Resolve the lobby server URL. May throw if the transport
    // override is malformed — render a configuration error page
    // before any identity-bearing lobby connection.
    let wsUrl: string;
    try {
        wsUrl = resolveLobbyServerUrl(bootSearch, window.location);
    } catch (error: unknown) {
        const message = error instanceof LobbyServerUrlError ? error.message : 'The WebSocket server URL is invalid.';
        createRoot(root).render(<LobbyConfigurationError message={message} />);
        return;
    }

    // Create the page-lifetime transport + controller pair. The
    // controller owns the Zustand store that tracks connection/identity
    // state; the router's root layout reads it via typed context.
    const transport = createWsLobbyClient({});
    const controller = createLobbyController({ transport, url: wsUrl });

    if (window.__europaTestOptIn?.lobby === true) {
        // Test-only handle (005 FR-037, 015 FR-019): installed ONLY
        // behind the pre-load opt-in sentinel set by test
        // infrastructure. An unflagged production boot installs no
        // `__europa*` handle at all. The handle carries a CREDENTIAL-
        // FREE projection of the lobby store (internal/debug-views) —
        // never the store itself, whose state carries the seat session
        // bearer (`seatSessionToken`).
        window.__europaLobby = lobbyDebugHandle(controller.store);
    }

    // Begin the lobby establish cycle. The connection is non-blocking —
    // the router's root layout `beforeLoad` gates child rendering on
    // `connection === 'ready'` and `identityStatus === 'named'`.
    void controller.connect();

    // Build the router with typed context (controller + wsUrl). The
    // root layout route's `beforeLoad` reads the controller store to
    // gate child rendering on connection/identity readiness.
    const router = createRouter({
        routeTree,
        context: { controller, wsUrl },
    });

    const inputMappingSession = new ControlMappingSession();
    const gamepadController = new GamepadController(inputMappingSession);

    // Mount the router into the DOM. The ErrorBoundary wraps the entire
    // tree so a bad frame never blanks the page silently (Q-B08).
    createRoot(root).render(
        <StrictMode>
            <ControlMappingProvider session={inputMappingSession} gamepadController={gamepadController}>
                <ErrorBoundary>
                    <ControlsEditorHostProvider>
                        <RouterProvider router={router} />
                    </ControlsEditorHostProvider>
                </ErrorBoundary>
            </ControlMappingProvider>
        </StrictMode>,
    );
}

// ─── Shared utilities ────────────────────────────────────────────────────────

/**
 * Remove production query values before any existing runtime can inspect them.
 *
 * The `ws=` transport override is consumed by
 * {@link bootstrapProductionRoute} from the query string CAPTURED
 * before this strip runs (013 FR-025) — production correctness never
 * depends on test infrastructure patching `history.replaceState`.
 */
function stripProductionQuery(): void {
    if (window.location.search !== '') {
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.hash}`);
    }
}

/** User-visible failure rendered before any identity-bearing lobby connection. */
function LobbyConfigurationError({ message }: { readonly message: string }): JSX.Element {
    return (
        <main id="main" className="europa-lobby" role="alert" tabIndex={-1}>
            <h1>Lobby unavailable</h1>
            <p>{message}</p>
            <p>Use this page's host for the WebSocket server, or remove the ws override.</p>
        </main>
    );
}

// ─── Lobby E2E test seam ─────────────────────────────────────────────────────

/** Window-global handle for lobby E2E tests (mirrors live-runtime's `__europaLive` pattern). */
interface EuropaLobbyHandle {
    /**
     * Credential-free projection of the lobby store (state assertions)
     * — see `internal/debug-views`. The raw store (whose state carries
     * the seat session bearer) is never published (005 FR-037).
     */
    readonly store: LobbyStoreDebugView;
}

declare global {
    interface Window {
        /**
         * Pre-load test opt-in sentinel (005 FR-037, 015 FR-019): test
         * infrastructure sets this via an init script BEFORE page load;
         * the production bootstrap installs test handles only when it
         * is present. Carries no bearer credentials.
         */
        __europaTestOptIn?: { readonly lobby?: true };
        __europaLobby?: EuropaLobbyHandle;
    }
}
