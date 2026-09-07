/**
 * Match-ID validation helper for TanStack Router's `beforeLoad` phase.
 *
 * Wraps {@link validateMatchId} from `./route` with the redirect-on-rejection
 * behavior required by FR-022 and FR-012. Each rejection reason is logged as
 * a classification tag so that diagnostics can distinguish malformed URLs from
 * legitimate unavailability without exposing the raw input.
 *
 * Design constraints:
 * - Pure validation + throw: no side-effects beyond the classification log.
 * - The `redirect` is thrown (not returned) so that `beforeLoad`'s return
 *   type remains `never` on the rejection path, matching TanStack Router's
 *   expected `beforeLoad` signature.
 * - The error component (`MatchIdValidationError`) is a separate export so
 *   the route tree can wire it as the `errorComponent` for `/match/$matchId`.
 *
 * @module
 */

import { redirect } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import type { RouteRejection } from './route';
import { validateMatchId } from './route';

// ─── Human-readable labels for each rejection reason ─────────────────────────

const REJECTION_LABELS: Readonly<Record<RouteRejection, string>> = {
    'malformed-encoding': 'The match ID contains invalid URL encoding.',
    'empty-match-id': 'No match ID was provided.',
    'decoded-slash': 'The match ID contains a path separator.',
    'unsafe-character': 'The match ID contains unsafe characters.',
    'wrong-segment-count': 'The URL has too many segments after the match ID.',
    'unsupported-path': 'This path is not a supported match route.',
};

// ─── beforeLoad helper ──────────────────────────────────────────────────────

/**
 * Validate a raw `$matchId` param and redirect to `/lobby` on rejection.
 *
 * Call this inside a `createRoute({ beforeLoad })` handler:
 *
 * ```ts
 * const matchRoute = createRoute({
 *     getParentRoute: () => rootRoute,
 *     path: '/match/$matchId',
 *     beforeLoad: ({ params }) => {
 *         validateAndRedirectMatchId(params.matchId);
 *     },
 * });
 * ```
 *
 * On success the decoded, validated match ID is returned. On rejection the
 * function logs the classification and **throws** a TanStack Router redirect
 * to `/lobby` — callers must not catch the throw.
 *
 * @param rawSegment The raw, URL-encoded `$matchId` param from the route.
 * @returns The decoded, validated match ID string.
 * @throws A TanStack Router `Redirect` Response when validation fails.
 */
export function validateAndRedirectMatchId(rawSegment: string): string {
    const result = validateMatchId(rawSegment);

    if (!result.ok) {
        logRouteRejection(result.reason);
        throw redirect({ to: '/lobby' });
    }

    return result.value;
}

/**
 * Log a match-ID rejection classification.
 *
 * Uses `console.warn` (the standard browser diagnostic channel) with a
 * structured tag so that monitoring or dev-tool filtering can distinguish
 * rejection classes. The raw input is deliberately NOT logged to avoid
 * leaking potentially hostile URL content.
 */
function logRouteRejection(reason: RouteRejection): void {
    console.warn(`[route:match-rejection] reason=${reason}`);
}

// ─── Error component for rejected match IDs ─────────────────────────────────

/**
 * Props for the match-ID validation error component.
 *
 * Mirrors TanStack Router's `errorComponent` signature so it can be used
 * directly as `errorComponent` on the `/match/$matchId` route.
 */
interface MatchIdValidationErrorProps {
    /** The error thrown by `beforeLoad` (expected to be a redirect Response). */
    readonly error: unknown;
    /** Reset the router error boundary and navigate back. */
    readonly reset: () => void;
}

/**
 * Component-level error handler for rejected match IDs.
 *
 * When `validateAndRedirectMatchId` throws a redirect in `beforeLoad`,
 * TanStack Router catches it and renders the route's `errorComponent`.
 * If the redirect is processed normally the user never sees this component;
 * it exists as a safety net for edge cases where the redirect cannot be
 * processed (e.g., router not yet mounted, or a non-redirect error).
 *
 * Renders a `RouteNotice`-compatible panel with a recovery action.
 */
export function MatchIdValidationError({ error, reset }: MatchIdValidationErrorProps): JSX.Element {
    const noticeRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        noticeRef.current?.focus();
    }, []);

    const message = deriveErrorMessage(error);

    return (
        <main id="main" className="europa-route-notice" data-europa-route-notice="match-id-error">
            <section
                ref={noticeRef}
                className="europa-route-notice__panel europa-focus-ring"
                tabIndex={-1}
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                aria-labelledby="match-id-error-title"
            >
                <span className="europa-route-notice__icon" aria-hidden="true">
                    🔍
                </span>
                <h1 id="match-id-error-title" className="europa-route-notice__title">
                    Match unavailable
                </h1>
                <p className="europa-route-notice__message">{message}</p>
                <div className="europa-route-notice__actions">
                    <button type="button" className="europa-lobby__button europa-focus-ring" onClick={reset}>
                        Try again
                    </button>
                    <a href="/lobby" className="europa-lobby__button europa-focus-ring">
                        Return to lobby
                    </a>
                </div>
            </section>
        </main>
    );
}

/**
 * Derive a safe, user-facing error message from the thrown value.
 *
 * Only known `RouteRejection` values produce specific messages; everything
 * else yields a generic fallback. Raw error content is never exposed.
 */
function deriveErrorMessage(error: unknown): string {
    if (
        typeof error === 'object' &&
        error !== null &&
        'reason' in error &&
        typeof (error as { reason: unknown }).reason === 'string'
    ) {
        const reason = (error as { reason: RouteRejection }).reason;
        if (reason in REJECTION_LABELS) {
            return REJECTION_LABELS[reason];
        }
    }

    // Redirect Responses (normal flow) or unknown errors — generic message.
    return 'The match link you followed is not valid.';
}
