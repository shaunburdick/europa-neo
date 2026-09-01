import { EuropaElement } from '../base.js';

/**
 * `<europa-waiting>` — a waiting/status overlay web component.
 *
 * Renders a plate with a decorative spinner pulse and a configurable
 * message. The component wraps the catalog's `.europa-waiting` family
 * of classes (`__plate`, `__pulse`, `__text`) in light DOM.
 *
 * **Attributes**:
 * - `message` (string) — the waiting text shown below the spinner.
 * - `reduced-motion` (boolean) — when present, disables the pulse
 *   animation by applying the `.europa-waiting--reduced` modifier class
 *   and suppressing the CSS animation.
 *
 * **Slots**: none — the message is driven entirely by the `message`
 * attribute.
 *
 * **Accessibility**: the spinner div carries `aria-hidden="true"` so
 * screen readers skip it. The message text is announced via a live
 * region when the component appears. Respects `prefers-reduced-motion`
 * (WCAG 2.3.3).
 *
 * Does NOT auto-register (FR-004). The consumer calls
 * `register()` from `@europa/design/components` to define the tag.
 *
 * @example
 * ```html
 * <europa-waiting message="Waiting for opponent…"></europa-waiting>
 * <europa-waiting message="Reconnecting…" reduced-motion></europa-waiting>
 * ```
 */
export class EuropaWaiting extends EuropaElement {
    /** The root `<div class="europa-waiting">` wrapper. */
    private _root: HTMLDivElement | null = null;

    /** The plate `<div class="europa-waiting__plate">`. */
    private _plate: HTMLDivElement | null = null;

    /** The spinner `<div class="europa-waiting__pulse">`. */
    private _pulse: HTMLDivElement | null = null;

    /** The message `<p class="europa-waiting__text">`. */
    private _text: HTMLParagraphElement | null = null;

    /**
     * The attributes this component observes. Changes trigger a re-render
     * via {@link EuropaElement.attributeChangedCallback}.
     *
     * @returns The observed attribute names.
     */
    static override get observedAttributes(): string[] {
        return ['message', 'reduced-motion'];
    }

    /**
     * Create (once) or update the internal waiting DOM structure.
     *
     * Idempotent: on first call the full div tree is created and appended;
     * on subsequent calls only classes, text content, and the
     * `aria-hidden` / reduced-motion modifier are refreshed.
     *
     * Catalog classes are applied directly to the internal wrapper
     * elements (not the host), per the web-components contract.
     */
    protected override render(): void {
        if (this._root === null) {
            this._root = document.createElement('div');
            this._plate = document.createElement('div');
            this._pulse = document.createElement('div');
            this._text = document.createElement('p');

            this._pulse.setAttribute('aria-hidden', 'true');

            this._plate.appendChild(this._pulse);
            this._plate.appendChild(this._text);
            this._root.appendChild(this._plate);
            this.appendChild(this._root);
        }

        const isReducedMotion = this.hasAttribute('reduced-motion');
        const message = this.getAttribute('message') ?? '';

        // Root wrapper classes.
        const rootClasses = ['europa-waiting', isReducedMotion && 'europa-waiting--reduced'].filter(Boolean).join(' ');

        this._root.className = rootClasses;

        // Plate — structural, always the same class.
        if (this._plate !== null) {
            this._plate.className = 'europa-waiting__plate';
        }

        // Pulse — always present and always aria-hidden (decorative).
        if (this._pulse !== null) {
            this._pulse.className = 'europa-waiting__pulse';
            this._pulse.setAttribute('aria-hidden', 'true');
        }

        // Text content — update when the message attribute changes.
        if (this._text !== null) {
            this._text.className = 'europa-waiting__text';

            if (this._text.textContent !== message) {
                this._text.textContent = message;
            }
        }
    }
}
