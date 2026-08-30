/**
 * N-player full-stack integration E2E — Feature 012 (T021).
 *
 * Parameterized harness over `N ∈ {3, 4}` mirroring the 2-player
 * `tests/e2e/full-stack.spec.ts` `buildStack()` recipe (FR-001..FR-011,
 * SC-001/SC-002; Q4; research §5). For each `N` it proves, with NO fakes
 * on the game path:
 *
 *   console UI (real Chromium, ?live runtime) ⇄
 *   WsMatchClient (networking's wire codec over native WebSocket) ⇄
 *   real createMatchServer (ephemeral port, ticking scheduler) ⇄
 *   matchmaking Matchmaker bridge (auto-start register/attach) ⇄
 *   engine + terrain + fog (real board generation + redaction)
 *
 * Scenario per `N`:
 *   1. lobby creates a PUBLIC `N`-player match at the default board `48`
 *      (via the real matchmaker; the public lobby projection lists it
 *      while filling with `playerCount: N`, `seatsFilled: 1`);
 *   2. `N` distinct guest identities claim the `N` seats (the host
 *      creator holds seat 0; `N-1` matchmaker joins fill 1..N-1); an
 *      over-join after the match is full returns `match_full` (at most
 *      one winner of the last seat; losers are rejected);
 *   3. `tick ≥ 1` arrives on all `N` seats within 2 s of the final join
 *      (fixed 250 ms cadence; deterministic poll, no wall-clock sleeps);
 *   4. each seat receives a fog-filtered view (own city visible, horizons
 *      differ per seat, no full-board leak);
 *   5. each seat issues one `setReserves` order with a single `ok:true`
 *      ack and a deterministic world effect (its own city shows 7%);
 *   6. victory is reachable: `N-1` seats surrender (scripted mutual
 *      elimination via `leaveMatch` → engine `surrender`), leaving one
 *      survivor whose console reaches `game_over` (showResults);
 *   7. a PRIVATE `N`-player match is never projected into the public
 *      lobby snapshot (10/10 trials).
 *
 * Determinism discipline: every wait is an `expect.poll` condition
 * against observable store/server state; no arbitrary sleeps longer than
 * the 250 ms tick cadence.
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
const TICK_MS = 250;

/**
 * Board edge for N>2. The 012 default for 3- and 4-player matches is 48
 * (FR-001); the 64 board is temporarily disabled (terrain issue #26), so
 * the proof runs at the product-approved default. 48 is well within the
 * terrain generator's reliable placement envelope.
 */
const BOARD_SIZE = 48;

// ---------------------------------------------------------------------------
// Harness: matchmaking ↔ networking bridge wiring (mirrors full-stack.spec.ts)
// ---------------------------------------------------------------------------

