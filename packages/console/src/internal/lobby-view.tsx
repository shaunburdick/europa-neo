/**
 * Lobby view — TanStack Router migration (issue #75, T-111).
 *
 * Self-contained lobby route component extracted from {@link LobbyRoot}
 * (in `lobby-runtime.tsx`). Renders the correct lobby sub-view based on
 * the current lobby state: deep-link interstitial or lobby landing page.
 *
 * Route notices (unavailable/unknown routes) are handled by {@link LobbyRoot}
 * before this component is reached — the `noticeKind` state is set by
 * routing effects (popstate, deep-link resolution) that live in the parent
 * for now (shared routing infrastructure, replaced in later tasks).
 *
 * Receives `controller`, `wsUrl`, and `announcer` via
 * {@link useLobbyLayout} from the parent layout route context. Command
 * wrappers (`createMatch`, `joinMatch`, `spectateMatch`) are defined here
 * since they are lobby-specific. The match view and profile view are
 * handled by separate route components in the TanStack Router tree
 * (T-112, T-113).
 *
 * @module
 */

import type { JSX } from 'react';
import type { LobbyCommandResult } from '../state/lobby-controller';
import type { LobbyState } from '../state/lobby-state';
import type { MatchId } from '../state/types';
import { DeepLinkInterstitial } from '../ui/deep-link-interstitial';
import { buildCreateSettings, type LobbyCreateFormValues } from '../ui/lobby-create-form';
import { LobbyLanding } from '../ui/lobby-landing';
import { useLobbyLayout } from './lobby-layout';

// ----------------------------------------------------------------------------
// Props
// ----------------------------------------------------------------------------

/**
 * Props for {@link LobbyView}.
 *
 * Command wrappers are defined inside the component using the controller
 * from context. Navigation callbacks and route state are passed from the
 * parent {@link LobbyRoot} because they affect both lobby and match routes
 * (shared routing infrastructure, replaced in later migration tasks).
 */
export interface LobbyViewProps {
    /** The current lobby state (single source of rendered truth). */
    readonly state: LobbyState;
    /**
     * Whether a view-mode switch has occurred — `true` on RETURNS to
     * the lobby, `false` on initial load. Drives heading focus behavior
     * (WCAG 2.4.3: focus heading on entry, not initial page load).
     */
    readonly focusHeading: boolean;
    /** Callback to set the leg intent for match-leg handoff. */
    readonly onSetLegIntent: (intent: { matchId: MatchId | null; role: 'player' | 'spectator' } | null) => void;
    /** Callback to mark route resolution as complete (skip re-resolution). */
    readonly onMarkRouteResolved: () => void;
    /** Callback to record that a lobby action has started a navigation (sets the pending navigation type). */
    readonly onPendingNavigationStarted: (type: 'create' | 'join' | 'spectate') => void;
    /** Callback to clear a pending navigation (on command failure). */
    readonly onClearPendingNavigation: () => void;
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

/**
 * The lobby route view: renders the correct lobby sub-view based on state.
 *
 * View gate (matches {@link LobbyRoot}'s existing architecture):
 *   1. Deep-link interstitial (non-participant opens match route)
 *   2. Lobby landing (default)
 *
 * Route notices and match views are handled by {@link LobbyRoot} before
 * this component is reached.
 *
 * @example
 * ```tsx
 * // In LobbyRoot or route tree
 * <LobbyView
 *     state={state}
 *     focusHeading={viewSwitches > 0}
 *     onSetLegIntent={(intent) => { legIntentRef.current = intent; }}
 *     onMarkRouteResolved={() => { routeResolutionRef.current = false; }}
 *     onPendingNavigationStarted={(type) => { pendingNavigationRef.current = type; }}
 *     onClearPendingNavigation={() => { pendingNavigationRef.current = null; }}
 * />
 * ```
 */
export function LobbyView({
    state,
    focusHeading,
    onSetLegIntent,
    onMarkRouteResolved,
    onPendingNavigationStarted,
    onClearPendingNavigation,
}: LobbyViewProps): JSX.Element {
    const { controller, announcer } = useLobbyLayout();

    // -- Command wrappers ------------------------------------------------
    // Lobby-specific commands that delegate to the controller. Each
    // wrapper sets routing state (leg intent, pending navigation) before
    // invoking the controller command. The actual URL navigation is
    // handled by route effects in LobbyRoot (shared infrastructure).

    /** Announce a seat-grant outcome on success only — failures render
     * as role="alert" nodes at their source and announce themselves. */
    function announceSeatOutcome(result: LobbyCommandResult, successMessage: string): void {
        if (result.ok && announcer !== null) {
            announcer.announce(successMessage, 'polite');
        }
    }

    function createMatch(values: LobbyCreateFormValues): void {
        onMarkRouteResolved();
        onPendingNavigationStarted('create');
        onSetLegIntent({ matchId: null, role: 'player' });
        void controller.createMatch(buildCreateSettings(values)).then((result) => {
            if (!result.ok) onClearPendingNavigation();
            announceSeatOutcome(result, 'Match created — entering the waiting room.');
        });
    }

    function joinMatch(matchId: MatchId): void {
        onMarkRouteResolved();
        onPendingNavigationStarted('join');
        onSetLegIntent({ matchId, role: 'player' });
        void controller.joinMatch(matchId).then((result) => {
            if (!result.ok) onClearPendingNavigation();
            announceSeatOutcome(result, 'Joined — entering the match.');
        });
    }

    function spectateMatch(matchId: MatchId): void {
        onMarkRouteResolved();
        onPendingNavigationStarted('spectate');
        onSetLegIntent({ matchId, role: 'spectator' });
        void controller.spectateMatch(matchId).then((result) => {
            if (!result.ok) onClearPendingNavigation();
            announceSeatOutcome(result, 'Spectating — attaching read-only.');
        });
    }

    // -- View gate -------------------------------------------------------

    // Deep-link interstitial (FR-029): non-participant opens /match/<id>.
    // The interstitial is a transient UI gate — the URL stays as
    // /match/<id> throughout; Back/Forward re-resolves the route and
    // dismisses it via popstate.
    if (state.deepLinkInterstitial !== null) {
        const interstitial = state.deepLinkInterstitial;
        return (
            <DeepLinkInterstitial
                matchId={interstitial.matchId}
                entry={interstitial.routeEntry}
                onPlay={() => joinMatch(interstitial.matchId)}
                onSpectate={() => spectateMatch(interstitial.matchId)}
                onReturnToLobby={() => {
                    // Dismiss the interstitial via the lobby state. The
                    // routing-level returnToLobby (URL push, match leave)
                    // remains in LobbyRoot.
                    controller.store.dispatch({ kind: 'lobbyDeepLinkInterstitialDismissed' });
                }}
                announcer={announcer ?? undefined}
            />
        );
    }

    // Default: lobby landing page.
    return (
        <LobbyLanding
            state={state}
            announcer={announcer ?? undefined}
            focusHeading={focusHeading}
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
    );
}
