/**
 * A waiting/status overlay that renders a plate with a decorative spinner
 * pulse and a configurable message.
 *
 * **Attributes/Props**:
 * - `message` — the waiting text shown below the spinner.
 * - `reducedMotion` — when true, disables the pulse animation by applying
 *   the `.europa-waiting--reduced` modifier class.
 *
 * **Accessibility**: the spinner div carries `aria-hidden="true"` so
 * screen readers skip it. The message text is rendered as plain paragraph
 * content. Respects `prefers-reduced-motion` via the `reducedMotion` prop
 * (WCAG 2.3.3).
 *
 * @example
 * ```tsx
 * <EuropaWaiting message="Waiting for opponent…" />
 * <EuropaWaiting message="Reconnecting…" reducedMotion />
 * ```
 */
export interface EuropaWaitingProps {
    /** The waiting text displayed below the spinner. */
    message?: string;
    /** When true, disables the pulse animation. */
    reducedMotion?: boolean;
}

export function EuropaWaiting({ message, reducedMotion }: EuropaWaitingProps) {
    return (
        <div className={`europa-waiting${reducedMotion ? ' europa-waiting--reduced' : ''}`}>
            <div className="europa-waiting__plate">
                <div className="europa-waiting__pulse" aria-hidden="true" />
                <p className="europa-waiting__text">{message}</p>
            </div>
        </div>
    );
}
