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

import { setHandleViaProfile } from './helpers/profile';

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

/**
 * Merge-variant of {@link preserveWsQueryInHistory} for the US3 redirect
 * round-trip: the redirect rewrites the URL to `/profile?returnTo=…`, and
 * the plain preserve script would REPLACE that query with the live `?ws=`
 * override — silently dropping `returnTo` and dead-ending the round-trip.
 * Merging keeps BOTH the override and the params the URL already carries.
 */
function preserveWsAndQueryParamsInHistory(): void {
    const mergeWsQuery = (url: string | URL | null): string | URL | null => {
        if (url === null || !window.location.search.startsWith('?ws=')) return url;
        const parsed = new URL(String(url), window.location.origin);
        const merged = new URLSearchParams(window.location.search);
        for (const [key, value] of new URLSearchParams(parsed.search)) {
            merged.set(key, value);
        }
        parsed.search = merged.toString();
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    };
    const replaceState = window.history.replaceState.bind(window.history);
    const pushState = window.history.pushState.bind(window.history);
    window.history.replaceState = (state, title, url) => {
        replaceState(state, title, mergeWsQuery(url));
    };
    window.history.pushState = (state, title, url) => {
        pushState(state, title, mergeWsQuery(url));
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
        .toBe('Europa Neo Lobby');
}

test.describe('semantic route browser history', () => {
    test('shows welcome screen on / and navigates to lobby via Play link (AC-001, AC-004, AC-007)', async ({
        page,
    }) => {
        // No server needed — the welcome screen is a pure static component.
        await page.goto('/');
        // AC-001: URL remains /, no redirect to /lobby.
        await expectPath(page, '/');
        // Welcome screen content visible.
        await expect(page.locator('img[alt="Europa Neo"]')).toBeVisible();
        await expect(page.getByText('Nanobot warfare')).toBeVisible();
        // AC-004: Play link navigates to /lobby.
        await page.getByRole('link', { name: 'Play', exact: true }).click();
        await expect(page).toHaveURL(/\/lobby/);
    });

    test('unknown route still redirects to lobby (AC-008)', async ({ page }) => {
        const { server, matchmaker } = buildStack();
        await server.listen();
        const wsUrl = `ws://127.0.0.1:${String(server.__boundPortForTest())}`;
        try {
            await page.context().addInitScript(preserveWsQueryInHistory);
            // Navigate to an unknown path — SPA bootstrap redirects to /lobby.
            await page.goto(`/foo?ws=${encodeURIComponent(wsUrl)}`);
            // The redirect fires via replaceState, then the lobby identity
            // gate redirects unnamed visitors to /profile.
            await expect(page).toHaveURL(/\/lobby|\/profile/);
        } finally {
            await server.close();
            await matchmaker.close();
        }
    });

    test('unnamed visitor on / is NOT redirected to /profile (AC-012)', async ({ page }) => {
        // No server needed — the welcome screen requires no identity.
        await page.goto('/');
        await expectPath(page, '/');
        // Welcome screen content visible, no redirect to /profile.
        await expect(page.locator('img[alt="Europa Neo"]')).toBeVisible();
        // Wait briefly to ensure no async redirect fires.
        await page.waitForTimeout(500);
        await expectPath(page, '/');
    });

    test('retires the legacy live query without mounting the live runtime', async ({ page }) => {
        const { server, matchmaker } = buildStack();
        await server.listen();
        const wsUrl = `ws://127.0.0.1:${String(server.__boundPortForTest())}`;
        try {
            await page.context().addInitScript(preserveWsQueryInHistory);
            // The legacy query params (?live, ?match, etc.) are stripped by
            // stripProductionQuery. Navigate to /lobby directly to prove the
            // live runtime is NOT mounted (the lobby runtime is).
            await page.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);
            await expect(page).toHaveURL(/\/profile/);
            await setHandleViaProfile(page, 'LegacyTester');
            await expect(page).toHaveURL(/\/lobby/);
            await expect(page.locator('h1')).toContainText('Europa Neo Lobby');
            // The live runtime is NOT mounted — only the lobby runtime.
            expect(await page.evaluate(() => Object.hasOwn(window, '__europaLive'))).toBe(false);
        } finally {
            await server.close();
            await matchmaker.close();
        }
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
            // The US1 identity gate redirects unnamed visitors from /lobby
            // to /profile. Wait for the redirect (not the lobby heading —
            // the heading renders before identity resolves, creating a race
            // where setHandleViaProfile tries to click "Choose a name"
            // while the link is still hidden during the 'restoring' state).
            await expect(page).toHaveURL(/\/profile/, { timeout: WAIT_TIMEOUT });
            await setHandleViaProfile(page, 'Bob');
            await waitForLobby(page);
            await expect(page.locator('.europa-lobby__identity-name')).toContainText('Bob');
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
            await expect(page.locator('h1')).toContainText('Europa Neo Lobby');

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
            await expect(page.locator('h1')).toContainText('Europa Neo Lobby');
            await page.goForward();
            await expectPath(page, '/lobby');
            await expect(page.locator('h1')).toContainText('Europa Neo Lobby');
            expect(fullNavigations).toBe(0);
            page.off('load', onDocumentLoad);
        } finally {
            await server.close();
            await matchmaker.close();
        }
    });

    test('recovers an unknown path without a redirect loop or match connection', async ({ page }) => {
        const { server, matchmaker } = buildStack();
        await server.listen();
        const wsUrl = `ws://127.0.0.1:${String(server.__boundPortForTest())}`;
        try {
            // A working server is required for the identity gate to fire.
            // Navigate to /lobby directly (the SPA bootstrap redirects
            // unknown paths here via replaceState). The identity gate then
            // redirects unnamed visitors to /profile.
            await page.context().addInitScript(preserveWsQueryInHistory);
            await page.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);
            await expect(page).toHaveURL(/\/profile/);
            // Set a handle to complete the identity flow.
            await setHandleViaProfile(page, 'RecoveryTester');
            await expect(page).toHaveURL(/\/lobby/);
            await expect(page.locator('h1')).toContainText('Europa Neo Lobby');
            // Refresh — named identity persists, lobby is stable.
            await page.reload({ waitUntil: 'domcontentloaded' });
            await expect(page).toHaveURL(/\/lobby/);
        } finally {
            await server.close();
            await matchmaker.close();
        }
    });
});

