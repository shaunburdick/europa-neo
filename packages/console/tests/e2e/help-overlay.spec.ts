/**
 * E2E — help overlay (Feature 018, FR-001–FR-016).
 *
 * Tests the help overlay open/close behavior via the ? key and the
 * help button, plus tooltip visibility on hover.
 *
 * The overlay is only available in the match view (the App component
 * renders the help button and keyboard listener in interactive mode).
 * This spec spins up a real match server, creates + fills a 2-player
 * match (auto-start), then one browser joins through the semantic
 * match route to reach the game view.
 *
 * Determinism: all waits poll observable DOM conditions.
 */

import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';

import { computePlayerView } from '@europa/fog';
import { createMatchmaker } from '@europa/matchmaking';
import {
    createMatchServer,
    type Logger,
    type MatchmakerBridge,
    NETWORK_DEFAULT_CONFIG,
    NULL_LOGGER,
    type Server,
    type ServerDeps,
} from '@europa/networking';
import { expect, type Page, test } from '@playwright/test';

const TICK_MS = 100;

// ---------------------------------------------------------------------------
// Stack wiring (same recipe as full-stack.spec.ts)
// ---------------------------------------------------------------------------

function buildStack(): {
    httpServer: HttpServer;
    server: Server;
    matchmaker: ReturnType<typeof createMatchmaker>;
} {
    let bound: MatchmakerBridge = {};
    const forwardingBridge: MatchmakerBridge = {
        onSeatClaimed: (event) => bound.onSeatClaimed?.(event),
        onSeatDisconnected: (event) => bound.onSeatDisconnected?.(event),
        onSeatReconnected: (event) => bound.onSeatReconnected?.(event),
        onSeatExpired: (event) => bound.onSeatExpired?.(event),
        onMatchTerminal: (event) => bound.onMatchTerminal?.(event),
    };

    const httpServer: HttpServer = createHttpServer();

    const deps: ServerDeps = {
        engine: {
            createMatchSession: () => {
                throw new Error('engine factory not used (matchmaker pre-builds sessions)');
            },
        },
        fog: {
            computePlayerView: ({ world, playerId, spectator }) => computePlayerView(world, playerId, { spectator }),
        },
        matchmaker: forwardingBridge,
        logger: NULL_LOGGER as Logger,
        httpServer,
    };

    const server = createMatchServer(
        {
            ...NETWORK_DEFAULT_CONFIG,
            host: '127.0.0.1',
            port: 0,
            tickRateMs: TICK_MS,
            ordersPerSecond: 1000,
        },
        deps,
    );

    const bindable = Object.assign(server, {
        bindMatchmaker(bridge: MatchmakerBridge): void {
            bound = { ...bound, ...bridge };
        },
    });
    const matchmaker = createMatchmaker({}, { server: bindable });
    return { httpServer, server, matchmaker };
}

// ---------------------------------------------------------------------------
// Browser-side helpers
// ---------------------------------------------------------------------------

interface LiveHandleView {
    readonly store: {
        getState(): { readonly status: string };
    };
    readonly client: { state(): { readonly connection: string } };
    bootError: string | null;
}

