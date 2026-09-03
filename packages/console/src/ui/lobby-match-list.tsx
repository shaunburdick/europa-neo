/**
 * Lobby match browser — feature 010 (T-015, US2).
 *
 * The public match list: one stable row per `PublicLobbyEntry`
 * (identity keyed by `matchId` — React key AND `data-match-id`, so
 * announcements/tests can address rows across snapshots), each showing
 * the match identifier, occupancy/capacity, lifecycle status, and a
 * settings summary (FR-006), with exactly one actionable verb:
 *
 *   - waiting + open seat → **Join** (FR-007);
 *   - waiting + full      → no action ("Full" — auto-start is imminent);
 *   - in progress         → **Spectate** (FR-012);
 *   - the viewer's OWN active match → no action + "Your match" badge
 *     (US4 AC-4: never claim a second seat with the same identity).
 *
 * Empty state (US2 AC-4): an explicit "no matches" message; the
 * create form remains the prominent path (it sits beside this list on
 * the landing page).
 *
 * Before the first server snapshot, the list is loading rather than empty.
 * This distinction prevents a transient transport state from being announced
 * as a definitive empty lobby (FR-016).
 *
 * Accessibility contract: semantic `<ul>` list; row actions carry
 * composed accessible names (`rowActionLabel`) so rows are
 * distinguishable by ear; the shared join/spectate failure line uses
 * `role="alert"`; all controls are native buttons with visible focus.
 */

import type { PublicLobbyEntry } from '@europa/matchmaking';
import type { JSX } from 'react';
import type { LobbyActionError } from '../state/lobby-state';
import type { MatchId } from '../state/types';
import { describeActionError, formatEntrySettings, isJoinable, lobbyStatusLabel, rowActionLabel } from './lobby-labels';

/** Props for {@link LobbyMatchList}. */
export interface LobbyMatchListProps {
    /** Current public entries, server order (constitution Principle II). */
    readonly entries: ReadonlyArray<PublicLobbyEntry>;
    /** Whether the first authoritative lobby snapshot has arrived. */
    readonly loading: boolean;
    /**
     * The viewer's active match per the server snapshot (`null` when
     * lobby-bound); that row loses its action buttons and gains a
     * "Your match" marker (US4 AC-4).
     */
    readonly activeMatchId: MatchId | null;
    /**
     * Master disable for row actions while a seat-granting action is
     * in flight (prevents double-claim attempts client-side).
     */
    readonly busy: boolean;
    /** The most recent failed join/spectate attempt, or `null`. */
    readonly actionError: LobbyActionError | null;
    /** Join a waiting match (caller binds the controller command). */
    readonly onJoin: (matchId: MatchId) => void;
    /** Spectate an in-progress match (caller binds the controller command). */
    readonly onSpectate: (matchId: MatchId) => void;
}

