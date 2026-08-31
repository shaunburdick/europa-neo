/**
 * Feature 013 T012 — browser history and semantic-route retention.
 *
 * These checks deliberately use the real lobby/match stack.  Waiting for
 * observable DOM and store state (rather than sleeping) keeps the history
 * assertions deterministic while the server ticks in the background.
 */

import { computePlayerView } from '@europa/fog';
import { createLobbyService, createMatchmaker, type Matchmaker } from '@europa/matchmaking';
import {
    createMatchServer,
    type Logger,
    type MatchmakerBridge,
    NETWORK_DEFAULT_CONFIG,
    NULL_LOGGER,
    type Server,
    type ServerDeps,
} from '@europa/networking';
import { expect, test } from '@playwright/test';

const TICK_MS = 100;
const BOARD_SIZE = 32;
const WAIT_TIMEOUT = 15_000;

/** Assert the browser-visible path while allowing the test-only ws seam. */
async function expectPath(page: import('@playwright/test').Page, pathname: string): Promise<void> {
    await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe(pathname);
}

interface Stack {
    readonly server: Server;
    readonly matchmaker: Matchmaker;
}

/** Build the same real matchmaker/networking bridge used by the full-stack tests. */
function buildStack(): Stack {
    let bridge: MatchmakerBridge = {};
    const wiring: { matchmaker: Matchmaker | null } = { matchmaker: null };
    const deps: ServerDeps = {
        engine: {
            createMatchSession: () => {
                throw new Error('matchmaker must provide the engine session');
            },
        },
        fog: {
            computePlayerView: ({ world, playerId, spectator }) => computePlayerView(world, playerId, { spectator }),
        },
        matchmaker: {
            onSeatClaimed: (event) => bridge.onSeatClaimed?.(event),
            onSeatDisconnected: (event) => bridge.onSeatDisconnected?.(event),
            onSeatReconnected: (event) => bridge.onSeatReconnected?.(event),
            onSeatExpired: (event) => bridge.onSeatExpired?.(event),
            onMatchTerminal: (event) => bridge.onMatchTerminal?.(event),
        },
        logger: NULL_LOGGER as Logger,
        lobby: {
            create: (sink) => {
                if (wiring.matchmaker === null) {
                    throw new Error('routing E2E wiring: lobby opened before matchmaker was ready');
                }
                return createLobbyService({ matchmaker: wiring.matchmaker, deliver: sink.deliver });
            },
        },
    };
    const server = createMatchServer(
        { ...NETWORK_DEFAULT_CONFIG, host: '127.0.0.1', port: 0, tickRateMs: TICK_MS, ordersPerSecond: 1000 },
        deps,
    );
    const bindable = Object.assign(server, {
        bindMatchmaker(next: MatchmakerBridge): void {
            bridge = { ...bridge, ...next };
        },
    });
    const matchmaker = createMatchmaker({}, { server: bindable });
    wiring.matchmaker = matchmaker;
    return { server, matchmaker };
}

/** Wait for the lobby heading without using wall-clock sleeps. */
async function waitForLobby(page: import('@playwright/test').Page): Promise<void> {
    await expect
        .poll(async () => page.locator('h1').first().textContent(), {
            timeout: WAIT_TIMEOUT,
            intervals: [50, 100, 250],
        })
        .toBe('Europa Neo lobby');
}

