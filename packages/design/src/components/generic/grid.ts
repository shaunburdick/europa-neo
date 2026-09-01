import { EuropaElement } from '../base.js';

/**
 * `<europa-grid>` — a light-DOM layout wrapper for the `europa-grid`
 * catalog class.
 *
 * Renders a `<div class="europa-grid">` with children manually reparented
 * into the wrapper. The `variant` attribute selects an optional modifier
 * class:
 *
 * - `sidebar` → adds `europa-grid--sidebar`
 * - `wrap` → adds `europa-grid--wrap`
 * - absent/other → base `europa-grid` only
 *
 * The catalog classes are applied to the **internal wrapper div** (not
 * the host element), per the web-components contract. The element is
 * layout-only: DOM order equals reading order, so no ARIA roles are
 * required.
 *
 * @example
 * ```html
 * <europa-grid>
 *     <europa-card>Item one</europa-card>
 *     <europa-card>Item two</europa-card>
 * </europa-grid>
 *
 * <europa-grid variant="sidebar">
 *     <aside>Sidebar content</aside>
 *     <main>Main content</main>
 * </europa-grid>
 * ```
 */
export class EuropaGrid extends EuropaElement {
    /** The internal `<div>` wrapper. */
    private _grid: HTMLDivElement | null = null;

    /**
     * The attributes this component observes. Changes to `variant` trigger
     * a re-render via {@link EuropaElement.attributeChangedCallback}.
     *
     * @returns The observed attribute names.
     */
    static override get observedAttributes(): string[] {
        return ['variant'];
    }

    /**
     * Create (once) the internal grid wrapper, then apply the `europa-grid`
     * catalog classes to the **internal wrapper div** and reparent light-DOM
     * children into it on every render (slots are inert in light DOM).
     *
     * Idempotent: the wrapper is created on first call; the wrapper's classes
     * and children are refreshed on every call (attribute changes).
     */
    protected override render(): void {
        if (this._grid === null) {
            this._grid = document.createElement('div');
            this.appendChild(this._grid);
        }

        // Reparent any host children not yet inside the wrapper.
        const children = Array.from(this.childNodes);
        for (const child of children) {
            if (child !== this._grid) {
                this._grid.appendChild(child);
            }
        }

        const variant = this.getAttribute('variant');

        const classes = [
            'europa-grid',
            variant === 'sidebar' && 'europa-grid--sidebar',
            variant === 'wrap' && 'europa-grid--wrap',
        ]
            .filter(Boolean)
            .join(' ');

        this._grid.className = classes;
    }
}
