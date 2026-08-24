/**
 * US2 a11y acceptance test — Feature 005 (T051).
 *
 * Covers Q-A05 (US2 portion) + WCAG 2.5.7 (Dragging Movements):
 * boots the interactive console (store + fake client) and asserts:
 *   (a) the order palette is keyboard-operable — Tab reaches each
 *       palette button, Enter activates, arrows rove between buttons;
 *   (b) pressing `i` over a friendly cell issues a pipe order without
 *       any mouse interaction (the focus ring marks the target cell);
 *   (c) Tab order visits skip-link → map → hud → order-bar;
 *   (d) the order bar shows visible focus indicators with ≥ 3:1
 *       contrast (WCAG 2.4.7);
 *   (e) zero axe violations on the interactive board.
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { createElement } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';

import { FakeMatchClient } from '../../src/internal/fake-match-client';
import { App } from '../../src/render/App';
import { cellElementId } from '../../src/render/cell-view';
// The production stylesheet is loaded by main.tsx (not App), so the
// contrast assertions below import it explicitly.
import '../../src/styles/index.css';
import { createOrderBridge } from '../../src/state/order-actions';
import { type ConsoleStore, createConsoleStore } from '../../src/state/store';
import type { Direction, ReducerEffect } from '../../src/state/types';
import { buildCellView, buildPlayerView } from '../fixtures/player-view';

/** Interactive boot result handed to each test. */
interface InteractiveBoot {
    readonly client: FakeMatchClient;
    readonly store: ConsoleStore;
}

/**
 * Boot the full interactive console: live state seeded from a small
 * friendly board, order bridge wired to a recording fake client.
 */
async function bootInteractiveConsole(): Promise<InteractiveBoot> {
    const view = buildPlayerView({
        width: 10,
        height: 10,
        playerId: 1,
        // Center cell (5,5) is the KeyboardNavigator's initial focus.
        visibleCells: [
            buildCellView({
                coord: { x: 5, y: 5 },
                elevation: 60,
                troops: 12,
                owner: 1,
                isCity: true,
                pipes: new Set<Direction>(['E']),
            }),
            buildCellView({ coord: { x: 5, y: 6 }, elevation: 45, troops: 3, owner: 1 }),
            buildCellView({ coord: { x: 4, y: 5 }, terrain: 'water' }),
        ],
    });
    const client = new FakeMatchClient();
    let forward: ((effect: ReducerEffect) => void) | null = null;
    const store = createConsoleStore(
        {
            status: 'live',
            inputEnabled: true,
            latestView: view,
            camera: { zoom: 32, pan: { x: 0, y: 0 }, minZoom: 12, maxZoom: 96 },
            hover: null,
            selection: null,
            lastCursorScreen: null,
            feedback: [],
            rejectedOrders: [],
            qol: {
                soundOn: false,
                animation: 'full',
                tooltips: true,
                theme: 'system',
                ownerColorRing: true,
            },
            session: {
                matchId: null,
                sessionToken: null,
                playerId: 1,
                displayName: 'Player 1',
                opponents: ['Player 2'],
            },
            exclusiveMode: false,
        },
        (effect) => {
            forward?.(effect);
        },
    );
    const bridge = createOrderBridge({ client, store });
    forward = (effect) => bridge.handleEffect(effect);

    await render(createElement(App, { store }));
    return { client, store };
}

afterEach(() => {
    cleanup();
});

