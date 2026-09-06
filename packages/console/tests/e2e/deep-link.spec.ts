/**
 * Deep-link entry E2E — issue #34 (T-034-21).
 *
 * Verifies the deep-link entry flow through the real production stack:
 *
 *   console lobby/match UI (real Chromium, lobby runtime) ⇄
 *   WsLobbyClient (lobby wire protocol) ⇄
 *   lobby facade (createLobbyService) ⇄
 *   real matchmaker (feature 006, auto-start) ⇄
 *   engine + terrain + fog + networking (real board generation)
 *
 * Scenarios covered (FR-029–FR-033, SC-013–SC-015):
 *   1. Fresh visitor opens /match/<matchId> → profile redirect →
 *      return → interstitial → Play (SC-013)
 *   2. In-progress match → interstitial shows Spectate only (SC-013)
 *   3. Participant reload → straight in, no interstitial (SC-014)
 *   4. Unknown match → RouteNotice "match not found" (SC-015)
 *
 * Constraints:
 *   - TypeScript strict, zero suppressions, zero `any`.
 *   - Biome: 4-space, 120-col.
 *   - E2E excluded from package tsconfig BY DESIGN.
 *   - Determinism: no arbitrary sleeps — all waits are expect.poll.
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

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const TICK_MS = 250;
const WAIT_TIMEOUT = 15_000;

// ---------------------------------------------------------------------------
// Stack harness
// ---------------------------------------------------------------------------

/** Preserve the test-only ?ws= transport override across same-document history. */
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

interface Stack {
    readonly server: Server;
    readonly matchmaker: Matchmaker;
}

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
                const matchmaker = wiring.matchmaker;
                if (matchmaker === null) {
                    throw new Error('host wiring bug: lobby frame arrived before the matchmaker was bound');
                }
                const facade = createLobbyService({ matchmaker, deliver: sink.deliver });
                return facade;
            },
        },
    };

    const server = createMatchServer(
        { ...NETWORK_DEFAULT_CONFIG, host: '127.0.0.1', port: 0, tickRateMs: TICK_MS, ordersPerSecond: 1000 },
        deps,
    );

    const bindable = Object.assign(server, {
        bindMatchmaker(bridgeHandler: MatchmakerBridge): void {
            bridge = { ...bridge, ...bridgeHandler };
        },
    });

    const matchmaker = createMatchmaker({}, { server: bindable });
    wiring.matchmaker = matchmaker;

    return { server, matchmaker };
}

// ---------------------------------------------------------------------------
// Browser-side helpers
// ---------------------------------------------------------------------------

