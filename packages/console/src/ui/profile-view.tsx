/**
 * Profile route view — feature 015 (T005).
 *
 * A dedicated `/profile` page replacing the inline lobby identity card
 * (`lobby-identity-card.tsx`) for three identity states:
 *
 *   1. **restoring** — session is being re-established; a waiting
 *      spinner and disabled Continue button are shown (FR-008).
 *   2. **unnamed** — handle input form with local validation
 *      (`validateHandleDraft`) and server error display
 *      (`describeActionError`) (FR-006).
 *   3. **named** — "Welcome back, {handle}" card with a Continue
 *      button that navigates to `returnTo` or `/lobby` (FR-007).
 *
 * After a successful handle submission the view auto-navigates to
 * `returnTo` or `/lobby` (FR-010) — no manual Continue click required
 * for first-time setup.
 *
 * Accessibility contract (WCAG 2.2 AA, constitution Principle VI):
 *   - Page heading is focusable (`tabIndex={-1}`) for route-change
 *     announcements.
 *   - Input has a tied `<label>` via `htmlFor`/`id`.
 *   - Errors use `role="alert"` + `aria-describedby` + `aria-invalid`.
 *   - Handle display uses `<bdi>` for bidi isolation.
 *   - All controls are native keyboard-operable elements.
 *
 * Connection status (FR-015): a non-intrusive line using
 * `connectionLabel()` from lobby-labels.ts.
 *
 * Design system (FR-016): `<europa-page>`, `<europa-card>`,
 * `<europa-stack>`, `<europa-button>`, `<europa-typography>`.
 */

import type { JSX } from 'react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import type { LobbyActionStatus, LobbyIdentityStatus } from '../state/lobby-state';
import { validateHandleDraft } from './lobby-handle';
import { connectionLabel, describeActionError } from './lobby-labels';

/** Props for {@link ProfileView}. */
export interface ProfileViewProps {
    /** Guest-identity lifecycle (unnamed / named / restoring). */
    readonly identityStatus: LobbyIdentityStatus;
    /** Server-confirmed display handle, verbatim; `null` while unnamed. */
    readonly handle: string | null;
    /** Transport connection lifecycle (rendered as its own status line). */
    readonly connection: { readonly status: string };
    /** The store's `setHandle` action slot (loading/error tracking). */
    readonly actionStatus: LobbyActionStatus;
    /**
     * Submit a raw (unvalidated) handle draft. Called ONLY after local
     * validation passes; the caller binds the controller command.
     */
    readonly onSubmitHandle: (raw: string) => void;
    /** Validated relative pathname from `?returnTo=…`, or `null`. */
    readonly returnTo: string | null;
}

/**
 * The profile page view: handle-setup form (unnamed), welcome card
 * (named), or session-restoration indicator (restoring).
 */
