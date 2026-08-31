/**
 * Abstract base class for all Europa Neo web components.
 *
 * Provides the shared lifecycle skeleton — `connectedCallback` and
 * `attributeChangedCallback` both delegate to the subclass's `render()`
 * method — plus two lightweight class-composition helpers (`setClasses`,
 * `setAttributeIf`) that keep individual component `render()` methods
 * short and declarative.
 *
 * All components use **light DOM** (no Shadow DOM, no `::part()`,
 * no `adoptedStyleSheets`). The existing `europa-*` CSS classes from the
 * shared catalog are applied directly via `setClasses`.
 *
 * @example
 * ```ts
 * class EuropaButton extends EuropaButton {
 *     static get observedAttributes(): string[] {
 *         return ['variant', 'size', 'disabled'];
 *     }
 *
 *     protected render(): void {
 *         // Create or update internal DOM …
 *         this.setClasses(
 *             'europa-button',
 *             this.getAttribute('variant') === 'primary' && 'europa-button--primary',
 *         );
 *     }
 * }
 * ```
 */
export abstract class EuropaElement extends HTMLElement {
    /**
     * Subclasses must override this to declare the attributes they observe.
     *
     * The browser calls {@link EuropaElement.attributeChangedCallback} whenever
     * one of these attributes changes on the host element, which in turn
     * triggers {@link EuropaElement.render}.
     *
     * @returns An array of attribute names to observe.
     */
    static get observedAttributes(): string[] {
        return [];
    }

    /**
     * Called by the base class when the element is inserted into the
     * document's DOM.
     *
     * Delegates to {@link EuropaElement.render} so subclasses can create
     * their internal DOM structure exactly once (idempotent — safe to
     * call again from {@link EuropaElement.attributeChangedCallback}).
     */
    connectedCallback(): void {
        this.render();
    }

    /**
     * Called by the base class whenever an observed attribute is added,
     * removed, or changed.
     *
     * Delegates to {@link EuropaElement.render} so subclasses can update
     * their internal DOM to reflect the new attribute values.
     *
     * @param _name  The attribute that changed.
     * @param _oldValue  The attribute's previous value (`null` when added).
     * @param _newValue  The attribute's new value (`null` when removed).
     */
    attributeChangedCallback(
        _name: string,
        _oldValue: string | null,
        _newValue: string | null,
    ): void {
        this.render();
    }

    /**
     * Subclasses implement this to create or update their internal DOM.
     *
     * **Must be idempotent** — called from both
     * {@link EuropaElement.connectedCallback} (initial creation) and
     * {@link EuropaElement.attributeChangedCallback} (attribute updates).
     *
     * Use {@link EuropaElement.setClasses} and
     * {@link EuropaElement.setAttributeIf} inside this method for
     * concise, declarative class/attribute management.
     */
    protected abstract render(): void;

    /**
     * Replace this element's `class` attribute with the joined list of
     * truthy class names.
     *
     * Falsy values (`false`, `null`, `undefined`, empty string) are
     * filtered out before joining. If no truthy classes remain, the
     * `class` attribute is removed entirely.
     *
     * @param classes  One or more class names or falsy sentinels.
     *
     * @example
     * ```ts
     * this.setClasses(
     *     'europa-button',
     *     variant === 'primary' && 'europa-button--primary',
     *     size === 'sm' && 'europa-button--sm',
     * );
     * ```
     */
    protected setClasses(...classes: Array<string | false | null | undefined>): void {
        const joined = classes.filter(Boolean).join(' ');

        if (joined.length === 0) {
            this.removeAttribute('class');
        } else {
            this.setAttribute('class', joined);
        }
    }

    /**
     * Set an attribute on an internal element when a condition holds;
     * otherwise remove the attribute.
     *
     * Useful for toggling boolean HTML attributes (`disabled`,
     * `aria-hidden`, `aria-live`, etc.) on child elements from inside
     * {@link EuropaElement.render}.
     *
     * @param el  The target element (a child of the component).
     * @param name  The attribute name.
     * @param condition  When truthy the attribute is set (to empty string);
     *                   when falsy the attribute is removed.
     *
     * @example
     * ```ts
     * this.setAttributeIf(this._button, 'disabled', this.hasAttribute('disabled'));
     * this.setAttributeIf(this._overlay, 'aria-hidden', !open);
     * ```
     */
    protected setAttributeIf(el: Element, name: string, condition: boolean): void {
        if (condition) {
            el.setAttribute(name, '');
        } else {
            el.removeAttribute(name);
        }
    }
}
