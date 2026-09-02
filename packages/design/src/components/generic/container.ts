import { EuropaElement } from '../base.js';

/**
 * The `<europa-container>` custom element — a Shadow DOM wrapper for the
 * `europa-container` catalog class.
 *
 * Renders a single `<div class="europa-container">` inside a shadow root,
 * with a `<slot>` element for projecting host children. The class conveys
 * no semantics, so the host is responsible for supplying any heading
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
    /** The internal `<div class="europa-container">` wrapper inside the shadow root. */
    private _container: HTMLDivElement | null = null;

    /**
     * Lazily create the shadow root and internal container wrapper with a
     * `<slot>` for projecting host children.
     */
    protected render(): void {
        const shadow = this.ensureShadowRoot();

        if (this._container === null) {
            const container = document.createElement('div');
            container.className = 'europa-container';

            const slot = document.createElement('slot');
            container.appendChild(slot);

            shadow.appendChild(container);
            this._container = container;
        }
    }
}
