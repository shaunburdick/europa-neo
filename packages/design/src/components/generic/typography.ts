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
 * **Slots**: default slot — host children are projected inside the semantic
 * element via a `<slot>` (Shadow DOM; children are never reparented).
 *
 * **Events**: none.
 *
 * **A11y obligations**: the component renders a real heading element for the
 * `heading`/`subheading` variants so document outline structure is preserved;
 * the `europa-typography--heading` modifier never substitutes for a heading
 * element (DESIGN.md § 2). The `body`/`label`/`caption` variants render
 * non-heading elements and carry no implicit semantics.
 *
 * Uses **Shadow DOM**: the semantic element lives inside the shadow root and
 * the shared catalog stylesheet is adopted into it, so the catalog classes
 * apply without touching the page's global cascade.
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
     * Create or rebuild the semantic element for the current `variant`
     * inside the shadow root.
     *
     * The semantic element wraps a `<slot>` projecting host children. When
     * the variant (and therefore the tag) changes — or on first render —
     * the shadow root is cleared and a fresh element of the correct tag is
     * created. When the tag is unchanged, the existing element is reused and
     * only its catalog class is refreshed.
     */
    protected override render(): void {
        const shadow = this.ensureShadowRoot();

        const variant = this._variant();
        const tag = VARIANT_TAGS[variant];

        if (this._el === null || this._el.tagName.toLowerCase() !== tag) {
            // Clear the shadow root and rebuild with the new tag (the
            // adopted stylesheet survives — it lives on adoptedStyleSheets).
            shadow.innerHTML = '';

            const el = document.createElement(tag);

            const slot = document.createElement('slot');
            el.appendChild(slot);

            shadow.appendChild(el);
            this._el = el;
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