/** One stable public-match row. */
function MatchRow({
    entry,
    ownMatch,
    busy,
    onJoin,
    onSpectate,
}: {
    readonly entry: PublicLobbyEntry;
    readonly ownMatch: boolean;
    readonly busy: boolean;
    readonly onJoin: (matchId: MatchId) => void;
    readonly onSpectate: (matchId: MatchId) => void;
}): JSX.Element {
    const joinable = isJoinable(entry);

    /** Derive the status dot class from the match status. */
    function statusDotClass(): string {
        if (entry.status === 'waiting') {
            return joinable ? 'europa-lobby__status-dot--waiting' : 'europa-lobby__status-dot--full';
        }
        if (entry.status === 'in_progress') {
            return 'europa-lobby__status-dot--playing';
        }
        return 'europa-lobby__status-dot--full';
    }

    return (
        <li
            className={`europa-lobby__row${ownMatch ? ' europa-lobby__row--own' : ''}`}
            data-match-id={entry.matchId}
            data-status={entry.status}
        >
            <div className="europa-lobby__row-main">
                {/* Status dot indicator. */}
                <span className="europa-lobby__status-indicator">
                    <span className={`europa-lobby__status-dot ${statusDotClass()}`} aria-hidden="true" />
                </span>
                {/* Player occupancy dots. */}
                <span className="europa-lobby__player-dots">
                    <span className="europa-visually-hidden">
                        {entry.seatsFilled} of {entry.capacity} players
                    </span>
                    {Array.from({ length: entry.capacity }, (_, i) => (
                        <span
                            key={i}
                            className={`europa-lobby__player-dot ${i < entry.seatsFilled ? 'europa-lobby__player-dot--filled' : 'europa-lobby__player-dot--empty'}`}
                            aria-hidden="true"
                        />
                    ))}
                </span>
                {/* The id is a server-minted UUID (safe charset) rendered as
          opaque text; handles never appear in listings (privacy
          envelope), so no `<bdi>` is required here. */}
                <span className="europa-lobby__row-id">Match {entry.matchId.slice(0, 8)}</span>
                {ownMatch ? <span className="europa-lobby__row-badge">Your match</span> : null}
                <span className="europa-lobby__row-meta">
                    {lobbyStatusLabel(entry.status)} · {formatEntrySettings(entry)}
                </span>
            </div>
            <div className="europa-lobby__row-actions">
                {entry.status === 'waiting' && !ownMatch ? (
                    joinable ? (
                        <europa-button
                            type="button"
                            disabled={busy}
                            aria-label={rowActionLabel('join', entry)}
                            onClick={() => {
                                onJoin(entry.matchId);
                            }}
                        >
                            Join
                        </europa-button>
                    ) : (
                        // Full waiting match: auto-start owns it now; no seat
                        // to advertise (FR-007 "open waiting matches" only).
                        <span className="europa-lobby__row-full">Full</span>
                    )
                ) : null}
                {entry.status === 'in_progress' && !ownMatch ? (
                    <europa-button
                        type="button"
                        disabled={busy}
                        aria-label={rowActionLabel('spectate', entry)}
                        onClick={() => {
                            onSpectate(entry.matchId);
                        }}
                    >
                        Spectate
                    </europa-button>
                ) : null}
            </div>
        </li>
    );
}

/**
 * The public match browser: rows, empty state, and the shared
 * join/spectate failure line.
 */
export function LobbyMatchList({
    entries,
    loading,
    activeMatchId,
    busy,
    actionError,
    onJoin,
    onSpectate,
}: LobbyMatchListProps): JSX.Element {
    const headingId = 'europa-lobby-matches-heading';
    const errorId = 'europa-lobby-matches-error';
    return (
        <section
            className="europa-lobby__card europa-lobby__card--wide"
            aria-labelledby={headingId}
            aria-busy={loading || busy}
        >
            <div className="europa-lobby__list-header">
                <h2 id={headingId} className="europa-lobby__card-title">
                    Public matches
                </h2>
                {!loading ? (
                    <span className="europa-lobby__list-count" aria-hidden="true">
                        {entries.length}
                    </span>
                ) : null}
            </div>
            {actionError !== null ? (
                <p className="europa-lobby__error" id={errorId} role="alert">
                    {describeActionError(actionError)}
                </p>
            ) : null}
            {loading ? (
                <p
                    className="europa-lobby__status-line"
                    data-europa-lobby-loading="true"
                    role="status"
                    aria-live="polite"
                >
                    Loading public matches…
                </p>
            ) : entries.length === 0 ? (
                <div className="europa-empty-state" data-europa-lobby-empty="true">
                    <span className="europa-empty-state__icon" aria-hidden="true">
                        ⚔
                    </span>
                    <p className="europa-empty-state__title">No matches</p>
                    <p className="europa-empty-state__message">
                        No public matches right now — create one to get started.
                    </p>
                </div>
            ) : (
                <ul className="europa-lobby__rows" aria-busy={loading || busy}>
                    {entries.map((entry) => (
                        <MatchRow
                            key={entry.matchId}
                            entry={entry}
                            ownMatch={activeMatchId !== null && entry.matchId === activeMatchId}
                            busy={busy}
                            onJoin={onJoin}
                            onSpectate={onSpectate}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}
