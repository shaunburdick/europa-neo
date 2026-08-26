/**
 * Lobby landing view — feature 010 (T-015).
 *
 * The composition root of the public landing page (FR-001): failure
 * banner, superseded-session notice, identity card, create form, and
 * the public match browser, plus the page-level accessibility
 * machinery:
 *
 *   - **Landmarks/headings**: skip link → `<main>` → `h1` → one
 *     `<section>` per card with an `h2` (WCAG 1.3.1 / 2.4.1);
 *   - **Focus**: the `h1` is a focus target (`tabIndex={-1}`) focused
 *     on RETURN to the lobby (the runtime sets {@link focusHeading}
 *     after the first view swap — never on initial load, so the
 *     address bar keeps focus on first paint); the superseded notice
 *     takes focus when it appears (dialog-like: the session itself
 *     was invalidated, WCAG 2.4.3);
 *   - **Announcements** through the RUNTIME-OWNED shared
 *     {@link LiveRegionAnnouncer} (it outlives the lobby/match view
 *     swap, so messages survive into the next screen): connection
 *     changes, identity events, and snapshot diffs. Errors do NOT go
 *     through the announcer — they render in `role="alert"` nodes at
 *     their source (identity card, create form, match list, banners),
 *     which announce assertively by semantics.
 *
 * Privacy envelope: this component renders ONLY what
 * {@link LobbyState} carries — handles and public projections. The
 * opaque guest player id never reaches this layer (the controller
 * strips it upstream), so there is no code path that could display,
 * route, or log it.
 */

import type { PublicLobbyEntry } from '@europa/matchmaking';
import type { JSX } from 'react';
import { useEffect, useRef } from 'react';

import type { LiveRegionAnnouncer } from '../a11y/live-region';
import type { LobbyState } from '../state/lobby-state';
import type { MatchId } from '../state/types';
import { LobbyCreateForm, type LobbyCreateFormValues } from './lobby-create-form';
import { LobbyIdentityCard } from './lobby-identity-card';
import { connectionLabel, describeSnapshotChange } from './lobby-labels';
import { LobbyMatchList } from './lobby-match-list';

/** Props for {@link LobbyLanding}. */
export interface LobbyLandingProps {
    /** The full lobby application state (single source of rendered truth). */
    readonly state: LobbyState;
    /**
     * The runtime-owned shared announcer; optional so static/test
     * boots without one still render (announcements simply no-op).
     */
    readonly announcer?: LiveRegionAnnouncer | undefined;
    /**
     * Whether to focus the page heading after mount — `true` only on
     * RETURNS to the lobby (view-mode switches), never initial load.
     */
    readonly focusHeading: boolean;
    /** Submit a raw handle draft (caller binds the controller command). */
    readonly onSubmitHandle: (raw: string) => void;
    /** Submit create-form values (caller binds the controller command). */
    readonly onCreate: (values: LobbyCreateFormValues) => void;
    /** Join a waiting match (caller binds the controller command). */
    readonly onJoin: (matchId: MatchId) => void;
    /** Spectate an in-progress match (caller binds the controller command). */
    readonly onSpectate: (matchId: MatchId) => void;
    /** User-actuated retry after a terminal connection failure. */
    readonly onRetry: () => void;
    /** Acknowledge the "session moved elsewhere" notice. */
    readonly onAcknowledgeSuperseded: () => void;
}

/**
 * The public lobby landing page.
 */
