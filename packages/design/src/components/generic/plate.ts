import { EuropaElement } from '../base.js';

/**
 * `<europa-plate>` — a simple content-surface primitive.
 *
 * Renders a `<div class="europa-plate">` inside a shadow root, with a
 * `<slot>` element for projecting host children. No attributes; the host
 * supplies heading structure as needed.
 *
 * Uses **Shadow DOM** — the catalog class is applied to the internal
 * wrapper, and the shared stylesheet is adopted into the shadow root.
 *
 * @example
 * ```html
 * <europa-plate>
 *     <h3>Section title</h3>
 *     <p>Body content goes here.</p>
 * </europa-plate>
 * ```
 */
export class EuropaPlate extends EuropaElement {
    /** The internal `<div class="europa-plate">` wrapper inside the shadow root. */
    private _wrapper: HTMLDivElement | null = null;

    /**
     * Lazily create the shadow root and internal plate wrapper with a
     * `<slot>` for projecting host children.
     */
    protected render(): void {
        const shadow = this.ensureShadowRoot();

        if (this._wrapper === null) {
            const wrapper = document.createElement('div');
            wrapper.className = 'europa-plate';

            const slot = document.createElement('slot');
            wrapper.appendChild(slot);

            shadow.appendChild(wrapper);
            this._wrapper = wrapper;
        }
    }
}
