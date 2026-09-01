import { EuropaElement } from '../base.js';

/**
 * The `<europa-container>` custom element — a light-DOM wrapper for the
 * `europa-container` catalog class.
 *
 * Renders a single `<div class="europa-container">` with children manually
 * reparented into the wrapper. The class conveys no semantics, so the host
 * is responsible for supplying any heading structure and interactive content.
 *
 * No attributes are observed; the element renders once on connect.
 *
 * @example
 * ```html
 * <europa-container>
 *     <h2>Lobby</h2>
 *     <p>Find a match below.</p>
 * </europa-container>
 * ```
 */
export class EuropaContainer extends EuropaElement {
    /** The internal `<div class="europa-container">` wrapper. */
    private _container: HTMLDivElement | null = null;

    /**
     * Create the internal container wrapper, then reparent light-DOM children
     * into it on every render (slots are inert in light DOM).
     */
    protected render(): void {
        if (this._container === null) {
            const container = document.createElement('div');
            container.className = 'europa-container';
            this.appendChild(container);
            this._container = container;
        }

        // Reparent any host children not yet inside the wrapper.
        const children = Array.from(this.childNodes);
        for (const child of children) {
            if (child !== this._container) {
                this._container.appendChild(child);
            }
        }
    }
}
