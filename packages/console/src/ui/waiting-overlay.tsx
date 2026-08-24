/**
 * Waiting-for-opponent overlay — post-playtest UX fix (2026-08-23).
 *
 * Rendered over the board area while the console is joined but the
 * match has not yet started ticking (match still filling; see
 * {@link ../state/awaiting-start.ts} for the derivation). Replaces the
 * playtested "silent black grid" with an explicit, self-explanatory
 * waiting room: a centered plate ("Waiting for opponent to join…")
 * plus a subtle spinner.
 *
 * Accessibility contract (WCAG):
 *   - the appearance is announced ONCE through the shared
 *     {@link LiveRegionAnnouncer} (polite — informational, never an
 *     interruption), guarded by a ref so re-renders never re-announce
 *     (same pattern as TargetingOverlay);
 *   - the spinner is purely decorative (`aria-hidden`) — the visible
 *     text carries the information;
 *   - the overlay is pointer-transparent: it never intercepts clicks,
 *     never takes focus, and adds nothing to the Tab order (there is
 *     nothing interactive inside), so the contractual Q-A04 head
 *     sequence is untouched;
 *   - motion respects `prefers-reduced-motion` twice over: the
 *     App-owned subscription flips the `europa-waiting--reduced`
 *     modifier class (live, no remount needed), and the stylesheet's
 *     own `@media (prefers-reduced-motion: reduce)` guard stops the
 *     animation even if the class path is bypassed (Q-A07 /
 *     WCAG 2.3.3).
 *
 * Precedence: the caller renders this only while
 * `isAwaitingMatchStart(state)` holds. The moment status leaves
 * 'live' (reconnecting banner, expiry, game-over surfaces) or the
 * first real tick broadcast arrives (tick ≥ 1), the predicate drops
 * and this overlay unmounts — it can never stack with those UIs.
 */

import type { JSX } from 'react';
import { useEffect, useRef } from 'react';

import type { LiveRegionAnnouncer } from '../a11y/live-region';

/** The single announcement text (also the visible headline). */
export const WAITING_FOR_OPPONENT_MESSAGE = 'Waiting for opponent to join…';

/** Props for {@link WaitingOverlay}. */
export interface WaitingOverlayProps {
    /**
     * Optional shared announcer (App-owned LiveRegionAnnouncer); when
     * provided, the overlay's appearance is announced once, politely.
     */
    readonly announcer?: LiveRegionAnnouncer | undefined;
    /**
     * Current reduced-motion preference (App-owned subscription). When
     * true the spinner animation is disabled via a modifier class.
     */
    readonly reducedMotion?: boolean | undefined;
}

/**
 * The waiting-for-opponent overlay plate. Purely presentational and
 * pointer-transparent; visibility is decided entirely by the caller
 * (App) from the store-derived awaiting-start predicate.
 */
export function WaitingOverlay({ announcer, reducedMotion }: WaitingOverlayProps): JSX.Element {
    // Announce once per appearance through the shared channel. The ref
    // guard mirrors TargetingOverlay: StrictMode double-invocation and
    // ordinary re-renders must not repeat the announcement.
    const lastAnnouncedRef = useRef(false);
    useEffect(() => {
        if (announcer !== undefined && !lastAnnouncedRef.current) {
            announcer.announce(WAITING_FOR_OPPONENT_MESSAGE, 'polite');
            lastAnnouncedRef.current = true;
        }
    }, [announcer]);

    return (
        <div
            className={reducedMotion === true ? 'europa-waiting europa-waiting--reduced' : 'europa-waiting'}
            data-europa-waiting="true"
        >
            <div className="europa-waiting__plate">
                {/* Decorative spinner — hidden from AT; the text below is the
            information carrier (WCAG 1.1.1). */}
                <div aria-hidden="true" className="europa-waiting__pulse" />
                <p className="europa-waiting__text">{WAITING_FOR_OPPONENT_MESSAGE}</p>
            </div>
        </div>
    );
}
