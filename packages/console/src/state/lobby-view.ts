/**
 * Lobby route/view-mode derivation — feature 010 (T-014).
 *
 * Answers exactly one question for the app shell: given the boot URL's
 * query string, does this page load start in the LOBBY view or drop
 * straight into a MATCH view?
 *
 * COMPATIBILITY CONTRACT (binding): the direct live-test routes used by
 * the integration-wave harness and Playwright drivers —
 * `?live&ws=<url>&match=<id>&name=[&token=]`, mounted by
 * `src/internal/live-runtime.tsx` — MUST keep working unchanged. A URL
 * carrying a match id goes straight to the match runtime and is NEVER
 * forced through the lobby; no lobby state, identity setup, or
 * connection may intercept it. This module pins that rule as a pure,
 * unit-tested predicate so the T-015 shell gate (and any future
 * default-entry wiring) cannot regress it.
 *
 * The predicate READS query parameters only — it never writes to the
 * URL, never stores parameter values in state, and never inspects
 * credential-bearing parameters (`token`) beyond their irrelevance to
 * the result. Pure: string in, classification out.
 */

import type { LobbyViewMode } from './lobby-state';

/**
 * Whether the given query string mounts the DIRECT live-match runtime
 * (`?live` present together with its required `ws` and `match`
 * parameters). A bare `?live` without the match coordinates is NOT a
 * live-match route — there is nothing to join.
 *
 * @param search The query string (e.g. `window.location.search`),
 *   with or without the leading `?`.
 */
export function hasDirectMatchRoute(search: string): boolean {
    const params = new URLSearchParams(search);
    return params.has('live') && params.get('ws') !== null && params.get('match') !== null;
}

/**
 * Resolve the initial {@link LobbyViewMode} for a page load:
 *
 *   - `'match'` — direct live-test route (see
 *     {@link hasDirectMatchRoute}); compatibility requires bypassing
 *     the lobby entirely.
 *   - `'lobby'` — every other entry point, including the default host
 *     landing (`/`), the demo harness (`?e2e`), and partial/malformed
 *     `?live` URLs (which fail loudly inside their own runtime, as
 *     today).
 *
 * @param search The query string (e.g. `window.location.search`).
 */
export function resolveInitialViewMode(search: string): LobbyViewMode {
    return hasDirectMatchRoute(search) ? 'match' : 'lobby';
}

// ----------------------------------------------------------------------------
// Lobby server URL resolution (T-015)
// ----------------------------------------------------------------------------

/**
 * Default TCP port of the host's match/lobby WebSocket server.
 * DOCUMENTED MIRROR of `packages/console/scripts/host.ts`
 * `DEFAULT_WS_PORT` (the host script is Node-side and cannot be
 * imported into the browser bundle). The SPA serves from its own
 * static origin, so the lobby client cannot discover the server port
 * at runtime — it defaults to this and operators override via the
 * `ws` query parameter (or share `?ws=` URLs when running
 * `pnpm host --port <other>`).
 */
export const LOBBY_DEFAULT_SERVER_PORT = 8080;

/** The page-location facts URL resolution needs (structural `Location` subset). */
export interface PageLocator {
    /** Page protocol, e.g. `'http:'` / `'https:'` (drives ws vs wss). */
    readonly protocol: string;
    /** Page hostname, e.g. `'localhost'` (empty for `file://`). */
    readonly hostname: string;
}

/**
 * Normalize a caller-supplied server URL fragment into a WebSocket
 * URL: `ws://`/`wss://` pass through verbatim; `http(s)://` upgrade
 * scheme; bare `host[:port]` gains a `ws://` prefix.
 *
 * @param value The raw override value (e.g. a `?ws=` parameter).
 */
function normalizeWsUrl(value: string): string {
    if (value.startsWith('ws://') || value.startsWith('wss://')) {
        return value;
    }
    if (value.startsWith('http://')) {
        return `ws://${value.slice('http://'.length)}`;
    }
    if (value.startsWith('https://')) {
        return `wss://${value.slice('https://'.length)}`;
    }
    return `ws://${value}`;
}

/**
 * Resolve the lobby/match server URL for this page load (T-015):
 *
 *   1. an explicit `ws` query parameter wins (operators on non-default
 *      ports; test harnesses) — scheme-normalized by
 *      {@link normalizeWsUrl};
 *   2. otherwise the documented default: same hostname as the page,
 *      {@link LOBBY_DEFAULT_SERVER_PORT}, scheme upgraded to `wss`
 *      when the page itself is HTTPS (mixed-content browsers block
 *      plain ws:// from https:// pages).
 *
 * PRIVACY: reads ONLY the `ws` parameter — identifiers never ride
 * URLs into this layer, and nothing here writes to the URL.
 *
 * @param search The query string (e.g. `window.location.search`).
 * @param locator The page-location facts (protocol + hostname).
 */
export function resolveLobbyServerUrl(search: string, locator: PageLocator): string {
    const override = new URLSearchParams(search).get('ws');
    if (override !== null && override.trim().length > 0) {
        return normalizeWsUrl(override.trim());
    }
    const scheme = locator.protocol === 'https:' ? 'wss' : 'ws';
    const host = locator.hostname.length > 0 ? locator.hostname : 'localhost';
    return `${scheme}://${host}:${String(LOBBY_DEFAULT_SERVER_PORT)}`;
}
