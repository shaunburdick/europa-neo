/**
 * Explicit player-join route component — TanStack Router migration (issue #75).
 *
 * Handles `/match/$matchId/join`. Renders {@link MatchLegHost} once the
 * lobby state transitions to `viewMode === 'match'`.
 *
 * Unlike the pre-migration adapter, this component does NOT auto-dispatch
 * a join command on mount. The join is always initiated from one of:
 *   - LobbyView command wrappers (lobby-initiated join)
 *   - MatchLayout's DeepLinkInterstitial callbacks (deep-link Play)
 *   - LobbyRoot's deep-link resolution effect (deep-link auto-join)
 *
 * This avoids a race where the auto-join completes before the parent
 * MatchLayout can show the deep-link interstitial (FR-029): child effects
 * fire before parent effects in React, so the join would succeed before
 * the interstitial is dispatched.
 *
 * The match ID is already validated by the parent `/match/$matchId` route's
 * `beforeLoad` handler; this component focuses solely on the join intent.
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

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Explicit player-join route — dispatches a join command and renders the
 * match leg host once the lobby transitions to match mode.
 */
export function MatchJoinRoute(): JSX.Element | null {
    const { matchId: rawMatchId } = useParams({ strict: false });
    const matchId = rawMatchId as MatchId;
    const { controller, wsUrl, announcer } = useLobbyLayout();
    const state = useSyncExternalStore(controller.store.subscribe, controller.store.getState);
    const navigate = useNavigate();

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
                matchRole="player"
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
                onRouteFailure={() => {
                    void navigate({ to: '/lobby' });
                }}
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

    // -- Fallback: command dispatched, waiting for lobby state transition ----
    return null;
}
