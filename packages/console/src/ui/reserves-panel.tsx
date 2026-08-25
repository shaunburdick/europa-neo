/**
 * Reserves panel UI — Feature 005 (T069).
 *
 * The per-cell reserves control surface US4 adds (spec US4 AC-1/2,
 * Q-A05): a 0–90% slider in 10% steps plus ten digit buttons (0–9),
 * rendered for the focused cell. Both paths dispatch
 * `{ kind: 'setReserves', cell, percent }` through the `onSetReserves`
 * callback — the same action the digit keys produce via
 * {@link ../input/order-reserves!buildReservesAction}, so mouse-only
 * and keyboard-only players get identical wire orders (SC-005).
 *
 * Accessibility contract (Q-A05 + WCAG):
 *   - the slider is a native `<input type="range">` (implicit
 *     `role="slider"`) with explicit `aria-valuemin/max/now`,
 *     `aria-valuetext`, and an accessible name citing the cell;
 *   - arrow keys adjust the slider natively (10% per step);
 *   - every digit button carries the exact command label
 *     ("Set reserves to 70%") from
 *     {@link ../input/order-reserves!reservesDigitLabel};
 *   - buttons meet the WCAG 2.5.8 24×24 CSS-pixel minimum target
 *     size (enforced in `.europa-reserves__digit`);
 *   - the engaged value is mirrored with `aria-pressed` so state is
 *     never conveyed by looks alone;
 *   - when input is disabled (`status !== 'live'`) every control is
 *     disabled and drops out of the Tab order.
 *
 * JSDoc reference: Q-A05 (US4 portion) + spec US4 AC-1/2.
 */

import type { JSX } from 'react';

import { reservesDigitLabel } from '../input/order-reserves';
import type { Coord, ReservesPct } from '../state/types';

/** Slider bounds: engine domain is 0..9 → 0%..90%. */
const SLIDER_MIN_PCT = 0;
const SLIDER_MAX_PCT = 90;
/** Digit buttons 0..9 (index === engine reserves digit). */
const DIGITS: readonly ReservesPct[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Props for {@link ReservesPanel}. */
export interface ReservesPanelProps {
    /** The focused cell the panel controls. */
    readonly cell: Coord;
    /** Current reserves digit on that cell (0..9). */
    readonly currentPercent: ReservesPct;
    /** Whether orders may be issued right now (drives disabled state). */
    readonly disabled: boolean;
    /** Dispatch sink — issues `{ kind: 'setReserves', cell, percent }`. */
    readonly onSetReserves: (percent: ReservesPct) => void;
}

/**
 * The reserves panel: slider + 0–9 digit buttons for the focused
 * cell. Render nothing meaningful without a cell — callers guard.
 */
export function ReservesPanel({ cell, currentPercent, disabled, onSetReserves }: ReservesPanelProps): JSX.Element {
    const currentPct = currentPercent * 10;

    return (
        <section id="reserves-panel" aria-label="Reserves control" className="europa-reserves">
            <label className="europa-reserves__label" htmlFor="reserves-slider">
                Reserves at ({cell.x}, {cell.y}): {currentPct}%
            </label>
            <input
                id="reserves-slider"
                className="europa-reserves__slider europa-focus-ring"
                type="range"
                min={SLIDER_MIN_PCT}
                max={SLIDER_MAX_PCT}
                step={10}
                value={currentPct}
                disabled={disabled}
                aria-label={`Reserves for cell (${cell.x}, ${cell.y})`}
                aria-valuemin={SLIDER_MIN_PCT}
                aria-valuemax={SLIDER_MAX_PCT}
                aria-valuenow={currentPct}
                aria-valuetext={`${currentPct}%`}
                onChange={(event) => {
                    const pct = Number.parseInt(event.currentTarget.value, 10);
                    onSetReserves((pct / 10) as ReservesPct);
                }}
            />
            <div className="europa-reserves__digits" role="group" aria-label="Reserve presets">
                {DIGITS.map((digit) => (
                    <button
                        key={digit}
                        type="button"
                        className="europa-reserves__digit europa-focus-ring"
                        aria-label={reservesDigitLabel(digit)}
                        aria-pressed={digit === currentPercent}
                        disabled={disabled}
                        onClick={() => {
                            onSetReserves(digit);
                        }}
                    >
                        {digit}
                    </button>
                ))}
            </div>
        </section>
    );
}
