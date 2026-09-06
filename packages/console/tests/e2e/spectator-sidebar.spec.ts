/**
 * E2E — spectator sidebar parity (issue #76, FR-021).
 *
 * The spectator leg renders the SAME sidebar as a player, with all 8
 * sections present but order-producing controls (Orders, Reserve,
 * Surrender) rendered disabled or inert — no orders can be sent
 * (structural invariant: spectators have no store, no order bridge).
 *
 * The spectator is driven through the PRODUCTION lobby runtime (the
 * `__europaTestMatch` live-runtime seam is a PLAYER path and must not
 * be used here — a wire player join would claim an unclaimed seat).
 *
 * Stack recipe: mirrors `lobby.spec.ts` `buildLobbyStack()` — no
 * external `httpServer`; the match server owns its internal HTTP
 * server. The lobby facade is wired via `ServerDeps.lobby`.
 *
 * Three-tab pattern (same as lobby.spec.ts):
 *   1. Alice: creates + plays in the match
 *   2. Bob: joins + plays in the match
 *   3. Cara: spectates the match from the lobby (the test page)
 *
 * The `?ws=` query parameter must survive the lobby→profile→lobby
 * redirect cycle (unnamed identity gate). The lobby.spec.ts
 * `preserveWsQueryInHistory` init script handles this.
 *
 * Determinism: all waits poll observable DOM/lobby-state conditions.
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
import { expect, type Page, test } from '@playwright/test';

import { setHandleViaProfile } from './helpers/profile';

const TICK_MS = 250;

/** Default poll timeout for observable state (CI-safe upper bound). */
const WAIT_TIMEOUT = 15_000;

// ---------------------------------------------------------------------------
// Init-script: preserve `?ws=` across SPA pushState/replaceState
// (copied from lobby.spec.ts — the lobby→profile→lobby redirect cycle
// drops the query parameter without this patch.)
// ---------------------------------------------------------------------------

function preserveWsQueryInHistory(): void {
    const preserveWsQuery = (url: string | URL | null): string | URL | null => {
        if (url === null || !window.location.search.startsWith('?ws=')) return url;
        const parsed = new URL(String(url), window.location.origin);
        parsed.search = window.location.search;
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    };
    const replaceState = window.history.replaceState.bind(window.history);
    const pushState = window.history.pushState.bind(window.history);
    window.history.replaceState = (state, title, url) => replaceState(state, title, preserveWsQuery(url));
    window.history.pushState = (state, title, url) => pushState(state, title, preserveWsQuery(url));
}

// ---------------------------------------------------------------------------
// Stack wiring (mirrors lobby.spec.ts buildLobbyStack)
// ---------------------------------------------------------------------------

function buildStack(): {
    server: Server;
    matchmaker: Matchmaker;
} {
    let bound: MatchmakerBridge = {};
    const forwardingBridge: MatchmakerBridge = {
        onSeatClaimed: (event) => bound.onSeatClaimed?.(event),
        onSeatDisconnected: (event) => bound.onSeatDisconnected?.(event),
        onSeatReconnected: (event) => bound.onSeatReconnected?.(event),
        onSeatExpired: (event) => bound.onSeatExpired?.(event),
        onMatchTerminal: (event) => bound.onMatchTerminal?.(event),
    };

    const wiring: { matchmaker: Matchmaker | null; lobby: ReturnType<typeof createLobbyService> | null } = {
        matchmaker: null,
        lobby: null,
    };

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
        lobby: {
            create: (sink) => {
                const matchmaker = wiring.matchmaker;
                if (matchmaker === null) {
                    throw new Error('host wiring bug: lobby frame arrived before the matchmaker was bound');
                }
                const facade = createLobbyService({ matchmaker, deliver: sink.deliver });
                wiring.lobby = facade;
                return facade;
            },
        },
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
    wiring.matchmaker = matchmaker;
    return { server, matchmaker };
}

