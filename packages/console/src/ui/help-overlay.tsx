/**
 * Help overlay modal — Feature 018 (In-Match Help Overlay, FR-001–FR-016).
 *
 * A comprehensive in-match help surface that explains every symbol,
 * color, and control on the screen. Uses the `europa-modal` web
 * component (Feature 014) for the dialog shell, which provides:
 *   - `role="dialog"` + `aria-modal="true"` (AC-012)
 *   - Focus trap (Tab cycles within overlay — AC-012)
 *   - Escape to close (AC-005)
 *   - Backdrop click to close (AC-007)
 *   - Focus restore to previously-focused element on close (AC-013)
 *
 * Content is hardcoded per FR-004/FR-005 — not sourced from manual
 * markdown files. The overlay is stateless; open/close is controlled
 * by the parent (App.tsx) via the `open` prop.
 *
 * Game status section (FR-007) reads from the resolved state to show
 * the current tick, player identity, match status, and player count.
 *
 * Accessibility (WCAG 2.2 AA):
 *   - `aria-labelledby` pointing to the overlay title
 *   - Scrollable when content exceeds viewport (FR-015)
 *   - All text meets 4.5:1 contrast ratio
 *   - Screen reader navigation via headings
 */

import type { JSX } from 'react';
import { useEffect, useRef } from 'react';

import './help-overlay.css';

// JSX intrinsic declaration for the <europa-modal> web component from
// @europa/design. The component is registered at runtime; this
// declaration lets TypeScript accept the tag in JSX. Children are
// projected via the default <slot> inside the shadow root.
declare module 'react' {
    namespace JSX {
        interface IntrinsicElements {
            'europa-modal': {
                title?: string;
                open?: boolean;
                onEuropaClose?: (() => void) | undefined;
                children?: React.ReactNode;
                ref?: React.Ref<HTMLElement>;
            };
        }
    }
}

/** Props for {@link HelpOverlay}. */
export interface HelpOverlayProps {
    /** Whether the overlay is visible. */
    readonly open: boolean;
    /** Called when the overlay should close (Escape, backdrop, close button). */
    readonly onClose: () => void;
    /** Current game tick number (from `resolvedState.latestView.tick`). */
    readonly tick: number | null;
    /** Player display name (from `resolvedState.session.displayName`). */
    readonly playerName: string;
    /** Player color hex (from `DEFAULT_PLAYER_COLORS`). */
    readonly playerColor: string;
    /** Current connection status (from `resolvedState.status`). */
    readonly matchStatus: string;
    /** Total player count (opponents + 1). */
    readonly playerCount: number;
}

/** Symbol legend entries (FR-004). Hardcoded content. */
const SYMBOL_LEGEND: ReadonlyArray<{ readonly symbol: string; readonly description: string }> = [
    { symbol: '▲ N / ▶ E / ▼ S / ◀ W', description: 'Pipe direction — troops flow through this pipe' },
    { symbol: '🟢 Green', description: 'Downhill pipe (flow accelerates)' },
    { symbol: '🟡 Amber', description: 'Flat pipe (normal flow)' },
    { symbol: '🔴 Red', description: 'Uphill pipe (flow decelerates)' },
    { symbol: '⚪ Hollow', description: 'Stalled pipe (no flow — too steep)' },
    { symbol: '[12]', description: 'Troop count on cell' },
    { symbol: '⬤ City', description: 'City ownership (player color fill)' },
    { symbol: '░░░ Fog', description: 'Unknown area (not in horizon)' },
    { symbol: '██ Elevation', description: 'Terrain height (dark = low, light = high)' },
    { symbol: '70% Reserves', description: 'Reserve percentage on cell' },
    { symbol: '⚡ Combat', description: 'Battle or capture in progress' },
    { symbol: '··· Paratroop', description: 'Paratroop targeting path (range 2)' },
    { symbol: '─── Gun', description: 'Gun fire line' },
];

/** Keyboard shortcut entries (FR-005). Hardcoded from DEFAULT_INPUT_MAPPING. */
const KEYBOARD_SHORTCUTS: ReadonlyArray<{ readonly keys: string; readonly action: string }> = [
    { keys: 'i / j / k / l', action: 'Toggle pipe N / W / S / E' },
    { keys: 'Alt+i / Alt+j / Alt+k / Alt+l', action: 'Exclusive pipe N / W / S / E' },
    { keys: 'Space', action: 'Clear all pipes in selected cell' },
    { keys: 'p (or h)', action: 'Fire paratroop' },
    { keys: 'g (or o)', action: 'Fire gun' },
    { keys: '0–9', action: 'Set reserves 0%–90%' },
    { keys: 'Escape', action: 'Cancel selection' },
    { keys: 'Arrow keys', action: 'Move selection' },
    { keys: '?', action: 'Toggle this help' },
];

