import type { JSX } from 'react';
import { useEffect, useRef } from 'react';

/** A user-facing recovery notice raised while resolving a semantic route. */
export type RouteNoticeKind = 'unknown' | 'unavailable' | 'shortcut-failure';

/** Props for {@link RouteNotice}. */
export interface RouteNoticeProps {
    /** Classifies the recovery state for styling and test/telemetry hooks. */
    readonly kind: RouteNoticeKind;
    /** Short heading describing the problem. */
    readonly title: string;
    /** Safe, user-facing explanation; callers should not include opaque IDs. */
    readonly message: string;
    /** Optional user-requested retry action. */
    readonly onRetry?: (() => void) | undefined;
    /** Required recovery action that returns to the canonical lobby. */
    readonly onReturnToLobby: () => void;
    /** Changes when a new notice replaces the current notice. */
    readonly focusKey?: string | undefined;
}

/**
 * Accessible recovery surface for unknown routes and failed match entry.
 *
 * The alert is both announced by assistive technology and focused when the
 * notice changes, so keyboard and screen-reader users are not left at a
 * stale link after a failed navigation. Actions are native buttons, matching
 * the lobby's keyboard and visible-focus contract.
 */
export function RouteNotice({
    kind,
    title,
    message,
    onRetry,
    onReturnToLobby,
    focusKey,
}: RouteNoticeProps): JSX.Element {
    const noticeRef = useRef<HTMLElement | null>(null);
    const focusIdentity = focusKey ?? `${kind}:${title}:${message}`;

    useEffect(() => {
        noticeRef.current?.focus();
    }, [focusIdentity]);

    return (
        <main id="main" className="europa-route-notice" data-europa-route-notice={kind}>
            <section
                ref={noticeRef}
                className="europa-route-notice__panel europa-focus-ring"
                tabIndex={-1}
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                aria-labelledby="route-notice-title"
            >
                <span className="europa-route-notice__icon" aria-hidden="true">
                    🔍
                </span>
                <h1 id="route-notice-title" className="europa-route-notice__title">
                    {title}
                </h1>
                <p className="europa-route-notice__message">{message}</p>
                <div className="europa-route-notice__actions">
                    {onRetry !== undefined ? (
                        <button type="button" className="europa-lobby__button europa-focus-ring" onClick={onRetry}>
                            Try again
                        </button>
                    ) : null}
                    <button type="button" className="europa-lobby__button europa-focus-ring" onClick={onReturnToLobby}>
                        Return to lobby
                    </button>
                </div>
            </section>
        </main>
    );
}
