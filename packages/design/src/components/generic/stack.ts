import { EuropaElement } from '../base.js';

/**
 * `<europa-stack>` — a vertical-stack layout primitive.
 *
 * Renders a `<div class="europa-stack">` with children manually reparented
 * into the wrapper. The catalog class provides vertical spacing and flex
 * direction via the shared `catalog.css` rules.
 *
 * No attributes are observed; the element renders once on connect.
 * Uses **light DOM** so the catalog class cascades directly.
 *
 * @example
 * ```html
 * <europa-stack>
 *     <europa-button>First</europa-button>
 *     <europa-button>Second</europa-button>
 * </europa-stack>
 * ```
 */
export class EuropaStack extends EuropaElement {
    /** The internal `<div class="europa-stack">` wrapper. */
    private _wrapper: HTMLDivElement | null = null;

    /**
     * Create the internal stack wrapper, then reparent light-DOM children
     * into it on every render (slots are inert in light DOM).
     */
    protected render(): void {
        if (this._wrapper === null) {
            const wrapper = document.createElement('div');
            wrapper.className = 'europa-stack';
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