interface LobbyHandleView {
    readonly store: {
        getState(): {
            readonly viewMode: string;
            readonly handle: string | null;
            readonly activeMatchId: string | null;
            readonly identityStatus: string;
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
    activeMatchId: string | null;
    identityStatus: string;
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
            activeMatchId: state.activeMatchId,
            identityStatus: state.identityStatus,
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

async function readLobbyOrThrow(page: Page): Promise<NonNullable<Awaited<ReturnType<typeof readLobby>>>> {
    const lobby = await readLobby(page);
    if (lobby === null) {
        throw new Error('lobby runtime handle missing — page did not mount lobby runtime');
    }
    return lobby;
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
// The proofs
// ---------------------------------------------------------------------------

test.describe('deep-link entry E2E — issue #34 (FR-029–FR-033, SC-013–SC-015)', () => {
    let server: Server;
    let matchmaker: Matchmaker;
    let wsPort: number;

    test.beforeEach(async () => {
        const stack = buildStack();
        server = stack.server;
        matchmaker = stack.matchmaker;
        await server.listen();
        wsPort = server.__boundPortForTest() ?? 0;
    });

    test.afterEach(async () => {
        await server.close();
        await matchmaker.close();
    });

    // -----------------------------------------------------------------------
    // Scenario 1: Fresh visitor opens /match/<matchId> → profile redirect →
    //             return → interstitial → Play (SC-013)
    // -----------------------------------------------------------------------

    test('fresh visitor deep link → profile → interstitial → play', async ({ browser }) => {
        test.setTimeout(90_000);

        const errors: string[] = [];
        const wsUrl = `ws://127.0.0.1:${String(wsPort)}`;

        // -- Tab 1: Alice creates a waiting public match ---------------------
        const aliceContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await aliceContext.addInitScript(preserveWsQueryInHistory);
        const alice = await aliceContext.newPage();
        alice.on('pageerror', (error) => errors.push(`Alice: ${String(error)}`));
        await alice.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);

        await waitUntilLobby(alice, (l) => l.connection === 'ready', 'Alice connected');
        await setHandleViaProfile(alice, 'Alice');
        await waitUntilLobby(alice, (l) => l.handle === 'Alice', 'Alice handle accepted');

        await alice.getByRole('button', { name: 'Create match' }).click();
        await waitUntilLobby(alice, (l) => l.viewMode === 'match', 'Alice in match view');

        const matchId = await waitUntilLobby(
            alice,
            (l) => (l.entries.length > 0 ? (l.entries[0]?.matchId ?? null) : null) !== null,
            'waiting row',
        ).then(async () => {
            const lobby = await readLobbyOrThrow(alice);
            return lobby.entries[0]?.matchId ?? '';
        });

        expect(matchId).toMatch(/^[0-9a-f-]{36}$/i);
        const lobbyAfterCreate = await readLobbyOrThrow(alice);
        expect(lobbyAfterCreate.entries[0]?.status).toBe('waiting');

        // -- Tab 2: Bob opens the deep link (fresh browser, no handle) -------
        const bobContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await bobContext.addInitScript(preserveWsQueryInHistory);
        const bob = await bobContext.newPage();
        bob.on('pageerror', (error) => errors.push(`Bob: ${String(error)}`));

        // Navigate to the match URL — the identity gate will redirect to
        // /profile since Bob has no handle.
        await bob.goto(`/match/${encodeURIComponent(matchId)}?ws=${encodeURIComponent(wsUrl)}`);

        // -- Identity gate → profile redirect (FR-029 step a) ----------------
        await waitUntilLobby(bob, (l) => l.connection === 'ready', 'Bob lobby connected');

        // Bob is redirected to /profile (unnamed visitor).
        await expect
            .poll(() => bob.evaluate(() => window.location.pathname), { timeout: WAIT_TIMEOUT })
            .toBe('/profile');

        // -- Set handle via profile form ------------------------------------
        await setHandleViaProfile(bob, 'Bob');

        // After naming, the returnTo round-trip delivers Bob back to
        // /match/<matchId>. The route resolver will fire and show the
        // interstitial.
        await waitUntilLobby(bob, (l) => l.identityStatus === 'named', 'Bob named');

        // -- Interstitial (FR-029 step b) -----------------------------------
        // The deep-link interstitial shows Play + Spectate for a waiting match.
        await expect(bob.locator('[data-europa-deep-link-interstitial="true"]')).toBeVisible({
            timeout: WAIT_TIMEOUT,
        });
        await expect(bob.getByRole('heading', { name: 'Match found' })).toBeVisible();
        await expect(bob.locator('[data-europa-deep-link-play="true"]')).toBeVisible();
        await expect(bob.locator('[data-europa-deep-link-spectate="true"]')).toBeVisible();
        await expect(bob.locator('[data-europa-deep-link-return="true"]')).toBeVisible();

        // -- Play seats the visitor (FR-029 step c) -------------------------
        await bob.locator('[data-europa-deep-link-play="true"]').click();

        // The match view should appear and the match should start (both
        // seats filled → auto-start).
        await waitUntilLobby(bob, (l) => l.viewMode === 'match', 'Bob enters match');
        await expect(bob.locator('.europa-lobby-match__title')).toContainText('In match');

        // -- Ticks flow to both seats ---------------------------------------
        await expect
            .poll(
                async () => {
                    const lobby = await readLobby(bob);
                    if (lobby === null) return false;
                    const entry = lobby.entries.find((e) => e.matchId === matchId);
                    return entry?.status === 'in_progress';
                },
                { timeout: WAIT_TIMEOUT },
            )
            .toBe(true);

        // Zero page errors.
        expect(errors).toEqual([]);

        await bobContext.close();
        await aliceContext.close();
    });

    // -----------------------------------------------------------------------
    // Scenario 2: In-progress match → interstitial shows Spectate only
    //             (SC-013, FR-029)
    // -----------------------------------------------------------------------

    test('in-progress match deep link → spectate only', async ({ browser }) => {
        test.setTimeout(90_000);

        const errors: string[] = [];
        const wsUrl = `ws://127.0.0.1:${String(wsPort)}`;

        // -- Create and start a match (two players) --------------------------
        const aliceContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await aliceContext.addInitScript(preserveWsQueryInHistory);
        const alice = await aliceContext.newPage();
        alice.on('pageerror', (error) => errors.push(`Alice: ${String(error)}`));
        await alice.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);

        await waitUntilLobby(alice, (l) => l.connection === 'ready', 'Alice connected');
        await setHandleViaProfile(alice, 'Alice');
        await waitUntilLobby(alice, (l) => l.handle === 'Alice', 'Alice handle');

        await alice.getByRole('button', { name: 'Create match' }).click();
        await waitUntilLobby(alice, (l) => l.viewMode === 'match', 'Alice in match');

        const matchId = await waitUntilLobby(
            alice,
            (l) => (l.entries.length > 0 ? (l.entries[0]?.matchId ?? null) : null) !== null,
            'waiting row',
        ).then(async () => {
            const lobby = await readLobbyOrThrow(alice);
            return lobby.entries[0]?.matchId ?? '';
        });

        // Bob joins → auto-start.
        const bobContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await bobContext.addInitScript(preserveWsQueryInHistory);
        const bob = await bobContext.newPage();
        bob.on('pageerror', (error) => errors.push(`Bob: ${String(error)}`));
        await bob.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);

        await waitUntilLobby(bob, (l) => l.connection === 'ready', 'Bob connected');
        await setHandleViaProfile(bob, 'Bob');
        await waitUntilLobby(bob, (l) => l.handle === 'Bob', 'Bob handle');

        await waitUntilLobby(
            bob,
            (l) => l.entries.some((entry) => entry.matchId === matchId && entry.status === 'waiting'),
            'Bob sees waiting match',
        );
        await bob.locator(`[data-match-id="${matchId}"]`).getByRole('button', { name: /^Join/ }).click();
        await waitUntilLobby(bob, (l) => l.viewMode === 'match', 'Bob enters match');

        // Wait for auto-start.
        await expect
            .poll(
                async () => {
                    const lobby = await readLobby(alice);
                    if (lobby === null) return false;
                    const entry = lobby.entries.find((e) => e.matchId === matchId);
                    return entry?.status === 'in_progress';
                },
                { timeout: WAIT_TIMEOUT },
            )
            .toBe(true);

        // -- Dave opens the deep link for the running match ------------------
        const daveContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await daveContext.addInitScript(preserveWsQueryInHistory);
        const dave = await daveContext.newPage();
        dave.on('pageerror', (error) => errors.push(`Dave: ${String(error)}`));

        await dave.goto(`/match/${encodeURIComponent(matchId)}?ws=${encodeURIComponent(wsUrl)}`);
        await waitUntilLobby(dave, (l) => l.connection === 'ready', 'Dave connected');

        // Identity gate → profile redirect.
        await expect
            .poll(() => dave.evaluate(() => window.location.pathname), { timeout: WAIT_TIMEOUT })
            .toBe('/profile');

        await setHandleViaProfile(dave, 'Dave');
        await waitUntilLobby(dave, (l) => l.identityStatus === 'named', 'Dave named');

        // -- Spectate-only interstitial (FR-029: full/running → spectate) ----
        await expect(dave.locator('[data-europa-deep-link-interstitial="true"]')).toBeVisible({
            timeout: WAIT_TIMEOUT,
        });
        await expect(dave.getByRole('heading', { name: 'Match found' })).toBeVisible();
        // Spectate-only: no Play button.
        await expect(dave.locator('[data-europa-deep-link-play="true"]')).toHaveCount(0);
        await expect(dave.locator('[data-europa-deep-link-spectate="true"]')).toBeVisible();

        // -- Spectate attaches as spectator (FR-031) ------------------------
        await dave.locator('[data-europa-deep-link-spectate="true"]').click();
        await waitUntilLobby(dave, (l) => l.viewMode === 'match', 'Dave spectating');
        await expect(dave.locator('.europa-lobby-match__title')).toContainText('Spectating');

        // -- Return to lobby via the return button ---------------------------
        await dave.locator('[data-europa-deep-link-return="true"]').click();
        await waitUntilLobby(dave, (l) => l.viewMode === 'lobby', 'Dave returns to lobby');
        await expect(dave.locator('h1')).toContainText('Europa Neo Lobby');

        expect(errors).toEqual([]);

        await daveContext.close();
        await bobContext.close();
        await aliceContext.close();
    });

    // -----------------------------------------------------------------------
    // Scenario 3: Participant reload → straight in, no interstitial
    //             (SC-014, FR-030)
    // -----------------------------------------------------------------------

    test('participant reload → straight in, no interstitial (SC-014)', async ({ browser }) => {
        test.setTimeout(60_000);

        const errors: string[] = [];
        const wsUrl = `ws://127.0.0.1:${String(wsPort)}`;

        // -- Establish identity + create a match ----------------------------
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await context.addInitScript(preserveWsQueryInHistory);
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);

        await waitUntilLobby(page, (l) => l.connection === 'ready', 'lobby connected');
        await setHandleViaProfile(page, 'Participant');
        await waitUntilLobby(page, (l) => l.handle === 'Participant', 'handle accepted');

        await page.getByRole('button', { name: 'Create match' }).click();
        await waitUntilLobby(page, (l) => l.viewMode === 'match', 'in match view');

        const matchId = await waitUntilLobby(
            page,
            (l) => (l.entries.length > 0 ? (l.entries[0]?.matchId ?? null) : null) !== null,
            'waiting row',
        ).then(async () => {
            const lobby = await readLobbyOrThrow(page);
            return lobby.entries[0]?.matchId ?? '';
        });

        expect(matchId).toMatch(/^[0-9a-f-]{36}$/i);

        // -- Reload the page ------------------------------------------------
        await page.reload({ waitUntil: 'domcontentloaded' });

        // After reload, the lobby reconnects and restores the identity.
        await waitUntilLobby(page, (l) => l.connection === 'ready', 'reconnected after reload');
        await waitUntilLobby(page, (l) => l.handle === 'Participant', 'handle restored');

        // The participant should go straight into the match view — no
        // interstitial should appear (FR-030, SC-014).
        await waitUntilLobby(page, (l) => l.viewMode === 'match', 'still in match after reload');

        // The interstitial must NOT be shown.
        await expect(page.locator('[data-europa-deep-link-interstitial="true"]')).toHaveCount(0);

        // The URL should still be /match/<matchId>.
        await expect(page).toHaveURL(new RegExp(`/match/${matchId}`));

        expect(errors).toEqual([]);
        await context.close();
    });

    // -----------------------------------------------------------------------
    // Scenario 4: Unknown match → RouteNotice "match not found" (SC-015)
    // -----------------------------------------------------------------------

    test('unknown match deep link → RouteNotice (SC-015)', async ({ browser }) => {
        test.setTimeout(60_000);

        const errors: string[] = [];
        const wsUrl = `ws://127.0.0.1:${String(wsPort)}`;
        const fakeMatchId = '00000000-0000-0000-0000-000000000000';

        // -- Establish identity first ---------------------------------------
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await context.addInitScript(preserveWsQueryInHistory);
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);

        await waitUntilLobby(page, (l) => l.connection === 'ready', 'lobby connected');
        await setHandleViaProfile(page, 'UnknownVisitor');
        await waitUntilLobby(page, (l) => l.handle === 'UnknownVisitor', 'handle accepted');

        // -- Navigate to an unknown match ------------------------------------
        await page.goto(`/match/${encodeURIComponent(fakeMatchId)}?ws=${encodeURIComponent(wsUrl)}`);

        // The route notice should show "Match unavailable" (FR-033, SC-015).
        // adaptRoute returns 'unavailable' → RouteNotice renders.
        await expect(page.locator('[data-europa-route-notice="unavailable"]')).toBeVisible({
            timeout: WAIT_TIMEOUT,
        });
        await expect(page.getByRole('heading', { name: 'Match unavailable' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Return to lobby' })).toBeEnabled();

        // The interstitial must NOT appear for an unavailable match.
        await expect(page.locator('[data-europa-deep-link-interstitial="true"]')).toHaveCount(0);

        // -- Return to lobby ------------------------------------------------
        await page.getByRole('button', { name: 'Return to lobby' }).click();
        await waitUntilLobby(page, (l) => l.viewMode === 'lobby', 'returned to lobby');
        await expect(page.locator('h1')).toContainText('Europa Neo Lobby');

        expect(errors).toEqual([]);
        await context.close();
    });
});
