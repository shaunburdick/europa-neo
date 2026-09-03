/**
 * Component tests — help overlay (Feature 018, FR-001–FR-016).
 *
 * Verifies the HelpOverlay component renders all content sections,
 * handles open/close, displays correct game status, and manages
 * focus properly.
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { HelpOverlay } from '../../../src/ui/help-overlay';
import '../../../src/styles/index.css';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/** Default props for the help overlay. */
const DEFAULT_PROPS = {
    open: true,
    onClose: vi.fn(),
    tick: 42,
    playerName: 'TestPlayer',
    playerColor: '#dc2626',
    matchStatus: 'live',
    playerCount: 2,
};

describe('HelpOverlay component', () => {
    describe('content rendering', () => {
        test('renders the overlay title', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} />);
            const modal = document.querySelector('europa-modal');
            expect(modal).not.toBeNull();
            expect(modal?.getAttribute('title')).toBe('Game Help');
        });

        test('renders the Symbol Legend section', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} />);
            expect(document.body.textContent).toContain('Symbol Legend');
            expect(document.body.textContent).toContain('Pipe direction');
            expect(document.body.textContent).toContain('Troop count');
        });

        test('renders the Keyboard Shortcuts section', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} />);
            expect(document.body.textContent).toContain('Keyboard Shortcuts');
            expect(document.body.textContent).toContain('Toggle pipe');
            expect(document.body.textContent).toContain('Fire paratroop');
            expect(document.body.textContent).toContain('Set reserves');
        });

        test('renders the Game Status section', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} />);
            expect(document.body.textContent).toContain('Game Status');
            expect(document.body.textContent).toContain('Tick:');
            expect(document.body.textContent).toContain('42');
            expect(document.body.textContent).toContain('TestPlayer');
            expect(document.body.textContent).toContain('live');
            expect(document.body.textContent).toContain('2');
        });

        test('renders the Learn More section with manual link', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} />);
            expect(document.body.textContent).toContain('Learn More');
            const link = document.querySelector(
                'a[href*="shaunburdick.github.io/europa-neo/manual"]',
            ) as HTMLAnchorElement;
            expect(link).not.toBeNull();
            expect(link.target).toBe('_blank');
            expect(link.rel).toBe('noopener noreferrer');
        });

        test('renders keyboard shortcut for ? key', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} />);
            expect(document.body.textContent).toContain('?');
            expect(document.body.textContent).toContain('Toggle this help');
        });
    });

    describe('open/close behavior', () => {
        test('europa-modal has open attribute when open is true', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} open={true} />);
            const modal = document.querySelector('europa-modal');
            expect(modal?.hasAttribute('open')).toBe(true);
        });

        test('europa-modal lacks open attribute when open is false', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} open={false} />);
            const modal = document.querySelector('europa-modal');
            expect(modal?.hasAttribute('open')).toBe(false);
        });

        test('europa-close event calls onClose', async () => {
            const onClose = vi.fn();
            await render(<HelpOverlay {...DEFAULT_PROPS} onClose={onClose} />);
            const modal = document.querySelector('europa-modal');
            modal?.dispatchEvent(new CustomEvent('europa-close'));
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    describe('game status display', () => {
        test('shows tick number from props', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} tick={100} />);
            expect(document.body.textContent).toContain('100');
        });

        test('shows dash when tick is null', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} tick={null} />);
            expect(document.body.textContent).toContain('—');
        });

        test('shows player name', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} playerName="Alice" />);
            expect(document.body.textContent).toContain('Alice');
        });

        test('shows match status', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} matchStatus="reconnecting" />);
            expect(document.body.textContent).toContain('reconnecting');
        });

        test('shows player count', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} playerCount={4} />);
            expect(document.body.textContent).toContain('4');
        });

        test('shows player color indicator', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} playerColor="#2563eb" />);
            const colorIndicator = document.querySelector('[role="img"][aria-label*="Player color"]');
            expect(colorIndicator).not.toBeNull();
            expect(colorIndicator?.getAttribute('aria-label')).toContain('#2563eb');
        });
    });

    describe('documentation link', () => {
        test('link opens in new tab', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} />);
            const link = document.querySelector('a[target="_blank"]') as HTMLAnchorElement;
            expect(link).not.toBeNull();
            expect(link.target).toBe('_blank');
        });

        test('link has noopener noreferrer', async () => {
            await render(<HelpOverlay {...DEFAULT_PROPS} />);
            const link = document.querySelector('a[rel="noopener noreferrer"]') as HTMLAnchorElement;
            expect(link).not.toBeNull();
            expect(link.rel).toBe('noopener noreferrer');
        });
    });
});