/** The player manual URL (FR-006). */
const MANUAL_URL = 'https://shaunburdick.github.io/europa-neo/manual/';

/**
 * The help overlay modal. Renders inside a `<europa-modal>` web
 * component which handles the dialog shell, focus trap, and
 * dismissal. The overlay content is organized into sections per
 * FR-015: Symbol Legend, Keyboard Shortcuts, Game Status, Learn More.
 */
export function HelpOverlay({
    open,
    onClose,
    tick,
    playerName,
    playerColor,
    matchStatus,
    playerCount,
}: HelpOverlayProps): JSX.Element {
    const modalRef = useRef<HTMLElement | null>(null);

    // Listen for the europa-close event from the web component and
    // forward it to the onClose callback.
    useEffect(() => {
        const modal = modalRef.current;
        if (modal === null) {
            return undefined;
        }
        const handleClose = (): void => {
            onClose();
        };
        modal.addEventListener('europa-close', handleClose);
        return () => {
            modal.removeEventListener('europa-close', handleClose);
        };
    }, [onClose]);

    // When the modal opens, sync the open attribute and capture a ref.
    const setModalRef = (node: HTMLElement | null): void => {
        (modalRef as React.MutableRefObject<HTMLElement | null>).current = node;
        if (node !== null && open) {
            node.setAttribute('open', '');
        } else if (node !== null && !open) {
            node.removeAttribute('open');
        }
    };

    return (
        <europa-modal ref={setModalRef} title="Game Help" {...(open ? { open: true } : {})}>
            <div className="europa-help-overlay__content">
                {/* Symbol Legend (FR-004) */}
                <h2 id="help-legend-title" className="europa-help-overlay__section-title">
                    Symbol Legend
                </h2>
                <dl className="europa-help-overlay__legend">
                    {SYMBOL_LEGEND.map((entry) => (
                        <div key={entry.symbol} className="europa-help-overlay__legend-symbol">
                            <dt>{entry.symbol}</dt>
                            <dd className="europa-help-overlay__legend-desc">{entry.description}</dd>
                        </div>
                    ))}
                </dl>

                {/* Keyboard Shortcuts (FR-005) */}
                <h2 id="help-shortcuts-title" className="europa-help-overlay__section-title">
                    Keyboard Shortcuts
                </h2>
                <table className="europa-help-overlay__shortcuts" aria-labelledby="help-shortcuts-title">
                    <thead>
                        <tr>
                            <th scope="col">Keys</th>
                            <th scope="col">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {KEYBOARD_SHORTCUTS.map((entry) => (
                            <tr key={entry.keys}>
                                <td>{entry.keys}</td>
                                <td>{entry.action}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Game Status (FR-007) */}
                <h2 id="help-status-title" className="europa-help-overlay__section-title">
                    Game Status
                </h2>
                <section className="europa-help-overlay__status" aria-labelledby="help-status-title">
                    <span className="europa-help-overlay__status-item">
                        <span className="europa-help-overlay__status-label">Tick:</span>
                        <span>{tick ?? '—'}</span>
                    </span>
                    <span className="europa-help-overlay__status-item">
                        <span className="europa-help-overlay__status-label">You:</span>
                        <span>
                            {playerName}{' '}
                            <span role="img" style={{ color: playerColor }} aria-label={`Player color: ${playerColor}`}>
                                ●
                            </span>
                        </span>
                    </span>
                    <span className="europa-help-overlay__status-item">
                        <span className="europa-help-overlay__status-label">Status:</span>
                        <span>{matchStatus}</span>
                    </span>
                    <span className="europa-help-overlay__status-item">
                        <span className="europa-help-overlay__status-label">Players:</span>
                        <span>{playerCount}</span>
                    </span>
                </section>

                {/* Learn More (FR-006) */}
                <div className="europa-help-overlay__learn-more">
                    <h2 id="help-learn-more-title" className="europa-help-overlay__section-title">
                        Learn More
                    </h2>
                    <a
                        className="europa-help-overlay__link europa-focus-ring"
                        href={MANUAL_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Open Player Manual →
                    </a>
                </div>
            </div>
        </europa-modal>
    );
}
