import { EuropaElement } from '../base.js';

/**
 * Counter for generating unique element IDs across multiple
 * `<europa-modal>` instances on the same page.
 */
let modalIdCounter = 0;

/** The set of keys that constitute a focusable element for the trap. */
const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * `<europa-modal>` — a dialog web component with focus trapping, Escape-to-close,
 * backdrop click, and automatic focus restore.
 *
 * Uses **Shadow DOM**: the `.europa-modal-backdrop` → `.europa-modal` dialog →
 * `.europa-modal__title` + `.europa-modal__body` + `.europa-modal__actions`
 * structure is rendered inside an open shadow root (styled by the shared
 * catalog stylesheet adopted by {@link EuropaElement.ensureShadowRoot}). Host
 * children are *projected*, never reparented: default children show through
 * the body's default `<slot>`, children carrying `slot="actions"` show
 * through the actions' named `<slot>`.
 *
 * Enforces the accessibility contract (FR-011): `role="dialog"`,
 * `aria-modal="true"`, `aria-labelledby` pointing to the title element
 * (both live inside the same shadow root, so the id reference resolves),
 * Tab/Shift+Tab focus trap, Escape dispatching `europa-close`, and focus
 * restore to the previously-focused element on close.
 *
 * **Focus trap under Shadow DOM**: the trap walks the dialog's *flattened*
 * tree in document order — shadow-tree elements, slotted light-DOM content
 * (via `slot.assignedElements()`, since slotted nodes stay light-DOM
 * children of the host), and the internal focusables of nested open-shadow
 * components such as a slotted `<europa-button>`. Boundary comparisons use
 * {@link deepActiveElement} so focus inside any open shadow root along the
 * chain compares equal to the corresponding flattened element.
 *
 * **Attributes**:
 * - `open` (boolean) — controls visibility and focus management.
 * - `title` (string) — dialog heading text and `aria-labelledby` target.
 *
 * **Slots**: default (body content), `actions` (button bar).
 *
 * **Events**: `europa-close` — dispatched on Escape or backdrop click (`detail` void).
 *
 * @example
 * ```html
 * <europa-modal title="Confirm" open>
 *     <p>Are you sure?</p>
 *     <div slot="actions">
 *         <europa-button>Cancel</europa-button>
 *         <europa-button variant="primary">OK</europa-button>
 *     </div>
 * </europa-modal>
 * ```
 */
export class EuropaModal extends EuropaElement {
    /** The outermost backdrop `<div>` inside the shadow root. */
    private _backdrop: HTMLDivElement | null = null;

    /** The inner dialog `<div role="dialog">` inside the shadow root. */
    private _dialog: HTMLDivElement | null = null;

    /** The body `<div class="europa-modal__body">` (contains the default slot). */
    private _body: HTMLDivElement | null = null;

    /** The actions `<div class="europa-modal__actions">` (contains the actions slot). */
    private _actions: HTMLDivElement | null = null;

    /** The title `<h2>` element. */
    private _titleEl: HTMLHeadingElement | null = null;

    /** Unique ID for linking `aria-labelledby` to the title element. */
    private readonly _id: string = `europa-modal-${++modalIdCounter}`;

    /** The element that held focus before the modal opened. */
    private _previousFocus: HTMLElement | null = null;

    /** Bound `keydown` handler for Escape and focus-trap (document-level). */
    private readonly _onKeyDown = (e: KeyboardEvent): void => {
        if (this.getAttribute('open') === null) {
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            this._close();
            return;
        }

        if (e.key === 'Tab') {
            this._trapFocus(e);
        }
    };

    /**
     * Bound `click` handler on the backdrop. Closes the modal when the
     * backdrop itself (not its descendants) is the event target. For a
     * listener inside the shadow root the event target is NOT retargeted,
     * so clicks on the dialog or its slotted content never match the
     * backdrop, while a direct backdrop click does.
     */
    private readonly _onBackdropClick = (e: Event): void => {
        if (e.target === this._backdrop && this.getAttribute('open') !== null) {
            this._close();
        }
    };

    /**
     * The attributes this component observes.
     *
     * @returns The observed attribute names (`open`, `title`).
     */
    static override get observedAttributes(): string[] {
        return ['open', 'title'];
    }

    /**
     * Create (once) or update the internal dialog DOM inside the shadow
     * root.
     *
     * On first call, builds the full backdrop → dialog → title → body →
     * actions structure inside the open shadow root. Host children are
     * projected via slots (default slot in the body, named `actions` slot
     * in the actions bar) — they stay in the host's light DOM. On
     * subsequent calls, refreshes the open/hidden state and title text.
     * The document-level `keydown` listener is attached once and cleaned
     * up on disconnect.
     */
    protected override render(): void {
        const shadow = this.ensureShadowRoot();

        if (this._backdrop === null || this._dialog === null || this._body === null || this._actions === null) {
            const backdrop = document.createElement('div');
            backdrop.className = 'europa-modal-backdrop';

            const dialog = document.createElement('div');
            dialog.className = 'europa-modal';
            dialog.setAttribute('tabindex', '-1');
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-labelledby', this._id);

            const titleEl = document.createElement('h2');
            titleEl.className = 'europa-modal__title';
            titleEl.id = this._id;

            const body = document.createElement('div');
            body.className = 'europa-modal__body';
            body.appendChild(document.createElement('slot'));

            const actions = document.createElement('div');
            actions.className = 'europa-modal__actions';
            const actionsSlot = document.createElement('slot');
            actionsSlot.setAttribute('name', 'actions');
            actions.appendChild(actionsSlot);

            dialog.appendChild(titleEl);
            dialog.appendChild(body);
            dialog.appendChild(actions);
            backdrop.appendChild(dialog);
            shadow.appendChild(backdrop);

            this._backdrop = backdrop;
            this._dialog = dialog;
            this._body = body;
            this._actions = actions;
            this._titleEl = titleEl;

            backdrop.addEventListener('click', this._onBackdropClick);
            document.addEventListener('keydown', this._onKeyDown);
        }

        if (this._titleEl !== null) {
            this._titleEl.textContent = this.getAttribute('title') ?? '';
        }

        const isOpen = this.hasAttribute('open');

        this.setAttributeIf(this, 'hidden', !isOpen);
        this.setAttributeIf(this, 'tabindex', !isOpen);

        if (isOpen && this._dialog !== null) {
            this._dialog.focus();
        }
    }