async function waitUntil(page: Page, when: (live: { status: string }) => boolean, description: string): Promise<void> {
    await expect
        .poll(
            async () => {
                const live = await page.evaluate(() => {
                    const handle = (window as unknown as { __europaLive?: LiveHandleView }).__europaLive;
                    if (handle === undefined || handle.store === undefined) {
                        return null;
                    }
                    return { status: handle.store.getState().status };
                });
                if (live === null) {
                    return false;
                }
                return when(live);
            },
            { timeout: 15_000, intervals: [100, 250, 500] },
        )
        .toBe(true, description);
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

test.describe('help overlay', () => {
    test.setTimeout(60_000);

    let httpServer: HttpServer;
    let server: Server;
    let matchmaker: ReturnType<typeof createMatchmaker>;
    let port: number;
    let matchId: string;

    test.beforeAll(async () => {
        ({ httpServer, server, matchmaker } = buildStack());
        await new Promise<void>((resolve, reject) => {
            httpServer.once('error', reject);
            httpServer.listen(0, '127.0.0.1', () => resolve());
        });
        await server.listen();
        port = (server as unknown as { __boundPortForTest(): number }).__boundPortForTest();

        // Create + fill a 2-player match (auto-starts on fill).
        const created = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'TestPlayer',
            settings: { playerCount: 2, boardSize: 32, tickIntervalMs: TICK_MS },
        });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        matchId = created.data.matchId;

        const filled = matchmaker.joinMatch({ matchId, displayName: 'Opponent' });
        expect(filled.ok).toBe(true);
    });

    test.afterAll(async () => {
        server.close();
        httpServer.close();
    });

    /** Open the match view in a fresh page. */
    async function openMatchPage(page: Page): Promise<void> {
        await page.addInitScript(
            ({ wsUrl, matchId, displayName }) => {
                (window as unknown as { __europaTestMatch: object }).__europaTestMatch = {
                    wsUrl,
                    matchId,
                    displayName,
                };
            },
            { wsUrl: `ws://127.0.0.1:${String(port)}`, matchId, displayName: 'TestPlayer' },
        );
        await page.goto(`/match/${encodeURIComponent(matchId)}/join`);
        await waitUntil(page, (live) => live.status === 'live', 'player reaches live');
        // Wait for the HUD to be visible (the help button is inside it).
        await page.waitForSelector('.europa-hud', { timeout: 10_000 });
    }

    test('pressing ? opens the help overlay', async ({ page }) => {
        await openMatchPage(page);

        await page.keyboard.press('?');

        const modal = page.locator('europa-modal');
        await expect(modal).toHaveAttribute('open', '');
    });

    test('pressing ? again closes the help overlay', async ({ page }) => {
        await openMatchPage(page);

        await page.keyboard.press('?');
        const modal = page.locator('europa-modal');
        await expect(modal).toHaveAttribute('open', '');

        await page.keyboard.press('?');
        await expect(modal).not.toHaveAttribute('open', '');
    });

    test('pressing Escape closes the help overlay', async ({ page }) => {
        await openMatchPage(page);

        await page.keyboard.press('?');
        const modal = page.locator('europa-modal');
        await expect(modal).toHaveAttribute('open', '');

        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveAttribute('open', '');
    });

    test('the help button in the HUD opens the overlay', async ({ page }) => {
        await openMatchPage(page);

        const helpButton = page.locator('.europa-help-button');
        await helpButton.click();

        const modal = page.locator('europa-modal');
        await expect(modal).toHaveAttribute('open', '');
    });

    test('the help button toggles the overlay closed', async ({ page }) => {
        await openMatchPage(page);

        const helpButton = page.locator('.europa-help-button');
        const modal = page.locator('europa-modal');

        await helpButton.click();
        await expect(modal).toHaveAttribute('open', '');

        await helpButton.click();
        await expect(modal).not.toHaveAttribute('open', '');
    });

    test('the help button is visible in the HUD', async ({ page }) => {
        await openMatchPage(page);

        const helpButton = page.locator('.europa-help-button');
        await expect(helpButton).toBeVisible();
        await expect(helpButton).toHaveText('?');
    });

    test('the overlay contains all expected sections', async ({ page }) => {
        await openMatchPage(page);

        await page.keyboard.press('?');

        const content = page.locator('.europa-help-overlay__content');
        await expect(content).toContainText('Symbol Legend');
        await expect(content).toContainText('Keyboard Shortcuts');
        await expect(content).toContainText('Game Status');
        await expect(content).toContainText('Learn More');
    });

    test('the overlay contains the player manual link', async ({ page }) => {
        await openMatchPage(page);

        await page.keyboard.press('?');

        const link = page.locator('a[href*="shaunburdick.github.io/europa-neo/manual"]');
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    test('tooltip appears on hover over the help button', async ({ page }) => {
        await openMatchPage(page);

        // Hover over the help button wrapper.
        const helpWrapper = page.locator('.europa-help-button').locator('..');
        await helpWrapper.hover();

        // The tooltip should become visible (no --hidden class).
        const tooltip = page.locator('[role="tooltip"]');
        await expect(tooltip).not.toHaveClass(/europa-tooltip--hidden/);
    });
});
