/**
 * Match layout route component — TanStack Router migration (issue #75).
 *
 * Pathless layout under `/match/$matchId` that handles:
 *   - Deferred route resolution against the lobby snapshot using `adaptRoute`;
 *   - Deep-link interstitial dispatch (non-participant opens match route);
 *   - Unnamed-identity redirect to `/profile?returnTo=<encoded-match-path>`;
 *   - Resume-match logic for active participants.
 *
 * This component is the `component` of the `/match/$matchId` route in the
 * TanStack Router route tree. It renders `<Outlet />` for child routes
 * (join, spectate, index) when resolution is complete.
 *
 * Design constraints:
 *   - The component reads lobby state via {@link useLobbyLayout} context;
 *   - Route resolution is deferred until identity (`named`) + connection
 *     (`ready`) + snapshot are available — same gates as `LobbyRoot`;
 *   - `adaptRoute` is called with a constructed `Route` object derived
 *     from the current pathname and the validated `matchId` param;
 *   - Deep-link interstitial is dispatched to the lobby store and rendered
 *     directly (the lobby layout does not render it);
 *   - Unnamed-identity redirect uses TanStack Router's `useNavigate`.
 *
 * @module
 */

import { Outlet, useNavigate, useParams } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { MatchRouteIntent, Route } from '../routing/route';
import { adaptRoute } from '../routing/route-adapter';
import type { MatchId } from '../state/types';
import { DeepLinkInterstitial } from '../ui/deep-link-interstitial';
import { RouteNotice } from '../ui/route-notice';
import { useLobbyLayout } from './lobby-layout';

// ─── Intent determination ────────────────────────────────────────────────────

/**
 * Classify the match-route intent from the URL path segments.
 *
 * The pathname is already validated by the route tree's `beforeLoad`
 * (matchId decoded and validated), so this function only needs to
 * inspect the trailing segment to classify the intent.
 *
 * @param pathname The current browser pathname (e.g. `/match/abc123/join`).
 * @returns The intent: `'adaptive'` (bare match), `'join'`, or `'spectate'`.
 */
function classifyIntent(pathname: string): MatchRouteIntent {
    const segments = pathname.split('/').slice(1); // Skip leading ''
    // segments[0] === 'match', segments[1] === matchId
    if (segments[2] === 'join') return 'join';
    if (segments[2] === 'spectate') return 'spectate';
    return 'adaptive';
}

/**
 * Construct a `Route` object suitable for `adaptRoute` from the current
 * pathname and validated match ID.
 *
 * @param pathname The current browser pathname (e.g. `/match/abc123/join`).
 * @param matchId The validated match ID from the route params.
 * @returns A `Route` object with `kind: 'match'`.
 */
