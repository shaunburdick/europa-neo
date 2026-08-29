/**
 * Lobby presentation helpers — feature 010 (T-015).
 *
 * Pure string/label derivation for the landing UI: occupancy text,
 * status labels, settings summaries, connection wording, and the
 * code→message mapping for failed lobby actions (FR-018: recoverable
 * failures are values; the UI turns them into actionable English).
 *
 * Deliberately DOM-free so node-mode unit tests can pin every player-
 * visible phrase without a browser (the components consume these —
 * they never inline their own copy for the concepts covered here).
 *
 * Error-message policy: server `message` strings are preferred
 * verbatim when present (already sanitized by the transport client's
 * redaction choke point); the code-derived fallbacks below cover the
 * client-synthesized codes (`timeout`/`transport`) and any unknown
 * additive wire code (tolerance rule). Handles are hostile-but-valid:
 * no helper here ever concatenates a handle into a sentence — the
 * components render handles inside `<bdi>` at the call site instead.
 */

import type { LobbyStatus, PublicLobbyEntry } from '@europa/matchmaking';
import type { LobbyConnectionState } from '../net/ws-lobby-client';
import type { LobbyActionError } from '../state/lobby-state';

// ----------------------------------------------------------------------------
// Connection + identity wording
// ----------------------------------------------------------------------------

/**
 * Human-readable text for each transport connection state, rendered in
 * the identity card's status line (distinct from identity status per
 * the task contract).
 *
 * @param connection The current lobby connection lifecycle.
 */
export function connectionLabel(connection: LobbyConnectionState): string {
    switch (connection) {
        case 'idle':
            return 'Not connected';
        case 'connecting':
            return 'Connecting to lobby…';
        case 'ready':
            return 'Connected';
        case 'disconnected':
            return 'Connection lost';
        case 'reconnecting':
            return 'Reconnecting to lobby…';
        case 'failed':
            return 'Connection failed';
        case 'closed':
            return 'Disconnected';
    }
}

/**
 * Human-readable identity-status line: what the visitor can do right
 * now with respect to naming themselves.
 *
 * @param identityStatus The guest-identity lifecycle.
 * @param handle The confirmed display handle (`null` while unnamed).
 */
export function identityStatusLabel(identityStatus: 'unnamed' | 'named' | 'restoring', handle: string | null): string {
    if (identityStatus === 'restoring') {
        return 'Restoring your session…';
    }
    return identityStatus === 'named' && handle !== null ? 'Ready to play' : 'Choose a name to play';
}

// ----------------------------------------------------------------------------
// Match-row wording
// ----------------------------------------------------------------------------

/**
 * Human-readable lifecycle label for one public entry (FR-007's two
 * actionable states; finished matches are never projected). Complements
 * the FR-003 (012) capacity chrome (`formatOccupancy` + `formatEntrySettings`)
 * that together render the lobby row's `k/N` + board label for `N ∈ {2,3,4}`.
 *
 * @param status The entry's lobby status.
 */
export function lobbyStatusLabel(status: LobbyStatus): string {
    return status === 'waiting' ? 'Waiting for players' : 'In progress';
}

/**
 * Occupancy fragment — capacity chrome for FR-003 (012).
 *
 * Renders `k/N` as `"k of N seats filled"` (e.g. `1/2 → "1 of 2 seats filled"`,
 * `2/3 → "2 of 3 seats filled"`, `3/4 → "3 of 4 seats filled"`), derived
 * from `PublicLobbyEntry {capacity, seatsFilled}` where `capacity` is
 * `playerCount` (`N ∈ {2,3,4}`). No new protocol field; private entries are
 * filtered before projection per 010 FR-015.
 *
 * @param seatsFilled Currently occupied seats (k).
 * @param capacity Total seats (N).
 */
export function formatOccupancy(seatsFilled: number, capacity: number): string {
    return `${String(seatsFilled)} of ${String(capacity)} seats filled`;
}

/**
 * Short settings summary for one row (FR-006 + FR-003 board label for 012),
 * e.g. `"32×32 board · 250 ms ticks"` through `"48×48 board · 250 ms ticks"`.
 * Derived from `PublicLobbyEntry {boardSize, tickIntervalMs}` where `boardSize`
 * is `32|48|64` for `N ∈ {2,3,4}` (FR-001 defaults: 2→32, 3→48, 4→48;
 * overrideable). The public projection carries only board size and tick
 * cadence — terrain detail is deliberately absent from listings (privacy
 * envelope, spec FR-006). Private entries never reach this helper (010 FR-015).
 *
 * @param entry The public entry to summarize.
 */
export function formatEntrySettings(entry: PublicLobbyEntry): string {
    return `${String(entry.boardSize)}×${String(entry.boardSize)} board · ${String(entry.tickIntervalMs)} ms ticks`;
}

/**
 * Whether Join may be offered for an entry (FR-007: open WAITING
 * matches only — a full waiting match is about to auto-start and must
 * not advertise a seat that no longer exists). Derived from
 * `PublicLobbyEntry {status, capacity, seatsFilled}` where `capacity` is
 * `playerCount` (`N ∈ {2,3,4}`); no new protocol field, private entries
 * filtered before projection (010 FR-015).
 *
 * @param entry The entry to judge.
 */