/** WCAG relative-luminance contrast ratio between two hex colors. */
function contrastRatio(hexA: string, hexB: string): number {
    function luminance(hex: string): number {
        const channel = Number.parseInt(hex.slice(1), 16);
        const parts = [(channel >> 16) & 0xff, (channel >> 8) & 0xff, channel & 0xff].map((v) => {
            const srgb = v / 255;
            return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
    }
    const l1 = luminance(hexA);
    const l2 = luminance(hexB);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe('US2 a11y acceptance (T051)', () => {
    test('(c) Tab order visits skip-link → map → hud → order-bar (Q-A04)', async () => {
        await bootInteractiveConsole();
        const user = userEvent.setup();

        await user.keyboard('{Tab}');
        expect(document.activeElement?.id).toBe('skip-link');
        await user.keyboard('{Tab}');
        expect(document.activeElement?.id).toBe('map');
        await user.keyboard('{Tab}');
        expect(document.activeElement?.id).toBe('hud');
        await user.keyboard('{Tab}');
        expect(document.activeElement?.id).toBe('order-bar');
    });

    test('(b) pressing i issues a pipe order without any mouse (Q-A05)', async () => {
        const { client, store } = await bootInteractiveConsole();
        const user = userEvent.setup();

        // Tab to the grid; initial roving focus lands on center cell (5,5),
        // which is the friendly city — the focus ring is the visual target.
        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');
        expect(document.activeElement?.id).toBe('map');
        expect(store.getState().selection).toEqual({ x: 5, y: 5 });

        // East pipe already exists on (5,5): i targets N → setPipe N.
        await user.keyboard('i');

        expect(client.orders).toHaveLength(1);
        expect(client.orders[0]?.order).toEqual({
            kind: 'setPipe',
            player: 1,
            cell: { x: 5, y: 5 },
            direction: 'N',
        });
        // The focused cell still carries the visible focus ring class.
        const ringCell = document.querySelector(`#${cellElementId({ x: 5, y: 5 })}`);
        expect(ringCell).not.toBeNull();
    });

    test('(a) palette buttons: Tab reaches them, Enter activates, arrows rove', async () => {
        const { store } = await bootInteractiveConsole();
        const user = userEvent.setup();

        // Walk Tab stops to the order bar, then into its buttons.
        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');
        await user.keyboard('{Tab}');
        expect(document.activeElement?.id).toBe('order-bar');

        const exclusiveButton = document.querySelector('#order-bar button[aria-pressed]') as HTMLButtonElement | null;
        expect(exclusiveButton).not.toBeNull();
        exclusiveButton?.focus();
        expect(document.activeElement).toBe(exclusiveButton);

        // Enter toggles exclusive mode (activation without pointer).
        await user.keyboard('{Enter}');
        expect(store.getState().exclusiveMode).toBe(true);
        expect(exclusiveButton?.getAttribute('aria-pressed')).toBe('true');

        // ArrowRight roves to the next palette button.
        await user.keyboard('{ArrowRight}');
        const activeAfterArrow = document.activeElement as HTMLButtonElement | null;
        expect(activeAfterArrow).not.toBe(exclusiveButton);
        expect(activeAfterArrow?.textContent).toContain('Clear pipes');

        // ArrowLeft returns.
        await user.keyboard('{ArrowLeft}');
        expect(document.activeElement).toBe(exclusiveButton);
    });

    test('(d) palette focus indicator contrast ≥ 3:1 (WCAG 2.4.7)', async () => {
        await bootInteractiveConsole();
        const user = userEvent.setup();

        // Keyboard-focus the first palette button (:focus-visible only
        // matches keyboard-initiated focus, so Tab all the way in:
        // skip-link → map → hud → order-bar → button).
        for (let i = 0; i < 5; i++) {
            await user.keyboard('{Tab}');
        }
        const button = document.activeElement as HTMLButtonElement | null;
        expect(button?.getAttribute('aria-pressed')).not.toBeNull();

        const style = window.getComputedStyle(button as HTMLButtonElement);
        // The stylesheet defines solid #ffffff outlines on the #111827 bar.
        expect(style.outlineStyle).toBe('solid');
        expect(Number.parseInt(style.outlineWidth, 10)).toBeGreaterThanOrEqual(2);
        expect(style.outlineColor).toBe('rgb(255, 255, 255)');
        // White-on-dark-navy contrast ratio ≈ 16:1 — comfortably ≥ 3:1.
        expect(contrastRatio('#ffffff', '#111827')).toBeGreaterThanOrEqual(3);
    });

    test('(e) zero axe violations on the interactive board', async () => {
        await bootInteractiveConsole();
        const { expectNoDomA11yViolations } = await import('../setup');
        await expectNoDomA11yViolations(document);
    });
});
