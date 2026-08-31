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

const TICK_MS = 250;
const WAIT_TIMEOUT = 15_000;

/** Assert the browser-visible path while allowing the test-only ws seam. */
async function expectPath(page: import('@playwright/test').Page, pathname: string): Promise<void> {
    await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe(pathname);
}

/** Preserve the test-only transport override across same-document history. */
function preserveWsQueryInHistory(): void {
    const preserveWsQuery = (url: string | URL | null): string | URL | null => {
        if (url === null || !window.location.search.startsWith('?ws=')) return url;
        const parsed = new URL(String(url), window.location.origin);
        parsed.search = window.location.search;
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    };
    const replaceState = window.history.replaceState.bind(window.history);
    const pushState = window.history.pushState.bind(window.history);
    window.history.replaceState = (state, title, url) => {
        replaceState(state, title, preserveWsQuery(url));
    };
    window.history.pushState = (state, title, url) => {
        pushState(state, title, preserveWsQuery(url));
    };
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

    test('shows recoverable Match unavailable when Back revisits a released filling match', async ({ page }) => {
        const { server, matchmaker } = buildStack();
        await server.listen();
        const wsUrl = `ws://127.0.0.1:${String(server.__boundPortForTest())}`;
        try {
            // The ephemeral lobby server is a test-only transport seam. Keep
            // its ws override available until lobby-runtime resolves it; the
            // production URL itself is still asserted by pathname and the
            // semantic history transition below is still same-document.
            await page.context().addInitScript(preserveWsQueryInHistory);
            await page.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);
            await waitForLobby(page);
            await page.getByRole('textbox', { name: /display name/i }).fill('Bob');
            await page.locator('[data-europa-submit-handle="true"]').click();
            await expect(page.locator('.europa-lobby__handle')).toContainText('Bob');
            await page.getByRole('button', { name: 'Create match' }).click();
            await expect
                .poll(() => page.evaluate(() => window.location.pathname.match(/^\/match\/([^/]+)$/)?.[1] ?? null), {
                    timeout: WAIT_TIMEOUT,
                    intervals: [50, 100, 250],
                })
                .not.toBeNull();
            const matchId = await page.evaluate(() => window.location.pathname.split('/')[2] ?? '');
            const semanticPath = `/match/${matchId}`;
            await expectPath(page, semanticPath);
            await expect(page.getByRole('heading', { name: /In match/ })).toBeVisible();

            // Release the only seat before traversing history. Feature 006
            // collects the filling match; routing must not resurrect it or
            // alter matchmaking semantics when the stale route is revisited.
            await page.getByRole('button', { name: 'Leave to lobby' }).click();
            await expect(page.locator('h1')).toContainText('Europa Neo lobby');

            // Browser history traverses the released entry. No document
            // navigation should occur: popstate re-resolves the route and
            // updates the visible view in place with recoverable failure.
            let fullNavigations = 0;
            const onDocumentLoad = () => {
                fullNavigations += 1;
            };
            page.on('load', onDocumentLoad);
            await page.goBack();
            await expectPath(page, semanticPath);
            await expect(page.getByRole('heading', { name: 'Match unavailable' })).toBeVisible();
            await page.getByRole('button', { name: 'Return to lobby' }).click();
            await expectPath(page, '/lobby');
            await expect(page.locator('h1')).toContainText('Europa Neo lobby');
            await page.goForward();
            await expectPath(page, '/lobby');
            await expect(page.locator('h1')).toContainText('Europa Neo lobby');
            expect(fullNavigations).toBe(0);
            page.off('load', onDocumentLoad);
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
        await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
        await page.getByRole('button', { name: 'Return to lobby' }).click();
        await expect(page.locator('h1')).toContainText('Europa Neo lobby');
        await page.reload();
        await expect(page).toHaveURL(/\/lobby$/);
        expect(navigations.filter((path) => path === '/lobby')).toHaveLength(2);
        expect(navigations.filter((path) => path === '/not-a-real-page')).toHaveLength(1);
    });
});
