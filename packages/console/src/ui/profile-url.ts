/**
 * Profile-route URL helpers — feature 015 (T004).
 *
 * Pure, DOM-free helpers for the dedicated `/profile` route's
 * stateless `returnTo` deep-link parameter. The parameter carries
 * the original match-join URL so the profile view can hand off after
 * handle setup — no localStorage, no session storage (FR-004/FR-005).
 *
 * Safety model: the decoded value must be a safe relative pathname
 * (starts with `/`, no protocol, no host, no `..` traversal). Unsafe
 * values are silently treated as absent so the Continue button
 * defaults to `/lobby` (SC-006).
 *
 * Pure module: no DOM, no clocks, no randomness.
 */

/**
 * Extract and validate the `returnTo` query parameter from a URL
 * search string.
 *
 * @param search The `window.location.search` value (or any `?...` string).
 * @returns A validated, decoded, relative pathname ready for
 *   `history.pushState`, or `null` when absent/empty/invalid.
 */
export function readReturnTo(search: string): string | null {
    // A search string may or may not start with '?"; accept both.
    const params = new URLSearchParams(search);
    const raw = params.get('returnTo');

    if (raw === null || raw.length === 0) {
        return null;
    }

    let decoded: string;
    try {
        decoded = decodeURIComponent(raw);
    } catch {
        return null;
    }

    return isSafeRelativePathname(decoded) ? decoded : null;
}

/**
 * Guard: the decoded value must be a relative pathname safe for
 * in-app navigation.
 *
 * Checks (in precedence order):
 *   1. Starts with `/` (absolute pathname, not bare segment).
 *   2. Does NOT contain `://` (rejects any absolute URL that carries an
 *      explicit scheme — a hostile off-site origin).
 *   3. Does NOT start with `//` (rejects protocol-relative `//evil.com`).
 *   4. Does NOT contain `..` segments (rejects path traversal).
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
