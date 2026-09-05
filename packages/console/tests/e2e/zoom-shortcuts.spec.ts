/**
 * E2E — keyboard zoom shortcuts (issue #76, FR-018).
 *
 * Presses `+`/`-`/`Home` in a live match and asserts the sidebar zoom
 * indicator (`[data-europa-zoom-level]`) changes: in, out, and reset
 * to 100%. Also covers the sidebar buttons (FR-017) as the same
 * dispatch path.
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

/** Read the sidebar zoom indicator text (e.g. "100%"). */
async function zoomLevel(page: Page): Promise<string> {
    const level = page.locator('[data-europa-zoom-level="true"]');
    await expect(level).toBeVisible();
    return (await level.textContent()) ?? '';
}

/** Parse the indicator's percentage number. */
function percentOf(text: string): number {
    const match = /^(\d+)%$/.exec(text.trim());
    expect(match, `zoom indicator text ${JSON.stringify(text)}`).not.toBeNull();
    return Number(match?.[1]);
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

test.describe('keyboard zoom shortcuts (FR-018)', () => {
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
        await page.waitForSelector('.europa-sidebar', { timeout: 10_000 });
        // First tick lands shortly after live; the zoom indicator is
        // present regardless, but wait for a non-zero tick so the board
        // view exists (zoom shortcuts require latestView).
        await expect.poll(async () => percentOf(await zoomLevel(page)), { timeout: 10_000 }).toBe(100);
    }

    test('+ zooms in and - zooms out from the default 100%', async ({ page }) => {
        await openMatchPage(page);

        await page.keyboard.press('+');
        await expect.poll(async () => percentOf(await zoomLevel(page))).toBeGreaterThan(100);

        await page.keyboard.press('-');
        await expect.poll(async () => percentOf(await zoomLevel(page))).toBe(100);
    });

    test('Home resets to 100% from a zoomed-in state', async ({ page }) => {
        await openMatchPage(page);

        await page.keyboard.press('+');
        await page.keyboard.press('+');
        await expect.poll(async () => percentOf(await zoomLevel(page))).toBeGreaterThan(100);

        await page.keyboard.press('Home');
        await expect.poll(async () => percentOf(await zoomLevel(page))).toBe(100);
    });

    test('the sidebar zoom buttons drive the same indicator (FR-017)', async ({ page }) => {
        await openMatchPage(page);

        await page.getByRole('button', { name: 'Zoom in' }).click();
        await expect.poll(async () => percentOf(await zoomLevel(page))).toBeGreaterThan(100);

        await page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
        await expect.poll(async () => percentOf(await zoomLevel(page))).toBe(100);
    });
});
