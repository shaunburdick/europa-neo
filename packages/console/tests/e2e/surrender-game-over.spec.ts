/**
 * Surrender → game-over E2E — Issue #47 (Bug A + Bug B).
 *
 * Proves the full surrender flow through the real stack:
 *
 *   console UI (real Chromium, semantic match route) ⇄
 *   WsMatchClient (networking's wire codec over native WebSocket) ⇄
 *   real createMatchServer (ephemeral port, ticking scheduler) ⇄
 *   matchmaking Matchmaker bridge (auto-start register/attach) ⇄
 *   engine + terrain + fog (real board generation + redaction)
 *
 * Bug A: surrendering player must see opponent as winner.
 * Bug B: non-surrendering player must receive terminal + show modal.
 *
 * Determinism: poll conditions, no arbitrary sleeps.
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
// Harness: matchmaking ↔ networking bridge wiring (same as full-stack)
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
            readonly session: {
                readonly playerId: number | null;
                readonly playerNames: ReadonlyMap<number, string>;
            };
            readonly matchResult: {
                readonly kind: string;
                readonly winner?: number;
                readonly tick?: number;
            } | null;
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
    matchResult: { kind: string; winner?: number; tick?: number } | null;
    playerNames: Record<number, string>;
} | null> {
    return page.evaluate(() => {
        const handle = (window as unknown as { __europaLive?: LiveHandleView }).__europaLive;
        if (handle === undefined || handle.store === undefined) {
            return null;
        }
        const state = handle.store.getState();
        const names: Record<number, string> = {};
        for (const [id, name] of state.session.playerNames) {
            names[id] = name;
        }
        return {
            status: state.status,
            connection: handle.client.state().connection,
            playerId: state.session.playerId,
            tick: state.latestView?.tick ?? -1,
            bootError: handle.bootError,
            matchResult: state.matchResult,
            playerNames: names,
        };
    });
}

/**
 * Read the live handle's essential state from a page, failing the
 * test when the runtime never mounted.
 */
async function readLiveOrThrow(page: Page): Promise<NonNullable<Awaited<ReturnType<typeof readLive>>>> {
    const live = await readLive(page);
    if (live === null) {
        throw new Error('live runtime handle missing (page did not mount the semantic match runtime)');
    }
    return live;
}

/**
 * Poll a page until `when` holds. Fails with the boot error surfaced
 * in the message when the runtime reported one.
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

/**
 * Check if the GameOverModal is visible in the DOM.
 * Looks for the role="dialog" aria-labelledby="gameover-title" element.
 */
async function isGameOverModalVisible(page: Page): Promise<boolean> {
    return page.locator('[role="dialog"][aria-labelledby="gameover-title"]').isVisible();
}

/**
 * Read the GameOverModal's title text.
 */
async function getGameOverModalTitle(page: Page): Promise<string> {
    return page.locator('#gameover-title').textContent() ?? '';
}

// ---------------------------------------------------------------------------
// The proof
// ---------------------------------------------------------------------------

