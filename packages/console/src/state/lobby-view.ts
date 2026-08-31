/**
 * Lobby server URL resolution — features 010 + 011 single-port (FR-006..FR-008).
 *
 * Single-port topology (011): the console UI and the WebSocket match/lobby server
 * share ONE http.Server on HOST_PORT (default 8080). The browser's same-origin
 * `location.host` (hostname + port as the browser sees it) is therefore the
 * canonical WebSocket fallback — no second port, no hardcoded non-same-origin
 * default as primary path. An explicit `?ws=` override remains validated
 * (same-host + loopback alias + no credentials) via {@link validateLobbyServerUrl}.
 * Explicit `?ws=` overrides remain supported for operator/test configuration,
 * but are validated before they can be used by a client.
 */

// ----------------------------------------------------------------------------
// Lobby server URL resolution (T-015)
// ----------------------------------------------------------------------------

/**
 * Default HOST_PORT (single-port canonical, 8080) — fallback only for
 * non-browser/test contexts where `location.host === ''` (e.g. `file://`
 * or unit tests without a PageLocator host). It is NOT a second listener.
 * Value aliases the host's `HOST_PORT` default; the shipped console's
 * primary path is same-origin `location.host` (FR-006/FR-008), not this
 * constant. DOCUMENTED MIRROR of `packages/console/scripts/host.ts`
 * `DEFAULT_WS_PORT` (aliased as `HOST_PORT` after the 011 single-port
 * collapse).
 */
export const LOBBY_DEFAULT_SERVER_PORT = 8080;

/** The page-location facts URL resolution needs (structural `Location` subset). */
export interface PageLocator {
    /** Page protocol, e.g. `'http:'` / `'https:'` (drives ws vs wss). */
    readonly protocol: string;
    /** Page host as the browser sees it — `location.host` (hostname + port). Preferred same-origin source (011). */
    readonly host?: string;
    /** Page hostname, e.g. `'localhost'` (empty for `file://`). Kept for backwards compat and validation; prefer `host`. */
    readonly hostname?: string;
    /** Page port, including `''` when the scheme's default port is used. Kept for backwards compat; prefer `host`. */
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
    // Derive page hostname from `hostname` (preferred for same-host check) or fallback to `host`'s
    // hostname part (e.g. when only `location.host` is supplied). Keeps validateLobbyServerUrl
    // semantics exactly (same-host + loopback alias + no credentials) per FR-007.
    const hostnameValue = (locator as { hostname?: string }).hostname;
    const hostValue = (locator as { host?: string }).host;
    const rawHostname =
        typeof hostnameValue === 'string' && hostnameValue.length > 0
            ? hostnameValue
            : typeof hostValue === 'string' && hostValue.length > 0
              ? (hostValue.split(':')[0] ?? '')
              : '';
    const pageHostname = rawHostname.length > 0 ? rawHostname : 'localhost';
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
 * Resolve the lobby/match server URL for this page load (011 single-port FR-006/FR-007):
 *
 *   1. an explicit `ws` query parameter wins (operators on non-default
 *      ports; test harnesses) — scheme-normalized by
 *      {@link normalizeWsUrl} and validated by {@link validateLobbyServerUrl};
 *   2. otherwise same-origin fallback: `${protocol==='https:'?'wss':'ws'}://${location.host}`
 *      (FR-006). When `location.host` is empty (`file://` or unit test without
 *      a host), falls back to `localhost:${LOBBY_DEFAULT_SERVER_PORT}` where
 *      {@link LOBBY_DEFAULT_SERVER_PORT} is the default HOST_PORT, not a second
 *      listener (FR-008). Backwards-compat: if `host` is absent but `hostname`
 *      is present, derives host from `hostname` + `port` (old call sites).
 *
 * PRIVACY: reads ONLY the `ws` parameter — identifiers never ride
 * URLs into this layer, and nothing here writes to the URL.
 *
 * @param search The query string (e.g. `window.location.search`).
 * @param locator The page-location facts (protocol + host).
 */
export function resolveLobbyServerUrl(search: string, locator: PageLocator): string {
    const override = new URLSearchParams(search).get('ws');
    if (override !== null && override.trim().length > 0) {
        return validateLobbyServerUrl(override, locator);
    }
    const scheme = locator.protocol === 'https:' ? 'wss' : 'ws';
    const hostForResolve = (locator as { host?: string }).host;
    const hostRaw = typeof hostForResolve === 'string' ? hostForResolve.trim() : '';
    if (hostRaw.length > 0) {
        return `${scheme}://${hostRaw}`;
    }
    // Backwards-compat: derive from hostname+port when host is absent (old tests/call sites).
    const hostnameValueForResolve = (locator as { hostname?: string }).hostname;
    const hostname = typeof hostnameValueForResolve === 'string' ? hostnameValueForResolve.trim() : '';
    if (hostname.length > 0) {
        const portValueForResolve = (locator as { port?: string }).port;
        const portRaw = typeof portValueForResolve === 'string' ? portValueForResolve.trim() : '';
        if (portRaw.length > 0) {
            return `${scheme}://${hostname}:${portRaw}`;
        }
        // Legacy hostname-only callers expected the default HOST_PORT appended. Keep that for
        // backwards compat when host is missing; new same-origin callers always supply host.
        return `${scheme}://${hostname}:${String(LOBBY_DEFAULT_SERVER_PORT)}`;
    }
    return `${scheme}://localhost:${String(LOBBY_DEFAULT_SERVER_PORT)}`;
}
