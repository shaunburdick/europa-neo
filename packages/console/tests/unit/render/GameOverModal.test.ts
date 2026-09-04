/**
 * GameOverModal unit tests — Feature 019 (T-013).
 *
 * Covers rendering, focus behavior, non-dismissability (FR-005),
 * and result text for win/draw outcomes. Runs in happy-dom via the
 * unit vitest config (not browser mode).
 */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../src/render/App';
import { GameOverModal } from '../../../src/render/GameOverModal';
import type { MatchResult, PlayerId } from '../../../src/state/types';

let container: HTMLDivElement;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
});

afterEach(() => {
    act(() => {
        const root = createRoot(container);
        root.unmount();
    });
    container.remove();
});

/** Render the modal into the test container. */
function renderModal(props: {
    open: boolean;
    result: MatchResult | null;
    onReturnToLobby: () => void;
    playerNames?: ReadonlyMap<PlayerId, string>;
}): void {
    act(() => {
        const root = createRoot(container);
        root.render(createElement(GameOverModal, props));
    });
}

/** A win result for testing. */
const winResult: MatchResult = {
    kind: 'win',
    winner: 1,
    tick: 1247,
    reason: 'last_standing',
};

/** A draw result for testing. */
const drawResult: MatchResult = {
    kind: 'draw',
    tick: 892,
    reason: 'mutual_elimination',
};

