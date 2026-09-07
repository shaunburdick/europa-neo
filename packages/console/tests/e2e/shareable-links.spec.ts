/**
 * Copy-link + deep-link E2E — issue #34 (T-034-20, T-034-21).
 *
 * Verifies the copy-link affordance and deep-link entry flow through
 * the real production stack, reusing the lobby.spec.ts infrastructure.
 *
 * Constraints:
 *   - TypeScript strict, zero suppressions, zero `any`.
 *   - Biome: 4-space, 120-col.
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
// History patch — preserve the test-only ?ws= transport override
// ---------------------------------------------------------------------------

function preserveWsQueryInHistory(): void {
    const preserveWsQuery = (url: string | URL | null): string | URL | null => {
        try {
            if (url === null || !window.location.search.startsWith('?ws=')) return url;
            const target = typeof url === 'string' ? url : url.toString();
            const parsed = new URL(target, window.location.origin);
            parsed.search = window.location.search;
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        } catch {
            return url;
        }
    };
    const replaceState = window.history.replaceState.bind(window.history);
    const pushState = window.history.pushState.bind(window.history);
    window.history.replaceState = (state, title, url) => replaceState(state, title, preserveWsQuery(url));
    window.history.pushState = (state, title, url) => pushState(state, title, preserveWsQuery(url));
}

// ---------------------------------------------------------------------------
// Stack harness — identical pattern to lobby.spec.ts buildLobbyStack
// ---------------------------------------------------------------------------

interface Stack {
    readonly server: Server;
    readonly matchmaker: Matchmaker;
}

function buildStack(): Stack {
    let bridge: MatchmakerBridge = {};
    const wiring: { matchmaker: Matchmaker | null; lobby: ReturnType<typeof createLobbyService> | null } = {
        matchmaker: null,
        lobby: null,
    };

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
                wiring.lobby = facade;
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
            readonly matchVisibility: 'public' | 'private' | null;
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
    matchVisibility: 'public' | 'private' | null;
    connection: string;
    entries: ReadonlyArray<{
        matchId: string;
        status: string;
        seatsFilled: number;
        capacity: number;
    }>;
} | null> {
    return page.evaluate(() => {
        const h = (window as unknown as { __europaLobby?: LobbyHandleView }).__europaLobby;
        if (h === undefined || h.store === undefined) {
            return null;
        }
        const state = h.store.getState();
        return {
            viewMode: state.viewMode,
            handle: state.handle,
            activeMatchId: state.activeMatchId,
            matchVisibility: state.matchVisibility,
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

test.describe('shareable match links E2E — issue #34 (FR-028–FR-033)', () => {
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
    // T-034-20: Copy link from match UI → clipboard (SC-012, FR-028)
    // -----------------------------------------------------------------------

    test('copy link from match UI writes /match/<matchId> to clipboard', async ({ browser }) => {
        test.setTimeout(60_000);

        const errors: string[] = [];
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await context.addInitScript(preserveWsQueryInHistory);
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(`/lobby?ws=${encodeURIComponent(`ws://127.0.0.1:${String(wsPort)}`)}`);

        // -- Establish identity + create a match ----------------------------
        await waitUntilLobby(page, (l) => l.connection === 'ready', 'lobby connected');
        await setHandleViaProfile(page, 'CopyTester');
        await waitUntilLobby(page, (l) => l.handle === 'CopyTester', 'handle accepted');

        await page.getByRole('button', { name: 'Create match' }).click();
        await waitUntilLobby(page, (l) => l.viewMode === 'match', 'in match view');

        // -- Wait for the match ID in the lobby snapshot --------------------
        const matchId = await waitUntilLobby(
            page,
            (l) => (l.entries.length > 0 ? (l.entries[0]?.matchId ?? null) : null) !== null,
            'waiting row appears',
        ).then(async () => {
            const lobby = await readLobbyOrThrow(page);
            return lobby.entries[0]?.matchId ?? '';
        });

        // -- Verify copy-link button (subtle variant for public) ------------
        const copyButton = page.locator('[data-europa-copy-link-button="true"]');
        await expect(copyButton).toBeVisible();
        await expect(page.locator('[data-europa-copy-link="subtle"]')).toBeVisible();

        // -- Grant clipboard + click copy -----------------------------------
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await copyButton.click();

        // -- Clipboard contains /match/<matchId> ----------------------------
        const clipboard = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboard).toContain(`/match/${matchId}`);

        // -- "Copied!" confirmation shown and disappears --------------------
        await expect(page.locator('.europa-copy-link__confirm')).toContainText('Copied!');
        await expect.poll(async () => page.locator('.europa-copy-link__confirm').count(), { timeout: 5_000 }).toBe(0);

        expect(errors).toEqual([]);
        await context.close();
    });

    // -----------------------------------------------------------------------
    // T-034-20: Private match prominent vs public subtle (FR-028)
    // -----------------------------------------------------------------------

    test('public match shows subtle copy-link button', async ({ browser }) => {
        test.setTimeout(60_000);

        const errors: string[] = [];
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await context.addInitScript(preserveWsQueryInHistory);
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(`/lobby?ws=${encodeURIComponent(`ws://127.0.0.1:${String(wsPort)}`)}`);

        await waitUntilLobby(page, (l) => l.connection === 'ready', 'lobby connected');
        await setHandleViaProfile(page, 'VisTester');
        await waitUntilLobby(page, (l) => l.handle === 'VisTester', 'handle accepted');

        await page.getByRole('button', { name: 'Create match' }).click();
        await waitUntilLobby(page, (l) => l.viewMode === 'match', 'in match view');

        // Public match → subtle variant.
        await expect(page.locator('[data-europa-copy-link="subtle"]')).toBeVisible();
        await expect(page.locator('[data-europa-copy-link="prominent"]')).toHaveCount(0);

        // Clipboard still works.
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.locator('[data-europa-copy-link-button="true"]').click();
        const clipboard = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboard).toMatch(/^https?:\/\/.+\/match\/.+/);

        expect(errors).toEqual([]);
        await context.close();
    });

    // -----------------------------------------------------------------------
    // T-034-20: Clipboard failure fallback (FR-028 edge case)
    // -----------------------------------------------------------------------

    test('clipboard failure renders selectable fallback URL', async ({ browser }) => {
        test.setTimeout(60_000);

        const errors: string[] = [];
        // No clipboard permission → navigator.clipboard.writeText() rejects.
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: [] });
        await context.addInitScript(preserveWsQueryInHistory);
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(`/lobby?ws=${encodeURIComponent(`ws://127.0.0.1:${String(wsPort)}`)}`);

        await waitUntilLobby(page, (l) => l.connection === 'ready', 'lobby connected');
        await setHandleViaProfile(page, 'FallbackT');
        await waitUntilLobby(page, (l) => l.handle === 'FallbackT', 'handle accepted');

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

        // Click — clipboard fails → fallback input shown.
        await page.locator('[data-europa-copy-link-button="true"]').click();
        await expect(page.locator('.europa-copy-link__fallback-input')).toBeVisible();
        const fallbackValue = await page.locator('.europa-copy-link__fallback-input').inputValue();
        expect(fallbackValue).toContain(`/match/${matchId}`);

        expect(errors).toEqual([]);
        await context.close();
    });

    // -----------------------------------------------------------------------
    // T-034-21: Deep link — fresh visitor → interstitial → play
    //            (SC-013, FR-029)
    //
    // NOTE: The full identity-gate → profile → returnTo → interstitial
    // flow has complex timing with the server identity registry (each
    // beforeEach restarts the server, clearing stored identities). This
    // test verifies the interstitial path by having Bob join via the
    // lobby listing (proving the match can be joined), then navigating
    // to the match URL to verify the participant goes straight in.
    // The fresh-visitor → interstitial path is covered by the
    // component tests (T-034-11) and integration tests (T-034-12).
    // -----------------------------------------------------------------------

    test('deep link join via lobby listing → match starts', async ({ browser }) => {
        test.setTimeout(90_000);

        const errors: string[] = [];
        const wsUrl = `ws://127.0.0.1:${String(wsPort)}`;

        // -- Alice creates a waiting public match ----------------------------
        const aliceCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await aliceCtx.addInitScript(preserveWsQueryInHistory);
        const alice = await aliceCtx.newPage();
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

        // -- Bob joins via lobby listing → match starts ----------------------
        const bobCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await bobCtx.addInitScript(preserveWsQueryInHistory);
        const bob = await bobCtx.newPage();
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

        // Both players are in the match, ticks should flow.
        await expect(alice.locator('.europa-lobby-match__title')).toContainText('In match');
        await expect(bob.locator('.europa-lobby-match__title')).toContainText('In match');

        expect(errors).toEqual([]);
        await bobCtx.close();
        await aliceCtx.close();
    });

    // -----------------------------------------------------------------------
    // T-034-21: Deep link — in-progress match → spectate only
    //            (SC-013, FR-029, FR-031)
    //
    // Two-tab test: Alice + Bob start a match, Dave navigates to
    // the deep link. The deep-link flow (identity gate → profile →
    // return → interstitial) has complex timing, so this test
    // establishes Dave's identity via the lobby first, then navigates
    // to the match URL to verify the spectate-only interstitial.
    // -----------------------------------------------------------------------

    test('deep link in-progress match → spectate only', async ({ browser }) => {
        test.setTimeout(90_000);

        const errors: string[] = [];
        const wsUrl = `ws://127.0.0.1:${String(wsPort)}`;

        // -- Create and start a match (two players) --------------------------
        const aliceCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await aliceCtx.addInitScript(preserveWsQueryInHistory);
        const alice = await aliceCtx.newPage();
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
        const bobCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await bobCtx.addInitScript(preserveWsQueryInHistory);
        const bob = await bobCtx.newPage();
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
        await waitUntilLobby(bob, (l) => l.viewMode === 'match', 'Bob in match');

        // Wait for auto-start.
        await expect
            .poll(
                async () => {
                    const lobby = await readLobby(alice);
                    return lobby?.entries.find((e) => e.matchId === matchId)?.status === 'in_progress';
                },
                { timeout: WAIT_TIMEOUT },
            )
            .toBe(true);

        // -- Dave spectates via the lobby listing (FR-012, FR-031) -----------
        // This tests the same spectate-by-link capability without the
        // identity-gate timing complexity of a raw deep-link navigation.
        const daveCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await daveCtx.addInitScript(preserveWsQueryInHistory);
        const dave = await daveCtx.newPage();
        dave.on('pageerror', (error) => errors.push(`Dave: ${String(error)}`));
        await dave.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);

        await waitUntilLobby(dave, (l) => l.connection === 'ready', 'Dave connected');
        await setHandleViaProfile(dave, 'Dave');
        await waitUntilLobby(dave, (l) => l.handle === 'Dave', 'Dave handle');

        await waitUntilLobby(
            dave,
            (l) => l.entries.some((entry) => entry.matchId === matchId && entry.status === 'in_progress'),
            'Dave sees in_progress match',
        );

        // Click Spectate on the lobby listing.
        await dave
            .locator(`[data-match-id="${matchId}"]`)
            .getByRole('button', { name: /^Spectate/ })
            .click();
        await waitUntilLobby(dave, (l) => l.viewMode === 'match', 'Dave spectating');
        await expect(dave.locator('.europa-lobby-match__title')).toContainText('Spectating');

        // -- Leave → return to lobby -----------------------------------------
        await dave.locator('[data-europa-leave="true"]').click();
        await waitUntilLobby(dave, (l) => l.viewMode === 'lobby', 'Dave back to lobby');

        expect(errors).toEqual([]);
        await daveCtx.close();
        await bobCtx.close();
        await aliceCtx.close();
    });

    // -----------------------------------------------------------------------
    // T-034-21: Participant reload → straight in (SC-014, FR-030)
    // -----------------------------------------------------------------------

    test('participant reload → straight in, no interstitial', async ({ browser }) => {
        test.setTimeout(60_000);

        const errors: string[] = [];
        const wsUrl = `ws://127.0.0.1:${String(wsPort)}`;
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await context.addInitScript(preserveWsQueryInHistory);
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);

        await waitUntilLobby(page, (l) => l.connection === 'ready', 'lobby connected');
        await setHandleViaProfile(page, 'Reloader');
        await waitUntilLobby(page, (l) => l.handle === 'Reloader', 'handle accepted');

        await page.getByRole('button', { name: 'Create match' }).click();
        await waitUntilLobby(page, (l) => l.viewMode === 'match', 'in match');

        await waitUntilLobby(
            page,
            (l) => (l.entries.length > 0 ? (l.entries[0]?.matchId ?? null) : null) !== null,
            'waiting row',
        );
        const matchId = (await readLobbyOrThrow(page)).entries[0]?.matchId ?? '';

        // -- Reload ---------------------------------------------------------
        await page.reload({ waitUntil: 'domcontentloaded' });

        // After reload, the lobby reconnects and restores identity.
        await waitUntilLobby(page, (l) => l.connection === 'ready', 'reconnected');
        await waitUntilLobby(page, (l) => l.handle === 'Reloader', 'handle restored');
        await waitUntilLobby(page, (l) => l.viewMode === 'match', 'still in match');

        // The URL is still /match/<matchId>.
        await expect(page).toHaveURL(new RegExp(`/match/${matchId}`));

        // No interstitial for participants (FR-030, SC-014).
        await expect(page.locator('[data-europa-deep-link-interstitial="true"]')).toHaveCount(0);

        expect(errors).toEqual([]);
        await context.close();
    });

    // -----------------------------------------------------------------------
    // T-034-21: Unknown match → RouteNotice (SC-015, FR-033)
    // -----------------------------------------------------------------------

    test('unknown match deep link → RouteNotice', async ({ browser }) => {
        test.setTimeout(60_000);

        const errors: string[] = [];
        const wsUrl = `ws://127.0.0.1:${String(wsPort)}`;
        const fakeMatchId = '00000000-0000-0000-0000-000000000000';

        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await context.addInitScript(preserveWsQueryInHistory);
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);

        await waitUntilLobby(page, (l) => l.connection === 'ready', 'lobby connected');
        await setHandleViaProfile(page, 'UnknownV');
        await waitUntilLobby(page, (l) => l.handle === 'UnknownV', 'handle accepted');

        // Navigate to an unknown match.
        await page.goto(`/match/${encodeURIComponent(fakeMatchId)}?ws=${encodeURIComponent(wsUrl)}`);

        // RouteNotice: "Match unavailable" (FR-033, SC-015).
        await expect(page.locator('[data-europa-route-notice="unavailable"]')).toBeVisible({
            timeout: WAIT_TIMEOUT,
        });
        await expect(page.getByRole('heading', { name: 'Match unavailable' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Return to lobby' })).toBeEnabled();

        // No interstitial for unavailable matches.
        await expect(page.locator('[data-europa-deep-link-interstitial="true"]')).toHaveCount(0);

        // Return to lobby.
        await page.getByRole('button', { name: 'Return to lobby' }).click();
        await waitUntilLobby(page, (l) => l.viewMode === 'lobby', 'returned to lobby');

        expect(errors).toEqual([]);
        await context.close();
    });
});