function buildMatchRoute(pathname: string, matchId: string): Extract<Route, { kind: 'match' }> {
    return { kind: 'match', pathname, matchId, intent: classifyIntent(pathname) };
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Pathless layout route component for `/match/$matchId`.
 *
 * Handles deferred route resolution against the authoritative lobby
 * snapshot, deep-link interstitial dispatch, unnamed-identity redirect,
 * and resume-match logic for active participants. Renders `<Outlet />`
 * for child routes (join, spectate, index) when resolution is complete.
 *
 * The component follows the same deferred-resolution gates as
 * `LobbyRoot` (feature 015 live-smoke fix):
 *   - Connection must be `'ready'`
 *   - Identity must be `'named'`
 *   - Snapshot must be non-null
 *
 * While any gate holds, the effect defers without consuming the attempt
 * and re-runs on state changes.
 */
export function MatchLayout(): JSX.Element {
    const { matchId: rawMatchId } = useParams({ from: '/match/$matchId' });
    const { controller, announcer } = useLobbyLayout();
    const state = useSyncExternalStore(controller.store.subscribe, controller.store.getState);
    const navigate = useNavigate();

    // The route tree's beforeLoad already validated the matchId, so this
    // cast is safe — it passes through the same branded boundary as
    // `route-adapter.ts`'s `asMatchId`.
    const matchId = rawMatchId as MatchId;

    // Deferred-resolution bookkeeping (mirrors LobbyRoot's refs).
    const routeAttemptedRef = useRef(false);
    const completedNavigationPathRef = useRef<string | null>(null);
    const [noticeKind, setNoticeKind] = useState<'unavailable' | null>(null);
    const [routeRetryEpoch, setRouteRetryEpoch] = useState(0);

    // ── Unnamed-identity redirect ──────────────────────────────────────────
    // When identity resolves as unnamed on a match route, redirect to
    // /profile with returnTo carrying the original match path (feature 015
    // US3). Fires AFTER identity resolution to avoid bootstrap flash.
    //
    // Skip when viewMode is already 'match': a user who already joined
    // or spectated should stay in the match view and be able to leave
    // (server restart recovery — the identity may be lost but the match
    // leg is still mounted).
    //
    // returnTo captures PATHNAME ONLY (feature 015 live-smoke fix): match
    // routes never carry a query in production, and keeping the search out
    // prevents the double-decode rejection in readReturnTo.
    useEffect(() => {
        if (state.identityStatus !== 'unnamed') return;
        if (state.viewMode === 'match') return;
        const pathname = window.location.pathname;
        if (!pathname.startsWith('/match/')) return;
        const returnTo = encodeURIComponent(pathname);
        void navigate({ to: '/profile', search: { returnTo }, replace: true });
    }, [state.identityStatus, state.viewMode, navigate]);

    // ── Deferred route resolution ──────────────────────────────────────────
    // Re-runs on lobby state changes (snapshot, connection, identity).
    // The gates mirror LobbyRoot's useEffect (lobby-runtime.tsx lines 385–445).
    //
    // While any gate holds, this effect defers WITHOUT consuming the attempt
    // (routeAttemptedRef stays false) and re-runs on the identity/connection
    // deps: naming on the redirected /profile resolves the deferred route
    // through the returnTo round-trip (FR-010), and the 'ready' flip
    // releases the connecting-window race.
    useEffect(() => {
        // If we're already in the match, no resolution needed — the
        // match leg owns rendering from here. Mark the attempt consumed
        // so the effect does not re-classify and re-dispatch the
        // interstitial when viewMode later transitions back to 'lobby'
        // (e.g. after the user leaves the match).
        if (state.viewMode === 'match') {
            routeAttemptedRef.current = true;
            return;
        }

        // Gates: defer without consuming the attempt while any holds.
        if (
            routeAttemptedRef.current ||
            state.snapshot === null ||
            completedNavigationPathRef.current === window.location.pathname ||
            state.connection !== 'ready' ||
            state.identityStatus !== 'named'
        ) {
            return;
        }

        routeAttemptedRef.current = true;

        const route = buildMatchRoute(window.location.pathname, matchId);
        const entry = adaptRoute(route, state.snapshot);

        // Resume-match: active participant reloading the same match.
        // The lobby snapshot is authoritative — an active association
        // means this route is a resume request, not a new join against
        // the now-running/full projection. Preserve explicit spectate
        // semantics; only adaptive/player routes may resume the existing
        // player association.
        if (state.activeMatchId === matchId && (route.intent === 'adaptive' || route.intent === 'join')) {
            controller.resumeMatch(state.activeMatchId);
            return;
        }

        // Unavailable: show the notice. A successful lobby action owns the
        // transition even if its snapshot races this effect and now
        // describes the match as full or running — never let that stale
        // route classification replace the already-mounted match runtime.
        if (entry.kind === 'unavailable') {
            setNoticeKind('unavailable');
            return;
        }

        // Deep-link interstitial: non-participant opens match route.
        // Show the play-or-spectate choice instead of immediately
        // joining/spectating (FR-029, D3). Participant detection (D4):
        // the activeMatchId check above already bypasses the interstitial
        // for participants.
        if (entry.kind === 'player' || entry.kind === 'spectator') {
            controller.store.dispatch({
                kind: 'lobbyDeepLinkInterstitialShown',
                routeEntry: entry,
                matchId: entry.matchId,
            });
        }
    }, [
        controller,
        matchId,
        routeRetryEpoch,
        state.activeMatchId,
        state.connection,
        state.identityStatus,
        state.snapshot,
        state.viewMode,
    ]);

    // ── Return-to-lobby helper ─────────────────────────────────────────────

    function returnToLobby(): void {
        setNoticeKind(null);
        // Clear the deep-link interstitial if it is showing (FR-029).
        if (state.deepLinkInterstitial !== null) {
            controller.store.dispatch({ kind: 'lobbyDeepLinkInterstitialDismissed' });
        }
        completedNavigationPathRef.current = null;
        void navigate({ to: '/lobby', replace: true });
        if (state.viewMode === 'match') {
            void controller.leaveMatch();
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────

    // Unavailable notice: show RouteNotice with retry/return actions.
    if (noticeKind !== null) {
        const retry = (): void => {
            setNoticeKind(null);
            routeAttemptedRef.current = false;
            setRouteRetryEpoch((epoch) => epoch + 1);
        };
        return (
            <RouteNotice
                kind={noticeKind}
                title="Match unavailable"
                message="This match entry is no longer available."
                onRetry={retry}
                onReturnToLobby={returnToLobby}
            />
        );
    }

    // Match view: once the lobby has transitioned to match mode (after
    // join/spectate succeeds), the match leg owns rendering — the
    // interstitial is a pre-resolution gate that must not block the
    // match view.
    if (state.viewMode === 'match') {
        return <Outlet />;
    }

    // Deep-link interstitial: show play-or-spectate choice for
    // non-participants who arrived via a semantic match URL.
    if (state.deepLinkInterstitial !== null) {
        const interstitial = state.deepLinkInterstitial;
        return (
            <DeepLinkInterstitial
                matchId={interstitial.matchId}
                entry={interstitial.routeEntry}
                onPlay={() => {
                    void controller.joinMatch(interstitial.matchId);
                }}
                onSpectate={() => {
                    void controller.spectateMatch(interstitial.matchId);
                }}
                onReturnToLobby={returnToLobby}
                announcer={announcer ?? undefined}
            />
        );
    }

    // Pending state: waiting for the lobby snapshot or gates to open.
    // Don't render children until resolution is complete — a missing
    // snapshot means adaptRoute would return 'resolve', not an action.
    // (viewMode === 'match' is already handled above, so only snapshot
    // matters here.)
    if (state.snapshot === null) {
        return (
            <main id="main" className="europa-lobby europa-lobby-match__placeholder">
                <div className="europa-waiting__plate" data-europa-match-resolving="true">
                    <p className="europa-waiting__text">Resolving match…</p>
                </div>
            </main>
        );
    }

    // Resolution complete or already in match: render child routes.
    return <Outlet />;
}
