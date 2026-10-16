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

import type { JSX } from 'react';

import { MatchRouteShell } from './match-route-shell';

/**
 * Explicit player-join route — dispatches a join command and renders the
 * match leg host once the lobby transitions to match mode.
 */
export function MatchJoinRoute(): JSX.Element | null {
    return <MatchRouteShell matchRole="player" displayNameFallback="Player" />;
}
