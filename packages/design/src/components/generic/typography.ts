import { EuropaElement } from '../base.js';

/**
 * The typography variants supported by `<europa-typography>`.
 */
type TypographyVariant = 'heading' | 'subheading' | 'body' | 'label' | 'caption';

/**
 * Maps each variant to the semantic element it renders. `label` and `caption`
 * both render a `<span>` — they differ only in the catalog modifier applied.
 */
const VARIANT_TAGS: Record<TypographyVariant, string> = {
    heading: 'h2',
    subheading: 'h3',
    body: 'p',
    label: 'span',
    caption: 'span',
};

/**
 * A semantic typography primitive that renders the correct heading/paragraph
 * element for a given `variant` and applies the matching `europa-typography`
 * catalog class.
 *
 * **Tag**: `<europa-typography>`
 *
 * **Attributes**:
 * - `variant` (`heading` | `subheading` | `body` | `label` | `caption`,
 *   default `body`) — selects the rendered element and catalog modifier:
 *   `heading` → `<h2 class="europa-typography europa-typography--heading">`,
 *   `subheading` → `<h3 …--subheading>`, `body` → `<p …--body>`,
 *   `label` → `<span …--label>`, `caption` → `<span …--caption>`.
 *
 * **Slots**: none — children are manually reparented into the semantic
 * element (slots are inert in light DOM).
 *
 * **Events**: none.
 *
 * **A11y obligations**: the component renders a real heading element for the
 * `heading`/`subheading` variants so document outline structure is preserved;
 * the `europa-typography--heading` modifier never substitutes for a heading
 * element (DESIGN.md § 2). The `body`/`label`/`caption` variants render
 * non-heading elements and carry no implicit semantics.
 *
 * Uses **light DOM**: the catalog class is applied directly to the rendered
 * element, so it participates in the page's normal stylesheet cascade.
 *
 * @example
 * ```html
 * <europa-typography variant="heading">Combat</europa-typography>
 * <europa-typography variant="body">Some prose.</europa-typography>
 * ```
 */
export class EuropaTypography extends EuropaElement {
    /** The observed `variant` attribute. */
    static override get observedAttributes(): string[] {
        return ['variant'];
    }

    /** The rendered semantic element (created lazily, reused across renders). */
    private _el: HTMLElement | null = null;

    /**
     * Create (once) or refresh the semantic element for the current `variant`.
     *
     * On first call the semantic element is created and appended, and light-DOM
     * children are manually reparented into it. On subsequent calls the existing
     * element is reused unless the variant changed the tag (e.g. `heading` →
     * `body`), in which case children are moved into a freshly created element
     * of the new tag. The catalog class is reapplied on every render.
     */
    protected override render(): void {
        const variant = this._variant();
        const tag = VARIANT_TAGS[variant];

        if (this._el === null) {
            this._el = document.createElement(tag);
            this.appendChild(this._el);
        } else if (this._el.tagName.toLowerCase() !== tag) {
            const next = document.createElement(tag);
            this.replaceChild(next, this._el);
            this._el = next;
        }

        // Reparent any host children not yet inside the semantic element.
        const children = Array.from(this.childNodes);
        for (const child of children) {
            if (child !== this._el) {
                this._el.appendChild(child);
            }
        }

        this._el.className = `europa-typography europa-typography--${variant}`;
    }

    /**
     * Read and validate the `variant` attribute, falling back to `body`.
     *
     * @returns The resolved variant.
     */
    private _variant(): TypographyVariant {
        const value = this.getAttribute('variant');
        if (value !== null && value in VARIANT_TAGS) {
            return value as TypographyVariant;
        }
        return 'body';
    }
}
