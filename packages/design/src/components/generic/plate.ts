import { EuropaElement } from '../base.js';

/**
 * `<europa-plate>` — a simple content-surface primitive.
 *
 * Renders a `<div class="europa-plate">` that wraps arbitrary slotted
 * children. No attributes; the host supplies heading structure as needed.
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
     * Create or update the internal DOM structure.
     *
     * On the first call a `<div class="europa-plate">` wrapper is created
     * and a `<slot>` is appended inside it. Subsequent calls are no-ops
     * (the DOM is already in place).
     */
    protected render(): void {
        if (this._wrapper !== null) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'europa-plate';
        wrapper.appendChild(document.createElement('slot'));

        this.appendChild(wrapper);
        this._wrapper = wrapper;
    }
}
