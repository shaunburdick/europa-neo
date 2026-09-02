import { EuropaElement } from '../base.js';

/**
 * `<europa-waiting>` — a waiting/status overlay web component.
 *
 * Renders a plate with a decorative spinner pulse and a configurable
 * message. The component wraps the catalog's `.europa-waiting` family
 * of classes (`__plate`, `__pulse`, `__text`) inside a shadow root.
 *
 * **Attributes**:
 * - `message` (string) — the waiting text shown below the spinner.
 * - `reduced-motion` (boolean) — when present, disables the pulse
 *   animation by applying the `.europa-waiting--reduced` modifier class
 *   to the internal root; the adopted catalog stylesheet carries the
 *   animation-suppressing rules, so they apply inside the shadow root.
 *
 * **Slots**: none — the message is driven entirely by the `message`
 * attribute, so there is no child projection and no `<slot>` element.
 *
 * **Accessibility**: the spinner div carries `aria-hidden="true"` so
 * screen readers skip it. The message text is rendered as plain paragraph
 * content. Respects `prefers-reduced-motion` via the `reduced-motion`
 * attribute (WCAG 2.3.3).
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
    /** The root `<div class="europa-waiting">` wrapper inside the shadow root. */
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
     * Create (once) or update the internal waiting DOM structure inside the
     * shadow root.
     *
     * Idempotent: on first call the full div tree is created inside the
     * shadow root (no `<slot>` — nothing projects); on subsequent calls only
     * classes and the message text content are refreshed.
     *
     * Catalog classes are applied directly to the internal wrapper
     * elements (not the host), per the web-components contract.
     */
    protected override render(): void {
        const shadow = this.ensureShadowRoot();

        if (this._root === null || this._plate === null || this._pulse === null || this._text === null) {
            const root = document.createElement('div');
            const plate = document.createElement('div');
            const pulse = document.createElement('div');
            const text = document.createElement('p');

            pulse.setAttribute('aria-hidden', 'true');

            plate.appendChild(pulse);
            plate.appendChild(text);
            root.appendChild(plate);
            shadow.appendChild(root);

            this._root = root;
            this._plate = plate;
            this._pulse = pulse;
            this._text = text;
        }

        const isReducedMotion = this.hasAttribute('reduced-motion');
        const message = this.getAttribute('message') ?? '';

        // Root wrapper classes — the reduced-motion modifier activates the
        // catalog's animation-suppressing rules inside the shadow root.
        const rootClasses = ['europa-waiting', isReducedMotion && 'europa-waiting--reduced'].filter(Boolean).join(' ');

        this._root.className = rootClasses;

        // Plate — structural, always the same class.
        this._plate.className = 'europa-waiting__plate';

        // Pulse — always present and always aria-hidden (decorative).
        this._pulse.className = 'europa-waiting__pulse';
        this._pulse.setAttribute('aria-hidden', 'true');

        // Text content — update when the message attribute changes.
        this._text.className = 'europa-waiting__text';
        if (this._text.textContent !== message) {
            this._text.textContent = message;
        }
    }
}
