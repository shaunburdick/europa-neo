/**
 * Surrender confirmation modal — Feature 005 (T084).
 *
 * The explicit confirm gate for the surrender order (spec US5 AC-2,
 * Q-E12, FR-009): a `role="dialog" aria-modal="true"` surface with
 * Cancel/Confirm, keyboard-trapped focus (Tab cycles between the two
 * buttons), Escape to cancel, and Enter activating Confirm natively.
 * Confirming dispatches `{ kind: 'surrender' }` through
 * {@link SurrenderModalProps.onConfirm} — the reducer then stamps and
 * sends the wire order (FR-009).
 *
 * Architecture note (Wave 8E deviation, documented): the contract's
 * `requestSurrenderConfirm` ReducerEffect is emitted by no reducer
 * branch in v1 — the confirm gate lives HERE in the UI layer (the
 * surrender button opens this modal; only Confirm dispatches the
 * action), which preserves US5 AC-2's "confirm before send" without
 * growing the frozen effect union. When the host supplies
 * `ConsoleConfig.onSurrenderRequest`, App delegates to it instead of
 * opening this modal (the contract's host-owned-modal option).
 *
 * Accessibility: focus moves into the dialog on open (first button),
 * is trapped between the two buttons while open, returns to the
 * previously-focused element on close (caller's responsibility via
 * the trigger button retaining focus semantics), Escape cancels, and
 * the whole surface is axe-clean (Q-A02).
 *
 * JSDoc references: US5 AC-2 + WCAG 2.4.3 (Focus Order) + Q-A04.
 */

import type { JSX } from 'react';
import { useEffect, useRef } from 'react';

/** Props for {@link SurrenderModal}. */
export interface SurrenderModalProps {
    /** Whether the modal is open. Renders nothing when `false`. */
    readonly open: boolean;
    /** Confirm handler — dispatches the surrender action. */
    readonly onConfirm: () => void;
    /** Cancel handler — closes the modal with no order sent. */
    readonly onCancel: () => void;
}

/**
 * The surrender confirmation dialog. Focus-trapped while open.
 */
export function SurrenderModal({ open, onConfirm, onCancel }: SurrenderModalProps): JSX.Element | null {
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
    const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

    // Move focus into the dialog when it opens (WCAG 2.4.3).
    useEffect(() => {
        if (open) {
            cancelButtonRef.current?.focus();
        }
    }, [open]);

    if (!open) {
        return null;
    }

    /**
     * Keyboard contract: Tab / Shift+Tab cycle between the two buttons;
     * Escape cancels. Enter/Space activate natively (real buttons).
     */
    function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
        if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
            return;
        }
        if (event.key !== 'Tab') {
            return;
        }
        event.preventDefault();
        const active = document.activeElement;
        const onConfirmButton = active === confirmButtonRef.current;
        const next = event.shiftKey
            ? onConfirmButton
                ? cancelButtonRef.current
                : confirmButtonRef.current
            : active === cancelButtonRef.current
              ? confirmButtonRef.current
              : cancelButtonRef.current;
        next?.focus();
    }

    return (
        <div className="europa-modal-backdrop">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="surrender-title"
                aria-describedby="surrender-body"
                className="europa-modal europa-focus-ring"
                onKeyDown={handleKeyDown}
            >
                <h2 id="surrender-title" className="europa-modal__title">
                    Surrender?
                </h2>
                <p id="surrender-body" className="europa-modal__body">
                    Your cities fall under enemy control and you join as a spectator. This cannot be undone.
                </p>
                <div className="europa-modal__actions">
                    <button
                        type="button"
                        ref={cancelButtonRef}
                        className="europa-modal__button europa-focus-ring"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        ref={confirmButtonRef}
                        className="europa-modal__button europa-modal__button--danger europa-focus-ring"
                        onClick={onConfirm}
                    >
                        Confirm surrender
                    </button>
                </div>
            </div>
        </div>
    );
}
