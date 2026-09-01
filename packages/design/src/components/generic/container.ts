import { EuropaElement } from '../base.js';

/**
 * The `<europa-container>` custom element — a light-DOM wrapper for the
 * `europa-container` catalog class.
 *
 * Renders a single `<div class="europa-container">` containing a `<slot>` so
 * arbitrary slotted children are projected into the container. The class
 * conveys no semantics, so the host is responsible for supplying any heading
 * structure and interactive content.
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
     * Create (once) the internal container wrapper and slot, then apply the
     * `europa-container` catalog class. Idempotent: subsequent calls no-op.
     */
    protected render(): void {
        if (this._container !== null) {
            return;
        }

        const container = document.createElement('div');
        container.className = 'europa-container';
        container.appendChild(document.createElement('slot'));
        this.appendChild(container);
        this._container = container;
    }
}
