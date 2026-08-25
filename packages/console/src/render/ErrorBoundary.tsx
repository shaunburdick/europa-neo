/**
 * Root error boundary — Feature 005 (T085).
 *
 * Catches uncaught render errors so a bad frame never blanks the
 * page silently (research.md §6; Q-B08): the fallback announces the
 * failure via an `aria-live="assertive"` region (WCAG 4.1.3 status
 * messages) and offers a Reload button (a plain `location.reload()`
 * — self-hosted SPA, no router state to preserve).
 *
 * Error reporting goes through the optional {@link onError} host
 * hook — the boundary never calls `console.*` directly (package
 * rule; the host decides where errors land).
 *
 * The boundary wraps the root `App` in `main.tsx` (both boot modes).
 *
 * JSDoc references: Q-B08 + WCAG 4.1.3.
 */

import { Component, type ErrorInfo, type JSX } from 'react';

/** Props for {@link ErrorBoundary}. */
export interface ErrorBoundaryProps {
    /** The guarded subtree (the console root). */
    readonly children: React.ReactNode;
    /** Optional host hook invoked with every caught error. */
    readonly onError?: ((error: Error, info: ErrorInfo) => void) | undefined;
}

/** Boundary state: the caught error, or `null` while healthy. */
interface ErrorBoundaryState {
    readonly error: Error | null;
}

/**
 * Class-based React error boundary with an accessible fallback.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    override state: ErrorBoundaryState = { error: null };

    /** React lifecycle: derive fallback state from a render error. */
    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    /** React lifecycle: report to the host hook (never `console.*`). */
    override componentDidCatch(error: Error, info: ErrorInfo): void {
        this.props.onError?.(error, info);
    }

    override render(): JSX.Element {
        const { error } = this.state;
        if (error !== null) {
            return (
                <div role="alert" className="europa-error-boundary">
                    <div aria-live="assertive" aria-atomic="true" className="europa-visually-hidden">
                        The console encountered an unexpected error and stopped rendering.
                    </div>
                    <h2 className="europa-error-boundary__title">Something went wrong</h2>
                    <p className="europa-error-boundary__body">
                        The console hit an unexpected error and cannot continue rendering this match.
                    </p>
                    <button
                        type="button"
                        className="europa-error-boundary__reload europa-focus-ring"
                        onClick={() => {
                            window.location.reload();
                        }}
                    >
                        Reload
                    </button>
                </div>
            );
        }
        return this.props.children as JSX.Element;
    }
}
