import { type ReactNode, useCallback, useEffect, useId, useRef } from 'react';

/** The set of CSS selectors that constitute a focusable element for the trap. */
const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A dialog component with focus trapping, Escape-to-close, backdrop click,
 * and automatic focus restore.
 *
 * Enforces the accessibility contract: `role="dialog"`, `aria-modal="true"`,
 * `aria-labelledby` pointing to the title element, Tab/Shift+Tab focus trap,
 * Escape dispatching `onClose`, and focus restore to the previously-focused
 * element on close.
 *
 * **Props**:
 * - `open` — controls visibility and focus management.
 * - `title` — dialog heading text and `aria-labelledby` target.
 * - `children` — body content.
 * - `actions` — button bar content.
 * - `onClose` — called on Escape or backdrop click.
 *
 * @example
 * ```tsx
 * <EuropaModal open title="Confirm" onClose={() => setOpen(false)}>
 *     <p>Are you sure?</p>
 *     <EuropaModal.Actions>
 *         <button>Cancel</button>
 *         <button>OK</button>
 *     </EuropaModal.Actions>
 * </EuropaModal>
 * ```
 */
export interface EuropaModalProps {
    /** Whether the modal is visible. Defaults to `false`. */
    open?: boolean;
    /** Dialog heading text and aria-labelledby target. */
    title?: string;
    /** Body content projected inside the modal. */
    children?: ReactNode;
    /** Action buttons projected in the footer area. */
    actions?: ReactNode;
    /** Called when the user requests closing (Escape or backdrop click). */
    onClose?: () => void;
}

export function EuropaModal({ open = false, title, children, actions, onClose }: EuropaModalProps) {
    const id = useId();
    const previousFocus = useRef<HTMLElement | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);

    // Capture previous focus when opening
    useEffect(() => {
        if (open) {
            previousFocus.current = document.activeElement as HTMLElement;
            dialogRef.current?.focus();
        }
    }, [open]);

    // Restore focus on close
    useEffect(() => {
        if (!open && previousFocus.current) {
            previousFocus.current.focus();
            previousFocus.current = null;
        }
    }, [open]);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (!open) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose?.();
                return;
            }
            if (e.key === 'Tab') {
                const dialog = dialogRef.current;
                if (!dialog) return;
                const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
                if (focusable.length === 0) return;
                const first = focusable.at(0);
                const last = focusable.at(-1);
                if (!first || !last) return;
                if (e.shiftKey) {
                    if (document.activeElement === first || document.activeElement === dialog) {
                        e.preventDefault();
                        last.focus();
                    }
                } else {
                    if (document.activeElement === last || document.activeElement === dialog) {
                        e.preventDefault();
                        first.focus();
                    }
                }
            }
        },
        [open, onClose],
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    if (!open) return null;

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose?.();
        }
    };

    const handleBackdropKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose?.();
        }
    };

    return (
        <div
            className="europa-modal-backdrop"
            role="button"
            tabIndex={-1}
            onClick={handleBackdropClick}
            onKeyDown={handleBackdropKeyDown}
        >
            <div
                ref={dialogRef}
                className="europa-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={id}
                tabIndex={-1}
            >
                <h2 id={id} className="europa-modal__title">
                    {title}
                </h2>
                <div className="europa-modal__body">{children}</div>
                {actions && <div className="europa-modal__actions">{actions}</div>}
            </div>
        </div>
    );
}
