/**
 * Unauthenticated `GET /version` route for the local/LAN host launcher
 * (feature 009 FR-006). Serves the release identity of the running
 * stack so a player or operator can answer "what am I actually
 * playing against?" with one curl (SC-002) — no credentials required.
 *
 * The body pairs the application version (`APP_VERSION`, changes every
 * release) with the wire protocol version (`NETWORK_API_VERSION`,
 * changes only when the networking contract breaks) so drift between
 * the two is observable from outside the process.
 *
 * This module is deliberately dependency-light: node:http types, the
 * shared security headers, and the two version constants. It never
 * touches the filesystem or the match stack.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { NETWORK_API_VERSION } from '@europa/networking';
import { APP_VERSION } from '@europa/version';
import { STATIC_SECURITY_HEADERS } from './host-config';

/** The exact path this route serves (case-sensitive, no sub-paths). */
const VERSION_PATH = '/version';

/**
 * JSON body served by {@link handleVersionRoute}. Key order is part of
 * the contract (FR-006 shows `appVersion` first); `JSON.stringify`
 * preserves insertion order, so the literal below is byte-stable.
 */
const VERSION_BODY = JSON.stringify({
    appVersion: APP_VERSION,
    protocolVersion: NETWORK_API_VERSION,
});

/**
 * Handle the `/version` endpoint on the static server surface.
 *
 * Behavior:
 * - Any path other than `/version` (compared case-sensitively after
 *   any query string is stripped) is left completely untouched and the
 *   caller is told to keep processing (`false`) — the SPA fallback
 *   owns those.
 * - `GET /version` (query-string tolerant: `/version?x=1` matches)
 *   answers `200` with `content-type: application/json; charset=utf-8`,
 *   `cache-control: no-store`, the shared {@link STATIC_SECURITY_HEADERS},
 *   and the exact body
 *   `{"appVersion":"<APP_VERSION>","protocolVersion":"<NETWORK_API_VERSION>"}`.
 * - Any other method on `/version` (POST, PUT, DELETE, HEAD, …) is
 *   rejected with `405` plus an `Allow: GET` header and NO body —
 *   nothing cacheable or stateful leaks through a non-GET probe.
 *
 * The endpoint is intentionally unauthenticated (spec Clarifications):
 * both values are shipped to every browser in the bundle anyway; the
 * route merely makes them curl-friendly.
 *
 * @param req     Incoming request (only `method` is read).
 * @param res     Response to write when the path matches.
 * @param urlPath Request path already split from any query string by
 *                the caller; a stray query suffix here is tolerated.
 * @returns `true` when the request was handled (response written),
 *          `false` when the path belongs to some other handler.
 */
export function handleVersionRoute(req: IncomingMessage, res: ServerResponse, urlPath: string): boolean {
    // Query-string tolerance: callers normally strip the query before
    // calling, but accepting `/version?x=1` directly keeps this safe
    // to reuse from other surfaces (and makes the unit tests honest).
    const [pathWithoutQuery] = urlPath.split('?');
    if (pathWithoutQuery !== VERSION_PATH) {
        return false;
    }
    if (req.method !== 'GET') {
        res.writeHead(405, { ...STATIC_SECURITY_HEADERS, Allow: 'GET' }).end();
        return true;
    }
    res.writeHead(200, {
        ...STATIC_SECURITY_HEADERS,
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(VERSION_BODY).toString(),
        // Uncacheable by decree (security-review follow-up): a proxy that
        // served a stale identity would defeat SC-002's deploy check right
        // after an upgrade — exactly when the answer must be fresh.
        'cache-control': 'no-store',
    }).end(VERSION_BODY);
    return true;
}
