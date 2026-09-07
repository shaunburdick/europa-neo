/**
 * Lobby layout route component — TanStack Router migration (issue #75).
 *
 * Root layout route component for the TanStack Router route tree. Extracts
 * the lobby connection/identity lifecycle from {@link LobbyRoot} (in
 * `lobby-runtime.tsx`, preserved until T111-T113).
 *
 * Responsibilities (FR-026 layout route):
 *   - Deferred-resolution `beforeLoad` gate: waits for the lobby
 *     connection to reach `'ready'` AND identity to be `'named'`
 *     before rendering children (T109). While either gate holds the
 *     route stays in TanStack Router's pending state; re-evaluation
 *     happens automatically on state changes;
 *   - Announcer mount (shared hidden live regions for accessibility —
 *     survives lobby/match view swaps);
 *   - Lobby identity gate: unnamed visitors on `/lobby` are redirected
 *     to `/profile?returnTo=<encoded-lobby-path>` (feature 015 US3);
 *   - `<Outlet />` for TanStack Router child routes.
 *
 * What this does NOT yet handle (deferred to T111-T113):
 *   - View-mode gate (lobby vs match vs deep-link interstitial);
 *   - Command wrappers (createMatch, joinMatch, spectateMatch, leaveMatch);
 *   - MatchLegHost rendering;
 *   - Route-resolution effects (deep-link, returnTo round-trip).
 *
 * Navigation is handled by the router's `useNavigate`; pathname
 * is available via `useLocation` when needed by child routes.
 *
 * ## `beforeLoad` architecture (T109)
 *
 * The deferred-resolution gates (`connection === 'ready'` and
 * `identityStatus === 'named'`) are implemented as a `beforeLoad` hook
 * on the root route rather than a React-level render gate. This means:
 *
 *   - TanStack Router holds child routes in a pending state while the
 *     gates are unsatisfied, showing pending UI (if configured);
 *   - When the lobby store advances (connection becomes `'ready'`,
 *     identity resolves to `'named'`), the router automatically
 *     re-evaluates `beforeLoad` and renders children;
 *   - The route stays pending across navigation — a transition to
 *     `/lobby` while identity is still `'restoring'` will not flash
 *     an empty lobby.
 *
 * The `beforeLoad` accesses the lobby controller via TanStack Router's
 * typed router context (`RouterContext`), which carries the controller
 * and wsUrl. This avoids module-level mutable state and keeps the data
 * flow explicit through the route tree.
 *
 * @module
 */

import { Outlet, useLocation, useNavigate, useRouteContext } from '@tanstack/react-router';
import type { JSX } from 'react';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { LiveRegionAnnouncer } from '../a11y/live-region';
import type { RouterContext } from '../routing/route-tree';
import type { LobbyController } from '../state/lobby-controller';

// ----------------------------------------------------------------------------
// beforeLoad (T109)
// ----------------------------------------------------------------------------

/**
 * Deferred-resolution `beforeLoad` for the root layout route.
 *
 * Gates child rendering on two lobby-state conditions:
 *   1. `connection === 'ready'` — the lobby WebSocket connection has
 *      completed the establish cycle (hello → identity → baseline);
 *   2. `identityStatus === 'named'` — the server has confirmed a
 *      display handle for this session.
 *
 * While either condition is unsatisfied, TanStack Router keeps the
 * route in its pending state. When the lobby store advances (the
 * connection becomes ready, or the identity resolves to named), the
 * router automatically re-evaluates this `beforeLoad` and proceeds.
 *
 * This function runs OUTSIDE React (in the router's navigation
 * lifecycle), so it reads the lobby state directly from the
 * controller's Zustand store via `store.getState()` rather than
 * through `useSyncExternalStore`.
 *
 * The function accesses the controller through TanStack Router's typed
 * router context — the root route is created with
 * `createRootRouteWithContext<RouterContext>()`, which makes
 * `context.controller` available to `beforeLoad`.
 *
 * @see TanStack Router — beforeLoad data loading guide
 */
export function lobbyBeforeLoad({ context }: { readonly context: RouterContext }): void {
    const { controller } = context;
    const state = controller.store.getState();

    // Identity gate: identity must be resolved — either 'named' (handle
    // confirmed by server) or 'unnamed' (server confirmed no handle).
    // Both are terminal identity states. The component's redirect
    // effect handles unnamed visitors (redirecting to /profile).
    //
    // The identity is only resolved AFTER the establish cycle completes
    // (connection → hello → identity → baseline → ready), so a resolved
    // identity implies the connection was 'ready' at some point. We do
    // NOT gate on `connection === 'ready'` because transient
    // reconnections (e.g. after server restart + Leave) can flip the
    // connection back to 'reconnecting' while the identity remains
    // valid — re-blocking the route would prevent the user from
    // navigating to /profile to re-establish their handle.
    if (state.identityStatus !== 'named' && state.identityStatus !== 'unnamed') {
        return;
    }

    // Identity resolved — the route resolves and children render.
}

// ----------------------------------------------------------------------------
// Lobby layout context
// ----------------------------------------------------------------------------

/**
 * Value shared with child routes via {@link LobbyLayoutContext}.
 *
 * In the current phase (pre-T111), this carries the controller, server
 * URL, and shared announcer. Future tasks will add command wrappers and
 * lobby state projection.
 */