describe('GameOverModal', () => {
    it('renders nothing when open is false', () => {
        renderModal({ open: false, result: winResult, onReturnToLobby: vi.fn() });
        expect(document.querySelector('.europa-modal-backdrop')).toBeNull();
    });

    it('renders nothing when result is null', () => {
        renderModal({ open: true, result: null, onReturnToLobby: vi.fn() });
        expect(document.querySelector('.europa-modal-backdrop')).toBeNull();
    });

    it('renders correct title for win result (AC-002)', () => {
        renderModal({ open: true, result: winResult, onReturnToLobby: vi.fn() });
        const title = document.getElementById('gameover-title');
        expect(title?.textContent).toBe('Player 1 wins!');
    });

    it('renders correct body text for win with last_standing reason (AC-002)', () => {
        renderModal({ open: true, result: winResult, onReturnToLobby: vi.fn() });
        const body = document.getElementById('gameover-body');
        expect(body?.textContent).toContain('Reason: last standing');
        expect(body?.textContent).toContain('Final tick: 1247');
    });

    it('renders correct title for draw result (AC-008)', () => {
        renderModal({ open: true, result: drawResult, onReturnToLobby: vi.fn() });
        const title = document.getElementById('gameover-title');
        expect(title?.textContent).toBe('Draw');
    });

    it('renders correct body text for draw with mutual_elimination reason (AC-008)', () => {
        renderModal({ open: true, result: drawResult, onReturnToLobby: vi.fn() });
        const body = document.getElementById('gameover-body');
        expect(body?.textContent).toContain('Reason: mutual elimination');
        expect(body?.textContent).toContain('Final tick: 892');
    });

    it('button text is "Return to Lobby"', () => {
        renderModal({ open: true, result: winResult, onReturnToLobby: vi.fn() });
        const button = document.querySelector('.europa-modal__button') as HTMLButtonElement;
        expect(button?.textContent?.trim()).toBe('Return to Lobby');
    });

    it('button click calls onReturnToLobby exactly once (AC-006)', () => {
        const onReturnToLobby = vi.fn();
        renderModal({ open: true, result: winResult, onReturnToLobby });
        const button = document.querySelector('.europa-modal__button') as HTMLButtonElement;
        act(() => {
            button.click();
        });
        expect(onReturnToLobby).toHaveBeenCalledTimes(1);
    });

    it('focus is on the Return to Lobby button after mount (AC-007)', () => {
        renderModal({ open: true, result: winResult, onReturnToLobby: vi.fn() });
        const button = document.querySelector('.europa-modal__button') as HTMLButtonElement;
        expect(document.activeElement).toBe(button);
    });

    it('Escape does NOT call onReturnToLobby (AC-004)', () => {
        const onReturnToLobby = vi.fn();
        renderModal({ open: true, result: winResult, onReturnToLobby });
        const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
        act(() => {
            dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        });
        expect(onReturnToLobby).not.toHaveBeenCalled();
    });

    it('backdrop click does NOT call onReturnToLobby (AC-003)', () => {
        const onReturnToLobby = vi.fn();
        renderModal({ open: true, result: winResult, onReturnToLobby });
        const backdrop = document.querySelector('.europa-modal-backdrop') as HTMLElement;
        act(() => {
            backdrop.click();
        });
        expect(onReturnToLobby).not.toHaveBeenCalled();
    });

    it('dialog has correct ARIA attributes', () => {
        renderModal({ open: true, result: winResult, onReturnToLobby: vi.fn() });
        const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
        expect(dialog).not.toBeNull();
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.getAttribute('aria-labelledby')).toBe('gameover-title');
        expect(dialog.getAttribute('aria-describedby')).toBe('gameover-body');
    });

    it('win with all_surrendered reason shows correct text', () => {
        const result: MatchResult = {
            kind: 'win',
            winner: 2,
            tick: 300,
            reason: 'all_surrendered',
        };
        renderModal({ open: true, result, onReturnToLobby: vi.fn() });
        const body = document.getElementById('gameover-body');
        expect(body?.textContent).toContain('Reason: all surrendered');
    });

    it('Tab on the button keeps focus on the same button (single-element focus trap, AC-005)', () => {
        renderModal({ open: true, result: winResult, onReturnToLobby: vi.fn() });
        const button = document.querySelector('.europa-modal__button') as HTMLElement;
        act(() => {
            button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
        });
        expect(document.activeElement).toBe(button);
    });

    it('shows display name instead of numeric ID when playerNames is provided', () => {
        const names = new Map<PlayerId, string>([
            [1, 'Shaun'],
            [2, 'Chrome'],
        ]);
        renderModal({ open: true, result: winResult, onReturnToLobby: vi.fn(), playerNames: names });
        const title = document.getElementById('gameover-title');
        expect(title?.textContent).toBe('Shaun wins!');
    });

    it('falls back to Player N when playerNames does not contain the winner', () => {
        const names = new Map<PlayerId, string>([[2, 'Chrome']]);
        renderModal({ open: true, result: winResult, onReturnToLobby: vi.fn(), playerNames: names });
        const title = document.getElementById('gameover-title');
        expect(title?.textContent).toBe('Player 1 wins!');
    });

    it('falls back to Player N when playerNames is absent (backward compat)', () => {
        renderModal({ open: true, result: winResult, onReturnToLobby: vi.fn() });
        const title = document.getElementById('gameover-title');
        expect(title?.textContent).toBe('Player 1 wins!');
    });

    it('shows display name for winner ID 2', () => {
        const result: MatchResult = { kind: 'win', winner: 2, tick: 300, reason: 'all_surrendered' };
        const names = new Map<PlayerId, string>([
            [1, 'Shaun'],
            [2, 'Chrome'],
        ]);
        renderModal({ open: true, result, onReturnToLobby: vi.fn(), playerNames: names });
        const title = document.getElementById('gameover-title');
        expect(title?.textContent).toBe('Chrome wins!');
    });
});

