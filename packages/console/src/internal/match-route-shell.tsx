import { useNavigate, useParams } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useState, useSyncExternalStore } from 'react';

import type { MatchId } from '../state/types';
import type { MatchVisibility } from '../ui/copy-link-button';
import { RouteNotice } from '../ui/route-notice';
import { useLobbyLayout } from './lobby-layout';
import { MatchLegHost } from './lobby-runtime';

export interface MatchRouteShellProps {
    readonly matchRole: 'player' | 'spectator';
    readonly displayNameFallback: string;
}

export function MatchRouteShell({ matchRole, displayNameFallback }: MatchRouteShellProps): JSX.Element | null {
    const { matchId: rawMatchId } = useParams({ strict: false });
    const matchId = rawMatchId as MatchId;
    const { controller, wsUrl, announcer } = useLobbyLayout();
    const state = useSyncExternalStore(controller.store.subscribe, controller.store.getState);
    const navigate = useNavigate();
    const [failed, setFailed] = useState(false);
    const [retryEpoch, setRetryEpoch] = useState(0);

    if (state.viewMode !== 'match') {
        return null;
    }

    const returnToLobby = (): void => {
        void controller.leaveMatch().then((result) => {
            if (result.ok) {
                void navigate({ to: '/lobby' });
                announcer?.announce('Returned to the lobby.', 'polite');
            }
        });
    };

    if (failed) {
        const leaveError = state.actions.leaveMatch.error;
        return (
            <RouteNotice
                kind="shortcut-failure"
                title="Match unavailable"
                message={
                    leaveError === null
                        ? 'This match could not be entered.'
                        : `This match could not be entered, and returning to the lobby failed: ${leaveError.message} Choose Return to lobby to try again.`
                }
                onRetry={() => {
                    setFailed(false);
                    setRetryEpoch((epoch) => epoch + 1);
                }}
                onReturnToLobby={returnToLobby}
            />
        );
    }

    const entry =
        matchId !== null ? (state.snapshot?.entries.find((candidate) => candidate.matchId === matchId) ?? null) : null;

    return (
        <MatchLegHost
            key={`${String(matchId)}:${retryEpoch}`}
            wsUrl={wsUrl}
            matchId={matchId}
            matchRole={matchRole}
            displayName={state.handle ?? displayNameFallback}
            handle={state.handle}
            occupancy={entry !== null ? { seatsFilled: entry.seatsFilled, capacity: entry.capacity } : null}
            matchStarted={entry?.status === 'in_progress'}
            seatSessionToken={state.seatSessionToken}
            announcer={announcer ?? undefined}
            leaveError={state.actions.leaveMatch.error}
            leaving={state.actions.leaveMatch.phase === 'loading'}
            onLeave={returnToLobby}
            onRouteFailure={() => setFailed(true)}
            onReturnToLobby={returnToLobby}
            matchVisibility={(state.matchVisibility as MatchVisibility) ?? null}
        />
    );
}
