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
