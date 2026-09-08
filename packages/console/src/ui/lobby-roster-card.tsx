/**
 * Lobby roster card — feature 023 (T-038/T-039/T-040/T-041/T-042).
 *
 * Renders the server-authoritative presence roster on the lobby
 * landing page: a card with a heading showing the player count,
 * a list of entries with handles, status badges, and a "(you)"
 * indicator for the local player, or a "Presence unavailable"
 * degraded state when the roster connection has not delivered a
 * snapshot.
 *
 * Accessibility:
 *   - `role="list"` / `role="listitem"` for roster entries (FR-018);
 *   - `aria-live="polite"` region for coalesced status updates (FR-018);
 *   - Keyboard-navigable: roster entries are within a navigable region
 *     (native `<ul>`/`<li>` provides implicit Tab navigation through
 *     focusable items — the entries themselves are not focusable since
 *     they are display-only; the region is scrollable for keyboard users);
 *   - `prefers-reduced-motion`: no transition effects; roster updates
 *     instantly (FR-019);
 *   - Status badges use color + text (WCAG 1.4.1 Use of Color);
 *   - Sufficient contrast for all text per WCAG 2.2 AA (FR-018).
 *
 * Styling uses `europa-*` design tokens and follows the existing lobby
 * card patterns (identity card, create form, match list).
 */

import type { RosterEntry, RosterStatus } from '@europa/matchmaking';
import type { JSX } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import type { RosterState } from '../state/lobby-state';

// ----------------------------------------------------------------------------
// Props
// ----------------------------------------------------------------------------

/** Props for {@link RosterCard}. */
export interface RosterCardProps {
    /** The current roster state from the lobby reducer. */
    readonly roster: RosterState;
    /** The local player's own handle, or `null` if not yet named. */
    readonly ownHandle: string | null;
}

// ----------------------------------------------------------------------------
// Status label derivation (pure — T-048 derivation tests)
// ----------------------------------------------------------------------------

/**
 * Map a {@link RosterStatus} to its human-readable display label.
 * Used in status badges and screen-reader text.
 *
 * @param status The roster status value.
 * @returns The display label.
 */
export function rosterStatusLabel(status: RosterStatus): string {
    switch (status) {
        case 'in_lobby':
            return 'In lobby';
        case 'in_game':
            return 'In game';
        case 'spectating':
            return 'Spectating';
    }
}

/**
 * Derive the heading text for the roster card.
 *
 * - Connected with known count: `"Players online (N)"`
 * - Connected but count unknown: `"Players online (?)"`
 * - Not connected: `"Players online (?)"` (degraded)
 *
 * @param roster The current roster state.
 * @returns The heading text.
 */
export function rosterHeadingText(roster: RosterState): string {
    if (!roster.connected) {
        return 'Players online (?)';
    }
    return `Players online (${String(roster.players.length)})`;
}

// ----------------------------------------------------------------------------
// RosterCard component
// ----------------------------------------------------------------------------

/**
 * The lobby roster card: heading, entry list, and degraded state.
 *
 * Follows the existing lobby card pattern (`.europa-lobby__card`
 * container with a title heading and content below).
 */
