import { EuropaElement } from '../base.js';

/**
 * `<europa-grid>` — a Shadow DOM layout wrapper for the `europa-grid`
 * catalog class.
 *
 * Renders a `<div class="europa-grid">` inside a shadow root, with a
 * `<slot>` element projecting host children into the wrapper. The
 * `variant` attribute selects an optional modifier class:
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
    /** The internal `<div class="europa-grid">` wrapper inside the shadow root. */
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
     * Create (once) the shadow root, internal grid wrapper, and `<slot>`,
     * then apply the `europa-grid` catalog classes to the **internal wrapper
     * div** on every render.
     *
     * Idempotent: the wrapper and slot are created on first call; only the
     * wrapper's modifier class is refreshed on subsequent calls (attribute
     * changes). Host children are projected via the `<slot>` — they remain
     * light-DOM children of the host, so framework reconciliation (React 19
     * `removeChild`) works without reparenting.
     */
    protected override render(): void {
        const shadow = this.ensureShadowRoot();

        if (this._grid === null) {
            const grid = document.createElement('div');

            const slot = document.createElement('slot');
            grid.appendChild(slot);

            shadow.appendChild(grid);
            this._grid = grid;
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
