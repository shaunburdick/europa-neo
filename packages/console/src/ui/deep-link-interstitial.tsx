/**
 * Deep-link interstitial — issue #34 (T-034-06).
 *
 * Play-or-spectate choice shown to non-participants who open
 * `/match/<matchId>` via a deep link (FR-029). Renders match
 * identification, action buttons, and a return-to-lobby escape hatch.
 *
 * Two entry modes:
 *   - `player`: seats are open — shows Play + Spectate buttons.
 *   - `spectator`: match is full/running/collected — shows Spectate only.
 *
 * Accessibility: `role="region"` with `aria-labelledby`, initial focus
 * on the heading, keyboard-navigable action buttons, and screen-reader
 * announcement via the shared `LiveRegionAnnouncer`.
 *
 * @module
 */

import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import type { LiveRegionAnnouncer } from '../a11y/live-region';
import type { RouteEntry } from '../routing/route-adapter';
import type { MatchId } from '../state/types';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/** Props for {@link DeepLinkInterstitial}. */
export interface DeepLinkInterstitialProps {
    /** The target match identifier. */
    readonly matchId: MatchId;
    /**
     * The resolved route entry from `adaptRoute` — determines which
     * action buttons are shown.
     */
    readonly entry: Extract<RouteEntry, { readonly kind: 'player' | 'spectator' }>;
    /** Called when the user chooses to play (seats open). */
    readonly onPlay: () => void;
    /** Called when the user chooses to spectate. */
    readonly onSpectate: () => void;
    /** Called when the user chooses to return to the lobby. */
    readonly onReturnToLobby: () => void;
    /** Shared live-region announcer (optional — tests may omit). */
    readonly announcer?: LiveRegionAnnouncer | undefined;
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

/**
 * Play-or-spectate interstitial for deep-link entry (FR-029).
 *
 * Shows the match ID, action buttons appropriate to the entry type,
 * and a "Return to lobby" link. Announces its appearance via the
 * shared live region and focuses the heading on mount.
 *
 * @example
 * ```tsx
 * <DeepLinkInterstitial
 *     matchId={matchId}
 *     entry={{ kind: 'player', route, matchId, intent: 'adaptive' }}
 *     onPlay={() => executeRouteEntry(entry, controller)}
 *     onSpectate={() => executeRouteEntry(spectatorEntry, controller)}
 *     onReturnToLobby={() => navigateTo('/lobby')}
 * />
 * ```
 */
export function DeepLinkInterstitial({
    matchId,
    entry,
    onPlay,
    onSpectate,
    onReturnToLobby,
    announcer,
}: DeepLinkInterstitialProps): JSX.Element {
    const headingRef = useRef<HTMLHeadingElement | null>(null);

    // Focus the heading on mount (WCAG 2.4.3 — same pattern as
    // MatchLegHost and RouteNotice).
    useEffect(() => {
        headingRef.current?.focus();
    }, []);

    // Announce the interstitial once via the shared live region.
    const announcedRef = useRef(false);
    useEffect(() => {
        if (announcer !== undefined && !announcedRef.current) {
            const message =
                entry.kind === 'player'
                    ? 'This match is available. Choose Play to join or Spectate to watch.'
                    : 'This match is in progress. Choose Spectate to watch.';
            announcer.announce(message, 'polite');
            announcedRef.current = true;
        }
    }, [announcer, entry.kind]);

    const matchIdDisplay = matchId.slice(0, 8);
    const isPlayer = entry.kind === 'player';

    return (
        <main id="main" className="europa-lobby" data-europa-deep-link-interstitial="true">
            <section
                className="europa-deep-link-interstitial europa-focus-ring"
                aria-labelledby="deep-link-interstitial-heading"
                tabIndex={-1}
            >
                <h1
                    ref={headingRef}
                    id="deep-link-interstitial-heading"
                    className="europa-deep-link-interstitial__heading europa-focus-ring"
                    tabIndex={-1}
                >
                    Match found
                </h1>
                <p className="europa-deep-link-interstitial__match-id">
                    Match <bdi>{matchIdDisplay}…</bdi>
                </p>
                <div className="europa-deep-link-interstitial__actions">
                    {isPlayer ? (
                        <button
                            type="button"
                            className="europa-lobby__button europa-focus-ring"
                            onClick={onPlay}
                            data-europa-deep-link-play="true"
                        >
                            Play
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className="europa-lobby__button europa-focus-ring"
                        onClick={onSpectate}
                        data-europa-deep-link-spectate="true"
                    >
                        Spectate
                    </button>
                </div>
                <div className="europa-deep-link-interstitial__footer">
                    <button
                        type="button"
                        className="europa-lobby__button europa-focus-ring"
                        onClick={onReturnToLobby}
                        data-europa-deep-link-return="true"
                    >
                        Return to lobby
                    </button>
                </div>
            </section>
        </main>
    );
}