export function RosterCard({ roster, ownHandle }: RosterCardProps): JSX.Element {
    const headingId = useId();
    const liveRegionRef = useRef<HTMLDivElement | null>(null);
    const [announcementText, setAnnouncementText] = useState<string>('');
    const prevCountRef = useRef<number>(roster.players.length);
    const prevHandlesRef = useRef<ReadonlySet<string>>(new Set<string>());

    const heading = useMemo(() => rosterHeadingText(roster), [roster]);

    // Coalesce roster change announcements (T-044). Announce when
    // the roster transitions from connected to disconnected, or when
    // the player count changes. Identical announcements within 500 ms
    // are suppressed by the LiveRegionAnnouncer's debounce — but since
    // we render our own live region here, we coalesce manually.
    const prevConnectedRef = useRef(roster.connected);
    useEffect(() => {
        const prevConnected = prevConnectedRef.current;
        const prevCount = prevCountRef.current;
        prevConnectedRef.current = roster.connected;

        // Degraded transition: announce once.
        if (prevConnected && !roster.connected) {
            setAnnouncementText('Presence data is not connected.');
            prevCountRef.current = 0;
            return;
        }

        // Count change: announce the new count.
        if (roster.connected && roster.players.length !== prevCount) {
            setAnnouncementText(`Players online: ${String(roster.players.length)}.`);
            prevCountRef.current = roster.players.length;
        }
    }, [roster.connected, roster.players.length]);

    // Track handle set for join/leave announcements.
    const currentHandles = useMemo(
        () => new Set<string>(roster.players.map((p: RosterEntry) => p.handle)),
        [roster.players],
    );
    useEffect(() => {
        const prev = prevHandlesRef.current;
        prevHandlesRef.current = currentHandles;

        if (!roster.connected) {
            return;
        }

        const joined: string[] = [];
        const left: string[] = [];
        for (const handle of currentHandles) {
            if (!prev.has(handle)) {
                joined.push(handle);
            }
        }
        for (const handle of prev) {
            if (!currentHandles.has(handle)) {
                left.push(handle);
            }
        }

        // Coalesce: announce at most one message per effect cycle.
        if (joined.length > 0) {
            const whom = joined.length === 1 ? joined[0] : `${String(joined.length)} players`;
            setAnnouncementText(`${whom} joined the lobby.`);
        } else if (left.length > 0) {
            const whom = left.length === 1 ? left[0] : `${String(left.length)} players`;
            setAnnouncementText(`${whom} left the lobby.`);
        }
    }, [currentHandles, roster.connected]);

    // -- Render ---------------------------------------------------------------

    if (!roster.connected) {
        return (
            <section className="europa-lobby__card europa-lobby__card--roster" aria-labelledby={headingId}>
                <h2 id={headingId} className="europa-lobby__card-title">
                    {heading}
                </h2>
                <div className="europa-lobby__roster-degraded" data-europa-roster-degraded="true">
                    <p className="europa-lobby__roster-degraded-title">Presence unavailable</p>
                    <p className="europa-lobby__roster-degraded-message">Presence data is not connected.</p>
                </div>
            </section>
        );
    }

    return (
        <section className="europa-lobby__card europa-lobby__card--roster" aria-labelledby={headingId}>
            <h2 id={headingId} className="europa-lobby__card-title">
                {heading}
            </h2>
            {/* Live region for coalesced roster-change announcements
                (T-044, WCAG 4.1.3 Status Messages). */}
            <div
                ref={liveRegionRef}
                aria-live="polite"
                aria-atomic="true"
                className="europa-visually-hidden"
                data-europa-roster-live="true"
            >
                {announcementText}
            </div>
            {roster.players.length === 0 ? (
                <p className="europa-lobby__roster-empty" data-europa-roster-empty="true">
                    No players online.
                </p>
            ) : (
                <ul className="europa-lobby__roster-list" aria-label="Players online" data-europa-roster-list="true">
                    {roster.players.map((entry: RosterEntry) => (
                        <RosterEntryRow
                            key={entry.handle}
                            entry={entry}
                            isOwn={ownHandle !== null && entry.handle === ownHandle}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}

// ----------------------------------------------------------------------------
// Entry row (inner component)
// ----------------------------------------------------------------------------

/**
 * A single roster entry row: handle, status badge, and optional
 * "(you)" indicator. Uses `role="listitem"` for screen-reader
 * semantics (WCAG 1.3.1).
 *
 * Status dot color: green for `in_lobby`, amber for `in_game`,
 * blue for `spectating`. Color is always paired with text (WCAG
 * 1.4.1 Use of Color).
 */
function RosterEntryRow({ entry, isOwn }: { readonly entry: RosterEntry; readonly isOwn: boolean }): JSX.Element {
    const statusLabel = rosterStatusLabel(entry.status);

    return (
        <li
            className={`europa-lobby__roster-entry${isOwn ? ' europa-lobby__roster-entry--own' : ''}`}
            data-roster-status={entry.status}
        >
            <span className="europa-lobby__roster-entry-handle">
                <bdi>{entry.handle}</bdi>
                {isOwn ? <span className="europa-lobby__roster-you">(you)</span> : null}
            </span>
            <span className="europa-lobby__roster-entry-status">
                <span
                    className={`europa-lobby__roster-status-dot europa-lobby__roster-status-dot--${entry.status}`}
                    aria-hidden="true"
                />
                <span className="europa-visually-hidden">{statusLabel}</span>
                <span className="europa-lobby__roster-entry-status-text" aria-hidden="true">
                    {statusLabel}
                </span>
            </span>
        </li>
    );
}
