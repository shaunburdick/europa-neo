/**
 * Profile-route URL helpers — feature 015 (T004).
 *
 * Pure, DOM-free helpers for the `/profile` route's
 * stateless `returnTo` deep-link parameter. The parameter carries
 * the original match-join URL so the profile view can hand off after
 * handle setup — no localStorage, no session storage (FR-004/FR-005).
 *
 * This module is the SINGLE `returnTo` validator (013 FR-034): the
 * profile route's `validateSearch` (`routing/search-params.ts`)
 * delegates to {@link isSafeReturnTo}; the former duplicated guard and
 * its divergent second decode are deleted. Exactly ONE URI-decode
 * happens per surface — `URLSearchParams.get` here, TanStack Router's
 * search parse on the route side — never both.
 *
 * Safety model (013 FR-034; feature 015 SC-006): the decoded value
 * must be a safe relative pathname — starts with `/`, not `//`, no
 * `://`, no `..`, no embedded query string, no backslash (browsers
 * treat `\` as `/` in special-scheme URLs, so `/\evil.com` is the
 * `//evil.com` open redirect in disguise). Unsafe values are silently
 * treated as absent so the Continue button defaults to `/lobby`.
 *
 * Pure module: no DOM, no clocks, no randomness.
 */

/**
 * Guard: is this an already-decoded `returnTo` value safe for in-app
 * navigation?
 *
 * The ONE safety contract for `returnTo` (013 FR-034), applied to an
 * ALREADY-DECODED string by every surface:
 *   1. Non-empty and starts with `/` (absolute pathname, not a bare segment).
 *   2. Does NOT start with `//` (rejects protocol-relative `//evil.com`).
 *   3. Does NOT contain `://` (rejects any absolute URL carrying a scheme).
 *   4. Does NOT contain `..` segments (rejects path traversal — including
 *      encoded forms, which the single URI-decode has already unmasked).
 *   5. Does NOT contain `?` (a returnTo is a pathname; an embedded query
 *      string is out of contract).
 *   6. Does NOT contain `\` (URL-equivalent to `/` for special schemes —
 *      AC-019's backslash open-redirect variant).
 *   7. Does NOT contain `%`: a value that is STILL percent-encoded after
 *      the single decode is an encoded form the semantic routes never
 *      produce, and the URL parser silently normalizes `%2e%2e` path
 *      segments into `..` traversal during navigation — rejected
 *      uniformly rather than reasoned about per encoding (AC-019's
 *      double-encoded and `%2e%2e` variants).
 *
 * @param value An already-decoded candidate pathname.
 * @returns `true` when the value is safe to navigate to.
 */
export function isSafeReturnTo(value: string): boolean {
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
    if (value.includes('?')) {
        return false;
    }
    if (value.includes('\\')) {
        return false;
    }
    if (value.includes('%')) {
        return false;
    }
    return true;
}

/**
 * Extract and validate the `returnTo` query parameter from a URL
 * search string. Performs exactly ONE URI-decode
 * (`URLSearchParams.get`); no second `decodeURIComponent` pass (013
 * FR-034 — the former double decode is deleted).
 *
 * @param search The `window.location.search` value (or any `?...` string).
 * @returns A validated, decoded, relative pathname ready for
 *   `history.pushState`, or `null` when absent/empty/invalid.
 * @public Profile return-path seam exercised by profile URL tests.
 */
export function readReturnTo(search: string): string | null {
    // A search string may or may not start with '?'; accept both.
    // `URLSearchParams.get` applies the single percent-decode.
    const raw = new URLSearchParams(search).get('returnTo');

    if (raw === null || raw.length === 0) {
        return null;
    }

    return isSafeReturnTo(raw) ? raw : null;
}