    /**
     * Dispatches `europa-close` and hides the modal.
     *
     * Restores focus to the element that was focused before the modal
     * opened, then dispatches the `europa-close` custom event (detail void).
     */
    private _close(): void {
        this.removeAttribute('open');

        if (this._previousFocus !== null && typeof this._previousFocus.focus === 'function') {
            this._previousFocus.focus();
            this._previousFocus = null;
        }

        this.dispatchEvent(
            new CustomEvent('europa-close', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * Collects the focusable elements inside the dialog, in flattened
     * document order.
     *
     * Because of the Shadow DOM split, three sources are combined by a
     * depth-first walk in document order:
     *
     * 1. **Shadow-tree elements** of the dialog (internal focusables).
     * 2. **Slotted light-DOM content** — slotted nodes remain light-DOM
     *    children of the host (projection does not move them), so they are
     *    invisible to `querySelectorAll` on the shadow tree; slots are
     *    followed via `slot.assignedElements()` in slot order.
     * 3. **Nested open-shadow components** — a slotted `<europa-button>`'s
     *    internal native button is a real tab stop in the flattened tree
     *    but lives inside the component's own shadow root; open shadow
     *    roots found along the walk are descended into.
     *
     * The same disabled / negative-tabindex filter that guarded the
     * pre-Shadow-DOM implementation is applied to every source.
     *
     * @returns The focusable elements, in flattened document order.
     */
    private _collectFocusables(): HTMLElement[] {
        const dialog = this._dialog;
        if (dialog === null) {
            return [];
        }

        const focusable: HTMLElement[] = [];
        const visit = (el: HTMLElement): void => {
            if (el.matches(FOCUSABLE_SELECTOR) && !el.hasAttribute('disabled') && el.tabIndex >= 0) {
                focusable.push(el);
            }
            const children = el.children;
            for (let i = 0; i < children.length; i++) {
                const child = children[i] as HTMLElement;
                if (child instanceof HTMLSlotElement) {
                    // A slot renders its assigned light-DOM elements in the
                    // flat tree — walk the assigned elements in slot order
                    // instead of the slot's (empty) shadow children.
                    const assigned = child.assignedElements();
                    for (let j = 0; j < assigned.length; j++) {
                        visit(assigned[j] as HTMLElement);
                    }
                    continue;
                }
                // Nested open shadow roots (e.g. a slotted <europa-button>):
                // the internal focusables are real tab stops in the
                // flattened tree but invisible from this shadow tree.
                if (child.shadowRoot !== null) {
                    const inner = child.shadowRoot.children;
                    for (let k = 0; k < inner.length; k++) {
                        visit(inner[k] as HTMLElement);
                    }
                }
                visit(child);
            }
        };
        visit(dialog);
        return focusable;
    }

    /**
     * Traps Tab / Shift+Tab focus within the modal dialog.
     *
     * Computes the set of focusable descendants on each keydown (reflecting
     * dynamic slot content), then cycles focus when Tab reaches the boundary.
     *
     * @param e  The Tab keydown event.
     */
    private _trapFocus(e: KeyboardEvent): void {
        const focusable = this._collectFocusables();

        if (focusable.length === 0) {
            return;
        }

        const first = focusable[0] as HTMLElement | undefined;
        const last = focusable[focusable.length - 1] as HTMLElement | undefined;

        // Resolve the deep active element: document.activeElement reports
        // the top-level shadow host when focus sits inside an open shadow
        // tree, so follow shadowRoot.activeElement down to the real focused
        // element before comparing against the (possibly shadow-internal)
        // boundary entries.
        let active = document.activeElement as HTMLElement | null;
        while (active !== null && active.shadowRoot !== null && active.shadowRoot.activeElement !== null) {
            active = active.shadowRoot.activeElement as HTMLElement | null;
        }

        if (e.shiftKey) {
            if ((first !== undefined && active === first) || active === this._dialog) {
                e.preventDefault();
                last?.focus();
            }
        } else {
            if ((last !== undefined && active === last) || active === this._dialog) {
                e.preventDefault();
                first?.focus();
            }
        }
    }

    /**
     * Capture the element that had focus before the modal opened, so focus
     * can be restored when the modal closes.
     */
    override connectedCallback(): void {
        if (this.hasAttribute('open') && this._previousFocus === null) {
            this._previousFocus = document.activeElement as HTMLElement | null;
        }

        super.connectedCallback();
    }

    /**
     * Remove the document-level keydown listener when the element leaves
     * the document.
     */
    disconnectedCallback(): void {
        document.removeEventListener('keydown', this._onKeyDown);
    }

    /**
     * Detect transitions into the `open` state so the previously-focused
     * element is remembered for focus restore.
     *
     * When `open` is added, captures `document.activeElement`. This must
     * happen before the re-render triggered by `attributeChangedCallback`
     * switches focus into the dialog.
     */
    override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
        if (name === 'open' && oldValue === null && newValue !== null) {
            this._previousFocus = document.activeElement as HTMLElement | null;
        }

        super.attributeChangedCallback(name, oldValue, newValue);
    }
}
