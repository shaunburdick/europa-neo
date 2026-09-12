/**
 * Seat-label derivation — feature 010 (T-016, FR-020/FR-023).
 *
 * Pure, DOM-free derivation of per-participant labels from the console
 * session (the reducer's projection of the server-authoritative
 * `JoinAckPayload.players` array). The UI renders these verbatim inside
 * `<bdi>` isolation; this module never touches strings beyond passing
 * them through — handles are hostile-but-valid and are NOT sanitized,
 * truncated, or interpolated here (orchestration invariant #2/#9).
 *
 * Authority rule (spec FR-020): labels come ONLY from
 * `ConsoleState.session` — which the reducer fills exclusively from the
 * server's join ack (`players` + assigned `playerId`). No client-side
 * guesswork or transport reads. Handles are preferred labels; the
 * server-issued universal `PlayerId` is the fallback (issue #74: IDs are
 * non-secret correlation data, never credentials) and is never rendered
 * as a handle when one exists.
 *
 * Identity rule (issue #74): a participant is keyed by its server-issued
 * `PlayerId`, never by a numeric seat or by the handle text.
 * `session.participants` arrives in terrain placement-slot order, so the
 * 1-based `seat` field below is a presentation coordinate only. The local
 * participant is identified by `isLocal` (computed from `session.playerId`
 * in the reducer); a spectator has no local participant.
 */

import type { ConsoleSession, PlayerId } from '../state/types';

/** One rendered participant row: identity + presentation seat number. */
export interface SeatLabel {
    /** Server-issued universal identity for this participant. */
    readonly id: PlayerId;
    /** 1-based presentation seat number (not identity). */
    readonly seat: number;
    /**
     * The participant's preferred server-provided handle, or `null` when
     * no handle is known. The caller falls back to {@link SeatLabel.id}
     * when this is `null`.
     */
    readonly name: string | null;
    /** Whether this participant is the local viewer. */
    readonly isLocal: boolean;
}

/**
 * Derive per-participant labels from the session. Pure.
 *
 * Returns an empty array while no participants are known (pre-join), so
 * callers can skip rendering the strip entirely. Participants without a
 * handle still appear (with `name: null`), keeping seat numbering stable
 * across the join boundary.
 *
 * @param session The console session (server-authoritative projection).
 * @returns One {@link SeatLabel} per participant, in placement-slot order.
 */
export function deriveSeatLabels(session: ConsoleSession): ReadonlyArray<SeatLabel> {
    return session.participants.map((participant, index) => ({
        id: participant.id,
        seat: index + 1,
        name: participant.name,
        isLocal: participant.isLocal,
    }));
}

/**
 * Whether the strip has anything to render — the render gate. Every
 * participant always has a usable label (the handle when present, else
 * the canonical ID fallback), so this is exactly "at least one
 * participant is known". Pure.
 *
 * @param labels The derived participant labels.
 */
export function hasVisibleLabels(labels: ReadonlyArray<SeatLabel>): boolean {
    return labels.length > 0;
}
