/**
 * Participant strip — feature 010 (T-016, FR-020/US4 AC-5/SC-008).
 *
 * The match-HUD list of per-seat authoritative labels. Data flows ONE
 * way: server join ack → reducer session → {@link deriveSeatLabels} →
 * this component. The strip re-renders only when the SESSION changes
 * (join/reconnect), never per tick, so labels cannot flicker or drift
 * mid-match (SC-008's "remains correct after the first authoritative
 * tick" is structural: ticks do not touch `session`).
 *
 * Accessibility (FR-020 "distinct, accessible label for each player"):
 * a labelled `<ol>` landmark ("Match participants") with one list item
 * per seat whose content reads "Seat N: NAME (you)" for the local seat
 * and "Seat N: NAME" otherwise — each seat is a distinct, self-sufficient
 * label. Every server-provided name renders inside `<bdi>` (bidi
 * isolation; handles are hostile-but-valid — orchestration invariants
 * #2/#9): the isolate keeps an RTL or mixed-direction handle from
 * reordering the surrounding "Seat N:" sentence, while assistive tech
 * reads through `<bdi>` transparently, so the accessible name stays
 * the natural sentence. Unknown names render a neutral placeholder
 * outside any `<bdi>` (nothing user-supplied to isolate yet).
 *
 * Identity presentation: the session currently carries display values only
 * because handles are the preferred participant labels. Player IDs are
 * non-secret correlation data and may be carried or shown when useful;
 * bearer credentials are never participant-display data, and the server
 * remains authoritative for seat identity.
 */

import type { JSX } from 'react';

import type { ConsoleSession } from '../state/types';
import { deriveSeatLabels, hasVisibleLabels } from './seat-labels';

/** Props for {@link ParticipantStrip}. */
export interface ParticipantStripProps {
    /**
     * The console session (server-authoritative label source). Passed
     * whole so the derivation stays testable and the component never
     * reads any other state slice.
     */
    readonly session: ConsoleSession;
}

/**
 * Render the per-seat participant strip, or `null` while no naming
 * data exists (pre-join boots keep the HUD uncluttered).
 *
 * @param props See {@link ParticipantStripProps}.
 */
export function ParticipantStrip({ session }: ParticipantStripProps): JSX.Element | null {
    const labels = deriveSeatLabels(session);
    if (!hasVisibleLabels(labels)) {
        return null;
    }
    return (
        <section className="europa-participants" aria-label="Match participants" data-europa-participants="true">
            <ol className="europa-participants__list">
                {labels.map((label) => (
                    <li
                        key={label.seat}
                        className={
                            label.isLocal
                                ? 'europa-participants__seat europa-participants__seat--local'
                                : 'europa-participants__seat'
                        }
                        data-europa-seat={label.seat}
                    >
                        {`Seat ${String(label.seat)}: `}
                        {label.name !== null ? <bdi>{label.name}</bdi> : <span>—</span>}
                        {label.isLocal ? ' (you)' : ''}
                    </li>
                ))}
            </ol>
        </section>
    );
}
