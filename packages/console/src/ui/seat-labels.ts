/**
 * Seat-label derivation — feature 010 (T-016, FR-020/FR-023).
 *
 * Pure, DOM-free derivation of per-seat participant labels from the
 * console session (the reducer's projection of the server-authoritative
 * `JoinAckPayload.players` array). The UI renders these verbatim inside
 * `<bdi>` isolation; this module never touches strings beyond passing
 * them through — handles are hostile-but-valid and are NOT sanitized,
 * truncated, or interpolated here (orchestration invariant #2/#9).
 *
 * Authority rule (spec FR-020): labels come ONLY from
 * `ConsoleState.session` — which the reducer fills exclusively from the
 * server's join ack (`players` + assigned `playerId`). No client-side
 * guesswork or transport reads. Handles are preferred labels; a server-
 * resolved player ID is non-secret correlation data and may be used as a
 * fallback or displayed where useful. Bearer credentials never belong in
 * labels.
 *
 * Reconstruction rule: `opponents` holds the other players' display
 * names in ascending PlayerId order (reducer `joined` arm), and the
 * local seat — when seated — is `playerId`. Walking seats `1..N` and
 * drawing non-local names from the opponents queue in order rebuilds
 * the exact server ordering deterministically. A spectator (`playerId
 * === null`) has no local seat, so every seat maps straight from the
 * queue; the spectator fold stores ALL participants in `opponents`
 * (ascending), matching FR-023's "spectator views MAY expose all
 * participant handles".
 */

import type { ConsoleSession } from '../state/types';

/** One rendered seat row: 1-based seat number plus its label source. */
export interface SeatLabel {
    /** 1-based seat number (engine `PlayerId` domain). */
    readonly seat: number;
    /**
     * The server-provided display value for this seat, or `null` when
     * unknown (seat occupancy/names not yet delivered). Rendered inside
     * `<bdi>` by the caller; when absent, the caller may use a generic
     * fallback rather than inventing a server identity here.
     */
    readonly name: string | null;
    /** Whether this seat belongs to the local viewer. */
    readonly isLocal: boolean;
}

/**
 * Derive per-seat labels from the session. Pure.
 *
 * Returns an empty array while no names are known at all (pre-join),
 * so callers can skip rendering the strip entirely. Seats whose names
 * are unknown still appear (with `name: null`) once ANY naming data
 * exists, keeping seat numbering stable across the join boundary.
 *
 * @param session The console session (server-authoritative projection).
 * @returns One {@link SeatLabel} per seat, ascending.
 */
export function deriveSeatLabels(session: ConsoleSession): ReadonlyArray<SeatLabel> {
    const { playerId, displayName, opponents } = session;
    const seated = playerId !== null;
    const seatCount = opponents.length + (seated ? 1 : 0);
    if (seatCount === 0) {
        return [];
    }

    const labels: SeatLabel[] = [];
    let opponentIndex = 0;
    for (let seat = 1; seat <= seatCount; seat++) {
        if (seated && seat === playerId) {
            labels.push({ seat, name: displayName.length > 0 ? displayName : null, isLocal: true });
            continue;
        }
        const name = opponents[opponentIndex];
        opponentIndex += 1;
        labels.push({ seat, name: name !== undefined && name.length > 0 ? name : null, isLocal: false });
    }
    return labels;
}

/**
 * Whether any seat carries a usable label — the strip's render gate.
 * Pure; mirrors {@link deriveSeatLabels}' empty/unnamed handling so
 * the component stays a dumb renderer.
 *
 * @param labels The derived seat labels.
 */
export function hasVisibleLabels(labels: ReadonlyArray<SeatLabel>): boolean {
    return labels.some((label) => label.name !== null);
}