export function isJoinable(entry: PublicLobbyEntry): boolean {
    return entry.status === 'waiting' && entry.seatsFilled < entry.capacity;
}

/**
 * Build the accessible name for a row action button. Visible button
 * text stays short ("Join"/"Spectate"); this label adds the row
 * context screen readers need to tell rows apart without reading the
 * whole row (WCAG 2.4.6/4.1.2). Contains the visible word first.
 * Context includes FR-003 (012) capacity chrome (`k/N` via
 * `formatOccupancy` where `N ∈ {2,3,4}`) + lifecycle label, derived from
 * `PublicLobbyEntry {capacity, seatsFilled, status}`; no new protocol
 * field, private entries never projected (010 FR-015).
 *
 * @param action Which action the button performs.
 * @param entry The row the button belongs to.
 */
export function rowActionLabel(action: 'join' | 'spectate', entry: PublicLobbyEntry): string {
    const context = `${lobbyStatusLabel(entry.status)}, ${formatOccupancy(entry.seatsFilled, entry.capacity)}`;
    return action === 'join' ? `Join match — ${context}` : `Spectate match — ${context}`;
}

// ----------------------------------------------------------------------------
// Snapshot-diff wording (FR-013 lobby-update announcements)
// ----------------------------------------------------------------------------

/**
 * Describe what changed between two snapshots in ONE screen-reader
 * sentence (or `null` when nothing visible changed). Row identity is
 * the stable `matchId`; recognized changes are additions, removals,
 * waiting→in-progress starts, and occupancy updates (FR-013's mutation
 * families). Deliberately terse — ids are UUIDs and would be noise in
 * speech; counts carry the information.
 *
 * @param previous The previously rendered entries (empty array on baseline).
 * @param next The newly applied entries.
 */
export function describeSnapshotChange(
    previous: ReadonlyArray<PublicLobbyEntry>,
    next: ReadonlyArray<PublicLobbyEntry>,
): string | null {
    const previousById = new Map(previous.map((entry) => [entry.matchId, entry] as const));
    const nextById = new Map(next.map((entry) => [entry.matchId, entry] as const));

    let added = 0;
    let removed = 0;
    let started = 0;
    let updated = 0;
    for (const entry of next) {
        if (!previousById.has(entry.matchId)) {
            added += 1;
        }
    }
    for (const [matchId, entry] of previousById) {
        const current = nextById.get(matchId);
        if (current === undefined) {
            removed += 1;
        } else if (entry.status === 'waiting' && current.status === 'in_progress') {
            started += 1;
        } else if (entry.seatsFilled !== current.seatsFilled || entry.capacity !== current.capacity) {
            updated += 1;
        }
    }

    const parts: string[] = [];
    if (added > 0) {
        parts.push(added === 1 ? 'A new match was listed.' : `${String(added)} new matches were listed.`);
    }
    if (started > 0) {
        parts.push(started === 1 ? 'A match started.' : `${String(started)} matches started.`);
    }
    if (updated > 0) {
        parts.push(updated === 1 ? 'A match was updated.' : `${String(updated)} matches were updated.`);
    }
    if (removed > 0) {
        parts.push(removed === 1 ? 'A match left the list.' : `${String(removed)} matches left the list.`);
    }
    if (parts.length === 0 && previous.length > 0 && next.length === 0) {
        // Defensive arm (removals above already cover it); keeps the
        // empty-state transition announced even if removal counting
        // changes shape later.
        return 'The lobby list is now empty.';
    }
    return parts.length === 0 ? null : parts.join(' ');
}

// ----------------------------------------------------------------------------
// Action-error wording (FR-018)
// ----------------------------------------------------------------------------

/**
 * Map a failed lobby action to actionable user-facing text. Server
 * messages win verbatim when present; otherwise the closed code union
 * drives a fallback (unknown additive codes get the generic branch —
 * tolerance rule). `detail` currently carries dotted settings-field
 * rejections (`settings.playerCount`, …); the create form renders
 * those at its fields, so this mapping stays message-level.
 *
 * @param error The normalized action error from the store slot.
 * @returns The sentence to render/announce (no trailing period —
 *   callers join sentences).
 */
export function describeActionError(error: LobbyActionError): string {
    if (error.message.trim().length > 0) {
        return error.message;
    }
    switch (error.code) {
        case 'handle_invalid':
            return 'That name was rejected.';
        case 'handle_taken':
            return 'That name is already in use — choose another.';
        case 'identity_invalid':
            return 'Your session is no longer valid.';
        case 'identity_expired':
            return 'Your session expired — starting fresh.';
        case 'server_restarted':
            return 'The server restarted — the lobby was reset.';
        case 'match_not_found':
            return 'That match is no longer available.';
        case 'match_full':
            return 'That match just filled up.';
        case 'match_not_joinable':
            return 'That match is not open for that action.';
        case 'identity_in_match':
            return 'You are already seated in a match.';
        case 'internal_error':
            return 'The server hit an unexpected error — try again.';
        case 'timeout':
            return 'The server did not respond in time — try again.';
        case 'transport':
            return 'The connection dropped before the action completed.';
        default:
            return 'The action could not be completed — try again.';
    }
}
