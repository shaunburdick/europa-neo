/**
 * Targeting overlay — Feature 005 (T062).
 *
 * The only new visual element US3 adds: a crosshair + subcell
 * indicator drawn over the focused cell, showing the cell as the
 * ring-1 / ring-2 "local map" of the original subcell scheme
 * (research.md §2; `europa-source/.../controls.html` documents the
 * black center / yellow ring-1 / blue ring-2 layout — reimplemented
 * from documented behavior only).
 *
 * Accessibility contract (T059 + WCAG):
 *   - the aim is announced via an `aria-live="polite"` status node
 *     ("Paratroop target: (7, 3)") whenever the BINNED target changes;
 *     raw pixel movement never re-announces (WCAG 4.1.3 anti-spam);
 *   - when a {@link LiveRegionAnnouncer} instance is supplied it also
 *     receives the announcement (shared channel with order feedback);
 *   - the visual grid/dot layer is `aria-hidden` — the ARIA grid
 *     remains the board's a11y source of truth — while the pointer-
 *     transparent container keeps the map fully clickable;
 *   - no animation is used for the crosshair itself; flash-style
 *     motion and its `prefers-reduced-motion` handling arrive with
 *     Phase 7's reduced-motion module (T074) per task text.
 */

import type { JSX } from 'react';
import { useEffect, useRef } from 'react';

import type { LiveRegionAnnouncer } from '../a11y/live-region';
import { subcellToTargetCoord } from '../input/subcell';
import type { Coord, SubcellPosition } from '../state/types';

/** Props for {@link TargetingOverlay}. */
export interface TargetingOverlayProps {
    /** The anchor cell (the focused/launch cell). */
    readonly cell: Coord;
    /** Cell size in CSS pixels (camera zoom). */
    readonly zoom: number;
    /** Cursor position within the anchor cell (`[0,1)²`). */
    readonly subcell: SubcellPosition;
    /**
     * Ability label prefix, e.g. `"Paratroop target"`. The full
     * announcement is `<label>: (<tx>, <ty>)`.
     */
    readonly abilityLabel: string;
    /**
     * Optional shared announcer (App-owned LiveRegionAnnouncer); when
     * provided, target changes are announced through it as well.
     */
    readonly announcer?: LiveRegionAnnouncer | undefined;
}

/**
 * Format the overlay's announcement for one aiming posture. Pure.
 *
 * A centered/stale cursor means "no launch": the message says so and
 * cites the focused cell (Q-A05 US3 portion).
 *
 * @param abilityLabel Label prefix ("Paratroop target").
 * @param source       The focused cell.
 * @param target       The binned destination, or `null` when centered.
 */
export function formatTargetingLabel(abilityLabel: string, source: Coord, target: Coord | null): string {
    if (target === null) {
        return `No launch — cursor centered on (${source.x}, ${source.y})`;
    }
    return `${abilityLabel}: (${target.x}, ${target.y})`;
}

/**
 * Compute the binned target for display purposes (pure projection of
 * the current aim; NOT a preflight — the firing path owns that).
 *
 * @param source  The focused cell.
 * @param subcell Cursor position within it.
 */
export function aimingTarget(source: Coord, subcell: SubcellPosition): Coord {
    return subcellToTargetCoord(source, subcell);
}

/**
 * The crosshair + subcell indicator overlay. Render nothing when the
 * anchor cell is null (caller decides visibility).
 */
export function TargetingOverlay({ cell, zoom, subcell, abilityLabel, announcer }: TargetingOverlayProps): JSX.Element {
    const target = aimingTarget(cell, subcell);
    const selfTarget = target.x === cell.x && target.y === cell.y;
    const label = formatTargetingLabel(abilityLabel, cell, selfTarget ? null : target);

    // Announce through the shared announcer on binned-target change.
    const lastLabelRef = useRef<string | null>(null);
    useEffect(() => {
        if (announcer !== undefined && lastLabelRef.current !== label) {
            announcer.announce(label, 'polite');
            lastLabelRef.current = label;
        }
    }, [announcer, label]);

    return (
        <div
            className="europa-targeting"
            style={{
                position: 'absolute',
                left: cell.x * zoom,
                top: cell.y * zoom,
                width: zoom,
                height: zoom,
                pointerEvents: 'none',
                zIndex: 3,
            }}
        >
            {/* Visual layer: ring grid + aim dot. Hidden from AT — the
          announcement node below carries the same information. */}
            <div aria-hidden="true" className="europa-targeting__rings" style={{ position: 'absolute', inset: 0 }}>
                <div
                    className="europa-targeting__dot"
                    style={{
                        position: 'absolute',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: '#f87171',
                        border: '1px solid #111827',
                        left: `calc(${subcell.x * 100}% - 3px)`,
                        top: `calc(${subcell.y * 100}% - 3px)`,
                    }}
                />
            </div>
            {/* Status node: announces aim changes without moving focus. */}
            <div role="status" aria-live="polite" className="europa-visually-hidden">
                {label}
            </div>
        </div>
    );
}
