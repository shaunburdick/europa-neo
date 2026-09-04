/**
 * Game-over results modal — Feature 019 (FR-002..FR-007).
 *
 * A non-dismissable `role="dialog" aria-modal="true"` overlay that
 * displays the match result (who won, reason, final tick) and a
 * single "Return to Lobby" action button. Follows the
 * {@link SurrenderModal} pattern for DOM structure and CSS classes.
 *
 * Accessibility:
 *   - Focus moves to the "Return to Lobby" button on mount
 *     (WCAG 2.4.3 Focus Order).
 *   - The single-button focus trap cycles Tab/Shift+Tab on the same
 *     button — no other focusable elements exist in the dialog.
 *   - No Escape handler (FR-005: non-dismissable).
 *   - No backdrop click handler (FR-005: non-dismissable).
 *   - Screen-reader announcement is handled by the reducer's
 *     `announce` effect (FR-007, FR-012), not by this component.
 *
 * JSDoc references: FR-002, FR-003, FR-004, FR-005, FR-006, FR-007.
 */

import type { JSX } from 'react';
import { useEffect, useRef } from 'react';

import type { MatchResult } from '../state/types';

/** Props for {@link GameOverModal}. */
export interface GameOverModalProps {
    /** Whether the modal is open. Renders nothing when `false`. */
    readonly open: boolean;
    /** The engine's terminal match result. Renders nothing when `null`. */
    readonly result: MatchResult | null;
    /** Callback invoked when the user activates "Return to Lobby". */
    readonly onReturnToLobby: () => void;
}

/**
 * Build the display title from a match result.
 *
 * @param result The engine's terminal match result.
 * @returns Human-readable title string.
 */
function resultTitle(result: MatchResult): string {
    switch (result.kind) {
        case 'win':
            return `Player ${String(result.winner)} wins!`;
        case 'draw':
            return 'Draw';
        default:
            return 'Match over';
    }
}

/**
 * Build the reason text from a match result.
 *
 * @param result The engine's terminal match result.
 * @returns Human-readable reason string.
 */
function resultReason(result: MatchResult): string {
    switch (result.kind) {
        case 'win':
            return result.reason === 'last_standing' ? 'Reason: last standing' : 'Reason: all surrendered';
        case 'draw':
            return 'Reason: mutual elimination';
        default:
            return '';
    }
}

/**
 * The game-over results dialog. Non-dismissable — the only exit is
 * the "Return to Lobby" button (FR-005).
 */
export function GameOverModal({ open, result, onReturnToLobby }: GameOverModalProps): JSX.Element | null {
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    // Move focus to the Return to Lobby button on open (WCAG 2.4.3).
    useEffect(() => {
        if (open && result !== null) {
            buttonRef.current?.focus();
        }
    }, [open, result]);

    if (!open || result === null) {
        return null;
    }

    /**
     * Keyboard contract: Tab/Shift+Tab refocus the single button
     * (single-element focus trap). No Escape handler (FR-005).
     */
    function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
        if (event.key === 'Tab') {
            event.preventDefault();
            buttonRef.current?.focus();
        }
    }

    return (
        <div className="europa-modal-backdrop">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="gameover-title"
                aria-describedby="gameover-body"
                className="europa-modal europa-focus-ring"
                onKeyDown={handleKeyDown}
            >
                <h2 id="gameover-title" className="europa-modal__title">
                    {resultTitle(result)}
                </h2>
                <p id="gameover-body" className="europa-modal__body">
                    {resultReason(result)}
                    <br />
                    Final tick: {String(result.tick)}
                </p>
                <div className="europa-modal__actions">
                    <button
                        type="button"
                        ref={buttonRef}
                        className="europa-modal__button europa-focus-ring"
                        onClick={onReturnToLobby}
                    >
                        Return to Lobby
                    </button>
                </div>
            </div>
        </div>
    );
}
