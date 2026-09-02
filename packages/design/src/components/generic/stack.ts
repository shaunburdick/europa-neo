import { EuropaElement } from '../base.js';

/**
 * `<europa-stack>` — a vertical-stack layout primitive.
 *
 * Renders a `<div class="europa-stack">` inside a shadow root, with a
 * `<slot>` element for projecting host children. The catalog class
 * provides vertical spacing and flex direction via the shared catalog
 * stylesheet.
 *
 * No attributes are observed; the element renders once on connect.
 * Uses **Shadow DOM** so the catalog class is adopted into the shadow root.
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
    /** The internal `<div class="europa-stack">` wrapper inside the shadow root. */
    private _wrapper: HTMLDivElement | null = null;

    /**
     * Lazily create the shadow root and internal stack wrapper with a
     * `<slot>` for projecting host children.
     */
    protected render(): void {
        const shadow = this.ensureShadowRoot();

        if (this._wrapper === null) {
            const wrapper = document.createElement('div');
            wrapper.className = 'europa-stack';

            const slot = document.createElement('slot');
            wrapper.appendChild(slot);

            shadow.appendChild(wrapper);
            this._wrapper = wrapper;
        }
    }
}
