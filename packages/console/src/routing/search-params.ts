/**
 * Search-param validation for TanStack Router routes.
 *
 * Standalone, pure, DOM-free validation functions that implement the safety
 * contracts defined by feature 015 (FR-004/FR-005) and feature 013 (FR-024).
 * These functions are designed to be passed directly to `validateSearch` on
 * `createRoute` calls.
 *
 * Safety model: the decoded `returnTo` value must be a safe relative pathname
 * (starts with `/`, no protocol, no host, no `..` traversal). Unsafe values
 * are silently treated as absent so the ProfileView's Continue button defaults
 * to `/lobby` (SC-006).
 *
 * Pure module: no DOM, no clocks, no randomness.
 */

/**
 * Validated search parameters for the `/profile` route.
 *
 * Returned by {@link profileSearchParams} after TanStack Router's
 * `validateSearch` phase. The `returnTo` field is `undefined` when
 * absent, empty, or unsafe — the ProfileView treats `undefined` as
 * `/lobby` fallback.
 */
export interface ProfileSearchParams {
    readonly returnTo: string | undefined;
}

/**
 * Validate search parameters for the `/profile` route.
 *
 * Implements the `returnTo` safety contract (feature 015 FR-005) for use as
 * TanStack Router's `validateSearch` callback. The contract is identical to
 * the existing `readReturnTo` function in `ui/profile-url.ts` but operates on
 * an already-parsed `Record<string, unknown>` rather than a raw search string.
 *
 * **Safety checks (in precedence order):**
 * 1. Must be a non-empty string after extraction.
 * 2. Must start with `/` (absolute pathname, not bare segment).
 * 3. Must NOT start with `//` (rejects protocol-relative `//evil.com`).
 * 4. Must NOT contain `://` (rejects any URL with explicit scheme).
 * 5. Must NOT contain `..` (rejects path traversal).
 *
 * @param search The raw search-params record from TanStack Router.
 * @returns A validated, typed search-params object safe for in-app navigation.
 *
 * @example
 * ```ts
 * const profileRoute = createRoute({
 *     getParentRoute: () => rootRoute,
 *     path: '/profile',
 *     validateSearch: profileSearchParams,
 *     component: ProfileView,
 * });
 * ```
 */
export function profileSearchParams(search: ProfileSearchParams): ProfileSearchParams {
    const raw = search.returnTo;

    if (typeof raw !== 'string' || raw.length === 0) {
        return { returnTo: undefined };
    }

    // Decode URI-encoded value (TanStack Router may or may not pre-decode,
    // but the existing readReturnTo contract expects double-decode safety).
    let decoded: string;
    try {
        decoded = decodeURIComponent(raw);
    } catch {
        return { returnTo: undefined };
    }

    return {
        returnTo: isSafeRelativePathname(decoded) ? decoded : undefined,
    };
}

/**
 * Guard: the decoded value must be a relative pathname safe for
 * in-app navigation.
 *
 * Checks (in precedence order):
 *   1. Starts with `/` (absolute pathname, not bare segment).
 *   2. Does NOT start with `//` (rejects protocol-relative `//evil.com`).
 *   3. Does NOT contain `://` (rejects any absolute URL that carries an
 *      explicit scheme — a hostile off-site origin).
 *   4. Does NOT contain `..` segments (rejects path traversal).
 *
 * This is the same guard used by `readReturnTo` in `ui/profile-url.ts`.
 * Duplicated here to keep the routing module self-contained and avoid
 * importing from the UI layer.
 */
function isSafeRelativePathname(value: string): boolean {
    if (value.length === 0 || value[0] !== '/') {
        return false;
    }
    if (value.startsWith('//')) {
        return false;
    }
    if (value.includes('://')) {
        return false;
    }
    if (value.includes('..')) {
        return false;
    }
    return true;
}
