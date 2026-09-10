/**
 * Adaptive match route component — TanStack Router migration (issue #75).
 *
 * Index route under `/match/$matchId` that renders the match leg in
 * player or spectator mode. Route classification (deep-link interstitial,
 * unavailable notice, resume-match) is handled by the parent `MatchLayout`
 * component. This component only renders once the lobby has transitioned
 * to `viewMode === 'match'`.
 *
 * @module
 */

import { useNavigate, useParams } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useSyncExternalStore } from 'react';
import type { MatchId } from '../state/types';
import type { MatchVisibility } from '../ui/copy-link-button';
import { useLobbyLayout } from './lobby-layout';
import { MatchLegHost } from './lobby-runtime';

// ─── Intent determination ────────────────────────────────────────────────────

/**
 * Classify the match-route intent from the URL path segments.
 *
 * Mirrors the `classifyIntent` helper in `match-layout.tsx` to derive
 * the match role from the current pathname. The route tree's `beforeLoad`
 * already validated the matchId, so this only inspects the trailing segment.
 *
 * @param pathname The current browser pathname (e.g. `/match/abc123/spectate`).
 * @returns `'join'` | `'spectate'` | `'adaptive'`.
 */
function classifyIntent(pathname: string): 'join' | 'spectate' | 'adaptive' {
    const segments = pathname.split('/').slice(1); // Skip leading ''
    if (segments[2] === 'join') return 'join';
    if (segments[2] === 'spectate') return 'spectate';
    return 'adaptive';
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Adaptive match route — renders the match leg host once the lobby
 * transitions to match mode.
 *
 * Route classification and dispatch (resume, deep-link interstitial,
 * unavailable notice) is handled by the parent `MatchLayout`. This
 * component only renders when `viewMode === 'match'`.
 */
export function MatchAdaptiveRoute(): JSX.Element | null {
    const { matchId: rawMatchId } = useParams({ strict: false });
    const matchId = rawMatchId as MatchId;
    const { controller, wsUrl, announcer } = useLobbyLayout();
    const state = useSyncExternalStore(controller.store.subscribe, controller.store.getState);
    const navigate = useNavigate();

    // -- Match leg (viewMode === 'match') -----------------------------------
    if (state.viewMode === 'match') {
        const entry =
            matchId !== null
                ? (state.snapshot?.entries.find((candidate) => candidate.matchId === matchId) ?? null)
                : null;
        const matchStarted = entry?.status === 'in_progress';
        const occupancy = entry !== null ? { seatsFilled: entry.seatsFilled, capacity: entry.capacity } : null;

        // Derive the match role from the URL pathname using the same
        // classification logic as MatchLayout.
        const intent = classifyIntent(window.location.pathname);
        const matchRole = intent === 'spectate' ? 'spectator' : 'player';

        return (
            <MatchLegHost
                key={matchId}
                wsUrl={wsUrl}
                matchId={matchId}
                matchRole={matchRole}
                displayName={state.handle ?? 'Player'}
                handle={state.handle}
                occupancy={occupancy}
                matchStarted={matchStarted}
                seatSessionToken={state.seatSessionToken}
                announcer={announcer ?? undefined}
                leaveError={state.actions.leaveMatch.error}
                leaving={state.actions.leaveMatch.phase === 'loading'}
                onLeave={() => {
                    void controller.leaveMatch().then((result) => {
                        if (result.ok) {
                            void navigate({ to: '/lobby' });
                            announcer?.announce('Returned to the lobby.', 'polite');
                        }
                    });
                }}
                onRouteFailure={() => {}}
                onReturnToLobby={() => {
                    void controller.leaveMatch().then((result) => {
                        if (result.ok) {
                            void navigate({ to: '/lobby' });
                            announcer?.announce('Returned to the lobby.', 'polite');
                        }
                    });
                }}
                matchVisibility={(state.matchVisibility as MatchVisibility) ?? null}
            />
        );
    }

    // -- Fallback: still resolving (connection/identity gate) ---------------
    // The LobbyLayout connection gate prevents this render, but as a
    // safety net render nothing while the layout gate is active.
    return null;
}
