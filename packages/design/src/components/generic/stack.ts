import { EuropaElement } from '../base.js';

/**
 * `<europa-stack>` — a vertical-stack layout primitive.
 *
 * Renders a `<div class="europa-stack">` that wraps arbitrary slotted
 * children. The catalog class provides vertical spacing and flex
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
     * Create (once) the internal stack wrapper and slot, then apply the
     * `europa-stack` catalog class. Idempotent: subsequent calls no-op.
     */
    protected render(): void {
        if (this._wrapper !== null) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'europa-stack';
        wrapper.appendChild(document.createElement('slot'));

        this.appendChild(wrapper);
        this._wrapper = wrapper;
    }
}