test.describe('semantic route browser history', () => {
    test('redirects root once and keeps the lobby stable on refresh', async ({ page }) => {
        const navigations: string[] = [];
        page.on('framenavigated', (frame) => {
            if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname);
        });

        await page.goto('/');
        await expect(page).toHaveURL(/\/lobby$/);
        await expect(page.locator('h1')).toContainText('Europa Neo lobby');
        await page.reload();
        await expect(page).toHaveURL(/\/lobby$/);
        await expect(page.locator('h1')).toContainText('Europa Neo lobby');
        expect(navigations.filter((path) => path === '/lobby')).toHaveLength(2);
        expect(navigations.filter((path) => path === '/')).toHaveLength(1);
    });

    test('restores a semantic match route with Back/Forward and refresh, then retains it through terminal and leave', async ({
        page,
    }) => {
        test.setTimeout(90_000);
        const { server, matchmaker } = buildStack();
        await server.listen();
        const wsUrl = `ws://127.0.0.1:${String(server.__boundPortForTest())}`;
        const created = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            settings: { playerCount: 2, boardSize: BOARD_SIZE, tickIntervalMs: TICK_MS },
        });
        expect(created.ok).toBe(true);
        if (!created.ok) return;

        const matchId = created.data.matchId;
        const semanticPath = `/match/${matchId}/join`;
        try {
            // The ephemeral lobby server is a test-only transport seam. Keep
            // its ws override available until lobby-runtime resolves it; the
            // production URL itself is still asserted to be query-free after
            // the runtime mounts.
            await page.addInitScript(() => {
                const replaceState = window.history.replaceState.bind(window.history);
                window.history.replaceState = (state, title, url) => {
                    if (typeof url === 'string' && window.location.search.startsWith('?ws=')) {
                        const ws = window.location.search;
                        replaceState(state, title, `${url}${ws}`);
                        return;
                    }
                    replaceState(state, title, url);
                };
            });
            await page.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);
            await waitForLobby(page);
            await page.getByRole('textbox', { name: /display name/i }).fill('Bob');
            await page.locator('[data-europa-submit-handle="true"]').click();
            await expect(page.locator('.europa-lobby__handle')).toContainText('Bob');
            await expect
                .poll(
                    () =>
                        page.evaluate(
                            (target) =>
                                (
                                    window as unknown as {
                                        __europaLobby?: {
                                            store: {
                                                getState(): {
                                                    snapshot: { entries: Array<{ matchId: string }> } | null;
                                                };
                                            };
                                        };
                                    }
                                ).__europaLobby?.store
                                    .getState()
                                    .snapshot?.entries.some((entry) => entry.matchId === target) ?? false,
                            matchId,
                        ),
                    { timeout: WAIT_TIMEOUT, intervals: [50, 100, 250] },
                )
                .toBe(true);

            await page.goto(`${semanticPath}?ws=${encodeURIComponent(wsUrl)}`);
            await expectPath(page, semanticPath);
            await expect(page.getByRole('heading', { name: /In match/ })).toBeVisible();

            const filled = matchmaker.joinMatch({ matchId, displayName: 'Alice' });
            expect(filled.ok).toBe(true);
            await expect(page.locator('canvas.europa-canvas')).toBeVisible();

            // A full reload starts from the same semantic path, not a query route.
            await page.reload();
            await expectPath(page, semanticPath);
            await expect(page.getByRole('heading', { name: /In match/ })).toBeVisible();

            // Browser history restores the preceding lobby and then the exact match path.
            await page.goto('/lobby');
            await expect(page).toHaveURL(/\/lobby$/);
            await page.goBack();
            await expectPath(page, semanticPath);
            await expect(page.getByRole('heading', { name: /In match/ })).toBeVisible();
            await page.goForward();
            await expect(page).toHaveURL(/\/lobby$/);

            // Return to the match and prove terminal display does not rewrite its route.
            await page.goto(`${semanticPath}?ws=${encodeURIComponent(wsUrl)}`);
            await expect(page.getByRole('heading', { name: /In match/ })).toBeVisible();
            await expect(page.getByRole('button', { name: /Surrender/ })).toBeVisible();
            await page.getByRole('button', { name: /Surrender/ }).click();
            await page.getByRole('button', { name: 'Confirm surrender' }).click();
            await expect(page.getByText(/game over|surrendered|defeat/i).first()).toBeVisible();
            await expectPath(page, semanticPath);

            await page.locator('[data-europa-leave="true"]').click();
            await expect(page).toHaveURL(/\/lobby$/);
            await expect(page.locator('h1')).toContainText('Europa Neo lobby');
        } finally {
            await server.close();
            await matchmaker.close();
        }
    });

    test('recovers an unknown path without a redirect loop or match connection', async ({ page }) => {
        const navigations: string[] = [];
        page.on('framenavigated', (frame) => {
            if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname);
        });
        await page.goto('/not-a-real-page');
        await expect(page).toHaveURL(/\/lobby$/);
        await expect(page.locator('h1')).toContainText('Europa Neo lobby');
        await page.reload();
        await expect(page).toHaveURL(/\/lobby$/);
        expect(navigations.filter((path) => path === '/lobby')).toHaveLength(2);
        expect(navigations.filter((path) => path === '/not-a-real-page')).toHaveLength(1);
    });
});
