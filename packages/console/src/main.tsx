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
 *     used by real-network fixture harnesses — boots the live-runtime
 *     entry directly, bypassing the lobby and router entirely.
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

import { createWsLobbyClient } from './net/ws-lobby-client';
import { ErrorBoundary } from './render/ErrorBoundary';
import { routeTree } from './routing/route-tree';
import { createLobbyController } from './state/lobby-controller';
import { LobbyServerUrlError, resolveLobbyServerUrl } from './state/lobby-view';

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
    stripProductionQuery();
    void import('./internal/live-runtime').then((module) => module.mountLiveRuntime(rootElement));
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
 * discipline as `lobby-runtime`'s `mountLobbyRuntime`): no
 * dispose-on-unmount race with StrictMode's simulated remounts, and
 * `connect()`'s own already-establishing guard makes double
 * invocation harmless.
 *
 * @param root The SPA mount node.
 */
function bootstrapProductionRoute(root: HTMLElement): void {
    stripProductionQuery();

    // Resolve the lobby server URL. May throw if the transport
    // override is malformed — render a configuration error page
    // before any identity-bearing lobby connection.
    let wsUrl: string;
    try {
        wsUrl = resolveLobbyServerUrl(window.location.search, window.location);
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

    // Expose the store for Playwright lobby E2E assertions (mirrors
    // live-runtime's `window.__europaLive` pattern). Test-only surface;
    // production code never reads this.
    window.__europaLobby = { store: controller.store };

    // Begin the lobby establish cycle. The connection is non-blocking —
    // the router's root layout `beforeLoad` gates child rendering on
    // `connection === 'ready'` and `identityStatus === 'named'`.
    void controller.connect();

    // Guard against TanStack Router's internal history normalization.
    //
    // createBrowserHistory (called by RouterCore.update during
    // createRouter) invokes history.replaceState(state, "") with only
    // two arguments — no URL. The browser's native behavior is to keep
    // the current URL, but E2E test infrastructure (preserveWsQueryInHistory)
    // patches replaceState and converts the missing URL argument from
    // undefined to the string "undefined", corrupting the pathname.
    //
    // This wrapper detects the missing URL and injects the current
    // location so the router initializes with the correct pathname.
    guardReplaceStateUrlArgument();

    // Build the router with typed context (controller + wsUrl). The
    // root layout route's `beforeLoad` reads the controller store to
    // gate child rendering on connection/identity readiness.
    const router = createRouter({
        routeTree,
        context: { controller, wsUrl },
    });

    // Mount the router into the DOM. The ErrorBoundary wraps the entire
    // tree so a bad frame never blanks the page silently (Q-B08).
    createRoot(root).render(
        <StrictMode>
            <ErrorBoundary>
                <RouterProvider router={router} />
            </ErrorBoundary>
        </StrictMode>,
    );
}

// ─── Shared utilities ────────────────────────────────────────────────────────

/**
 * Remove production query values before any existing runtime can inspect them.
 *
 * The E2E transport override is preserved by the test infrastructure's
 * `preserveWsQueryInHistory` init script, which patches
 * `history.replaceState` to carry the param through.
 */
function stripProductionQuery(): void {
    if (window.location.search !== '') {
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.hash}`);
    }
}

/**
 * Guard against `history.replaceState` being called without a URL argument.
 *
 * TanStack Router's `createBrowserHistory` calls `replaceState(state, "")`
 * during construction to inject a history key. Browsers treat a missing URL
 * as "keep the current URL", but E2E test infrastructure that patches
 * `replaceState` may convert `undefined` to the literal string `"undefined"`,
 * corrupting the pathname.
 *
 * This function wraps `replaceState` so that a missing URL argument is
 * replaced with the current `window.location.href`, preserving the correct
 * initial location for the router.
 */
function guardReplaceStateUrlArgument(): void {
    const currentReplaceState = window.history.replaceState.bind(window.history);
    window.history.replaceState = (state: unknown, title: string, url?: string | URL | null): void => {
        if (url === undefined || url === null) {
            currentReplaceState(state, title, window.location.href);
        } else {
            currentReplaceState(state, title, url);
        }
    };
}

/** User-visible failure rendered before any identity-bearing lobby connection. */
function LobbyConfigurationError({ message }: { readonly message: string }): JSX.Element {
    return (
        <main id="main" className="europa-lobby" role="alert">
            <h1>Lobby unavailable</h1>
            <p>{message}</p>
            <p>Use this page's host for the WebSocket server, or remove the ws override.</p>
        </main>
    );
}

// ─── Lobby E2E test seam ─────────────────────────────────────────────────────

/** Window-global handle for lobby E2E tests (mirrors live-runtime's `__europaLive` pattern). */
interface EuropaLobbyHandle {
    /** The lobby store (state assertions). */
    readonly store: import('./state/lobby-store').LobbyStore;
}

declare global {
    interface Window {
        __europaLobby?: EuropaLobbyHandle;
    }
}
