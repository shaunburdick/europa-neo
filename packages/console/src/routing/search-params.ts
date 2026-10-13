/**
 * Search-param validation for TanStack Router routes.
 *
 * Standalone, pure, DOM-free validation functions that implement the safety
 * contracts defined by feature 015 (FR-004/FR-005) and feature 013 (FR-024).
 * These functions are designed to be passed directly to `validateSearch` on
 * `createRoute` calls.
 *
 * `returnTo` validation is SINGLE-SOURCED (013 FR-034): this module
 * delegates to the canonical {@link isSafeReturnTo} guard in
 * `ui/profile-url.ts`. TanStack Router's search parse has already
 * applied the ONE URI-decode by the time `validateSearch` runs, so this
 * layer performs NO additional decode — the former divergent second
 * `decodeURIComponent` pass is deleted.
 *
 * Pure module: no DOM, no clocks, no randomness.
 */

import { isSafeReturnTo } from '../ui/profile-url';

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
 * Delegates the safety contract to the canonical `isSafeReturnTo`
 * guard (feature 015 FR-005, feature 013 FR-034). Values arriving here
 * are ALREADY decoded once by TanStack Router's search parse; a value
 * that is still percent-encoded (e.g. `%2Fmatch%2Fabc`) fails the
 * leading-`/` check and is treated as absent — decoding it again is
 * exactly the divergent double decode FR-034 retires.
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

    if (typeof raw !== 'string' || !isSafeReturnTo(raw)) {
        return { returnTo: undefined };
    }

    return { returnTo: raw };
}
