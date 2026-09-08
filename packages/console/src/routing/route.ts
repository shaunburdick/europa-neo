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

const JOIN_SUFFIX = 'join';
const SPECTATE_SUFFIX = 'spectate';

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

/**
 * Validates and decodes a raw URL segment representing a match ID.
 *
 * Combines URI decoding with safety validation in a single call. Returns a
 * discriminated union so callers can branch on success/failure without
 * exceptions. This is the canonical entry point for match-ID validation and
 * is exported for direct use by the TanStack Router route tree (FR-022).
 *
 * @param segment The raw, URL-encoded match-ID segment from the pathname.
 * @returns `{ ok: true, value }` with the decoded ID on success, or
 *   `{ ok: false, reason }` with a `RouteRejection` on failure.
 */
export function validateMatchId(
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
