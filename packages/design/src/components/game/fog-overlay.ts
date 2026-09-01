import { EuropaElement } from '../base.js';

/**
 * `<europa-fog-overlay>` — a fog-of-war visual indicator.
 *
 * Renders a single semi-transparent `<div aria-hidden="true">` overlay that
 * covers its host area to represent unexplored fog. The overlay is purely
 * visual (FR-014): it carries `aria-hidden="true"` at all times so screen
 * readers never announce it, and it exposes no interactive or semantic
 * content.
 *
 * The `visible` attribute is a boolean controlling whether the overlay is
 * shown. The default is **visible** (true) — a fog overlay is present by
 * default and hidden only when the fog clears. It is hidden when the
 * `visible` attribute is explicitly set to `"false"` (or any value other
 * than `"true"`); the overlay is shown in every other case (attribute
 * absent, empty, or `"true"`).
 *
 * Uses **light DOM** (no Shadow DOM, no `::part()`, no
 * `adoptedStyleSheets`). The overlay is inline-styled from the shared
 * token palette (no catalog class, per contract §3.2).
 *
 * **Attributes**
 * - `visible` (boolean, default: true) — when `"false"`, the overlay is
 *   hidden; otherwise it is shown.
 *
 * **Slots**: none.
 *
 * **Events**: none.
 *
 * **A11y (FR-014)**: `aria-hidden="true"` on the overlay (purely visual).
 *
 * Does NOT auto-register (FR-004). The consumer calls `register()` from
 * `@europa/design/components` to define the tag.
 *
 * @example
 * ```html
 * <europa-fog-overlay></europa-fog-overlay>
 * <europa-fog-overlay visible="false"></europa-fog-overlay>
 * ```
 */
export class EuropaFogOverlay extends EuropaElement {
    /** The internal `<div aria-hidden="true">` overlay element. */
    private _overlay: HTMLDivElement | null = null;

    /**
     * The attributes this component observes. Changes to `visible` trigger a
     * re-render via {@link EuropaElement.attributeChangedCallback}.
     *
     * @returns The observed attribute names.
     */
    static override get observedAttributes(): string[] {
        return ['visible'];
    }

    /**
     * Create (once) or update the internal overlay `<div>`.
     *
     * Idempotent: the overlay div is created and appended on first call; on
     * subsequent calls (attribute changes) only its visibility is refreshed.
     * The overlay is always `aria-hidden="true"` (purely visual, FR-014) and
     * is shown/hidden by toggling the `hidden` attribute based on the current
     * `visible` state.
     */
    protected override render(): void {
        if (this._overlay === null) {
            this._overlay = document.createElement('div');
            this._overlay.setAttribute('aria-hidden', 'true');
            this.appendChild(this._overlay);
        }

        // The `visible` attribute is a boolean with a default of true: the
        // overlay is shown unless `visible` is explicitly set to "false".
        const visible = this.getAttribute('visible') !== 'false';

        this.setAttributeIf(this._overlay, 'hidden', !visible);
    }
}
