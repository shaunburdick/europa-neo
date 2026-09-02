/**
 * Route-to-entry seam for the semantic console URLs.
 *
 * This module deliberately stops at the Feature 010 lobby boundary. It
 * resolves a validated route against the latest public projection and turns
 * an eligible result into the corresponding lobby command. It does not know
 * how to create a match socket; the later runtime hand-off owns that concern.
 * Keeping that boundary explicit prevents a deep link from opening a match
 * connection before the lobby has authoritatively resolved its target.
 */

import type { LobbySnapshot } from '@europa/matchmaking';
import type { LobbyCommandResult, LobbyController } from '../state/lobby-controller';
import type { MatchId } from '../state/types';
import type { MatchRouteIntent, Route } from './route';

/** Commands used by the adapter; the controller remains Feature 010's authority. */
export type RouteEntryCommands = Pick<LobbyController, 'joinMatch' | 'spectateMatch'>;

/** Why a match route cannot currently produce an entry action. */
export type RouteEntryUnavailableReason = 'not-found' | 'not-joinable' | 'full' | 'unresolved';

/** The result of adapting a browser route into an application entry point. */
export type RouteEntry =
    | { readonly kind: 'redirect'; readonly route: Route; readonly pathname: '/lobby' }
    | { readonly kind: 'lobby'; readonly route: Route; readonly pathname: '/lobby' }
    | { readonly kind: 'profile'; readonly route: Extract<Route, { readonly kind: 'profile' }> }
    | {
          readonly kind: 'resolve';
          readonly route: Extract<Route, { readonly kind: 'match' }>;
          readonly matchId: MatchId;
      }
    | {
          readonly kind: 'player';
          readonly route: Extract<Route, { readonly kind: 'match' }>;
          readonly matchId: MatchId;
          readonly intent: Extract<MatchRouteIntent, 'adaptive' | 'join'>;
      }
    | {
          readonly kind: 'spectator';
          readonly route: Extract<Route, { readonly kind: 'match' }>;
          readonly matchId: MatchId;
          readonly intent: Extract<MatchRouteIntent, 'adaptive' | 'spectate'>;
      }
    | {
          readonly kind: 'unavailable';
          readonly route: Route;
          readonly matchId: MatchId | null;
          readonly intent: MatchRouteIntent | null;
          readonly reason: RouteEntryUnavailableReason;
      };

/**
 * Resolve a route against a Feature 010 projection.
 *
 * A missing snapshot is represented as `resolve`, rather than as a player or
 * spectator action. Explicit intents are never changed: a running `join`
 * route and a waiting `spectate` route both become `unavailable`.
 *
 * @param route Parsed browser pathname.
 * @param snapshot Latest lobby projection, or `null` before the baseline.
 */
export function adaptRoute(route: Route, snapshot: LobbySnapshot | null): RouteEntry {
    if (route.kind === 'root' || route.kind === 'unknown') {
        return { kind: 'redirect', route, pathname: '/lobby' };
    }
    if (route.kind === 'lobby') {
        return { kind: 'lobby', route, pathname: route.pathname };
    }
    if (route.kind === 'profile') {
        return { kind: 'profile', route };
    }

    const matchId = asMatchId(route.matchId);
    if (snapshot === null) {
        return { kind: 'resolve', route, matchId };
    }

    const entry = snapshot.entries.find((candidate) => candidate.matchId === matchId);
    if (entry === undefined) {
        return unavailable(route, matchId, 'not-found');
    }

    const open = entry.status === 'waiting' && entry.seatsFilled < entry.capacity;
    if (route.intent === 'join') {
        return open
            ? { kind: 'player', route, matchId, intent: route.intent }
            : unavailable(route, matchId, entry.status === 'waiting' ? 'full' : 'not-joinable');
    }
    if (route.intent === 'spectate') {
        return entry.status === 'in_progress'
            ? { kind: 'spectator', route, matchId, intent: route.intent }
            : unavailable(route, matchId, 'not-joinable');
    }

    if (open) {
        return { kind: 'player', route, matchId, intent: route.intent };
    }
    if (entry.status === 'in_progress') {
        return { kind: 'spectator', route, matchId, intent: route.intent };
    }
    return unavailable(route, matchId, 'full');
}

/**
 * Execute an eligible route entry through the existing lobby commands.
 * Non-entry results perform no I/O and return `null`; in particular, route
 * resolution never constructs or connects a match client.
 *
 * @param entry Result from {@link adaptRoute}.
 * @param commands Feature 010 lobby command surface.
 */
export function executeRouteEntry(entry: RouteEntry, commands: RouteEntryCommands): Promise<LobbyCommandResult> | null {
    switch (entry.kind) {
        case 'player':
            return commands.joinMatch(entry.matchId);
        case 'spectator':
            return commands.spectateMatch(entry.matchId);
        case 'redirect':
        case 'lobby':
        case 'profile':
        case 'resolve':
        case 'unavailable':
            return null;
    }
}

function unavailable(
    route: Extract<Route, { readonly kind: 'match' }>,
    matchId: MatchId,
    reason: Exclude<RouteEntryUnavailableReason, 'unresolved'>,
): Extract<RouteEntry, { readonly kind: 'unavailable' }> {
    return { kind: 'unavailable', route, matchId, intent: route.intent, reason };
}

/** The parser validates this value; this is the single boundary to MatchId's brand. */
function asMatchId(value: string): MatchId {
    return value as MatchId;
}