export function ProfileView({
    identityStatus,
    handle,
    connection,
    actionStatus,
    onSubmitHandle,
    returnTo,
}: ProfileViewProps): JSX.Element {
    const [draft, setDraft] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);

    const headingId = useId();
    const fieldName = useId();
    const errorId = useId();
    const statusId = useId();

    const saving = actionStatus.phase === 'loading';
    const named = identityStatus === 'named' && handle !== null;

    // Focus the heading on mount so route-change announcements work
    // (WCAG live-region announcement via heading focus).
    useEffect(() => {
        headingRef.current?.focus();
    }, []);

    // FR-010: auto-navigate on successful handle submission — when
    // identity transitions from unnamed to named, push to returnTo
    // or /lobby without requiring a manual Continue click.
    useEffect(() => {
        if (named) {
            const target = returnTo ?? '/lobby';
            window.history.pushState(window.history.state, '', target);
        }
    }, [named, returnTo]);

    /** Validate locally, then hand the raw draft to the caller. */
    function submit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();
        const verdict = validateHandleDraft(draft);
        if (!verdict.ok) {
            setLocalError(verdict.message);
            return;
        }
        setLocalError(null);
        onSubmitHandle(verdict.value);
    }

    /** Navigate to returnTo or /lobby via history.pushState. */
    function navigateToTarget(): void {
        const target = returnTo ?? '/lobby';
        window.history.pushState(window.history.state, '', target);
    }

    const errorMessage = localError ?? (actionStatus.error !== null ? describeActionError(actionStatus.error) : null);

    if (identityStatus === 'restoring') {
        /* FR-008: restoring state — all-native elements to avoid
           Light DOM reparenting crash on React 19 unmount.
           Every europa-* container (page, card, stack) reparents
           children via appendChild into an internal wrapper div;
           when React unmounts this branch it calls removeChild on
           the host, but the children are already in the wrapper. */
        return (
            <div className="europa-page">
                <div className="europa-stack">
                    <h1 ref={headingRef} id={headingId} tabIndex={-1}>
                        <europa-typography variant="heading">Profile</europa-typography>
                    </h1>

                    {/* FR-015: connection status line */}
                    <p className="europa-lobby__status-line" data-europa-connection-status={connection.status}>
                        Connection: {connectionLabel(connection.status as Parameters<typeof connectionLabel>[0])}
                    </p>

                    <div className="europa-card">
                        <div className="europa-stack">
                            <p data-europa-identity-status="restoring">Restoring your session…</p>
                            <div className="europa-lobby__status-line" aria-hidden="true">
                                Loading…
                            </div>
                            <button type="button" disabled className="europa-lobby__button">
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <europa-page>
            <europa-stack>
                <h1 ref={headingRef} id={headingId} tabIndex={-1}>
                    <europa-typography variant="heading">Profile</europa-typography>
                </h1>

                {/* FR-015: connection status line */}
                <p className="europa-lobby__status-line" data-europa-connection-status={connection.status}>
                    Connection: {connectionLabel(connection.status as Parameters<typeof connectionLabel>[0])}
                </p>

                <europa-card>
                    <europa-stack>
                        {named ? (
                            /* FR-007: named state — welcome card with Continue button */
                            <>
                                <p data-europa-identity-status="named">
                                    Welcome back, <bdi className="europa-lobby__handle">{handle}</bdi>
                                </p>
                                <europa-button
                                    type="button"
                                    data-europa-continue-to-lobby="true"
                                    onClick={navigateToTarget}
                                >
                                    Continue to lobby
                                </europa-button>
                            </>
                        ) : (
                            /* FR-006: unnamed state — handle input form */
                            <>
                                <p data-europa-identity-status="unnamed">Set up your profile</p>
                                <form className="europa-lobby__form" onSubmit={submit}>
                                    <label className="europa-lobby__field-label" htmlFor={fieldName}>
                                        Display name
                                    </label>
                                    <input
                                        id={fieldName}
                                        className="europa-lobby__input europa-focus-ring"
                                        type="text"
                                        value={draft}
                                        onChange={(event) => {
                                            setDraft(event.target.value);
                                            // Clear stale local error on draft change.
                                            if (localError !== null) {
                                                setLocalError(null);
                                            }
                                        }}
                                        disabled={saving}
                                        aria-invalid={errorMessage !== null}
                                        aria-describedby={errorMessage !== null ? `${errorId} ${statusId}` : statusId}
                                        autoComplete="off"
                                    />
                                    {errorMessage !== null ? (
                                        <p className="europa-lobby__error" id={errorId} role="alert">
                                            {errorMessage}
                                        </p>
                                    ) : null}
                                    <europa-button type="submit" disabled={saving} data-europa-submit-handle="true">
                                        {saving ? 'Saving…' : 'Set name'}
                                    </europa-button>
                                </form>
                            </>
                        )}
                    </europa-stack>
                </europa-card>
            </europa-stack>
        </europa-page>
    );
}
