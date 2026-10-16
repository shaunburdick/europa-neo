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

import type { JSX } from 'react';

import { MatchRouteShell } from './match-route-shell';

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
    const intent = classifyIntent(window.location.pathname);
    const matchRole = intent === 'spectate' ? 'spectator' : 'player';

    return <MatchRouteShell matchRole={matchRole} displayNameFallback="Player" />;
}
