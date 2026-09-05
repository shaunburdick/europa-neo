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
 * Determinism: all waits poll observable DOM/lobby-state conditions.
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

import { setHandleViaProfile } from './helpers/profile';

const TICK_MS = 100;

/** Default poll timeout for observable state (CI-safe upper bound). */
const WAIT_TIMEOUT = 15_000;

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
// Lobby-runtime helpers (mirror lobby.spec.ts — the spectator is driven
// through the production lobby runtime, not the live-runtime seam)
// ---------------------------------------------------------------------------

/** Minimal mirror of the lobby runtime's `window.__europaLobby` handle. */
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

/** Read the lobby handle's essential state from a page, or null pre-mount. */
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

/** Poll a page until `when` holds on the lobby state. */
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

    /** Open the spectator leg of the running match via the production lobby. */
    async function openSpectatePage(page: Page): Promise<void> {
        await page.goto(`/lobby?ws=${encodeURIComponent(`ws://127.0.0.1:${String(port)}`)}`);
        await waitUntilLobby(page, (lobby) => lobby.connection === 'ready', 'spectator lobby connected');
        await setHandleViaProfile(page, 'Cara');
        await waitUntilLobby(page, (lobby) => lobby.handle === 'Cara', 'spectator handle accepted');

        // The running match row exposes the Spectate action.
        await waitUntilLobby(
            page,
            (lobby) => lobby.entries.some((entry) => entry.matchId === matchId && entry.status === 'in_progress'),
            'spectator sees in_progress match',
        );
        await page
            .locator(`[data-match-id="${matchId}"]`)
            .getByRole('button', { name: /^Spectate/ })
            .click();
        await waitUntilLobby(page, (lobby) => lobby.viewMode === 'match', 'spectator enters match view');
        await page.waitForSelector('.europa-sidebar', { timeout: 10_000 });
    }

    test('the spectator sees all 8 sidebar sections', async ({ page }) => {
        await openSpectatePage(page);

        const sections = page.locator('.europa-sidebar > section');
        await expect(sections).toHaveCount(8);
        for (const label of ['Status', 'Players', 'Orders', 'Reserve', 'Overview', 'Zoom', 'Surrender', 'Help']) {
            await expect(page.locator(`section[aria-label="${label}"]`)).toBeVisible();
        }
    });

    test('order-producing controls render disabled or inert (Orders, Reserve, Surrender)', async ({ page }) => {
        await openSpectatePage(page);

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
        await openSpectatePage(page);

        // Full-visibility board (spectator view has no fog — the entire
        // 32×32 board renders).
        await expect(page.locator('[role="grid"] [role="gridcell"]')).toHaveCount(32 * 32);

        // The Zoom section renders (level indicator + in/out/reset). Zoom
        // is not order-producing; its enabled state is incidental to the
        // spectator's no-store camera model (FR-021 covers Orders/Reserve/
        // Surrender only).
        await expect(page.locator('#zoom [data-europa-zoom-level="true"]')).toHaveText('100%');
        await expect(page.locator('#zoom button')).toHaveCount(3);
    });
});
