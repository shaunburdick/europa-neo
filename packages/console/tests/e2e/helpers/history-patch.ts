/**
 * Shared E2E init scripts — history preservation and test-handle opt-in.
 *
 * These scripts run in the page BEFORE any application code
 * (`Page.addInitScript` semantics), which is also the channel spec 015
 * FR-019 names for the pre-load test opt-in sentinel (spec 005 FR-037).
 *
 * ⚠ Serialization boundary: `addInitScript(fn)` ships only the
 * FUNCTION SOURCE to the page — every helper a script uses must be
 * defined INSIDE its own body. An outer-scope reference would be an
 * undefined identifier in the page, and the resulting ReferenceError
 * fires inside whatever production call path first invoked the patch
 * (e.g. the bootstrap's query strip), aborting the boot silently. The
 * duplicated inner helpers below are deliberate, not oversight.
 *
 * History patches (013 FR-035): the E2E suites navigate to semantic
 * paths carrying the test-only `?ws=` transport override, and SPA
 * same-document history calls would drop the query. Two variants exist
 * and BOTH are load-bearing:
 *
 *   - {@link preserveWsQueryInHistory} REPLACES the target URL's query
 *     with the live `?ws=` search — used where the next hop carries no
 *     query of its own.
 *   - {@link preserveWsAndQueryParamsInHistory} MERGES the live `?ws=`
 *     search with the params the target URL already carries — required
 *     for `/profile?returnTo=…` redirect round-trips, where the
 *     preserve-only variant would drop `returnTo` and dead-end the
 *     round-trip.
 *
 * Both mirror native `history` semantics for missing/empty URL
 * arguments (WHATWG HTML: a missing URL keeps the current document
 * URL): TanStack Router's `createBrowserHistory` calls
 * `replaceState(state, undefined)` with no URL during construction, and
 * an init script that rewrote `undefined` into the string
 * `"undefined"` corrupted the pathname — the bug that once forced a
 * production monkey-patch (deleted by issue #129 / 015 FR-020). The
 * patches therefore pass missing/empty URLs through untouched.
 *
 * @module
 */

/** Patch `history.replaceState`/`pushState` to preserve the `?ws=` override (replace variant). */
export function preserveWsQueryInHistory(): void {
    const passThrough = (url: string | URL | null | undefined): boolean =>
        url === undefined || url === null || url === '';
    const preserveWsQuery = (url: string | URL | null | undefined): string | URL | null | undefined => {
        if (passThrough(url) || !window.location.search.startsWith('?ws=')) return url;
        try {
            const parsed = new URL(String(url), window.location.origin);
            parsed.search = window.location.search;
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        } catch {
            return url;
        }
    };
    const replaceState = window.history.replaceState.bind(window.history);
    const pushState = window.history.pushState.bind(window.history);
    window.history.replaceState = (state, title, url) => replaceState(state, title, preserveWsQuery(url));
    window.history.pushState = (state, title, url) => pushState(state, title, preserveWsQuery(url));
}

/**
 * Merge-variant history patch: keeps BOTH the live `?ws=` override and
 * the params the target URL already carries (see module doc).
 */
export function preserveWsAndQueryParamsInHistory(): void {
    const passThrough = (url: string | URL | null | undefined): boolean =>
        url === undefined || url === null || url === '';
    const mergeWsQuery = (url: string | URL | null | undefined): string | URL | null | undefined => {
        if (passThrough(url) || !window.location.search.startsWith('?ws=')) return url;
        try {
            const parsed = new URL(String(url), window.location.origin);
            const merged = new URLSearchParams(window.location.search);
            for (const [key, value] of new URLSearchParams(parsed.search)) {
                merged.set(key, value);
            }
            parsed.search = merged.toString();
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        } catch {
            return url;
        }
    };
    const replaceState = window.history.replaceState.bind(window.history);
    const pushState = window.history.pushState.bind(window.history);
    window.history.replaceState = (state, title, url) => replaceState(state, title, mergeWsQuery(url));
    window.history.pushState = (state, title, url) => pushState(state, title, mergeWsQuery(url));
}

declare global {
    interface Window {
        /** Pre-load test opt-in sentinel (spec 005 FR-037 / 015 FR-019). */
        __europaTestOptIn?: { readonly lobby?: true };
    }
}

/**
 * Opt the page into the lobby test handle: the production bootstrap
 * installs `window.__europaLobby` only when this sentinel is set
 * before load (spec 005 FR-037, 015 FR-019, plan AD-3). The sentinel
 * carries no bearer credentials.
 */
export function optInLobbyTestHandle(): void {
    window.__europaTestOptIn = { lobby: true };
}
