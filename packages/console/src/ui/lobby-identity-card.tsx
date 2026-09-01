/**
 * Lobby identity card — feature 010 (T-015).
 *
 * The landing page's first section (US1): shows the CONNECTION status
 * (transport lifecycle) distinctly from the IDENTITY status (guest
 * naming), renders the accepted handle, and owns the set-name / rename
 * form (FR-004/FR-005).
 *
 * Validation is two-layered, server-authoritative:
 *
 *   1. LOCAL (instant): {@link validateHandleDraft} mirrors the
 *      server's FR-004 rules so obviously invalid submissions fail
 *      without a round-trip. Rejection classes and precedence are
 *      pinned identical to the server (see that module).
 *   2. SERVER (authoritative): uniqueness (`handle_taken`) and every
 *      future rule arrive through the store's `setHandle` action slot;
 *      this card renders that error verbatim below the field.
 *
 * Accessibility contract (WCAG 2.2 AA, constitution Principle VI):
 *   - every input has a tied `<label>`; errors use `role="alert"` +
 *      `aria-describedby` + `aria-invalid` so appearance AND annunciation
 *      happen together without stealing focus (WCAG 3.3.1/3.3.3/4.1.3);
 *   - the accepted handle renders inside `<bdi>` — handles are
 *      hostile-but-valid user content and must never reorder
 *      surrounding layout for OTHER readers (Wave-4 dispatch invariant);
 *   - all controls are native elements (keyboard-operable by
 *      construction); the submit button uses `<europa-button>`
 *      which wraps a native `<button>` with `:focus-visible` ring;
 *   - busy states disable the submit button and relabel it ("Saving…")
 *      rather than hiding it, keeping focus stable.
 */

import type { JSX } from 'react';
import { type FormEvent, useId, useState } from 'react';

import type { LobbyConnectionState } from '../net/ws-lobby-client';
import type { LobbyActionStatus, LobbyIdentityStatus } from '../state/lobby-state';
import { validateHandleDraft } from './lobby-handle';
import { connectionLabel, describeActionError, identityStatusLabel } from './lobby-labels';

/** Props for {@link LobbyIdentityCard}. */
export interface LobbyIdentityCardProps {
    /** Transport connection lifecycle (rendered as its own status line). */
    readonly connection: LobbyConnectionState;
    /** Guest-identity lifecycle (unnamed / named / restoring). */
    readonly identityStatus: LobbyIdentityStatus;
    /** Server-confirmed display handle, verbatim; `null` while unnamed. */
    readonly handle: string | null;
    /** The store's `setHandle` action slot (loading/error tracking). */
    readonly actionStatus: LobbyActionStatus;
    /**
     * Submit a raw (unvalidated) handle draft. Called ONLY after local
     * validation passes; the caller binds the controller command.
     */
    readonly onSubmitHandle: (raw: string) => void;
}

/**
 * The identity/rename card: session status lines plus the naming form.
 */
export function LobbyIdentityCard({
    connection,
    identityStatus,
    handle,
    actionStatus,
    onSubmitHandle,
}: LobbyIdentityCardProps): JSX.Element {
    const [draft, setDraft] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);

    const headingId = useId();
    const fieldName = useId();
    const errorId = useId();
    const statusId = useId();

    const saving = actionStatus.phase === 'loading';
    const named = identityStatus === 'named' && handle !== null;

    /** Validate locally, then hand the raw draft to the caller. */
    function submit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();
        const verdict = validateHandleDraft(draft);
        if (!verdict.ok) {
            setLocalError(verdict.message);
            return;
        }
        setLocalError(null);
        onSubmitHandle(draft);
    }

    const errorMessage = localError ?? (actionStatus.error !== null ? describeActionError(actionStatus.error) : null);

    return (
        <section className="europa-lobby__card" aria-labelledby={headingId}>
            <h2 id={headingId} className="europa-lobby__card-title">
                Your name
            </h2>
            {/* Connection vs identity status: two distinct facts, two
          distinct lines (task contract). data-* hooks aid tests. */}
            <p className="europa-lobby__status-line" data-europa-connection-status={connection}>
                Connection: {connectionLabel(connection)}
            </p>
            <p className="europa-lobby__status-line" id={statusId} data-europa-identity-status={identityStatus}>
                {named ? (
                    <>
                        Playing as <bdi className="europa-lobby__handle">{handle}</bdi>
                    </>
                ) : (
                    identityStatusLabel(identityStatus, handle)
                )}
            </p>
            {identityStatus === 'restoring' ? null : (
                <form className="europa-lobby__form" onSubmit={submit}>
                    <label className="europa-lobby__field-label" htmlFor={fieldName}>
                        {named ? 'Change name' : 'Display name'}
                    </label>
                    <input
                        id={fieldName}
                        className="europa-lobby__input europa-focus-ring"
                        type="text"
                        value={draft}
                        onChange={(event) => {
                            setDraft(event.target.value);
                            // Clear the stale local error as soon as the
                            // draft changes — re-validating per keystroke
                            // would shout at the visitor mid-thought.
                            if (localError !== null) {
                                setLocalError(null);
                            }
                        }}
                        disabled={saving}
                        aria-invalid={errorMessage !== null}
                        aria-describedby={errorMessage !== null ? `${errorId} ${statusId}` : statusId}
                        autoComplete="off"
                    />
                    {/* role="alert": the error announces itself (assertive)
              the moment it appears — no announcer wiring needed. */}
                    {errorMessage !== null ? (
                        <p className="europa-lobby__error" id={errorId} role="alert">
                            {errorMessage}
                        </p>
                    ) : null}
                    <europa-button type="submit" disabled={saving} data-europa-submit-handle="true">
                        {saving ? 'Saving…' : named ? 'Update name' : 'Set name'}
                    </europa-button>
                </form>
            )}
        </section>
    );
}