test('2-player surrender: both players see correct game-over result', async ({ browser }) => {
    test.setTimeout(90_000);

    const { httpServer, server, matchmaker } = buildStack();
    await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    await server.listen();
    const port = server.__boundPortForTest();
    expect(port).toBeDefined();

    try {
        // -- Matchmaking: public create + fill => auto-start -------------------
        const created = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'Surrenderer',
            settings: { playerCount: 2, boardSize: BOARD_SIZE, tickIntervalMs: TICK_MS },
        });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        const { matchId } = created.data;
        expect(created.data.seatAssignment.playerId).toBe(1);

        const filled = matchmaker.joinMatch({ matchId, displayName: 'Winner' });
        expect(filled.ok).toBe(true);

        // Auto-start registered the engine session with the live server.
        const stats = server.stats();
        expect(stats.activeMatches).toBe(1);

        // -- Two real browser consoles join through the semantic match route ----
        const errors: string[] = [];
        const openConsole = async (name: string): Promise<Page> => {
            const context = await browser.newContext();
            await context.addInitScript(
                ({ wsUrl, matchId, displayName }) => {
                    (window as unknown as { __europaTestMatch: object }).__europaTestMatch = {
                        wsUrl,
                        matchId,
                        displayName,
                    };
                },
                { wsUrl: `ws://127.0.0.1:${String(port)}`, matchId, displayName: name },
            );
            const page = await context.newPage();
            page.on('pageerror', (error) => {
                errors.push(`${name}: ${String(error)}`);
            });
            await page.goto(`/match/${encodeURIComponent(matchId)}/join`);
            return page;
        };

        const surrenderer = await openConsole('Surrenderer');
        const winner = await openConsole('Winner');

        // Both seats reach 'live' with distinct assigned seats.
        await waitUntil(surrenderer, (live) => live.status === 'live', 'Surrenderer reaches live');
        await waitUntil(winner, (live) => live.status === 'live', 'Winner reaches live');

        const surrendererSeated = await readLiveOrThrow(surrenderer);
        const winnerSeated = await readLiveOrThrow(winner);
        expect(new Set([surrendererSeated.playerId, winnerSeated.playerId])).toEqual(new Set([1, 2]));

        // -- Ticks flow to both seats -------------------------------------------
        await waitUntil(surrenderer, (live) => live.tick >= 3, 'Surrenderer receives ticks');
        await waitUntil(winner, (live) => live.tick >= 3, 'Winner receives ticks');

        // -- Player 1 (Surrenderer) surrenders -----------------------------------
        // Dispatch the surrender order through the store.
        await surrenderer.evaluate(() => {
            const handle = (window as unknown as { __europaLive?: LiveHandleView }).__europaLive;
            handle?.store.dispatch({ kind: 'surrender' });
        });

        // -- Assert: BOTH players receive the terminal event with correct winner -
        // Bug A: the surrendering player must see the OPPONENT (Player 2, "Winner")
        // as the winner, NOT themselves.
        // Bug B: the non-surrendering player must also receive the terminal event
        // and reach 'game_over' status.

        // Wait for the surrenderer (Player 1) to reach game_over.
        await waitUntil(surrenderer, (live) => live.status === 'game_over', 'Surrenderer reaches game_over');

        // Wait for the winner (Player 2) to reach game_over.
        await waitUntil(winner, (live) => live.status === 'game_over', 'Winner reaches game_over');

        // --- Verify Bug A: correct winner in terminal result ---
        const surrendererFinal = await readLiveOrThrow(surrenderer);
        const winnerFinal = await readLiveOrThrow(winner);

        // Both must have a matchResult.
        expect(surrendererFinal.matchResult).not.toBeNull();
        expect(winnerFinal.matchResult).not.toBeNull();

        // The result kind must be 'win' (not 'draw').
        expect(surrendererFinal.matchResult?.kind).toBe('win');
        expect(winnerFinal.matchResult?.kind).toBe('win');

        // CRITICAL BUG A CHECK: The winner's PlayerId must be the
        // NON-surrendering player (Player 2 = "Winner"), NOT the
        // surrendering player (Player 1 = "Surrenderer").
        const surrendererWinnerId = surrendererFinal.matchResult?.winner;
        const winnerWinnerId = winnerFinal.matchResult?.winner;

        // Both players must agree on who won.
        expect(surrendererWinnerId).toBe(winnerWinnerId);

        // The winner must be Player 2 (the "Winner" seat), NOT Player 1.
        expect(surrendererWinnerId).toBe(winnerSeated.playerId);
        expect(winnerWinnerId).toBe(winnerSeated.playerId);

        // --- Verify Bug B: GameOverModal renders for BOTH players ---
        // The modal should be visible now that both are in game_over.
        // Give React a moment to commit the state change.
        await expect
            .poll(async () => isGameOverModalVisible(surrenderer), {
                timeout: 5_000,
                intervals: [50, 100, 250],
            })
            .toBe(true, 'GameOverModal visible to surrenderer (Bug B)');

        await expect
            .poll(async () => isGameOverModalVisible(winner), {
                timeout: 5_000,
                intervals: [50, 100, 250],
            })
            .toBe(true, 'GameOverModal visible to winner (Bug B)');

        // --- Verify modal content: winner's name is displayed ---
        const surrendererModalTitle = await getGameOverModalTitle(surrenderer);
        const winnerModalTitle = await getGameOverModalTitle(winner);

        // Both must show the winner's display name.
        expect(surrendererModalTitle).toContain('Winner');
        expect(winnerModalTitle).toContain('Winner');

        // The surrenderer must NOT see themselves as the winner.
        expect(surrendererModalTitle).not.toContain('Surrenderer');

        // --- Verify no WaitingOverlay is shown ---
        // Bug B symptom: the non-surrendering player's screen goes back to
        // "waiting for opponent to join". After game_over, the WaitingOverlay
        // should NOT be visible (isAwaitingMatchStart returns false).
        const surrendererWaitingVisible = await surrenderer.evaluate(() => {
            return document.querySelector('.europa-waiting') !== null;
        });
        const winnerWaitingVisible = await winner.evaluate(() => {
            return document.querySelector('.europa-waiting') !== null;
        });
        expect(surrendererWaitingVisible).toBe(false);
        expect(winnerWaitingVisible).toBe(false);

        // --- Diagnostic: print state for debugging ---
        const diagS = await readLiveOrThrow(surrenderer);
        const diagW = await readLiveOrThrow(winner);
        // eslint-disable-next-line no-console
        console.log('[surrender-e2e] Surrenderer final:', JSON.stringify(diagS, null, 2));
        // eslint-disable-next-line no-console
        console.log('[surrender-e2e] Winner final:', JSON.stringify(diagW, null, 2));

        // Zero page errors across the whole conversation.
        expect(errors).toEqual([]);

        await surrenderer.context().close();
        await winner.context().close();
    } finally {
        await server.close();
        await new Promise<void>((resolve) => {
            httpServer.close(() => resolve());
        });
        await matchmaker.close();
    }
});
