/**
 * Full-stack integration E2E — Integration wave (the core deliverable).
 *
 * Proves the entire production path with NO fakes on the game path:
 *
 *   console UI (real Chromium, ?live runtime) ⇄
 *   WsMatchClient (networking's wire codec over native WebSocket) ⇄
 *   real createMatchServer (ephemeral port, ticking scheduler) ⇄
 *   matchmaking Matchmaker bridge (auto-start register/attach) ⇄
 *   engine + terrain + fog (real board generation + redaction)
 *
 * Scenario: the matchmaker creates a PUBLIC 2-player match and fills
 * it programmatically (matchmaking has no wire presence by design —
 * its HTTP surface belongs to a future host binary), auto-start binds
 * the engine session into the live server, then TWO browser contexts
 * join through the actual console runtime, receive fog-filtered tick
 * broadcasts, issue orders from BOTH seats, and get authoritative
 * acks + world state back.
 *
 * Determinism discipline: no arbitrary sleeps anywhere — every wait
 * is an expect.poll condition against observable store/server state;
 * the tick cadence is fixed; orders are deterministic setReserves
 * gestures aimed at each seat's own city.
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

/** Fixed test cadence; server tickRateMs MUST equal match tickIntervalMs. */
const TICK_MS = 100;

/**
 * Board edge. The terrain generator's placement constraints are tuned
 * for the shipped default (32); smaller boards can exhaust its
 * regeneration attempts, so the proof runs at the production default.
 */
const BOARD_SIZE = 32;

// ---------------------------------------------------------------------------
// Harness: matchmaking ↔ networking bridge wiring
// ---------------------------------------------------------------------------

/**
 * Wire a real matchmaker to a real server through the contract's
 * soft-binding path (`contracts/matchmaking-api.ts`: "when the server
 * exposes an optional bindMatchmaker, the matchmaker hands its bridge
 * handlers over"). The shipped networking Server takes its bridge via
 * `ServerDeps.matchmaker` at construction time — BEFORE a matchmaker
 * exists — so the host glue forwards: the server's deps observe a
 * stable proxy whose calls land on whatever handlers the matchmaker
 * later binds. This is the exact recipe a production host binary
 * repeats; keeping it here documents it where it is exercised.
 *
 * Single-port (011 FR-009): one externally owned http.Server on 127.0.0.1:0
 * shared for HTTP + WS (via ServerDeps.httpServer). The ephemeral port
 * is the single bound port for both surfaces; __boundPortForTest reads it.
 */
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
            // Real sessions arrive pre-built from the matchmaker's
            // auto-start (engineSession.ts); the factory stays unused.
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

/** Minimal mirror of the live runtime's window handle (spec-side view). */
interface LiveHandleView {
    readonly store: {
        getState(): {
            readonly status: string;
            readonly latestView: {
                readonly tick: number;
                readonly player: number;
                readonly visibleCells: ReadonlyArray<{
                    readonly coord: { readonly x: number; readonly y: number };
                    readonly cityOwner: number | null;
                    readonly reservesPercent: number;
                }>;
            } | null;
            readonly session: { readonly playerId: number | null };
            readonly feedback: ReadonlyArray<{ readonly kind: string; readonly text: string }>;
        };
    };
    readonly client: { state(): { readonly connection: string } };
    bootError: string | null;
}

/** Read the live handle's essential state from a page. */
async function readLive(page: Page): Promise<{
    status: string;
    connection: string;
    playerId: number | null;
    tick: number;
    bootError: string | null;
    cells: Array<{ x: number; y: number; cityOwner: number | null; reserves: number }>;
} | null> {
    return page.evaluate(() => {
        const handle = (window as unknown as { __europaLive?: LiveHandleView }).__europaLive;
        if (handle === undefined || handle.store === undefined) {
            return null;
        }
        const state = handle.store.getState();
        return {
            status: state.status,
            connection: handle.client.state().connection,
            playerId: state.session.playerId,
            tick: state.latestView?.tick ?? -1,
            bootError: handle.bootError,
            cells: (state.latestView?.visibleCells ?? []).map((cell) => ({
                x: cell.coord.x,
                y: cell.coord.y,
                cityOwner: cell.cityOwner,
                reserves: cell.reservesPercent,
            })),
        };
    });
}