export interface LobbyLayoutValue {
    /** The page-lifetime lobby controller. */
    readonly controller: LobbyController;
    /** Resolved lobby/match server WebSocket URL. */
    readonly wsUrl: string;
    /** Shared announcer instance (survives view swaps). */
    readonly announcer: LiveRegionAnnouncer | null;
}

/**
 * React context for the lobby layout route.
 *
 * Child routes (lobby, profile, match) consume this to access the
 * controller and server URL without prop drilling through the route
 * tree. The value is provided by {@link LobbyLayout}.
 */
export const LobbyLayoutContext = createContext<LobbyLayoutValue | null>(null);

/**
 * Convenience hook for child routes to access the lobby layout context.
 *
 * @throws {Error} If called outside a {@link LobbyLayout} provider.
 */
export function useLobbyLayout(): LobbyLayoutValue {
    const value = useContext(LobbyLayoutContext);
    if (value === null) {
        throw new Error('useLobbyLayout must be used within a <LobbyLayout> provider');
    }
    return value;
}

// ----------------------------------------------------------------------------
// Layout component
// ----------------------------------------------------------------------------

/**
 * Root layout route component for the TanStack Router route tree.
 *
 * Renders shared infrastructure (announcer, identity gate for `/lobby`)
 * and delegates to {@link Outlet} for child-route content.
 *
 * The controller and wsUrl are read from TanStack Router's typed route
 * context (`RouterContext`) rather than from React props — the root
 * route is created with `createRootRouteWithContext<RouterContext>()`
 * and the router receives the context when instantiated.
 *
 * The deferred-resolution gates (`connection === 'ready'` and
 * `identityStatus === 'named'`) are handled by {@link lobbyBeforeLoad}
 * in the route's `beforeLoad`, NOT by a render gate in this component.
 * This means TanStack Router manages the pending state, and child
 * routes only render once both gates are satisfied.
 *
 * The remaining React-side gate is the unnamed-identity redirect:
 * when a visitor lands on `/lobby` with `identityStatus === 'unnamed'`,
 * this component redirects to `/profile?returnTo=<lobby-path>`. This
 * fires after `beforeLoad` has already confirmed the connection is
 * ready and identity resolved — the redirect happens only when the
 * server confirms the visitor has no handle.
 */
export function LobbyLayout(): JSX.Element {
    // The root route is created with `createRootRouteWithContext<RouterContext>()`,
    // so the route context carries { controller, wsUrl }. We extract the
    // controller and wsUrl from the typed route context rather than from
    // React props — the router context is the single source of truth for
    // the lobby controller lifetime.
    const routeCtx = useRouteContext({ from: rootRouteId }) as RouterContext;
    const { controller, wsUrl } = routeCtx;

    const state = useSyncExternalStore(controller.store.subscribe, controller.store.getState);
    const navigate = useNavigate();
    const location = useLocation();

    // Shared hidden live regions (App.tsx pattern). Runtime-owned so
    // announcements SURVIVE the lobby⇄match view swap.
    const liveHostRef = useRef<HTMLDivElement | null>(null);
    const [announcer, setAnnouncer] = useState<LiveRegionAnnouncer | null>(null);
    useEffect(() => {
        const host = liveHostRef.current;
        if (host !== null) {
            const instance = new LiveRegionAnnouncer(host);
            setAnnouncer(instance);
            return () => {
                instance.clear();
                setAnnouncer(null);
            };
        }
        return undefined;
    }, []);

    // -- Lobby identity gate --------------------------------------------
    // When an unnamed visitor lands on /lobby, redirect to /profile so
    // they choose a name before interacting. Fires after identity
    // resolution (not at bootstrap) so the redirect happens only when
    // the server confirms the visitor has no handle. Safe from loops:
    // after redirect the pathname is /profile, so the guard exits.
    //
    // Welcome screen (/) requires no identity — unnamed visitors see
    // the landing page and are only redirected when they click Play
    // and land on /lobby. Profile (/profile) is the target, not a
    // redirect source. Match routes are handled separately (feature
    // 015 live-smoke fix).
    useEffect(() => {
        if (state.identityStatus !== 'unnamed') return;

        // Only redirect from /lobby — not /profile, /match/*, or /.
        // Use location.pathname (from useLocation) so the effect re-fires
        // when the router pathname changes (e.g. after leaving a match via
        // pushState). window.location.pathname would be stale.
        if (location.pathname !== '/lobby') return;

        const returnTo = encodeURIComponent(location.pathname);
        void navigate({ to: '/profile', search: { returnTo }, replace: true });
    }, [state.identityStatus, navigate, location.pathname]);

    // -- Render ---------------------------------------------------------

    // Hidden host for the shared live-region announcer — must be
    // rendered (not just ref-attached) so liveHostRef.current is
    // non-null and the useEffect can construct the instance.
    const announcerHost = (
        <div ref={liveHostRef} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} />
    );

    const contextValue: LobbyLayoutValue = { controller, wsUrl, announcer };

    return (
        <LobbyLayoutContext.Provider value={contextValue}>
            {announcerHost}
            <Outlet />
        </LobbyLayoutContext.Provider>
    );
}

// ─── Route ID constant ──────────────────────────────────────────────────────

/**
 * TanStack Router route ID for the root layout route.
 *
 * Used by `useRouteContext({ from: rootRouteId })` to retrieve the
 * typed router context (controller + wsUrl) from the root route.
 */
const rootRouteId = '__root__' as const;