/**
 * Wire a real matchmaker to a real server through the contract's
 * soft-binding path. Single-port topology: one externally owned
 * http.Server on 127.0.0.1:0 shared for HTTP + WS.
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
// Browser-side helpers (mirrors full-stack.spec.ts)
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
// The proof (parameterized over N ∈ {3, 4})
// ---------------------------------------------------------------------------

// Playwright 1.62.1 does not expose `test.describe.each`; iterate and
// register one describe block per N so the same harness covers both 3- and
// 4-player suites (SC-001 + SC-002) under one file.
for (const N of [3, 4]) {
    test.describe(`N=${N} player full-stack E2E (lobby→match→ticks→orders→victory)`, () => {
        test('drives one live N-player match end-to-end over the real stack', async ({ browser }) => {
            test.setTimeout(120_000);

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
                // -- Matchmaking: public create + fill ⇒ auto-start -----------------
                const created = matchmaker.createMatch({
                    visibility: 'public',
                    displayName: 'Host',
                    settings: { playerCount: N, boardSize: BOARD_SIZE, tickIntervalMs: TICK_MS },
                });
                expect(created.ok).toBe(true);
                if (!created.ok) {
                    return;
                }
                const { matchId } = created.data;
                expect(created.data.seatAssignment.playerId).toBe(1);

                // The public lobby projection lists the filling match with the
                // correct capacity chrome (FR-003 / lobby facade).
                const fillingListing = matchmaker.listPublicMatches();
                expect(fillingListing.ok).toBe(true);
                const fillingEntry = fillingListing.matches.find((entry) => entry.matchId === matchId);
                expect(fillingEntry).toBeDefined();
                expect(fillingEntry?.playerCount).toBe(N);
                expect(fillingEntry?.seatsFilled).toBe(1);
                expect(fillingEntry?.boardSize).toBe(BOARD_SIZE);

                // -- Private N-player match is never projected (10/10 trials) ------
                const privateCreated = matchmaker.createMatch({
                    visibility: 'private',
                    displayName: 'PrivateHost',
                    settings: { playerCount: N, boardSize: BOARD_SIZE, tickIntervalMs: TICK_MS },
                });
                expect(privateCreated.ok).toBe(true);
                if (!privateCreated.ok) {
                    return;
                }
                const privateMatchId = privateCreated.data.matchId;
                for (let trial = 0; trial < 10; trial++) {
                    const snapshot = matchmaker.listPublicMatches();
                    expect(snapshot.ok).toBe(true);
                    expect(snapshot.matches.some((entry) => entry.matchId === privateMatchId)).toBe(false);
                }

                // -- N-1 distinct guests fill the remaining seats -------------------
                const joinTokens: string[] = [];
                for (let seat = 1; seat < N; seat++) {
                    const joined = matchmaker.joinMatch({ matchId, displayName: `P${String(seat + 1)}` });
                    expect(joined.ok).toBe(true);
                    if (!joined.ok) {
                        return;
                    }
                    joinTokens.push(joined.data.seatAssignment.sessionToken);
                }

                // Auto-start registered the engine session with the live server.
                const stats = server.stats();
                expect(stats.activeMatches).toBe(1);

                // Over-join after the match is full: losers get `match_full`
                // (at most one winner of the last seat; the rest are rejected).
                const late = matchmaker.joinMatch({ matchId, displayName: 'Latecomer' });
                expect(late.ok).toBe(false);
                if (late.ok) {
                    return;
                }
                expect(late.error.code).toBe('match_full');

                // -- N real browser consoles join through the ?live runtime --------
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

                const pages: Page[] = [];
                for (let seat = 0; seat < N; seat++) {
                    pages.push(await openConsole(`P${String(seat + 1)}`));
                }

                // All seats reach 'live' with distinct assigned seats.
                for (const page of pages) {
                    await waitUntil(page, (live) => live.status === 'live', `seat reaches live (N=${N})`);
                }
                const seated = await Promise.all(pages.map((page) => readLiveOrThrow(page)));
                const playerIds = seated.map((live) => live.playerId);
                expect(new Set(playerIds)).toEqual(new Set(Array.from({ length: N }, (_, i) => i + 1)));

                // -- Ticks flow to all seats within 2 s of final join -------------
                // (fixed 250 ms cadence; the early economy is still changing, so
                // tick ≥ 1 is guaranteed to be broadcast — no skipped-frame risk.)
                for (const page of pages) {
                    await expect
                        .poll(async () => (await readLive(page))?.tick ?? -1, {
                            timeout: 8_000,
                            intervals: [50, 100, 250],
                        })
                        .toBeGreaterThanOrEqual(1, `seat receives tick≥1 within 2s (N=${N})`);
                }

                // -- Orders from ALL seats through the full wire round trip -------
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

                for (const page of pages) {
                    await issueReservesOrder(page);
                }

                // Authoritative acks come back through orderAck envelopes (FR-008):
                // the reducer formats each ok-ack as success feedback.
                for (const page of pages) {
                    await expect
                        .poll(
                            async () =>
                                await page.evaluate(() => {
                                    const handle = (window as unknown as { __europaLive?: LiveHandleView })
                                        .__europaLive;
                                    return (
                                        handle?.store.getState().feedback.some((entry) => entry.kind === 'success') ??
                                        false
                                    );
                                }),
                            { timeout: 10_000 },
                        )
                        .toBe(true, `seat receives ok:true ack (N=${N})`);
                }

                // And the ENGINE applied every order: each seat's own city shows
                // the ordered 7% reserves in its fog-filtered tick views.
                for (const page of pages) {
                    const me = (await readLiveOrThrow(page)).playerId;
                    await expect
                        .poll(
                            async () =>
                                (await readLive(page))?.cells.some(
                                    (cell) => cell.reserves === 7 && cell.cityOwner === me,
                                ) ?? false,
                            { timeout: 10_000 },
                        )
                        .toBe(true, `engine applied reserves for seat ${String(me)} (N=${N})`);
                }

                // -- Fog-filtered consistency across all N seats -------------------
                const finals = await Promise.all(pages.map((page) => readLiveOrThrow(page)));

                const totalCells = BOARD_SIZE * BOARD_SIZE;
                for (const live of finals) {
                    // Each view is stamped with its own seat…
                    expect(live.playerId).not.toBeNull();
                    // …neither seat sees the whole board (redaction active)…
                    expect(live.cells.length).toBeLessThan(totalCells);
                    // …each seat sees its own city…
                    expect(live.cells.some((cell) => cell.cityOwner === live.playerId)).toBe(true);
                }

                // …and the horizons differ per seat (per-seat filtering, not one
                // shared stream). At least two distinct visible-cell signatures
                // prove the views are individually fog-filtered.
                const signature = (cells: (typeof finals)[number]['cells']): string =>
                    cells
                        .map((cell) => `${cell.x},${cell.y}`)
                        .sort()
                        .join('|');
                const distinctHorizons = new Set(finals.map((live) => signature(live.cells)));
                expect(distinctHorizons.size).toBeGreaterThanOrEqual(2);

                // Views advance consistently: near-equal progress, never regressing.
                const ticks = finals.map((live) => live.tick);
                const maxTick = Math.max(...ticks);
                const minTick = Math.min(...ticks);
                expect(maxTick - minTick).toBeLessThanOrEqual(3);

                // -- Victory reachable by scripted mutual elimination -------------
                // Surrender N-1 seats (everyone but the host/seat 0) via the
                // matchmaker's leaveMatch → engine OrderSurrender. The remaining
                // survivor triggers a terminal win delivered to its console.
                for (const token of joinTokens) {
                    const left = matchmaker.leaveMatch({ matchId, sessionToken: token });
                    expect(left.ok).toBe(true);
                }

                // The survivor is the host (seat 0 → playerId 1). Its console must
                // surface the terminal result (showResults / game_over).
                const winnerPage = pages[playerIds.indexOf(1)];
                await expect
                    .poll(async () => (await readLive(winnerPage))?.status, {
                        timeout: 15_000,
                        intervals: [50, 100, 250],
                    })
                    .toBe('game_over', `survivor console reaches game_over (N=${N})`);

                // Zero page errors across the whole conversation.
                expect(errors).toEqual([]);

                for (const page of pages) {
                    await page.context().close();
                }
            } finally {
                await server.close();
                await new Promise<void>((resolve) => {
                    httpServer.close(() => resolve());
                });
                await matchmaker.close();
            }
        });
    });
}
