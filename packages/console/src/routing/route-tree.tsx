/**
 * TanStack Router code-based route tree for the Europa Neo console.
 *
 * This module defines the complete set of routes supported by the production
 * console application. Each route is created with `createRoute` and wired
 * into a tree via `rootRoute.addChildren(...)`.
 *
 * Route hierarchy:
 *   root (pathless layout → <Outlet />)
 *   ├── /              → redirect to /lobby
 *   ├── /lobby         → lobby landing
 *   ├── /profile       → identity management (validateSearch: profileSearchParams)
 *   └── /match/$matchId → match entry layout (MatchLayout + beforeLoad validation)
 *       ├── /          → adaptive match (MatchAdaptiveRoute — index route)
 *       ├── /join      → explicit player-entry intent
 *       └── /spectate  → explicit spectator-entry intent
 *
 * Design constraints:
 * - Pure route definitions: no side-effects beyond the beforeLoad validation
 *   throws.
 * - Placeholder components render minimal markup; the real UI lives in
 *   existing components that will be wired in later integration steps.
 * - The root route is a pathless layout that simply renders an `<Outlet />`
 *   so child routes can render into it.
 *
 * @module
 */

import { createRootRouteWithContext, createRoute, useNavigate } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { LobbyLayout, useLobbyLayout } from '../internal/lobby-layout';
import { LobbyRoot } from '../internal/lobby-runtime';
import { MatchAdaptiveRoute } from '../internal/match-adaptive-route';
import { MatchJoinRoute } from '../internal/match-join-route';
import { MatchLayout } from '../internal/match-layout';
import { MatchSpectateRoute } from '../internal/match-spectate-route';
import { ProfileRoute } from '../internal/profile-route';
import type { LobbyController } from '../state/lobby-controller';
import { WelcomeScreen } from '../ui/welcome-screen';
import { MatchIdValidationError, validateAndRedirectMatchId } from './match-validation';
import { profileSearchParams } from './search-params';

// ─── Router context type ────────────────────────────────────────────────────

/**
 * Typed context available to all routes via `beforeLoad` and `useRouteContext`.
 *
 * The lobby controller is the primary dependency: it owns the Zustand store
 * that holds the connection/identity state the root route's `beforeLoad`
 * gates on, and child components consume it via {@link useLobbyLayout}.
 */
export interface RouterContext {
    /** The page-lifetime lobby controller (created before the router mounts). */
    readonly controller: LobbyController;
    /** Resolved lobby/match server WebSocket URL. */
    readonly wsUrl: string;
}

// ─── Root route (pathless layout) ───────────────────────────────────────────

/**
 * Root route that renders child routes via the {@link LobbyLayout} component.
 *
 * This is a pathless layout route — it has no `path` of its own and exists
 * solely to provide the shared layout shell for all child routes. The
 * {@link LobbyLayout} component handles:
 *   - Announcer mount for shared live-region accessibility;
 *   - `<Outlet />` rendering for child routes.
 *
 * Note: The connection/identity deferred-resolution gates are NOT on the
 * root route's `beforeLoad` because the welcome screen (`/`) renders
 * without any lobby infrastructure. The identity gate (unnamed-identity
 * redirect to `/profile`) is handled by {@link LobbyLayout}'s `useEffect`,
 * which fires after the lobby connection establishes and identity resolves.
 *
 * Uses `createRootRouteWithContext` so child routes can access the lobby
 * controller via typed router context.
 */

/**
 * Redirect unknown paths to /lobby (AC-008).
 *
 * TanStack Router's fuzzy not-found mode renders this inside the root
 * layout's `<Outlet />` when no child route matches. The redirect is
 * deferred to a `useEffect` so it runs after the mount — avoiding a
 * render-time side effect that could race the router's navigation
 * lifecycle. The lobby's identity gate then decides whether the
 * visitor proceeds to `/lobby` or is forwarded to `/profile`.
 */
function NotFoundRedirect(): JSX.Element {
    const navigate = useNavigate();
    useEffect(() => {
        void navigate({ to: '/lobby', replace: true });
    }, [navigate]);
    return <p>Redirecting to lobby…</p>;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
    component: LobbyLayout,
    notFoundComponent: NotFoundRedirect,
});

// ─── Child routes ───────────────────────────────────────────────────────────

/**
 * Index route (`/`) — welcome landing screen (Feature 017).
 *
 * Renders the static welcome screen with no lobby connection required.
 * The welcome screen is a pure static page (FR-009) — no identity,
 * no WebSocket, no lobby state. Users click "Play" to navigate to `/lobby`.
 */
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: WelcomeScreen,
});