// ---------------------------------------------------------------------------
// Lobby-runtime helpers
// ---------------------------------------------------------------------------

interface LobbyHandleView {
    readonly store: {
        getState(): {
            readonly viewMode: string;
            readonly handle: string | null;
            readonly connection: string;
            readonly snapshot: {
                readonly entries: ReadonlyArray<{
                    readonly matchId: string;
                    readonly status: string;
                    readonly seatsFilled: number;
                    readonly capacity: number;
                }>;
            } | null;
        };
    };
}

async function readLobby(page: Page): Promise<{
    viewMode: string;
    handle: string | null;
    connection: string;
    entries: ReadonlyArray<{
        matchId: string;
        status: string;
        seatsFilled: number;
        capacity: number;
    }>;
} | null> {
    return page.evaluate(() => {
        const handle = (window as unknown as { __europaLobby?: LobbyHandleView }).__europaLobby;
        if (handle === undefined || handle.store === undefined) {
            return null;
        }
        const state = handle.store.getState();
        return {
            viewMode: state.viewMode,
            handle: state.handle,
            connection: state.connection,
            entries: (state.snapshot?.entries ?? []).map((entry) => ({
                matchId: entry.matchId,
                status: entry.status,
                seatsFilled: entry.seatsFilled,
                capacity: entry.capacity,
            })),
        };
    });
}

