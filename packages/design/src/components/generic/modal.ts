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
 * Renders a light-DOM structure matching the catalog's `.europa-modal-backdrop`
 * + `.europa-modal` + `.europa-modal__title` + `.europa-modal__body` +
 * `.europa-modal__actions` class hierarchy. Enforces the accessibility contract
 * (FR-011): `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to
 * the title element, Tab/Shift+Tab focus trap, Escape dispatching `europa-close`,
 * and focus restore to the previously-focused element on close.
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
    /** The outermost backdrop `<div>`. */
    private _backdrop: HTMLDivElement | null = null;

    /** The inner dialog `<div role="dialog">`. */
    private _dialog: HTMLDivElement | null = null;

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
     * backdrop itself (not its descendants) is the event target.
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
    static get observedAttributes(): string[] {
        return ['open', 'title'];
    }

    /**
     * Create (once) or update the internal dialog DOM.
     *
     * On first call, builds the full backdrop → dialog → title → body →
     * actions structure and appends it to the host. On subsequent calls,
     * refreshes the open/hidden state and title text. The document-level
     * `keydown` listener is attached once and cleaned up on disconnect.
     */
    protected render(): void {
        if (this._backdrop === null) {
            this._backdrop = document.createElement('div');
            this._backdrop.className = 'europa-modal-backdrop';

            this._dialog = document.createElement('div');
            this._dialog.className = 'europa-modal';
            this._dialog.setAttribute('role', 'dialog');
            this._dialog.setAttribute('aria-modal', 'true');
            this._dialog.setAttribute('aria-labelledby', this._id);

            this._titleEl = document.createElement('h2');
            this._titleEl.className = 'europa-modal__title';
            this._titleEl.id = this._id;

            const body = document.createElement('div');
            body.className = 'europa-modal__body';
            body.appendChild(document.createElement('slot'));

            const actions = document.createElement('div');
            actions.className = 'europa-modal__actions';
            const actionsSlot = document.createElement('slot');
            actionsSlot.setAttribute('name', 'actions');
            actions.appendChild(actionsSlot);

            this._dialog.appendChild(this._titleEl);
            this._dialog.appendChild(body);
            this._dialog.appendChild(actions);
            this._backdrop.appendChild(this._dialog);
            this.appendChild(this._backdrop);

            this._backdrop.addEventListener('click', this._onBackdropClick);
            document.addEventListener('keydown', this._onKeyDown);
        }

        this._titleEl.textContent = this.getAttribute('title') ?? '';

        const isOpen = this.hasAttribute('open');

        this.setAttributeIf(this, 'hidden', !isOpen);
        this.setAttributeIf(this, 'tabindex', isOpen ? false : true);

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
     * Traps Tab / Shift+Tab focus within the modal dialog.
     *
     * Computes the set of focusable descendants on each keydown (reflecting
     * dynamic slot content), then cycles focus when Tab reaches the boundary.
     *
     * @param e  The Tab keydown event.
     */
    private _trapFocus(e: KeyboardEvent): void {
        const focusable = Array.from(
            (this._dialog ?? this).querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex >= 0);

        if (focusable.length === 0) {
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (e.shiftKey) {
            if (active === first || active === this._dialog) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (active === last || active === this._dialog) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    /**
     * Capture the element that had focus before the modal opened, so focus
     * can be restored when the modal closes.
     */
    connectedCallback(): void {
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
    attributeChangedCallback(
        name: string,
        oldValue: string | null,
        newValue: string | null,
    ): void {
        if (name === 'open' && oldValue === null && newValue !== null) {
            this._previousFocus = document.activeElement as HTMLElement | null;
        }

        super.attributeChangedCallback(name, oldValue, newValue);
    }
}