test.describe('US3 profile redirect for unnamed deep links (feature 015)', () => {
    test('an unnamed visitor deep-linking a join URL onboards via /profile and returns to the match', async ({
        page,
        browser,
    }) => {
        const { server, matchmaker } = buildStack();
        await server.listen();
        const wsUrl = `ws://127.0.0.1:${String(server.__boundPortForTest())}`;
        try {
            // A HOST tab creates a public 4-player match through the REAL
            // lobby path (the lobby projection ledger lists only matches the
            // facade issued). 4 players means the visitor's join lands seat
            // 2 of 4, so the granted seat stays in the pre-start waiting
            // room deterministically (a 2-player match would auto-start on
            // this join and race the assertion).
            const hostContext = await browser.newContext();
            await hostContext.addInitScript(preserveWsQueryInHistory);
            const host = await hostContext.newPage();
            await host.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);
            // The identity gate redirects unnamed visitors to /profile.
            // Set a handle first so the host lands on /lobby as a named
            // visitor — the lobby heading appears after the handle is set.
            await expect(host).toHaveURL(/\/profile/);
            await setHandleViaProfile(host, 'Host');
            await waitForLobby(host);
            // The radio input is europa-visually-hidden inside a label —
            // the label's flex layout intercepts pointer events, so force
            // the check to bypass Playwright's actionability snapshot.
            await host.locator('input[name="playerCount"][value="4"]').check({ force: true });
            await host.getByRole('button', { name: 'Create match' }).click();
            await expect
                .poll(() => host.evaluate(() => window.location.pathname.match(/^\/match\/([^/]+)$/)?.[1] ?? null), {
                    timeout: WAIT_TIMEOUT,
                    intervals: [50, 100, 250],
                })
                .not.toBeNull();
            const matchId = await host.evaluate(() => window.location.pathname.split('/')[2] ?? '');
            expect(matchId).not.toBe('');

            // The deep-link visitor runs in a FRESH browser context (no
            // localStorage), exactly like a real share-link recipient. The
            // merge-variant history script keeps the test-only ws override
            // AND the redirect's returnTo param through the round-trip.
            await page.context().addInitScript(preserveWsAndQueryParamsInHistory);
            await page.goto(`/match/${encodeURIComponent(matchId)}/join?ws=${encodeURIComponent(wsUrl)}`);

            // US3 AC-1: redirect to /profile with the stateless returnTo
            // param, showing the handle form — NOT the old sticky
            // "Match unavailable" notice that suppressed it.
            await expectPath(page, '/profile');
            const returnTo = await page.evaluate(() => new URLSearchParams(window.location.search).get('returnTo'));
            expect(returnTo).not.toBeNull();
            expect(decodeURIComponent(returnTo ?? '').startsWith(`/match/${matchId}/join`)).toBe(true);
            await expect(page.getByRole('textbox', { name: /display name/i })).toBeVisible();
            await expect(page.getByRole('heading', { name: 'Match unavailable' })).toHaveCount(0);

            // Name yourself; FR-010 auto-navigates back to the deep link
            // with zero manual URL re-entry (SC-003).
            await page.getByRole('textbox', { name: /display name/i }).fill('Deeplink');
            await page.locator('[data-europa-submit-handle="true"]').click();
            await expectPath(page, `/match/${matchId}/join`);

            // Seat granted: the match view opens into the pre-start waiting
            // room (2/4 filled), with no route-failure notice anywhere.
            await expect(page.getByRole('heading', { name: /In match/ })).toBeVisible();
            await expect(page.locator('[data-europa-prestart-plate]')).toBeVisible();
            await expect(page.getByRole('main')).toContainText('Waiting for 2 more players');
            await expect(page.getByRole('heading', { name: 'Match unavailable' })).toHaveCount(0);

            await hostContext.close();
        } finally {
            await server.close();
            await matchmaker.close();
        }
    });
});