async function waitUntilLobby(
    page: Page,
    when: (lobby: NonNullable<Awaited<ReturnType<typeof readLobby>>>) => boolean,
    description: string,
): Promise<void> {
    await expect
        .poll(
            async () => {
                const lobby = await readLobby(page);
                if (lobby === null) {
                    return false;
                }
                return when(lobby);
            },
            { timeout: WAIT_TIMEOUT, intervals: [50, 100, 250] },
        )
        .toBe(true, description);
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

test.describe('spectator sidebar parity (FR-021)', () => {
    test.setTimeout(90_000);

    let server: Server;
    let wsPort: number;

    test.beforeEach(async () => {
        ({ server } = buildStack());
        await server.listen();
        wsPort = (server as unknown as { __boundPortForTest(): number }).__boundPortForTest() ?? 0;
    });

    test.afterEach(async () => {
        await server.close();
    });

    /**
     * Set up a live 2-player match (Alice + Bob playing) and spectate
     * it from Cara's tab (the test page). Returns after the sidebar is
     * visible in Cara's spectator view.
     */
    async function setupLiveMatchAndSpectate(caraPage: Page): Promise<void> {
        const wsUrl = `ws://127.0.0.1:${String(wsPort)}`;

        // --- Alice tab: creates match, stays in match view ---
        const browserInstance = caraPage.context().browser();
        if (browserInstance === null) {
            throw new Error('expected a connected browser');
        }
        const aliceCtx = await browserInstance.newContext({ viewport: { width: 1280, height: 720 } });
        await aliceCtx.addInitScript(preserveWsQueryInHistory);
        const alice = await aliceCtx.newPage();
        await alice.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);
        await waitUntilLobby(alice, (l) => l.connection === 'ready', 'Alice lobby connected');
        await setHandleViaProfile(alice, 'Alice');
        await waitUntilLobby(alice, (l) => l.handle === 'Alice', 'Alice handle accepted');

        await alice.getByRole('button', { name: 'Create match' }).click();
        await waitUntilLobby(alice, (l) => l.viewMode === 'match', 'Alice enters match view');

        await waitUntilLobby(
            alice,
            (l) => (l.entries.length > 0 ? (l.entries[0]?.matchId ?? null) : null) !== null,
            'waiting row appears',
        );
        const matchId = (await readLobby(alice))?.entries[0]?.matchId ?? '';

        // --- Bob tab: joins match, stays in match view ---
        const bobCtx = await browserInstance.newContext({ viewport: { width: 1280, height: 720 } });
        await bobCtx.addInitScript(preserveWsQueryInHistory);
        const bob = await bobCtx.newPage();
        await bob.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);
        await waitUntilLobby(bob, (l) => l.connection === 'ready', 'Bob lobby connected');
        await setHandleViaProfile(bob, 'Bob');
        await waitUntilLobby(bob, (l) => l.handle === 'Bob', 'Bob handle accepted');

        await waitUntilLobby(
            bob,
            (l) => l.entries.some((e) => e.matchId === matchId && e.status === 'waiting'),
            'Bob sees waiting match',
        );
        await bob.locator(`[data-match-id="${matchId}"]`).getByRole('button', { name: /^Join/ }).click();
        await waitUntilLobby(bob, (l) => l.viewMode === 'match', 'Bob enters match view');

        // --- Cara tab (test page): spectates the live match ---
        await caraPage.context().addInitScript(preserveWsQueryInHistory);
        await caraPage.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);
        await waitUntilLobby(caraPage, (l) => l.connection === 'ready', 'Cara lobby connected');
        await setHandleViaProfile(caraPage, 'Cara');
        await waitUntilLobby(caraPage, (l) => l.handle === 'Cara', 'Cara handle accepted');

        await waitUntilLobby(
            caraPage,
            (l) => l.entries.some((e) => e.matchId === matchId && e.status === 'in_progress'),
            'Cara sees in_progress match',
        );
        await caraPage
            .locator(`[data-match-id="${matchId}"]`)
            .getByRole('button', { name: /^Spectate/ })
            .click();
        await waitUntilLobby(caraPage, (l) => l.viewMode === 'match', 'Cara enters match view');
        await caraPage.waitForSelector('.europa-sidebar', { timeout: 10_000 });

        // Store references for cleanup.
        (caraPage as unknown as { _cleanup?: () => Promise<void> })._cleanup = async () => {
            await bob.close();
            await bobCtx.close();
            await alice.close();
            await aliceCtx.close();
        };
    }

    test('the spectator sees all 8 sidebar sections', async ({ page }) => {
        await setupLiveMatchAndSpectate(page);

        const sections = page.locator('.europa-sidebar > section');
        await expect(sections).toHaveCount(8);
        for (const label of ['Status', 'Players', 'Orders', 'Reserve', 'Overview', 'Zoom', 'Surrender', 'Help']) {
            await expect(page.locator(`section[aria-label="${label}"]`)).toBeVisible();
        }
    });

    test('order-producing controls render disabled or inert (Orders, Reserve, Surrender)', async ({ page }) => {
        await setupLiveMatchAndSpectate(page);

        // Orders: exclusive/clear buttons disabled.
        const orderButtons = page.locator('#orders button');
        await expect(orderButtons).toHaveCount(2);
        for (let i = 0; i < 2; i += 1) {
            await expect(orderButtons.nth(i)).toBeDisabled();
        }

        // Reserve: the spectator has no selection (no store), so the panel
        // is inert — the hint text renders instead of interactive controls.
        await expect(page.locator('#reserve')).toContainText('Select a cell to set its reserves.');
        await expect(page.locator('#reserve input, #reserve button')).toHaveCount(0);

        // Surrender: disabled.
        await expect(page.locator('#surrender button')).toHaveCount(1);
        await expect(page.locator('#surrender button')).toBeDisabled();
    });

    test('the spectator still sees the live board', async ({ page }) => {
        await setupLiveMatchAndSpectate(page);

        // Full-visibility board (spectator view has no fog — the entire
        // 32×32 board renders).
        await expect(page.locator('[role="grid"] [role="gridcell"]')).toHaveCount(32 * 32);

        // The Zoom section renders (level indicator + in/out/reset).
        await expect(page.locator('#zoom [data-europa-zoom-level="true"]')).toHaveText('100%');
        await expect(page.locator('#zoom button')).toHaveCount(3);
    });
});
