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
    /** Page port, including `''` when the scheme's default port is used. */
    readonly port?: string;
}

/** Typed failure for an unsafe or malformed URL supplied by the page URL. */
export class LobbyServerUrlError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'LobbyServerUrlError';
    }
}

/**
 * Normalize a caller-supplied server URL fragment into a WebSocket
 * URL: `ws://`/`wss://` pass through verbatim; `http(s)://` upgrade
 * scheme; bare `host[:port]` gains a `ws://` prefix.
 *
 * @param value The raw override value (e.g. a `?ws=` parameter).
 */
function normalizeWsUrl(value: string): string {
    const lowerValue = value.toLowerCase();
    if (lowerValue.startsWith('ws://') || lowerValue.startsWith('wss://')) {
        return value;
    }
    if (lowerValue.startsWith('http://')) {
        return `ws://${value.slice('http://'.length)}`;
    }
    if (lowerValue.startsWith('https://')) {
        return `wss://${value.slice('https://'.length)}`;
    }
    return `ws://${value}`;
}

/**
 * Validate a URL override without opening a connection.
 *
 * The host intentionally owns two HTTP services in the self-hosted launch:
 * the static SPA and the WebSocket server. Therefore a same-host override
 * may use a different port (including an ephemeral test port), but it may
 * never select a different hostname. The two equivalent IPv4 loopback
 * spellings, localhost and 127.0.0.1, are accepted together for local test
 * and self-host routes. This preserves the documented
 * `?ws=` operator/test setting while preventing bearer identity material
 * from being sent cross-host. Both ws/wss are accepted for same-host routes;
 * the browser remains responsible for mixed-content enforcement.
 */
export function validateLobbyServerUrl(value: string, locator: PageLocator): string {
    const normalized = normalizeWsUrl(value.trim());
    let candidate: URL;
    try {
        candidate = new URL(normalized);
    } catch {
        throw new LobbyServerUrlError('The WebSocket server URL is malformed. Remove the ws override and try again.');
    }
    if (candidate.protocol !== 'ws:' && candidate.protocol !== 'wss:') {
        throw new LobbyServerUrlError('The WebSocket server URL must use ws:// or wss://.');
    }
    const pageHostname = locator.hostname.length > 0 ? locator.hostname : 'localhost';
    const candidateHostname = candidate.hostname.toLowerCase();
    const normalizedPageHostname = pageHostname.toLowerCase();
    const isLoopbackAlias =
        (candidateHostname === 'localhost' || candidateHostname === '127.0.0.1') &&
        (normalizedPageHostname === 'localhost' || normalizedPageHostname === '127.0.0.1');
    if (candidateHostname !== normalizedPageHostname && !isLoopbackAlias) {
        throw new LobbyServerUrlError('The WebSocket server URL must use the same host as this page.');
    }
    if (candidate.username !== '' || candidate.password !== '') {
        throw new LobbyServerUrlError('The WebSocket server URL cannot contain credentials.');
    }
    // Keep the operator's path/query spelling intact; URL is used only for
    // parsing and policy checks, not as a redirect or credential transport.
    return normalized;
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
        return validateLobbyServerUrl(override, locator);
    }
    const scheme = locator.protocol === 'https:' ? 'wss' : 'ws';
    const host = locator.hostname.length > 0 ? locator.hostname : 'localhost';
    return `${scheme}://${host}:${String(LOBBY_DEFAULT_SERVER_PORT)}`;
}