export function LobbyLanding({
    state,
    announcer,
    focusHeading,
    onSubmitHandle,
    onCreate,
    onJoin,
    onSpectate,
    onRetry,
    onAcknowledgeSuperseded,
}: LobbyLandingProps): JSX.Element {
    const headingRef = useRef<HTMLHeadingElement | null>(null);
    const supersededRef = useRef<HTMLDivElement | null>(null);

    // Focus the heading on RETURNS to the lobby (view swaps), keeping
    // initial load focus-free (browser convention). The flag flips
    // only after the first view-mode change (runtime-owned).
    useEffect(() => {
        if (focusHeading) {
            headingRef.current?.focus();
        }
    }, [focusHeading]);

    // Supersession is dialog-like: the session was taken over or
    // evicted elsewhere, so every lobby action will fail until
    // acknowledged. Move focus to the notice when it appears.
    useEffect(() => {
        if (state.superseded) {
            supersededRef.current?.focus();
        }
    }, [state.superseded]);

    // -- Announcements (polite channel; errors use role="alert") -------

    const prevConnectionRef = useRef(state.connection);
    useEffect(() => {
        const previous = prevConnectionRef.current;
        prevConnectionRef.current = state.connection;
        if (announcer === undefined || previous === state.connection) {
            return;
        }
        const failed = state.connection === 'failed' || state.connection === 'disconnected';
        announcer.announce(connectionLabel(state.connection), failed ? 'assertive' : 'polite');
    }, [state.connection, announcer]);

    const prevIdentityRef = useRef<{ status: LobbyState['identityStatus']; handle: string | null }>({
        status: state.identityStatus,
        handle: state.handle,
    });
    useEffect(() => {
        const previous = prevIdentityRef.current;
        prevIdentityRef.current = { status: state.identityStatus, handle: state.handle };
        if (announcer === undefined) {
            return;
        }
        if (previous.status === 'restoring' && state.identityStatus === 'unnamed') {
            announcer.announce('Welcome — choose a name to join matches.', 'polite');
        } else if (previous.status !== 'named' && state.identityStatus === 'named') {
            announcer.announce('Your name was accepted.', 'polite');
        } else if (
            state.identityStatus === 'named' &&
            previous.status === 'named' &&
            previous.handle !== null &&
            state.handle !== null &&
            previous.handle !== state.handle
        ) {
            announcer.announce('Your name was updated.', 'polite');
        } else if (previous.status === 'named' && state.identityStatus === 'restoring') {
            announcer.announce('Your session expired — reconnecting as a new visitor.', 'assertive');
        }
    }, [state.identityStatus, state.handle, announcer]);

    const prevEntriesRef = useRef<ReadonlyArray<PublicLobbyEntry>>([]);
    useEffect(() => {
        const previous = prevEntriesRef.current;
        prevEntriesRef.current = state.snapshot?.entries ?? [];
        if (announcer === undefined || state.snapshot === null) {
            return;
        }
        const change = describeSnapshotChange(previous, state.snapshot.entries);
        if (change !== null) {
            announcer.announce(change, 'polite');
        }
    }, [state.snapshot, announcer]);

    // -- Derived availability -------------------------------------------

    const connected = state.connection === 'ready';
    const named = state.identityStatus === 'named' && state.handle !== null;
    const seatActionBusy =
        state.actions.createMatch.phase === 'loading' ||
        state.actions.joinMatch.phase === 'loading' ||
        state.actions.spectateMatch.phase === 'loading';
    const createDisabled = !connected || !named || seatActionBusy;
    const rowActionsDisabled = !connected || seatActionBusy;
    const listActionError = state.actions.joinMatch.error ?? state.actions.spectateMatch.error;

    const snapshotLoaded = state.snapshot !== null;
    const entries = state.snapshot?.entries ?? [];

    return (
        <>
            {/* Skip link is the first Tab stop (WCAG 2.4.1), mirroring
          the match view's contract. */}
            <a id="skip-link" className="skip-link" href="#main">
                Skip to main content
            </a>
            {/* Terminal connection failure (FR-018): role="alert"
          announces itself; Retry re-runs the establish cycle. */}
            {state.failure !== null && state.connection === 'failed' ? (
                <div role="alert" className="europa-banner" data-europa-lobby-failure="true">
                    {state.failure.message}{' '}
                    <button type="button" className="europa-focus-ring" onClick={onRetry}>
                        Retry connection
                    </button>
                </div>
            ) : null}
            {/* Transient transport loss with auto-retry running: visible
          status, no retry button (the backoff loop owns recovery). */}
            {state.failure !== null && state.connection === 'disconnected' ? (
                <div role="alert" className="europa-banner" data-europa-lobby-failure="true">
                    {state.failure.message} Reconnecting…
                </div>
            ) : null}
            <main id="main" className="europa-lobby">
                <h1 ref={headingRef} tabIndex={-1} className="europa-lobby__title europa-focus-ring">
                    Europa Neo lobby
                </h1>
                {/* SUPERSESSION (US4/security invariant): the session's
            claim was taken over or evicted elsewhere. Distinct visual
            + verbal treatment; acknowledgement is explicit. */}
                {state.superseded ? (
                    <div
                        ref={supersededRef}
                        tabIndex={-1}
                        role="alert"
                        className="europa-lobby__superseded europa-focus-ring"
                        data-europa-lobby-superseded="true"
                    >
                        <p>
                            This session moved somewhere else — another browser took over this identity. You can set a
                            new name below to start fresh.
                        </p>
                        <button
                            type="button"
                            className="europa-lobby__button europa-focus-ring"
                            onClick={onAcknowledgeSuperseded}
                        >
                            Acknowledge
                        </button>
                    </div>
                ) : null}
                {/* US4 AC-4: active-match status stays VISIBLE on the
            landing page; the row badge prevents a second-seat claim. */}
                {state.activeMatchId !== null ? (
                    <p className="europa-lobby__active-note" data-europa-active-match="true">
                        You have an active match ({state.activeMatchId.slice(0, 8)}…). It is marked “Your match” in the
                        list below.
                    </p>
                ) : null}
                <div className="europa-lobby__grid">
                    <LobbyIdentityCard
                        connection={state.connection}
                        identityStatus={state.identityStatus}
                        handle={state.handle}
                        actionStatus={state.actions.setHandle}
                        onSubmitHandle={onSubmitHandle}
                    />
                    <LobbyCreateForm
                        disabled={createDisabled}
                        actionStatus={state.actions.createMatch}
                        onCreate={onCreate}
                    />
                    <LobbyMatchList
                        entries={entries}
                        loading={!snapshotLoaded}
                        activeMatchId={state.activeMatchId}
                        busy={rowActionsDisabled}
                        actionError={listActionError}
                        onJoin={onJoin}
                        onSpectate={onSpectate}
                    />
                </div>
            </main>
        </>
    );
}