/**
 * Read the live handle's essential state from a page, failing the
 * test when the runtime never mounted (instead of a cryptic null).
 */
async function readLiveOrThrow(page: Page): Promise<NonNullable<Awaited<ReturnType<typeof readLive>>>> {
    const live = await readLive(page);
    if (live === null) {
        throw new Error('live runtime handle missing (page did not mount ?live runtime)');
    }
    return live;
}

/**
 * Poll a page until `when` holds. Fails with the boot error surfaced
 * in the message when the runtime reported one (never hang silently).
 */
async function waitUntil(
    page: Page,
    when: (live: NonNullable<Awaited<ReturnType<typeof readLive>>>) => boolean,
    description: string,
): Promise<void> {
    await expect
        .poll(
            async () => {
                const live = await readLive(page);
                if (live === null) {
                    return false;
                }
                if (live.bootError !== null) {
                    throw new Error(`live runtime boot failed: ${live.bootError}`);
                }
                return when(live);
            },
            { timeout: 15_000, intervals: [50, 100, 250] },
        )
        .toBe(true, description);
}

// ---------------------------------------------------------------------------
// The proof
// ---------------------------------------------------------------------------

test('two consoles drive one live match end-to-end over the real stack', async ({ browser }) => {
    test.setTimeout(90_000);

    const { httpServer, server, matchmaker } = buildStack();
    await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    await server.listen();
    const port = server.__boundPortForTest();
    expect(port).toBeDefined();
    // Single-port proof: same http.Server answers both HTTP + WS.
    const httpPort = (httpServer.address() as { port: number } | null)?.port;
    expect(httpPort).toBe(port);

    try {
        // -- Matchmaking: public create + fill ⇒ auto-start -------------------
        const created = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Alice',
            settings: { playerCount: 2, boardSize: BOARD_SIZE, tickIntervalMs: TICK_MS },
        });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        const { matchId } = created.data;
        expect(created.data.seatAssignment.playerId).toBe(1);

        const filled = matchmaker.joinMatch({ matchId, displayName: 'Bob' });
        expect(filled.ok).toBe(true);

        // Auto-start registered the engine session with the live server.
        const stats = server.stats();
        expect(stats.activeMatches).toBe(1);

        // -- Two real browser consoles join through the ?live runtime --------
        const errors: string[] = [];
        const openConsole = async (name: string): Promise<Page> => {
            const context = await browser.newContext();
            const page = await context.newPage();
            page.on('pageerror', (error) => {
                errors.push(`${name}: ${String(error)}`);
            });
            await page.goto(
                `/?live&ws=ws://127.0.0.1:${String(port)}&match=${encodeURIComponent(matchId)}&name=${name}`,
            );
            return page;
        };

        const alice = await openConsole('Alice');
        const bob = await openConsole('Bob');

        // Both seats reach 'live' with distinct assigned seats (joinAck path).
        await waitUntil(alice, (live) => live.status === 'live', 'Alice reaches live');
        await waitUntil(bob, (live) => live.status === 'live', 'Bob reaches live');
        const aliceSeated = await readLiveOrThrow(alice);
        const bobSeated = await readLiveOrThrow(bob);
        expect(new Set([aliceSeated.playerId, bobSeated.playerId])).toEqual(new Set([1, 2]));

        // -- Ticks flow to both seats (fog-filtered broadcasts) --------------
        // Note: the early economy reaches a fixed point (city troop growth
        // caps), after which the server legitimately SKIPS byte-identical
        // broadcasts — so "ticks flowed" is asserted here, before the
        // orders below perturb the world again.
        await waitUntil(alice, (live) => live.tick >= 3, 'Alice receives ticks');
        await waitUntil(bob, (live) => live.tick >= 3, 'Bob receives ticks');

        // -- Orders from BOTH seats through the full wire round trip ---------
        /**
         * Find the seat's own city in ITS fog view and dispatch a
         * setReserves gesture there (always engine-valid: owned source).
         */
        const issueReservesOrder = async (page: Page): Promise<void> => {
            const target = await page.evaluate(() => {
                const handle = (window as unknown as { __europaLive?: LiveHandleView }).__europaLive;
                if (handle === undefined) {
                    return null;
                }
                const state = handle.store.getState();
                const me = state.session.playerId;
                const city = state.latestView?.visibleCells.find((cell) => cell.cityOwner === me) ?? null;
                return city === null ? null : { x: city.coord.x, y: city.coord.y };
            });
            expect(target, 'seat can see its own city').not.toBeNull();
            await page.evaluate((cell) => {
                (window as unknown as { __europaLive?: LiveHandleView }).__europaLive?.store.dispatch({
                    kind: 'setReserves',
                    cell,
                    percent: 7,
                });
            }, target);
        };

        await issueReservesOrder(alice);
        await issueReservesOrder(bob);

        // Authoritative acks come back through orderAck envelopes (FR-008):
        // the reducer formats each ok-ack as success feedback, proving the
        // console → ws → server → engine → ack → ws → reducer round trip.
        await expect
            .poll(
                async () =>
                    (await readLive(alice))?.status === 'live' &&
                    (await alice.evaluate(() => {
                        const handle = (window as unknown as { __europaLive?: LiveHandleView }).__europaLive;
                        return handle?.store.getState().feedback.some((entry) => entry.kind === 'success') ?? false;
                    })),
                { timeout: 10_000 },
            )
            .toBe(true);
        await expect
            .poll(
                async () =>
                    await bob.evaluate(() => {
                        const handle = (window as unknown as { __europaLive?: LiveHandleView }).__europaLive;
                        return handle?.store.getState().feedback.some((entry) => entry.kind === 'success') ?? false;
                    }),
                { timeout: 10_000 },
            )
            .toBe(true);

        // And the ENGINE applied both orders: each seat's own city shows
        // the ordered 70% reserves in its fog-filtered tick views.
        await expect
            .poll(
                async () =>
                    (await readLive(alice))?.cells.some(
                        (cell) => cell.reserves === 7 && cell.cityOwner === aliceSeated.playerId,
                    ) ?? false,
                { timeout: 10_000 },
            )
            .toBe(true);
        await expect
            .poll(
                async () =>
                    (await readLive(bob))?.cells.some(
                        (cell) => cell.reserves === 7 && cell.cityOwner === bobSeated.playerId,
                    ) ?? false,
                { timeout: 10_000 },
            )
            .toBe(true);

        // -- Fog-filtered consistency across seats ---------------------------
        const aliceFinal = await readLiveOrThrow(alice);
        const bobFinal = await readLiveOrThrow(bob);

        // Each view is stamped with its own seat…
        expect(aliceFinal.playerId).not.toBeNull();
        expect(bobFinal.playerId).not.toBeNull();
        // …neither seat sees the whole board (redaction active)…
        const totalCells = BOARD_SIZE * BOARD_SIZE;
        expect(aliceFinal.cells.length).toBeLessThan(totalCells);
        expect(bobFinal.cells.length).toBeLessThan(totalCells);
        // …each seat sees its own city…
        expect(aliceFinal.cells.some((cell) => cell.cityOwner === aliceFinal.playerId)).toBe(true);
        expect(bobFinal.cells.some((cell) => cell.cityOwner === bobFinal.playerId)).toBe(true);
        // …and the two horizons differ (per-seat filtering, not one shared stream).
        const key = (cells: typeof aliceFinal.cells): string =>
            cells
                .map((cell) => `${cell.x},${cell.y}`)
                .sort()
                .join('|');
        expect(key(aliceFinal.cells)).not.toBe(key(bobFinal.cells));

        // Views advance consistently: near-equal progress, never regressing.
        expect(Math.abs(aliceFinal.tick - bobFinal.tick)).toBeLessThanOrEqual(3);

        // Zero page errors across the whole conversation.
        expect(errors).toEqual([]);

        await alice.context().close();
        await bob.context().close();
    } finally {
        await server.close();
        await new Promise<void>((resolve) => {
            httpServer.close(() => resolve());
        });
        await matchmaker.close();
    }
});