/**
 * Lobby route (`/lobby`) — the main lobby landing view.
 *
 * Uses {@link LobbyRoot} which handles the full lobby lifecycle:
 * command wrappers, deep-link interstitial, identity gate, route
 * resolution effects, and the match-leg handoff.
 */
const lobbyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/lobby',
    component: LobbyRoute,
});

/**
 * Thin wrapper that reads the lobby controller from the route context
 * and renders {@link LobbyRoot} with the correct props.
 */
function LobbyRoute(): JSX.Element {
    const { controller, wsUrl } = useLobbyLayout();
    const navigate = useNavigate();
    return (
        <LobbyRoot
            controller={controller}
            wsUrl={wsUrl}
            onNavigateToMatch={(matchId, intent) => {
                if (intent === 'create') {
                    void navigate({ to: '/match/$matchId', params: { matchId } });
                } else if (intent === 'join') {
                    void navigate({ to: '/match/$matchId/join', params: { matchId } });
                } else {
                    void navigate({ to: '/match/$matchId/spectate', params: { matchId } });
                }
            }}
        />
    );
}

/**
 * Profile route (`/profile`) — identity management.
 *
 * Uses `profileSearchParams` for search-param validation (FR-004/FR-005
 * from feature 015). The validated `returnTo` param is available to the
 * component via `useSearch({ from: profileRoute.id })`.
 *
 * The `ProfileRoute` wrapper (T112) reads the typed search param and
 * renders the existing `ProfileView` with lobby state bindings.
 */
const profileRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/profile',
    validateSearch: profileSearchParams,
    component: ProfileRoute,
});

/**
 * Match route (`/match/$matchId`) — match entry point (layout).
 *
 * The `beforeLoad` handler validates the raw `$matchId` URL param using
 * `validateAndRedirectMatchId`. On rejection the handler throws a redirect
 * to `/lobby`; on success the decoded match ID is returned for child
 * routes and components to consume.
 *
 * The `errorComponent` provides a safety net when the redirect cannot be
 * processed (e.g., router not yet mounted).
 *
 * The `MatchLayout` component handles deferred resolution (connection,
 * identity, snapshot gates), deep-link interstitial dispatch, resume-match
 * logic, and unnamed-identity redirect. It renders `<Outlet />` for child
 * routes when resolution is complete.
 */
const matchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/match/$matchId',
    beforeLoad: ({ params }) => {
        validateAndRedirectMatchId(params.matchId);
    },
    errorComponent: MatchIdValidationError,
    component: MatchLayout,
});

/**
 * Match index route (`/match/$matchId/`) — adaptive match entry.
 *
 * Index route that matches the bare `/match/$matchId` path with no trailing
 * segment. Renders `MatchAdaptiveRoute` which handles the adaptive
 * (player-role) match leg once the lobby has transitioned to match mode.
 */
const matchIndexRoute = createRoute({
    getParentRoute: () => matchRoute,
    path: '/',
    component: MatchAdaptiveRoute,
});

/**
 * Join route (`/match/$matchId/join`) — explicit player-entry intent.
 *
 * Child of the match route. The match ID is already validated by the
 * parent's `beforeLoad`; this route dispatches a join command via the
 * lobby controller and renders the match leg host once the lobby state
 * transitions to match mode.
 */
const matchJoinRoute = createRoute({
    getParentRoute: () => matchRoute,
    path: 'join',
    component: MatchJoinRoute,
});

/**
 * Spectate route (`/match/$matchId/spectate`) — explicit spectator-entry intent.
 *
 * Child of the match route. Dispatches a spectate command via the lobby
 * controller and renders the match leg host in read-only mode once the
 * lobby state transitions to match mode.
 */
const matchSpectateRoute = createRoute({
    getParentRoute: () => matchRoute,
    path: 'spectate',
    component: MatchSpectateRoute,
});

// ─── Route tree assembly ────────────────────────────────────────────────────

/**
 * The complete route tree for the Europa Neo console.
 *
 * Assembled by attaching all child routes to the root route. The match
 * route carries its join and spectate children via `addChildren`.
 *
 * Usage:
 * ```ts
 * import { routeTree } from './routing/route-tree';
 * import { Router } from '@tanstack/react-router';
 *
 * const router = new Router({ routeTree });
 * ```
 */
export const routeTree = rootRoute.addChildren([
    indexRoute,
    lobbyRoute,
    profileRoute,
    matchRoute.addChildren([matchIndexRoute, matchJoinRoute, matchSpectateRoute]),
]);

// ─── Individual route exports ───────────────────────────────────────────────

export {
    indexRoute,
    lobbyRoute,
    matchIndexRoute,
    matchJoinRoute,
    matchRoute,
    matchSpectateRoute,
    profileRoute,
    rootRoute,
};
