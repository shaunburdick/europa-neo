/** The action requested by a semantic match URL. */
export type MatchRouteIntent = 'adaptive' | 'join' | 'spectate';

/** Reasons a browser-visible pathname cannot be used as a route. */
export type RouteRejection =
    | 'malformed-encoding'
    | 'empty-match-id'
    | 'decoded-slash'
    | 'unsafe-character'
    | 'wrong-segment-count'
    | 'unsupported-path';

/** The closed set of routes understood by the production console. */
export type Route =
    | { readonly kind: 'welcome'; readonly pathname: '/' }
    | { readonly kind: 'lobby'; readonly pathname: '/lobby' }
    | { readonly kind: 'profile'; readonly pathname: '/profile' }
    | {
          readonly kind: 'match';
          readonly pathname: string;
          readonly matchId: string;
          readonly intent: MatchRouteIntent;
      }
    | { readonly kind: 'unknown'; readonly pathname: string; readonly reason: RouteRejection };

const MATCH_PREFIX = 'match';
const JOIN_SUFFIX = 'join';
const SPECTATE_SUFFIX = 'spectate';

/**
 * Classifies a pathname without consulting query parameters or browser state.
 *
 * The original pathname is retained on every result so callers can keep the
 * browser-visible URL authoritative. A match ID is decoded exactly once and
 * only the decoded value is returned for authoritative lookup.
 */
export function parseRoute(pathname: string): Route {
    if (pathname === '/') {
        return { kind: 'welcome', pathname };
    }

    if (pathname === '/lobby') {
        return { kind: 'lobby', pathname };
    }

    if (pathname === '/profile') {
        return { kind: 'profile', pathname };
    }

    const segments = pathname.split('/').slice(1);
    if (segments[0] !== MATCH_PREFIX) {
        return unknown(pathname, 'unsupported-path');
    }

    if (segments[1] === undefined || segments[1] === '') {
        return unknown(pathname, 'empty-match-id');
    }

    const intent = determineIntent(segments);
    if (intent === undefined) {
        return unknown(pathname, segments.length === 3 ? 'unsupported-path' : 'wrong-segment-count');
    }

    const decodedMatchId = decodeMatchSegment(segments[1]);
    if (!decodedMatchId.ok) {
        return unknown(pathname, decodedMatchId.reason);
    }

    return {
        kind: 'match',
        pathname,
        matchId: decodedMatchId.value,
        intent,
    };
}

/** Builds the canonical public lobby URL for an origin. */
export function buildLobbyUrl(origin: string): string {
    return `${normalizeOrigin(origin)}/lobby`;
}

/** Builds the canonical profile URL for an origin. */
export function buildProfileUrl(origin: string): string {
    return `${normalizeOrigin(origin)}/profile`;
}

/** Builds an adaptive semantic match URL. */
export function buildMatchUrl(origin: string, matchId: string): string {
    return buildMatchActionUrl(origin, matchId);
}

/** Builds an explicit player-entry URL for a match. */
export function buildJoinUrl(origin: string, matchId: string): string {
    return buildMatchActionUrl(origin, matchId, JOIN_SUFFIX);
}

/** Builds an explicit read-only spectator URL for a match. */
export function buildSpectateUrl(origin: string, matchId: string): string {
    return buildMatchActionUrl(origin, matchId, SPECTATE_SUFFIX);
}

function buildMatchActionUrl(origin: string, matchId: string, suffix?: 'join' | 'spectate'): string {
    const encodedMatchId = encodeMatchId(matchId);
    const path = `/match/${encodedMatchId}${suffix === undefined ? '' : `/${suffix}`}`;
    return `${normalizeOrigin(origin)}${path}`;
}

function encodeMatchId(matchId: string): string {
    if (matchId.length === 0) {
        throw new TypeError('matchId must not be empty');
    }

    const validation = validateDecodedMatchId(matchId);
    if (validation !== undefined) {
        throw new TypeError(`matchId contains ${validation}`);
    }

    return encodeURIComponent(matchId);
}

function normalizeOrigin(origin: string): string {
    let parsedOrigin: URL;
    try {
        parsedOrigin = new URL(origin);
    } catch {
        throw new TypeError('origin must be an absolute URL');
    }

    if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
        throw new TypeError('origin must use HTTP or HTTPS');
    }

    return parsedOrigin.origin;
}

function determineIntent(segments: string[]): MatchRouteIntent | undefined {
    if (segments.length === 2) {
        return 'adaptive';
    }

    if (segments.length === 3 && segments[2] === JOIN_SUFFIX) {
        return 'join';
    }

    if (segments.length === 3 && segments[2] === SPECTATE_SUFFIX) {
        return 'spectate';
    }

    return undefined;
}

function decodeMatchSegment(
    segment: string,
): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly reason: RouteRejection } {
    let decoded: string;
    try {
        decoded = decodeURIComponent(segment);
    } catch {
        return { ok: false, reason: 'malformed-encoding' };
    }

    const unsafeReason = validateDecodedMatchId(decoded);
    if (unsafeReason !== undefined) {
        return { ok: false, reason: unsafeReason };
    }

    return { ok: true, value: decoded };
}

function validateDecodedMatchId(matchId: string): RouteRejection | undefined {
    if (matchId.includes('/') || matchId.includes('\\')) {
        return 'decoded-slash';
    }

    if (matchId === '.' || matchId === '..' || matchId.includes('..')) {
        return 'unsafe-character';
    }

    for (const character of matchId) {
        const codePoint = character.codePointAt(0);
        if (codePoint !== undefined && (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f))) {
            return 'unsafe-character';
        }
    }

    return undefined;
}

function unknown(pathname: string, reason: RouteRejection): Route {
    return { kind: 'unknown', pathname, reason };
}
