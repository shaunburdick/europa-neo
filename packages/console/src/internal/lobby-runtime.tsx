/**
 * Lobby runtime — feature 010 (T-015).
 *
 * The DEFAULT application entry (mounted by `main.tsx` for canonical and
 * semantic production paths): boots the lobby. The `?e2e` harness is handled
 * separately, and the retired live query is never a production entry.
 * transport + controller once per page, renders the landing view while
 * `viewMode === 'lobby'`, and — after a seat-granting action succeeds
 * — hands off to a match context (`viewMode === 'match'`) that ends in
 * the EXISTING match console, unchanged.
 *
 * Match-leg handoff (plan §2 "one presence per connection" split): the
 * LOBBY connection stays open the whole time (identity, snapshots,
 * leave); gameplay rides a SECOND socket via the existing production
 * chain — `createWsMatchClient` → `createConsoleClient` → order bridge
 * → console store → {@link App} — exactly the integration-wave
 * `live-runtime` recipe. Timing follows the wire's registration rule:
 * the matchmaker registers a match with the networking server only at
 * AUTO-START, so a player leg attaches when the lobby snapshot flips
 * the target row to `'in_progress'` — until then the visitor sees the
 * waiting-room plate (US3 AC-1). The seat reserved through the lobby
 * is claimed by the tokenless wire join (first seat with no live
 * connection). Leaving (`lobbyLeave`) flips the view back and tears
 * the leg down; the identity survives for the next round.
 *
 * Spectator legs (feature 010 T-016, US4 AC-2 / FR-012 / SC-005): a
 * lobby-initiated spectate attaches through the EXISTING feature-004
 * spectator path — same wire, `joinMatch.role: 'spectator'`, no seat,
 * server-computed full-visibility views (fog's `{ spectator: true }`
 * branch). The leg deliberately does NOT use the player store/reducer
 * chain: {@link ../state/spectator-session} folds envelopes into a
 * ConsoleState-shaped snapshot rendered by the existing App STATICALLY
 * (no store ⇒ no input controllers, no order bridge, no sendOrder sink
 * — read-only by construction), and the adapter refuses spectator
 * orders outright (`net/client.ts`). Order controls are therefore inert
 * at every layer, and fog visibility is exactly the server-generated
 * spectator view — nothing is filtered or re-derived client-side.
 *
 * Identity handling: this module consumes {@link LobbyState} plus the
 * display handle it deliberately copies into the match join's
 * `displayName` (FR-019 — the handle FOLLOWS the player into the match).
 * Player IDs are non-secret correlation data and may be carried or shown
 * when useful; handles remain the preferred user-facing label. Resume
 * credentials are still protected and authority remains server-resolved.
 *
 * Focus management: each view focuses its heading on ENTRY, but never
 * on initial page load (browser convention — the first view skips the
 * focus steal; every subsequent swap takes it, WCAG 2.4.3).
 */

