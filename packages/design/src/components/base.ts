/**
 * Abstract base class for all Europa Neo web components.
 *
 * Provides the shared lifecycle skeleton — `connectedCallback` and
 * `attributeChangedCallback` both delegate to the subclass's `render()`
 * method — plus two lightweight class-composition helpers (`setClasses`,
 * `setAttributeIf`) that keep individual component `render()` methods
 * short and declarative.
 *
 * ## DOM architecture (two-tier)
 *
 * Child-projecting generic components use **Shadow DOM** with an open
 * shadow root. The shared catalog stylesheet (`CATALOG_CSS`) is adopted
 * via a single constructed `CSSStyleSheet` — one sheet shared across all
 * instances. CSS custom properties (`--europa-*`) inherit through the
 * shadow boundary from `:root`, so the token block is not duplicated
 * inside shadow roots.
 *
 * Shadow-DOM subclasses call {@link EuropaElement.ensureShadowRoot} in
 * their `render()` method to lazily create and style the shadow root,
 * then append internal elements to it. Light DOM children are projected
 * via `<slot>` elements inside the shadow tree — children stay as
 * children of the host and are never reparented (reparenting
 * React-managed nodes breaks React 19 unmounts).
 *
 * The game-specific primitives (troop-chip, city-marker, pipe-slope,
 * elevation-swatch, player-badge, fog-overlay, reserve-indicator) are
 * **Light DOM** leaf elements — they render regular children on the host
 * and do NOT call {@link EuropaElement.ensureShadowRoot}.
 *
 * The host element's `class` attribute (set via {@link EuropaElement.setClasses})
 * remains on the host for external `:host(.foo)` selectors and consumer
 * class-based styling. Internal element attributes are managed via
 * {@link EuropaElement.setAttributeIf}.
 *
 * @example
 * ```ts
 * class EuropaButton extends EuropaElement {
 *     static get observedAttributes(): string[] {
 *         return ['variant', 'size', 'disabled'];
 *     }
 *
 *     protected render(): void {
 *         const root = this.ensureShadowRoot();
 *         // Create or update internal DOM inside shadow root …
 *         this.setClasses(
 *             'europa-button',
 *             this.getAttribute('variant') === 'primary' && 'europa-button--primary',
 *         );
 *     }
 * }
 * ```
 */

import { CATALOG_CSS } from '../styles/catalog-styles.js';

/**
 * Shared stylesheet constructed once at module load time.
 *
 * All shadow roots adopt this single instance via `adoptedStyleSheets`,
 * avoiding per-element stylesheet parsing overhead.
 */
const CATALOG_STYLESHEET: CSSStyleSheet = (() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CATALOG_CSS);
    return sheet;
})();

export abstract class EuropaElement extends HTMLElement {
    /**
     * Tracks whether the shadow root has been created and styled.
     *
     * Once `true`, subsequent calls to {@link EuropaElement.ensureShadowRoot}
     * skip attachment and return the existing shadow root immediately.
     */
    private _shadowReady = false;

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
    attributeChangedCallback(_name: string, _oldValue: string | null, _newValue: string | null): void {
        this.render();
    }

    /**
     * Subclasses implement this to create or update their internal DOM.
     *
     * **Must be idempotent** — called from both
     * {@link EuropaElement.connectedCallback} (initial creation) and
     * {@link EuropaElement.attributeChangedCallback} (attribute updates).
     *
     * Call {@link EuropaElement.ensureShadowRoot} to obtain the shadow
     * root, then build/update the internal tree inside it. Use
     * {@link EuropaElement.setClasses} and
     * {@link EuropaElement.setAttributeIf} for concise, declarative
     * class/attribute management.
     */
    protected abstract render(): void;

    /**
     * Lazily create an open shadow root and adopt the shared catalog
     * stylesheet.
     *
     * On first call, attaches a shadow root with `mode: 'open'` and
     * adopts the shared {@link CATALOG_STYLESHEET} via `adoptedStyleSheets`.
     * Subsequent calls return the cached shadow root immediately.
     *
     * Subclasses should call this at the top of their `render()` method:
     *
     * @example
     * ```ts
     * protected render(): void {
     *     const root = this.ensureShadowRoot();
     *     // build internal DOM inside root …
     * }
     * ```
     *
     * @returns The element's open shadow root.
     */
    protected ensureShadowRoot(): ShadowRoot {
        if (!this._shadowReady) {
            const shadow = this.attachShadow({ mode: 'open' });
            shadow.adoptedStyleSheets = [CATALOG_STYLESHEET];
            this._shadowReady = true;
        }
        const root = this.shadowRoot;
        if (root === null) {
            throw new Error('ensureShadowRoot: shadowRoot is null after attachShadow');
        }
        return root;
    }

    /**
     * Replace this element's `class` attribute with the joined list of
     * truthy class names.
     *
     * Falsy values (`false`, `null`, `undefined`, empty string) are
     * filtered out before joining. If no truthy classes remain, the
     * `class` attribute is removed entirely.
     *
     * The `class` attribute lives on the **host element** (outside the
     * shadow boundary), so it works with external `:host(.foo)` selectors
     * and consumer-provided class-based styling.
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