describe('App conditional rendering of GameOverModal (AC-009, AC-010)', () => {
    /**
     * Minimal App render with controlled state for testing conditional
     * modal rendering. Does not set up the full interactive console —
     * just enough to verify the GameOverModal mount/unmount logic.
     */
    function renderAppWithGameState(
        status: string,
        matchResult: MatchResult | null,
        onReturnToLobby?: () => void,
    ): void {
        const state = {
            status,
            matchResult,
            latestView: null,
            initialWorld: null,
            camera: { zoom: 32, pan: { x: 0, y: 0 }, minZoom: 12, maxZoom: 96 },
            hover: null,
            selection: null,
            lastCursorScreen: null,
            feedback: [],
            rejectedOrders: [],
            qol: {
                soundOn: false,
                animation: 'full' as const,
                tooltips: true,
                theme: 'system' as const,
                ownerColorRing: true,
            },
            session: {
                matchId: null,
                sessionToken: null,
                playerId: null,
                displayName: '',
                opponents: [],
                playerNames: new Map(),
            },
            inputEnabled: false,
            exclusiveMode: false,
        } as import('../../../src/state/types').ConsoleState;

        act(() => {
            const root = createRoot(container);
            root.render(createElement(App, { state, ...(onReturnToLobby !== undefined ? { onReturnToLobby } : {}) }));
        });
    }

    it('does NOT render GameOverModal when onReturnToLobby is absent (AC-009)', () => {
        const winResult: MatchResult = { kind: 'win', winner: 1, tick: 100, reason: 'last_standing' };
        renderAppWithGameState('game_over', winResult);
        expect(document.querySelector('.europa-modal-backdrop')).toBeNull();
    });

    it('does NOT render GameOverModal when matchResult is null even with onReturnToLobby', () => {
        const onReturnToLobby = vi.fn();
        renderAppWithGameState('game_over', null, onReturnToLobby);
        expect(document.querySelector('.europa-modal-backdrop')).toBeNull();
    });

    it('does NOT render GameOverModal when status is not game_over', () => {
        const onReturnToLobby = vi.fn();
        const winResult: MatchResult = { kind: 'win', winner: 1, tick: 100, reason: 'last_standing' };
        renderAppWithGameState('live', winResult, onReturnToLobby);
        expect(document.querySelector('.europa-modal-backdrop')).toBeNull();
    });

    it('renders GameOverModal when all three conditions are met (AC-010)', () => {
        const onReturnToLobby = vi.fn();
        const winResult: MatchResult = { kind: 'win', winner: 1, tick: 100, reason: 'last_standing' };
        renderAppWithGameState('game_over', winResult, onReturnToLobby);
        expect(document.querySelector('.europa-modal-backdrop')).not.toBeNull();
        const title = document.getElementById('gameover-title');
        expect(title?.textContent).toBe('Player 1 wins!');
    });

    it('passes display names to GameOverModal from session state', () => {
        const onReturnToLobby = vi.fn();
        const winResult: MatchResult = { kind: 'win', winner: 2, tick: 100, reason: 'last_standing' };
        const state = {
            status: 'game_over',
            matchResult: winResult,
            latestView: null,
            initialWorld: null,
            camera: { zoom: 32, pan: { x: 0, y: 0 }, minZoom: 12, maxZoom: 96 },
            hover: null,
            selection: null,
            lastCursorScreen: null,
            feedback: [],
            rejectedOrders: [],
            qol: {
                soundOn: false,
                animation: 'full' as const,
                tooltips: true,
                theme: 'system' as const,
                ownerColorRing: true,
            },
            session: {
                matchId: null,
                sessionToken: null,
                playerId: 1 as import('../../../src/state/types').PlayerId,
                displayName: 'Shaun',
                opponents: ['Chrome'],
                playerNames: new Map([
                    [1 as import('../../../src/state/types').PlayerId, 'Shaun'],
                    [2 as import('../../../src/state/types').PlayerId, 'Chrome'],
                ]),
            },
            inputEnabled: false,
            exclusiveMode: false,
        } as import('../../../src/state/types').ConsoleState;

        act(() => {
            const root = createRoot(container);
            root.render(createElement(App, { state, onReturnToLobby }));
        });
        expect(document.querySelector('.europa-modal-backdrop')).not.toBeNull();
        const title = document.getElementById('gameover-title');
        expect(title?.textContent).toBe('Chrome wins!');
    });
});
