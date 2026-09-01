import { EuropaElement } from '../base.js';

/**
 * `<europa-plate>` — a simple content-surface primitive.
 *
 * Renders a `<div class="europa-plate">` with children manually reparented
 * into the wrapper. No attributes; the host supplies heading structure as
 * needed.
 *
 * Uses **light DOM** — the catalog class is applied directly so the
 * shared `catalog.css` styles cascade without Shadow DOM boundaries.
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
    private _wrapper: HTMLDivElement | null = null;

    /**
     * Create the internal plate wrapper, then reparent light-DOM children
     * into it on every render (slots are inert in light DOM).
     */
    protected render(): void {
        if (this._wrapper === null) {
            const wrapper = document.createElement('div');
            wrapper.className = 'europa-plate';
            this.appendChild(wrapper);
            this._wrapper = wrapper;
        }

        // Reparent any host children not yet inside the wrapper.
        const children = Array.from(this.childNodes);
        for (const child of children) {
            if (child !== this._wrapper) {
                this._wrapper.appendChild(child);
            }
        }
    }
}
