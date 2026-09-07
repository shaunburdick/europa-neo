/**
 * Explicit spectator route component — TanStack Router migration (issue #75).
 *
 * Handles `/match/$matchId/spectate`. Renders {@link MatchLegHost} with
 * `role: 'spectator'` once the lobby state transitions to
 * `viewMode === 'match'`.
 *
 * The spectate command is always initiated from one of:
 *   - LobbyView command wrappers (lobby-initiated spectate)
 *   - MatchLayout's DeepLinkInterstitial callbacks (deep-link Spectate)
 *   - LobbyRoot's deep-link resolution effect (deep-link auto-spectate)
 *
 * This avoids a race where the auto-spectate completes before the parent
 * MatchLayout can show the deep-link interstitial (FR-029): child effects
 * fire before parent effects in React, so the spectate would succeed before
 * the interstitial is dispatched.
 *
 * The match ID is already validated by the parent `/match/$matchId` route's
 * `beforeLoad` handler; this component focuses solely on the spectate intent.
 *
 * @module
 */

import { useParams } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useSyncExternalStore } from 'react';
import type { MatchId } from '../state/types';
import type { MatchVisibility } from '../ui/copy-link-button';
import { useLobbyLayout } from './lobby-layout';
import { MatchLegHost } from './lobby-runtime';

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Explicit spectator route — dispatches a spectate command and renders the
 * match leg host in read-only mode once the lobby transitions to match mode.
 */
export function MatchSpectateRoute(): JSX.Element | null {
    const { matchId: rawMatchId } = useParams({ strict: false });
    const matchId = rawMatchId as MatchId;
    const { controller, wsUrl, announcer } = useLobbyLayout();
    const state = useSyncExternalStore(controller.store.subscribe, controller.store.getState);

    // -- Render match leg (viewMode === 'match') ----------------------------
    if (state.viewMode === 'match') {
        const entry =
            matchId !== null
                ? (state.snapshot?.entries.find((candidate) => candidate.matchId === matchId) ?? null)
                : null;
        const matchStarted = entry?.status === 'in_progress';
        const occupancy = entry !== null ? { seatsFilled: entry.seatsFilled, capacity: entry.capacity } : null;

        return (
            <MatchLegHost
                key={matchId}
                wsUrl={wsUrl}
                matchId={matchId}
                matchRole="spectator"
                displayName={state.handle ?? 'Spectator'}
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
                            window.history.pushState(window.history.state, '', '/lobby');
                            announcer?.announce('Returned to the lobby.', 'polite');
                        }
                    });
                }}
                onRouteFailure={() => {
                    window.history.pushState(window.history.state, '', '/lobby');
                }}
                onReturnToLobby={() => {
                    void controller.leaveMatch().then((result) => {
                        if (result.ok) {
                            window.history.pushState(window.history.state, '', '/lobby');
                            announcer?.announce('Returned to the lobby.', 'polite');
                        }
                    });
                }}
                matchVisibility={(state.matchVisibility as MatchVisibility) ?? null}
            />
        );
    }

    // -- Fallback: command dispatched, waiting for lobby state transition ----
    return null;
}
