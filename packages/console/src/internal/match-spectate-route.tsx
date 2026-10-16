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

import type { JSX } from 'react';

import { MatchRouteShell } from './match-route-shell';

/**
 * Explicit spectator route — dispatches a spectate command and renders the
 * match leg host in read-only mode once the lobby transitions to match mode.
 */
export function MatchSpectateRoute(): JSX.Element | null {
    return <MatchRouteShell matchRole="spectator" displayNameFallback="Spectator" />;
}
