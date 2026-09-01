/**
 * Waiting-for-opponent overlay — post-playtest UX fix (2026-08-23),
 * extended for N-player filling rooms (feature 012 FR-005).
 *
 * Rendered over the board area while the console is joined but the
 * match has not yet started ticking (match still filling; see
 * {@link ../state/awaiting-start.ts} for the derivation). Replaces the
 * playtested "silent black grid" with an explicit, self-explanatory
 * waiting room: a centered plate plus a subtle spinner.
 *
 * Headline resolution (see {@link resolveWaitingMessage}):
 *   1. an explicit `message` prop wins (hosts that already compute their
 *      own copy, e.g. the lobby, pass it verbatim);
 *   2. when both `seatsFilled` and `capacity` are supplied the overlay
 *      renders the N-aware "Waiting for N-k more players… (k/N)" copy via
 *      {@link formatWaitingMessage};
 *   3. legacy callers that pass neither fall back to the original single-
 *      opponent string {@link WAITING_FOR_OPPONENT_MESSAGE}.
 *
 * Accessibility contract (WCAG):
 *   - the appearance is announced ONCE through the shared
 *     {@link LiveRegionAnnouncer} (polite — informational, never an
 *     interruption), guarded by a ref so identical re-renders never re-
 *     announce (same pattern as TargetingOverlay). The guard tracks the
 *     last announced *string*, so the copy updates politely when the seat
 *     count changes without spamming unchanged re-renders (WCAG 4.1.3);
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
import { formatWaitingMessage } from '../state/awaiting-start';

// JSX intrinsic declaration for the <europa-waiting> web component from
// @europa/design. The component is registered at runtime by T-066; this
// declaration lets TypeScript accept the tag in JSX.
declare module 'react' {
    namespace JSX {
        interface IntrinsicElements {
            'europa-waiting': {
                message?: string;
                'reduced-motion'?: '' | boolean;
            };
        }
    }
}

/** The legacy single-opponent headline (also the visible fallback). */
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
    /**
     * Explicit headline override. When provided it is rendered and
     * announced verbatim, taking precedence over the derived N-aware copy
     * below. Hosts that already compute their own copy (e.g. the lobby)
     * pass it here.
     */
    readonly message?: string | undefined;
    /**
     * Currently occupied seats (k, 1 ≤ k < N). When both this and
     * `capacity` are supplied (and `message` is not), the overlay renders
     * the N-aware "Waiting for N-k more players… (k/N)" copy via
     * {@link formatWaitingMessage}.
     */
    readonly seatsFilled?: number | undefined;
    /**
     * Total seats (N, 2|3|4). Paired with `seatsFilled` to derive the
     * N-aware headline.
     */
    readonly capacity?: number | undefined;
}

/**
 * Resolve the headline text for {@link WaitingOverlay} from its props.
 *
 * Precedence (see {@link WaitingOverlayProps}):
 *   1. explicit `message` override;
 *   2. N-aware `formatWaitingMessage(seatsFilled, capacity)` when both seat
 *      counts are supplied;
 *   3. the legacy single-opponent string for legacy callers that pass
 *      neither.
 *
 * Pure — no clock, no randomness.
 *
 * @param props The overlay props (only `message`, `seatsFilled`, and
 *   `capacity` influence the result).
 * @returns The headline to render and announce.
 */
export function resolveWaitingMessage(props: WaitingOverlayProps): string {
    if (props.message !== undefined) {
        return props.message;
    }
    if (props.seatsFilled !== undefined && props.capacity !== undefined) {
        return formatWaitingMessage(props.seatsFilled, props.capacity);
    }
    return WAITING_FOR_OPPONENT_MESSAGE;
}

/**
 * The waiting-for-opponent overlay plate. Purely presentational and
 * pointer-transparent; visibility is decided entirely by the caller
 * (App) from the store-derived awaiting-start predicate.
 */
export function WaitingOverlay({
    announcer,
    reducedMotion,
    message,
    seatsFilled,
    capacity,
}: WaitingOverlayProps): JSX.Element {
    const headline = resolveWaitingMessage({ message, seatsFilled, capacity });

    // Announce once per distinct headline through the shared channel. The
    // ref guard mirrors TargetingOverlay: StrictMode double-invocation and
    // ordinary re-renders must not repeat the announcement. Tracking the
    // last announced *string* (rather than a bare boolean) lets the copy
    // update politely when the seat count changes without spamming
    // identical re-renders (WCAG 4.1.3).
    const lastAnnouncedRef = useRef<string | null>(null);
    useEffect(() => {
        if (announcer !== undefined && headline !== lastAnnouncedRef.current) {
            announcer.announce(headline, 'polite');
            lastAnnouncedRef.current = headline;
        }
    }, [announcer, headline]);

    // The <europa-waiting> web component handles the plate, spinner
    // (aria-hidden), and text internally via light DOM. We pass the
    // resolved headline and reduced-motion flag as attributes.
    const motionAttr = reducedMotion === true ? 'reduced-motion' : undefined;

    return (
        <europa-waiting
            message={headline}
            {...(motionAttr !== undefined ? { [motionAttr]: '' } : {})}
        />
    );
}