import type { PublicLobbyEntry } from '@europa/matchmaking';
import type { JSX } from 'react';
import { StrictMode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * Subscribe to the current browser pathname, re-rendering on ANY change —
 * including `history.pushState`/`replaceState`, which do NOT fire
 * `popstate`. The lobby view gate reads `window.location.pathname`
 * directly, so it must re-evaluate when the pathname changes (e.g. the
 * lobby landing's "Choose a name" link pushes `/profile`).
 *
 * `pushState`/`replaceState` are patched once to dispatch a custom
 * `europa:pathchange` event; `popstate` and `hashchange` are also
 * observed for Back/Forward and hash-only navigation.
 */
function usePathname(): string {
    return useSyncExternalStore(
        (onStoreChange) => {
            const onPathChange = (): void => onStoreChange();
            window.addEventListener('popstate', onPathChange);
            window.addEventListener('hashchange', onPathChange);
            window.addEventListener('europa:pathchange', onPathChange);
            return () => {
                window.removeEventListener('popstate', onPathChange);
                window.removeEventListener('hashchange', onPathChange);
                window.removeEventListener('europa:pathchange', onPathChange);
            };
        },
        () => window.location.pathname,
    );
}

/** Patch history.pushState/replaceState once to emit `europa:pathchange`. */
function patchHistoryForPathChanges(): void {
    const pushState = window.history.pushState.bind(window.history);
    const replaceState = window.history.replaceState.bind(window.history);
    window.history.pushState = (state, title, url) => {
        pushState(state, title, url);
        window.dispatchEvent(new Event('europa:pathchange'));
    };
    window.history.replaceState = (state, title, url) => {
        replaceState(state, title, url);
        window.dispatchEvent(new Event('europa:pathchange'));
    };
}

import { LiveRegionAnnouncer } from '../a11y/live-region';
import { createConsoleClient } from '../net/client';
import { createWsLobbyClient } from '../net/ws-lobby-client';
import { createWsMatchClient } from '../net/ws-match-client';
import { App } from '../render/App';
import { ErrorBoundary } from '../render/ErrorBoundary';
import type { Route } from '../routing/route';
import { buildJoinUrl, buildMatchUrl, buildSpectateUrl, parseRoute } from '../routing/route';
import { adaptRoute, executeRouteEntry } from '../routing/route-adapter';
import { formatWaitingMessage } from '../state/awaiting-start';
import { createLobbyController, type LobbyCommandResult, type LobbyController } from '../state/lobby-controller';
import type { LobbyActionError } from '../state/lobby-state';
import type { LobbyStore } from '../state/lobby-store';
import { LobbyServerUrlError, resolveLobbyServerUrl } from '../state/lobby-view';
import { createOrderBridge } from '../state/order-actions';
import { INITIAL_CONSOLE_STATE } from '../state/reducer';
import {
    applySpectatorEnvelope,
    applySpectatorTransportLoss,
    initialSpectatorState,
    withNotice,
} from '../state/spectator-session';
import { type ConsoleStore, createConsoleStore } from '../state/store';
import type { ConsoleState, MatchId, ReducerEffect } from '../state/types';
import { buildCreateSettings, type LobbyCreateFormValues } from '../ui/lobby-create-form';
import { formatOccupancy } from '../ui/lobby-labels';
import { LobbyLanding } from '../ui/lobby-landing';
import { readReturnTo } from '../ui/profile-url';
import { ProfileView } from '../ui/profile-view';
import { RouteNotice, type RouteNoticeKind } from '../ui/route-notice';
import { WAITING_FOR_OPPONENT_MESSAGE } from '../ui/waiting-overlay';

// ----------------------------------------------------------------------------
// Test handle — exposed for Playwright lobby E2E assertions
// ----------------------------------------------------------------------------

/** Window-global handle for lobby E2E tests (mirrors live-runtime's `__europaLive`). */
interface EuropaLobbyHandle {
    /** The lobby store (state assertions). */
    readonly store: LobbyStore;
}

declare global {
    interface Window {
        __europaLobby?: EuropaLobbyHandle;
    }
}

// ----------------------------------------------------------------------------
// Mount entry
// ----------------------------------------------------------------------------

/**
 * Mount the public-lobby runtime into `root`.
 *
 * The transport/controller pair lives OUTSIDE React (page lifetime —
 * same discipline as `live-runtime`): no dispose-on-unmount race with
 * StrictMode's simulated remounts, and `connect()`'s own
 * already-establishing guard makes double invocation harmless.
 *
 * @param root The DOM mount node (index.html's `#root`).
 */
export function mountLobbyRuntime(
    root: HTMLElement,
    route?: Extract<Route, { readonly kind: 'match' }>,
    recoveryKind?: RouteNoticeKind,
): void {
    let wsUrl: string;
    try {
        wsUrl = resolveLobbyServerUrl(window.location.search, window.location);
    } catch (error: unknown) {
        const message = error instanceof LobbyServerUrlError ? error.message : 'The WebSocket server URL is invalid.';
        createRoot(root).render(<LobbyConfigurationError message={message} />);
        return;
    }
    const transport = createWsLobbyClient({});
    const controller = createLobbyController({ transport, url: wsUrl });

    // Expose the store for Playwright lobby E2E assertions (mirrors
    // live-runtime's `window.__europaLive` pattern). Test-only surface;
    // production code never reads this.
    window.__europaLobby = { store: controller.store };

    void controller.connect();
    createRoot(root).render(
        <StrictMode>
            <ErrorBoundary>
                <LobbyRoot
                    controller={controller}
                    wsUrl={wsUrl}
                    initialRoute={route}
                    initialNoticeKind={recoveryKind}
                />
            </ErrorBoundary>
        </StrictMode>,
    );
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

// ----------------------------------------------------------------------------
// Root component: announcer + view gate + command wrappers
// ----------------------------------------------------------------------------

/** Which match leg to attach when the view enters `'match'`. */
interface LegIntent {
    /** Target match; `null` for the create flow (snapshot pins it). */
    readonly matchId: MatchId | null;
    /** Wire role for the leg's join. */
    readonly role: 'player' | 'spectator';
}

/** Props for {@link LobbyRoot}. */
export interface LobbyRootProps {
    /** The page-lifetime lobby controller. */
    readonly controller: LobbyController;
    /** Resolved lobby/match server URL (see `resolveLobbyServerUrl`). */
    readonly wsUrl: string;
    /**
     * Optional semantic match route selected by the production bootstrap.
     * The route is resolved against the lobby snapshot before any match
     * command or match socket is created.
     */
    readonly initialRoute?: Extract<Route, { readonly kind: 'match' }> | undefined;
    /** Recovery notice selected by bootstrap for an unknown pathname. */
    readonly initialNoticeKind?: RouteNoticeKind | undefined;
}

/**
 * The application root: shared announcer mount, command wrappers with
 * outcome announcements, and the lobby/match view gate. Exported for
 * component tests (the mount entry wires it identically).
 */
export function LobbyRoot({ controller, wsUrl, initialRoute, initialNoticeKind }: LobbyRootProps): JSX.Element {
    const state = useSyncExternalStore(controller.store.subscribe, controller.store.getState);
    // Re-render on pathname changes (pushState/replaceState/popstate) so the
    // profile/lobby view gate below re-evaluates. Patch history once.
    const pathname = usePathname();
    useEffect(() => {
        patchHistoryForPathChanges();
    }, []);

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

    // Focus hand-off bookkeeping: count view-mode switches so views
    // know they are an ENTRY (focus heading) vs initial load (don't).
    const [viewSwitches, setViewSwitches] = useState(0);
    const [currentRoute, setCurrentRoute] = useState<Extract<Route, { readonly kind: 'match' }> | undefined>(
        initialRoute,
    );
    const [noticeKind, setNoticeKind] = useState<RouteNoticeKind | null>(initialNoticeKind ?? null);
    const [routeRetryEpoch, setRouteRetryEpoch] = useState(0);
    const pendingNavigationRef = useRef<'create' | 'join' | 'spectate' | null>(null);
    const prevViewModeRef = useRef(state.viewMode);
    const routeResolutionRef = useRef(initialRoute !== undefined);
    const completedNavigationPathRef = useRef<string | null>(null);
    const lobbyRedirectedRef = useRef(false);
    useEffect(() => {
        if (prevViewModeRef.current !== state.viewMode) {
            prevViewModeRef.current = state.viewMode;
            setViewSwitches((count) => count + 1);
        }
    }, [state.viewMode]);

    // The pending/current match-leg intent (render-phase ref holding
    // plain data — no I/O during render, App's MapCanvas pattern).
    const legIntentRef = useRef<LegIntent | null>(null);
    const routeAttemptedRef = useRef(false);

    function navigateTo(pathname: string): void {
        if (window.location.pathname === pathname) return;
        window.history.pushState(window.history.state, '', pathname);
    }

    function returnToLobby(): void {
        setNoticeKind(null);
        setCurrentRoute(undefined);
        if (window.location.pathname !== '/lobby') {
            window.history.replaceState(window.history.state, '', '/lobby');
        }
        if (state.viewMode === 'match') {
            void controller.leaveMatch();
        }
    }

    // Browser Back/Forward changes the route without remounting the page.
    // Re-evaluate it against the current authoritative lobby snapshot.
    useEffect(() => {
        const onPopState = (): void => {
            if (completedNavigationPathRef.current === window.location.pathname) return;
            const next = parseRoute(window.location.pathname);
            if (next.kind === 'match') {
                routeAttemptedRef.current = false;
                routeResolutionRef.current = true;
                completedNavigationPathRef.current = null;
                setNoticeKind(null);
                setCurrentRoute(next);
            } else if (next.kind === 'lobby') {
                routeAttemptedRef.current = true;
                setNoticeKind(null);
                setCurrentRoute(undefined);
                if (state.viewMode === 'match') void controller.leaveMatch();
            } else {
                window.history.replaceState(window.history.state, '', '/lobby');
                setCurrentRoute(undefined);
                setNoticeKind('unknown');
            }
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [controller, state.viewMode]);

    // A semantic deep link is deliberately resolved only after the lobby has
    // delivered its authoritative baseline. The adapter decides whether the
    // route is a player or spectator entry; this runtime only records that
    // decision and invokes the existing Feature 010 command. In particular,
    // no match client exists while the route is unresolved, and an explicit
    // intent can never be changed by this hand-off.
    //
    // Resolution additionally waits for the IDENTITY and CONNECTION gates
    // (feature 015 live-smoke defect fix). Wire ordering inside one
    // establish cycle is identity event → baseline snapshot → 'ready',
    // where 'ready' is dispatched a microtask AFTER the snapshot handlers
    // — so a naive snapshot gate can command a join while the transport is
    // still 'connecting' (rejected locally), and an unnamed visitor's join
    // is rejected server-side with `identity_invalid` (matchmaking US1
    // AC-5). Either failure used to land as a sticky shortcut-failure
    // notice rendered OVER the US3 /profile redirect — the deep-link
    // dead-end. While either gate holds, this effect defers WITHOUT
    // consuming the attempt (routeAttemptedRef stays false) and re-runs on
    // the identity/connection deps: naming on the redirected /profile
    // resolves the deferred route through the returnTo round-trip (FR-010),
    // and the 'ready' flip releases the connecting-window race. Spectator
    // routes wait too: the redirect effect owns the URL for EVERY match
    // route while unnamed, so attaching a spectator leg under a /profile
    // URL would be incoherent — after naming, the same returnTo round-trip
    // delivers spectators (spectate itself needs no handle server-side,
    // only a resolved identity posture).
    useEffect(() => {
        if (
            currentRoute === undefined ||
            !routeResolutionRef.current ||
            routeAttemptedRef.current ||
            state.viewMode === 'match' ||
            state.snapshot === null ||
            completedNavigationPathRef.current === currentRoute.pathname ||
            // Feature 015 gates — see the block comment above. Deferring
            // here must NOT mark the attempt: a later identity/connection
            // transition re-runs this effect and resolves the route then.
            state.connection !== 'ready' ||
            state.identityStatus !== 'named'
        ) {
            return;
        }
        routeAttemptedRef.current = true;
        const entry = adaptRoute(currentRoute, state.snapshot);
        // The lobby snapshot is authoritative for the current identity. On a
        // reload, an active association means this route is a resume request,
        // not a new join against the now-running/full projection. Preserve
        // explicit spectate semantics; only adaptive/player routes may resume
        // the existing player association.
        if (
            state.activeMatchId === currentRoute.matchId &&
            (currentRoute.intent === 'adaptive' || currentRoute.intent === 'join')
        ) {
            legIntentRef.current = { matchId: state.activeMatchId, role: 'player' };
            controller.resumeMatch(state.activeMatchId);
            return;
        }
        if (entry.kind === 'unavailable') {
            // A successful lobby action owns the transition even if its
            // snapshot races this effect and now describes the match as full
            // or running. Never let that stale route classification replace
            // the already-mounted match runtime.
            setNoticeKind('unavailable');
            return;
        }
        if (entry.kind === 'player') {
            legIntentRef.current = { matchId: entry.matchId, role: 'player' };
        } else if (entry.kind === 'spectator') {
            legIntentRef.current = { matchId: entry.matchId, role: 'spectator' };
        }
        void executeRouteEntry(entry, controller)?.then((result) => {
            if (!result.ok) setNoticeKind('shortcut-failure');
        });
    }, [
        controller,
        currentRoute,
        routeRetryEpoch,
        state.connection,
        state.identityStatus,
        state.snapshot,
        state.viewMode,
    ]);

    // US3 match-join redirect: when a player arrives at a match route
    // (via browser URL) and identity resolution completes as unnamed,
    // redirect to /profile with returnTo carrying the original route.
    // This fires AFTER identity resolution (not at bootstrap) so the
    // redirect happens only when the server confirms the visitor has
    // no handle.
    //
    // returnTo captures the PATHNAME only (feature 015 live-smoke fix):
    // FR-005 defines the parameter as a relative pathname, and match
    // routes never carry a query in production — the bootstrap strips
    // it before this runtime mounts, so `pathname + search` was already
    // pathname-equivalent here. Keeping the search out matters because
    // `readReturnTo` decodes twice (URLSearchParams + decodeURIComponent),
    // so a query inside the captured value (e.g. a transport-override
    // query riding on the deep link) would decode into a `://` sequence
    // and be rightly rejected as unsafe — silently dead-ending the
    // returnTo round-trip. The pathname cannot trip that check.
    useEffect(() => {
        if (state.identityStatus !== 'unnamed') return;
        const route = parseRoute(window.location.pathname);
        if (route.kind !== 'match') return;
        const returnTo = encodeURIComponent(window.location.pathname);
        window.history.replaceState(window.history.state, '', `/profile?returnTo=${returnTo}`);
    }, [state.identityStatus]);

    // US1 lobby identity gate: when an unnamed visitor lands on the lobby
    // root (/ or /lobby), redirect to /profile so they choose a name before
    // interacting. This fires AFTER identity resolution (not at bootstrap)
    // so the redirect happens only when the server confirms the visitor has
    // no handle. The redirect is one-shot (lobbyRedirectedRef) to avoid a
    // loop: after pushState to /profile, the pathname is no longer a lobby
    // route, so the guard exits even without the ref.
    //
    // Connection gating: wait until the lobby connection is 'ready' so the
    // identity has been resolved by the server — avoid a flash redirect
    // before the server responds.
    useEffect(() => {
        if (lobbyRedirectedRef.current) return;
        if (state.identityStatus !== 'unnamed') return;
        if (state.connection !== 'ready') return;
        const route = parseRoute(window.location.pathname);
        if (route.kind !== 'root' && route.kind !== 'lobby') return;
        lobbyRedirectedRef.current = true;
        const returnTo = encodeURIComponent(window.location.pathname);
        window.history.replaceState(window.history.state, '', `/profile?returnTo=${returnTo}`);
    }, [state.identityStatus, state.connection]);

    // Successful actions initiated from the lobby get one canonical semantic
    // history entry. Route-originated actions already have the right URL.
    useEffect(() => {
        const pending = pendingNavigationRef.current;
        const matchId = state.activeMatchId;
        if (state.viewMode !== 'match' || pending === null || matchId === null) return;
        const path =
            pending === 'create'
                ? buildMatchUrl(window.location.origin, matchId)
                : pending === 'join'
                  ? buildJoinUrl(window.location.origin, matchId)
                  : buildSpectateUrl(window.location.origin, matchId);
        routeResolutionRef.current = false;
        routeAttemptedRef.current = true;
        setCurrentRoute(undefined);
        setNoticeKind(null);
        const pathname = new URL(path).pathname;
        completedNavigationPathRef.current = pathname;
        navigateTo(pathname);
        // Do not put the newly-written path back through route resolution.
        // The command already succeeded and its target may have changed state
        // (for example, the final joiner starts the match immediately).
        // Back/Forward remains the explicit re-resolution boundary.
        pendingNavigationRef.current = null;
    }, [state.activeMatchId, state.viewMode]);

    /** Announce a seat-grant outcome on success only — failures render
     * as role="alert" nodes at their source and announce themselves. */
    function announceSeatOutcome(result: LobbyCommandResult, successMessage: string): void {
        if (result.ok && announcer !== null) {
            announcer.announce(successMessage, 'polite');
        }
    }

    function submitHandle(raw: string): void {
        void controller.setHandle(raw);
    }

    function createMatch(values: LobbyCreateFormValues): void {
        routeResolutionRef.current = false;
        pendingNavigationRef.current = 'create';
        legIntentRef.current = { matchId: null, role: 'player' };
        void controller.createMatch(buildCreateSettings(values)).then((result) => {
            if (!result.ok) pendingNavigationRef.current = null;
            announceSeatOutcome(result, 'Match created — entering the waiting room.');
        });
    }

    function joinMatch(matchId: MatchId): void {
        routeResolutionRef.current = false;
        pendingNavigationRef.current = 'join';
        legIntentRef.current = { matchId, role: 'player' };
        void controller.joinMatch(matchId).then((result) => {
            if (!result.ok) pendingNavigationRef.current = null;
            announceSeatOutcome(result, 'Joined — entering the match.');
        });
    }

    function spectateMatch(matchId: MatchId): void {
        routeResolutionRef.current = false;
        pendingNavigationRef.current = 'spectate';
        legIntentRef.current = { matchId, role: 'spectator' };
        void controller.spectateMatch(matchId).then((result) => {
            if (!result.ok) pendingNavigationRef.current = null;
            announceSeatOutcome(result, 'Spectating — attaching read-only.');
        });
    }

    function leaveMatch(): void {
        void controller.leaveMatch().then((result) => {
            if (result.ok) {
                legIntentRef.current = null;
                // Keep the canonical semantic route in the address bar while
                // preserving the existing lobby connection and identity.
                // The released match entry is now eligible for normal
                // popstate re-resolution; do not let the hand-off guard
                // mistake a later Back traversal for its original push.
                completedNavigationPathRef.current = null;
                if (window.location.pathname !== '/lobby') {
                    window.history.pushState(window.history.state, '', '/lobby');
                }
                announcer?.announce('Returned to the lobby.', 'polite');
            }
        });
    }

    // -- View gate -----------------------------------------------------

    // Hidden host for the shared live-region announcer — must be
    // rendered (not just ref-attached) so liveHostRef.current is
    // non-null and the useEffect can construct the instance.
    const announcerHost = (
        <div ref={liveHostRef} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} />
    );

    if (noticeKind !== null) {
        const retry =
            currentRoute === undefined
                ? undefined
                : () => {
                      setNoticeKind(null);
                      routeAttemptedRef.current = false;
                      setRouteRetryEpoch((epoch) => epoch + 1);
                  };
        return (
            <>
                {announcerHost}
                <RouteNotice
                    kind={noticeKind}
                    title={noticeKind === 'unknown' ? 'Page not found' : 'Match unavailable'}
                    message={
                        noticeKind === 'unknown'
                            ? 'Page not found. Returning to lobby.'
                            : 'This match entry is no longer available.'
                    }
                    onRetry={retry}
                    onReturnToLobby={returnToLobby}
                />
            </>
        );
    }

    if (state.viewMode === 'match') {
        const intent = legIntentRef.current ?? { matchId: state.activeMatchId, role: 'player' as const };
        const matchId = intent.matchId ?? state.activeMatchId;
        // Auto-start detector: the target row's lobby status is the
        // single source of truth for "registered with the wire server"
        // (see MatchLegHost's JSDoc). A missing row reads as not
        // started — the plate + Leave escape hatch cover the edge.
        const entry =
            matchId !== null
                ? ((state.snapshot?.entries ?? []).find(
                      (candidate: PublicLobbyEntry) => candidate.matchId === matchId,
                  ) ?? null)
                : null;
        const matchStarted = entry?.status === 'in_progress';
        return (
            <>
                {announcerHost}
                <MatchLegHost
                    key={matchId ?? 'pending'}
                    wsUrl={wsUrl}
                    matchId={matchId}
                    role={intent.role}
                    displayName={state.handle ?? 'Player'}
                    handle={state.handle}
                    occupancy={entry !== null ? { seatsFilled: entry.seatsFilled, capacity: entry.capacity } : null}
                    matchStarted={matchStarted}
                    announcer={announcer ?? undefined}
                    leaveError={state.actions.leaveMatch.error}
                    leaving={state.actions.leaveMatch.phase === 'loading'}
                    onLeave={leaveMatch}
                    onRouteFailure={() => setNoticeKind('shortcut-failure')}
                />
            </>
        );
    }

    // Profile route: when the browser pathname is /profile and the view
    // mode is lobby, render the dedicated profile view instead of the
    // lobby landing. This check runs AFTER noticeKind and match-gate
    // guards, so profile notices and match legs are unaffected.
    if (state.viewMode === 'lobby' && pathname === '/profile') {
        return (
            <>
                {announcerHost}
                <ProfileView
                    identityStatus={state.identityStatus}
                    handle={state.handle}
                    connection={{ status: state.connection }}
                    actionStatus={state.actions.setHandle}
                    onSubmitHandle={submitHandle}
                    returnTo={readReturnTo(window.location.search)}
                />
            </>
        );
    }

    return (
        <>
            {announcerHost}
            <LobbyLanding
                state={state}
                announcer={announcer ?? undefined}
                focusHeading={viewSwitches > 0}
                onCreate={createMatch}
                onJoin={joinMatch}
                onSpectate={spectateMatch}
                onRetry={() => {
                    void controller.retry();
                }}
                onAcknowledgeSuperseded={() => {
                    controller.acknowledgeSuperseded();
                }}
            />
        </>
    );
}

// ----------------------------------------------------------------------------
// Match leg: the existing console, entered from the lobby
// ----------------------------------------------------------------------------

/** One attached PLAYER match leg: store + real wire client + bridge. */
interface MatchLeg {
    /** The console store feeding {@link App}. */
    readonly store: ConsoleStore;
    /** Connect + run the join handshake (async; UI shows connecting). */
    boot(): Promise<void>;
    /** Tear the wire connection down (idempotent). */
    dispose(): void;
}

/** Arguments for {@link createMatchLeg}. */
interface MatchLegArgs {
    /** WebSocket URL of the match server (same host as the lobby). */
    readonly wsUrl: string;
    readonly matchId: MatchId;
    /** Display name for the seat claim — the accepted handle (FR-019). */
    readonly displayName: string;
    /** Report a terminal handshake failure to route recovery. */
    readonly onFailure: () => void;
}

/**
 * Build one PLAYER match leg with the production wiring proven by the
 * integration wave's `live-runtime`: forwarding-slot circularity
 * (store ↔ bridge), real browser WebSocket client, transport-loss
 * translation into the reducer's reconnecting banner. (Spectator legs
 * never construct one — see the module scope note.)
 */
function createMatchLeg(args: MatchLegArgs): MatchLeg {
    // React StrictMode deliberately runs an effect's cleanup before replaying
    // it. A cancelled first boot can therefore reject after the replayed boot
    // has started; only the current boot generation may fail the route.
    let bootGeneration = 0;
    let forward: ((effect: ReducerEffect) => void) | null = null;
    const store = createConsoleStore(INITIAL_CONSOLE_STATE, (effect) => {
        forward?.(effect);
    });
    store.dispatch({ kind: 'connecting', matchId: args.matchId });

    const wsClient = createWsMatchClient({ verboseLogging: false });
    const client = createConsoleClient(
        {
            url: args.wsUrl,
            displayName: args.displayName,
            matchId: args.matchId,
        },
        { matchClientFactory: () => wsClient },
    );
    const bridge = createOrderBridge({ client, store });
    forward = (effect) => {
        bridge.handleEffect(effect);
    };

    let lastConnection = wsClient.state().connection;
    wsClient.onConnectionChanged((current) => {
        if (current === 'disconnected' && (lastConnection === 'joined' || lastConnection === 'rejoined')) {
            store.dispatch({ kind: 'socketClosed', code: 1006, reason: 'transport lost' });
        }
        lastConnection = current;
    });

    return {
        store,
        async boot(): Promise<void> {
            const generation = ++bootGeneration;
            try {
                await client.connect();
                await client.joinMatch();
            } catch {
                if (generation === bootGeneration) args.onFailure();
            }
        },
        dispose(): void {
            bootGeneration += 1;
            wsClient.disconnect();
        },
    };
}

/** Props for {@link MatchLegHost}. */
interface MatchLegHostProps {
    /** WebSocket URL of the match server. */
    readonly wsUrl: string;
    /**
     * Target match; `null` only in the create flow's brief window
     * before the next snapshot pins `activeMatchId`.
     */
    readonly matchId: MatchId | null;
    readonly role: 'player' | 'spectator';
    /** Display name for the seat/spectator join — the accepted handle (FR-019). */
    readonly displayName: string;
    /**
     * The visitor's accepted handle verbatim (`null` while unnamed) —
     * the waiting plate's "seated as" label (FR-020 waiting half).
     * Kept separate from {@link displayName} so the plate never shows
     * a fabricated fallback name.
     */
    readonly handle: string | null;
    /**
     * Occupancy of the target match per the latest lobby snapshot
     * (`null` before the first snapshot pins the row).
     */
    readonly occupancy: { readonly seatsFilled: number; readonly capacity: number } | null;
    /**
     * Whether the lobby snapshot reports the target row `'in_progress'`
     * — i.e. the matchmaker has auto-started and REGISTERED the match
     * with the wire server, so a leg can attach.
     */
    readonly matchStarted: boolean;
    /** Shared runtime announcer (survives view swaps). */
    readonly announcer?: LiveRegionAnnouncer | undefined;
    /** The leave action's error slot (rendered beside the button). */
    readonly leaveError: LobbyActionError | null;
    /** Whether the leave action is in flight. */
    readonly leaving: boolean;
    /** Release the seat/association and return to the lobby. */
    readonly onLeave: () => void;
    /** Report match-leg failures without exposing transport details. */
    readonly onRouteFailure: () => void;
}

/**
 * Host one match context: slim lobby chrome (leave control) around
 * the EXISTING game UI.
 *
 * Handoff timing (wire reality, proven by the T-013 integration
 * suite): the matchmaker registers a match with the networking server
 * only at AUTO-START (`registerMatch` inside `autoStart`), so a
 * WAITING match has no wire channel — an early join fails with
 * `match_not_found`. A PLAYER leg therefore attaches only once
 * {@link MatchLegHostProps.matchStarted} flips true; until then the
 * visitor sits in the accessible waiting-room plate (US3 AC-1). The
 * `transition: 'match'` classification (join filled the final seat)
 * arrives together with that flip, so one predicate covers both. A
 * SPECTATOR leg attaches under the same predicate (spectate targets
 * in-progress rows, which are registered by definition); pre-flip it
 * sees the read-only spectator plate.
 *
 * Auto-start announcement (T-016): when `matchStarted` TRANSITIONS
 * false → true for a leg that was already mounted (the creator/joinee
 * waiting-room case), the shared live region announces the start once
 * — the plate swaps for the board in the same commit, so the
 * announcement is the audible thread of the transition (SC-008's
 * clean label hand-off). Legs mounting WITH the flag already set
 * (join-filled-final-seat, spectate of a running match) stay silent
 * here; their entry was announced by the command wrappers / the
 * spectator attach path instead.
 */
function MatchLegHost({
    wsUrl,
    matchId,
    role,
    displayName,
    handle,
    occupancy,
    matchStarted,
    announcer,
    leaveError,
    leaving,
    onLeave,
    onRouteFailure,
}: MatchLegHostProps): JSX.Element {
    const headingRef = useRef<HTMLHeadingElement | null>(null);

    // Every mount of this host IS a view entry (initial load always
    // lands in the lobby), so taking focus is correct here.
    useEffect(() => {
        headingRef.current?.focus();
    }, []);

    // Auto-start transition announcement — see the JSDoc above. The
    // ref distinguishes a LIVE flip from an entry that simply started
    // out attached (those never announce here).
    const wasStartedRef = useRef(matchStarted);
    useEffect(() => {
        if (matchStarted && !wasStartedRef.current && announcer !== undefined) {
            announcer.announce('Match started — entering the game.', 'polite');
        }
        wasStartedRef.current = matchStarted;
    }, [matchStarted, announcer]);

    // One PLAYER leg per mount, built only when the match is actually
    // registered (see the JSDoc); keyed by matchId upstream so
    // switching matches rebuilds cleanly. Construction does no I/O
    // (App's MapCanvas ref pattern); boot/dispose ride the effect.
    const legRef = useRef<MatchLeg | null>(null);
    if (legRef.current === null && role === 'player' && matchId !== null && matchStarted) {
        legRef.current = createMatchLeg({ wsUrl, matchId, displayName, onFailure: onRouteFailure });
    }
    const leg = legRef.current;
    useEffect(() => {
        if (leg !== null) {
            void leg.boot();
        }
        return () => {
            leg?.dispose();
        };
    }, [leg]);

    return (
        <div className="europa-lobby-match">
            <a id="skip-link" className="skip-link" href="#main">
                Skip to main content
            </a>
            <section className="europa-lobby-match__bar" aria-label="Lobby controls" data-europa-match-chrome="true">
                <h1 ref={headingRef} tabIndex={-1} className="europa-lobby-match__title europa-focus-ring">
                    {role === 'spectator' ? 'Spectating' : 'In match'}{' '}
                    {matchId === null ? '— resolving…' : `(${matchId.slice(0, 8)}…)`}
                </h1>
                <button
                    type="button"
                    className="europa-lobby__button europa-focus-ring"
                    disabled={leaving}
                    onClick={onLeave}
                    data-europa-leave="true"
                >
                    {leaving ? 'Leaving…' : 'Leave to lobby'}
                </button>
                {leaveError !== null ? (
                    <p className="europa-lobby__error" role="alert">
                        {leaveError.message}
                    </p>
                ) : null}
            </section>
            {leg !== null ? (
                // Player board: App owns the page's single
                // <main id="main"> landmark (skip-link target).
                <App store={leg.store} />
            ) : role === 'spectator' && matchId !== null && matchStarted ? (
                // Live read-only spectator surface — also App-rendered,
                // so it likewise owns its own <main>.
                <SpectatorMatchLeg
                    wsUrl={wsUrl}
                    matchId={matchId}
                    displayName={displayName}
                    announcer={announcer}
                    onFailure={onRouteFailure}
                />
            ) : (
                <main id="main" className="europa-lobby europa-lobby-match__placeholder">
                    {/* Plate windows (no wire channel yet): the waiting
            room for players, the pre-attach notice for spectators.
            Informational only — no board, no order surface; announces
            once politely through the shared channel. */}
                    {role === 'spectator' ? (
                        <SpectatorPlate matchId={matchId} announcer={announcer} />
                    ) : (
                        <PreStartPlate matchId={matchId} handle={handle} occupancy={occupancy} announcer={announcer} />
                    )}
                </main>
            )}
        </div>
    );
}

/** Props for {@link SpectatorPlate}. */
interface SpectatorPlateProps {
    readonly matchId: MatchId | null;
    readonly announcer?: LiveRegionAnnouncer | undefined;
}

/**
 * The pre-attach spectator plate — shown only in the brief window
 * before the target row reads `'in_progress'` (a race the lobby's
 * Spectate gating makes rare: rows offer Spectate only once running).
 * Announces once per appearance (WaitingOverlay's guarded-effect
 * pattern). The full read-only board lives in {@link SpectatorMatchLeg}.
 */
function SpectatorPlate({ matchId, announcer }: SpectatorPlateProps): JSX.Element {
    const lastAnnouncedRef = useRef(false);
    useEffect(() => {
        if (announcer !== undefined && !lastAnnouncedRef.current) {
            announcer.announce('Spectator mode is read-only.', 'polite');
            lastAnnouncedRef.current = true;
        }
    }, [announcer]);
    return (
        <div className="europa-waiting__plate" data-europa-spectator-plate="true">
            <p className="europa-waiting__text">
                {matchId === null
                    ? 'Attaching to the match…'
                    : `Read-only spectator view of match ${matchId.slice(0, 8)}…`}
            </p>
            <p className="europa-lobby__status-line">Attaching to the live view…</p>
        </div>
    );
}

// ----------------------------------------------------------------------------
// Spectator leg: real wire attach, static read-only render
// ----------------------------------------------------------------------------

/** One attached SPECTATOR leg: real wire client, no order path. */
interface SpectatorLeg {
    /** Connect + run the spectator join handshake (async). */
    boot(): Promise<void>;
    /** Tear the wire connection down (idempotent). */
    dispose(): void;
}

/** Arguments for {@link createSpectatorLeg}. */
interface SpectatorLegArgs {
    /** WebSocket URL of the match server. */
    readonly wsUrl: string;
    readonly matchId: MatchId;
    /** Cosmetic join name — the accepted handle (FR-019). */
    readonly displayName: string;
    /** Snapshot sink (the component's React state setter). */
    readonly onSnapshot: (next: ConsoleState) => void;
    /** Report attach failure to route recovery. */
    readonly onFailure: () => void;
}

/**
 * Build one SPECTATOR wire leg (feature 010 T-016). Mirrors the
 * player leg's production wiring (`createWsMatchClient` → adapter →
 * subscriptions) with three deliberate differences:
 *
 *   1. the adapter joins with `role: 'spectator'` — feature 004's
 *      existing spectator semantics: no seat, server-computed
 *      full-visibility views (fog `{ spectator: true }`), and the
 *      server's own `spectator_readonly` gate behind everything;
 *   2. envelopes fold through {@link applySpectatorEnvelope} into a
 *      ConsoleState-shaped snapshot instead of the player store —
 *      there is NO store, bridge, or effect sink, so no code path
 *      from this leg can submit an order (SC-005 by construction);
 *   3. transport loss after attach maps to the snapshot's
 *      `reconnecting` status so the App's existing banner explains
 *      the gap (v1 spectators do not auto-rejoin).
 *
 * Construction does no I/O; boot/dispose ride the component effect.
 * Subscriptions live for the leg object's lifetime (page-lifetime
 * discipline, same as {@link createMatchLeg}) — dispose closes the
 * socket; the whole leg is garbage with its handlers when the host
 * unmounts.
 */
function createSpectatorLeg(args: SpectatorLegArgs): SpectatorLeg {
    // See the player leg: StrictMode's intentional effect teardown must not
    // turn a stale first attach rejection into a route-level failure.
    let bootGeneration = 0;
    // The fold is sequential and single-owner: one mutable cell, each
    // envelope producing the next immutable snapshot.
    let current = initialSpectatorState(args.matchId);
    const apply = (next: ConsoleState): void => {
        current = next;
        args.onSnapshot(next);
    };

    const wsClient = createWsMatchClient({ verboseLogging: false });
    const client = createConsoleClient(
        {
            url: args.wsUrl,
            displayName: args.displayName,
            matchId: args.matchId,
            role: 'spectator',
        },
        { matchClientFactory: () => wsClient },
    );

    client.onEnvelope((envelope) => {
        apply(applySpectatorEnvelope(current, envelope, performance.now()));
    });

    let lastConnection = wsClient.state().connection;
    wsClient.onConnectionChanged((connection) => {
        if (connection === 'disconnected' && (lastConnection === 'joined' || lastConnection === 'rejoined')) {
            apply(applySpectatorTransportLoss(current, 1006));
        }
        lastConnection = connection;
    });

    return {
        async boot(): Promise<void> {
            const generation = ++bootGeneration;
            try {
                await client.connect();
                await client.joinMatch();
            } catch {
                if (generation !== bootGeneration) return;
                // Attach failures (match ended between list and attach,
                // spectator gate closed) surface as a fixed, id-free
                // notice on the App's feedback surface; Leave remains
                // the way back. Never throw into React.
                apply(
                    withNotice(
                        current,
                        'Could not attach to the match — it may have ended. Use Leave to return to the lobby.',
                        performance.now(),
                    ),
                );
                args.onFailure();
            }
        },
        dispose(): void {
            bootGeneration += 1;
            client.close();
        },
    };
}

/** Props for {@link SpectatorMatchLeg}. */
interface SpectatorMatchLegProps {
    /** WebSocket URL of the match server. */
    readonly wsUrl: string;
    readonly matchId: MatchId;
    /** Cosmetic join name — the accepted handle (FR-019). */
    readonly displayName: string;
    /** Shared runtime announcer (survives view swaps). */
    readonly announcer?: LiveRegionAnnouncer | undefined;
    /** Report attach failure to the route shell. */
    readonly onFailure: () => void;
}

/**
 * The live read-only spectator surface (US4 AC-2 / SC-005): owns one
 * {@link SpectatorLeg}, folds its envelopes into React state, and
 * renders the EXISTING App statically (`state` prop, no store) — the
 * same board/grid/HUD components players see, with every interactive
 * layer structurally absent (no store ⇒ no controllers, no targeting,
 * no surrender/reserves wiring; palette buttons render disabled with
 * no handlers). Fog visibility is untouched: the view IS the server's
 * spectator payload.
 *
 * Announces the attach once through the shared runtime channel.
 */
function SpectatorMatchLeg({ wsUrl, matchId, displayName, announcer, onFailure }: SpectatorMatchLegProps): JSX.Element {
    const [snapshot, setSnapshot] = useState<ConsoleState>(() => initialSpectatorState(matchId));

    // One leg per mount (render-phase ref construction, no I/O — the
    // App's MapCanvas pattern); keyed by matchId upstream.
    const legRef = useRef<SpectatorLeg | null>(null);
    if (legRef.current === null) {
        legRef.current = createSpectatorLeg({ wsUrl, matchId, displayName, onSnapshot: setSnapshot, onFailure });
    }
    const leg = legRef.current;
    useEffect(() => {
        void leg.boot();
        return () => {
            leg.dispose();
        };
    }, [leg]);

    // Attach announcement (guarded once — WaitingOverlay's pattern):
    // fires when the fold first reaches 'spectating'.
    const announcedAttachRef = useRef(false);
    useEffect(() => {
        if (announcer !== undefined && snapshot.status === 'spectating' && !announcedAttachRef.current) {
            announcer.announce('Spectating — live view attached.', 'polite');
            announcedAttachRef.current = true;
        }
    }, [announcer, snapshot.status]);

    return <App state={snapshot} />;
}

/** Props for {@link PreStartPlate}. */
interface PreStartPlateProps {
    readonly matchId: MatchId | null;
    /**
     * The visitor's accepted handle verbatim (`null` while unnamed) —
     * rendered inside `<bdi>` (hostile-but-valid, orchestration
     * invariant #2).
     */
    readonly handle: string | null;
    /**
     * Occupancy of the target match per the latest lobby snapshot
     * (`null` before the first snapshot pins the row).
     */
    readonly occupancy: { readonly seatsFilled: number; readonly capacity: number } | null;
    readonly announcer?: LiveRegionAnnouncer | undefined;
}

/**
 * The waiting-room plate between a seat grant and auto-start (FR-020's
 * waiting half + US4 AC-5): shows the visitor's OWN accepted handle
 * (bidi-isolated — it is hostile-but-valid user content) and the
 * match's live occupancy, reusing the shipped waiting-room message so
 * waiting feels identical wherever it happens. All fragments are plain
 * text nodes/spans — the handle never enters an HTML-ish context.
 */
function PreStartPlate({ handle, occupancy, announcer }: PreStartPlateProps): JSX.Element {
    // N-aware waiting copy (FR-005): when the lobby snapshot has pinned
    // the row we already know the live occupancy, so render the same
    // "Waiting for N-k more players… (k/N)" copy the App uses. The legacy
    // single-opponent string remains only as a fallback for the brief
    // window before the first snapshot arrives (occupancy still null).
    const waitingMessage =
        occupancy !== null
            ? formatWaitingMessage(occupancy.seatsFilled, occupancy.capacity)
            : WAITING_FOR_OPPONENT_MESSAGE;
    const lastAnnouncedRef = useRef<string | null>(null);
    useEffect(() => {
        if (announcer !== undefined && waitingMessage !== lastAnnouncedRef.current) {
            announcer.announce(waitingMessage, 'polite');
            lastAnnouncedRef.current = waitingMessage;
        }
    }, [announcer, waitingMessage]);
    return (
        <div className="europa-waiting__plate" data-europa-prestart-plate="true">
            <p className="europa-waiting__text">{waitingMessage}</p>
            <p className="europa-lobby__status-line" data-europa-prestart-seat="true">
                {handle !== null ? (
                    <span>
                        Seated as <bdi>{handle}</bdi>
                    </span>
                ) : (
                    <span>Reserving your seat…</span>
                )}
                {occupancy !== null ? (
                    <span> · {formatOccupancy(occupancy.seatsFilled, occupancy.capacity)}</span>
                ) : null}
                <span> · starting when full</span>
            </p>
        </div>
    );
}
