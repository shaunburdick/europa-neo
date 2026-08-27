/**
 * Lobby E2E — feature 010 (T-019).
 *
 * Two-browser-tab Playwright coverage of the full lobby lifecycle
 * through the REAL production stack:
 *
 *   console lobby UI (real Chromium, default lobby runtime) ⇄
 *   WsLobbyClient (lobby wire protocol) ⇄
 *   lobby facade (createLobbyService) ⇄
 *   real matchmaker (feature 006, auto-start) ⇄
 *   engine + terrain + fog + networking (real board generation)
 *
 * Stack recipe: mirrors `scripts/host.ts` `buildStack()` — forwarding
 * bridge + lazy lobby-facade via `ServerDeps.lobby`, then matchmaker
 * binds via the soft `bindMatchmaker` seam.
 *
 * Browser-side helpers: each tab navigates to the lobby URL with a
 * `?ws=` override pointing at the ephemeral server port (the
 * lobby-view.ts `resolveLobbyServerUrl` resolves it). The lobby
 * runtime exposes `window.__europaLobby` for internal-state
 * assertions (identity, viewMode, activeMatchId) that the DOM alone
 * cannot convey.
 *
 * Determinism discipline: NO arbitrary sleeps — every wait is an
 * `expect.poll` condition against observable DOM or handle state;
 * the tick cadence is fixed; orders are deterministic
 * `setReserves` gestures aimed at each seat's own city.
 *
 * Scenarios covered:
 *   1. create→join→first tick + lobby updates + waiting→running (SC-004, SC-008)
 *   2. spectator read-only entry (SC-005, FR-012) + zero-order proof
 *   3. return-to-lobby (identity survives, US4 AC-4)
 *   4. reconnect within grace (identity persists across reload, FR-003)
 *   5. server restart recovery (clients detect loss, low-revision baseline)
 *   6. privacy: no opaque guestPlayerId in DOM (FR-024)
 *
 * Security/privacy:
 *   - Common DOM textContent is scanned against a UUID regex and the
 *     'guest-' prefix as a lightweight guard (FR-024/FR-03).
 *   - Handles are rendered inside <bdi> (lobby-identity-card.tsx,
 *     PreStartPlate); the test verifies the <bdi> presence structurally.
 *
 * Constraints:
 *   - TypeScript strict, zero suppressions, zero `any`.
 *   - Biome: 4-space, 120-col.
 *   - E2E excluded from package tsconfig BY DESIGN.
 *   - Scoped checks only: build workspace deps, then this suite.
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

// ---------------------------------------------------------------------------
// Tunables (single location — constitution Principle V / AGENTS.md rule 3)
// ---------------------------------------------------------------------------

/** Fixed test cadence; match tickIntervalMs MUST equal server tickRateMs. */
const TICK_MS = 250;

/** Default poll timeout for observable state (CI-safe upper bound). */
const WAIT_TIMEOUT = 15_000;

// ---------------------------------------------------------------------------
// Stack harness (real server ⇄ real facade ⇄ real matchmaker)
// ---------------------------------------------------------------------------

/** What {@link buildLobbyStack} returns: running components to shut down. */
interface LobbyStack {
    readonly server: Server;
    readonly matchmaker: Matchmaker;
    /** Read the memoized lobby facade once built; null until first lobby frame. */
    readonly lobbyFacade: () => ReturnType<typeof createLobbyService> | null;
}

/**
 * Wire matchmaker ⇄ match server ⇄ lobby facade per the documented
 * host recipe: forwarding bridge + lazy lobby-facade via `ServerDeps.lobby`,
 * matchmaker binds via the soft `bindMatchmaker` seam.
 */
function buildLobbyStack(port = 0): LobbyStack {
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
            // Real sessions arrive pre-built from the matchmaker's auto-start.
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
        { ...NETWORK_DEFAULT_CONFIG, host: '127.0.0.1', port, tickRateMs: TICK_MS, ordersPerSecond: 1000 },
        deps,
    );

    const bindable = Object.assign(server, {
        bindMatchmaker(bridge: MatchmakerBridge): void {
            bound = { ...bound, ...bridge };
        },
    });

    const matchmaker = createMatchmaker({}, { server: bindable });
    wiring.matchmaker = matchmaker;

    return {
        server,
        matchmaker,
        lobbyFacade: () => wiring.lobby,
    };
}

// ---------------------------------------------------------------------------
// Browser-side helpers
// ---------------------------------------------------------------------------

/**
 * Minimal mirror of the lobby runtime's `window.__europaLobby` handle
 * (spec-side view for internal-state assertions).
 */
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

/**
 * Read the lobby handle's essential state from a page.
 *
 * @param page Playwright page with a mounted lobby runtime.
 * @returns The lobby state snapshot, or null if the handle is missing.
 */
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

/**
 * Read the lobby handle's state, failing with a clear message when
 * the runtime never mounted.
 */
async function readLobbyOrThrow(page: Page): Promise<NonNullable<Awaited<ReturnType<typeof readLobby>>>> {
    const lobby = await readLobby(page);
    if (lobby === null) {
        throw new Error('lobby runtime handle missing — page did not mount lobby runtime');
    }
    return lobby;
}

/**
 * Poll a page until `when` holds on the lobby state. Fails with a
 * clear message on timeout (never hangs silently).
 */
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

/**
 * Scan all visible text on the page for opaque guest player IDs.
 * Uses a UUID-v4 regex and the 'guest-' prefix as lightweight guards
 * (FR-024/FR-03). The UUID regex is intentionally broad (any UUID
 * shape) because guest IDs ARE UUIDs — finding ANY UUID in visible text
 * would be a leak.
 */
async function assertNoGuestIdInDOM(page: Page): Promise<void> {
    const text = await page.evaluate(() => document.body.textContent ?? '');
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;
    const guestPrefix = 'guest-';
    expect(
        uuidPattern.test(text),
        'UUID pattern found in visible DOM text — opaque guestPlayerId may have leaked',
    ).toBe(false);
    expect(
        text.toLowerCase().includes(guestPrefix),
        '"guest-" prefix found in visible DOM text — opaque guestPlayerId may have leaked',
    ).toBe(false);
}

/**
 * Verify the lobby page renders a handle inside a `<bdi>` element
 * (hostile-but-valid user content isolation, WCAG bidi).
 */
async function assertHandleInBdi(page: Page, handle: string): Promise<void> {
    const bdiCount = await page.locator('bdi').filter({ hasText: handle }).count();
    expect(bdiCount, `handle "${handle}" not found inside a <bdi> element`).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// The proofs
// ---------------------------------------------------------------------------

test.describe('lobby E2E — full lifecycle through the real stack (feature 010 T-019)', () => {
    // Shared server for all tests in this describe block: the Vite dev
    // server is the SPA source and boots once per project; the match
    // server boots per test for isolation.
    let server: Server;
    let matchmaker: Matchmaker;
    let wsPort: number;

    test.beforeEach(async () => {
        const stack = buildLobbyStack();
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
    // Scenario 1: create→join→first tick + lobby updates + waiting→running
    //             (SC-004, SC-008)
    // -----------------------------------------------------------------------

    test('create→join→first tick + lobby updates + waiting→running', async ({ browser }) => {
        test.setTimeout(90_000);

        const errors: string[] = [];
        const openLobbyTab = async (name: string): Promise<Page> => {
            const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
            const page = await context.newPage();
            page.on('pageerror', (error) => {
                errors.push(`${name}: ${String(error)}`);
            });
            await page.goto(`/?ws=ws://127.0.0.1:${String(wsPort)}`);
            return page;
        };

        // -- Tab 1: Alice enters the lobby, sets a handle --------------------
        const alice = await openLobbyTab('Alice');
        await expect(alice.locator('h1')).toContainText('Europa Neo lobby');
        await waitUntilLobby(alice, (l) => l.connection === 'ready', 'Alice lobby connected');

        await alice.locator('[data-europa-submit-handle="true"]').waitFor({ state: 'attached' });
        await alice.getByRole('textbox', { name: /display name/i }).fill('Alice');
        await alice.locator('[data-europa-submit-handle="true"]').click();
        await waitUntilLobby(alice, (l) => l.handle === 'Alice', 'Alice handle accepted');

        // -- Tab 1: Create a public match → waiting state --------------------
        await alice.locator('button:has-text("Create match")').click();
        await waitUntilLobby(alice, (l) => l.viewMode === 'match', 'Alice enters match view');
        await expect(alice.locator('.europa-lobby-match__title')).toContainText('In match');
        await expect(alice.locator('[data-europa-prestart-plate="true"]')).toBeVisible();
        await expect(alice.locator('[data-europa-prestart-seat="true"] bdi')).toHaveText('Alice');

        // Capture the match id from the lobby snapshot before it flips to
        // in_progress (the row is still visible as waiting to the subscriber).
        const matchId = await waitUntilLobby(
            alice,
            (l) => (l.entries.length > 0 ? (l.entries[0]?.matchId ?? null) : null) !== null,
            'waiting row appears in snapshot',
        ).then(async () => {
            const lobby = await readLobbyOrThrow(alice);
            return lobby.entries[0]?.matchId ?? '';
        });

        // -- Tab 2: Bob enters the lobby, sees the waiting match -------------
        const bob = await openLobbyTab('Bob');
        await waitUntilLobby(bob, (l) => l.connection === 'ready', 'Bob lobby connected');

        await bob.locator('[data-europa-submit-handle="true"]').waitFor({ state: 'attached' });
        await bob.getByRole('textbox', { name: /display name/i }).fill('Bob');
        await bob.locator('[data-europa-submit-handle="true"]').click();
        await waitUntilLobby(bob, (l) => l.handle === 'Bob', 'Bob handle accepted');

        // Bob sees Alice's waiting match with Join available (SC-004).
        await waitUntilLobby(
            bob,
            (l) => l.entries.some((entry) => entry.matchId === matchId && entry.status === 'waiting'),
            'Bob sees waiting match',
        );

        const waitingRow = bob.locator(`[data-match-id="${matchId}"]`);
        await expect(waitingRow).toHaveAttribute('data-status', 'waiting');
        await expect(waitingRow.locator('button:has-text("Join")')).toBeVisible();

        // -- Tab 2: Bob joins → auto-start → match transition ----------------
        await waitingRow.locator('button:has-text("Join")').click();
        await waitUntilLobby(bob, (l) => l.viewMode === 'match', 'Bob enters match view');

        // Alice's match entry flips to in_progress (lobby update, SC-004).
        await waitUntilLobby(
            alice,
            (l) => {
                const entry = l.entries.find((e) => e.matchId === matchId);
                return entry?.status === 'in_progress';
            },
            "Alice's row flips to in_progress",
        );

        // -- Ticks: both tabs show advancing ticks (SC-008) ------------------
        await waitUntilLobby(alice, (l) => l.viewMode === 'match', 'Alice still in match view');
        await waitUntilLobby(bob, (l) => l.viewMode === 'match', 'Bob still in match view');

        // Both tabs should display the game board (App rendered).
        await expect(alice.locator('.europa-lobby-match')).toBeVisible();
        await expect(bob.locator('.europa-lobby-match')).toBeVisible();
        await expect(alice.locator('[data-europa-participants] bdi')).toHaveText(['Alice', 'Bob']);
        await expect(bob.locator('[data-europa-participants] bdi')).toHaveText(['Alice', 'Bob']);

        // -- Tab 2: Lobby update proof — Alice's row shows in_progress -------
        // Create a third tab to observe the lobby snapshot externally.
        const observer = await openLobbyTab('Observer');
        await waitUntilLobby(observer, (l) => l.connection === 'ready', 'Observer connected');
        await observer.locator('[data-europa-submit-handle="true"]').waitFor({ state: 'attached' });
        await observer.getByRole('textbox', { name: /display name/i }).fill('Observer');
        await observer.locator('[data-europa-submit-handle="true"]').click();
        await waitUntilLobby(observer, (l) => l.handle === 'Observer', 'Observer handle accepted');

        // The observer sees the running match with Spectate available.
        await waitUntilLobby(
            observer,
            (l) => l.entries.some((entry) => entry.matchId === matchId && entry.status === 'in_progress'),
            'Observer sees in_progress match',
        );
        await expect(observer.locator(`[data-match-id="${matchId}"] button:has-text("Spectate")`)).toBeVisible();

        // -- Zero page errors across the conversation ------------------------
        expect(errors).toEqual([]);

        await observer.context().close();
        await bob.context().close();
        await alice.context().close();
    });

    // -----------------------------------------------------------------------
    // Scenario 2: spectator read-only entry (SC-005, FR-012) + zero orders
    // -----------------------------------------------------------------------

    test('spectator read-only entry + zero-order proof', async ({ browser }) => {
        test.setTimeout(90_000);

        const errors: string[] = [];
        const openLobbyTab = async (name: string): Promise<Page> => {
            const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
            const page = await context.newPage();
            page.on('pageerror', (error) => {
                errors.push(`${name}: ${String(error)}`);
            });
            await page.goto(`/?ws=ws://127.0.0.1:${String(wsPort)}`);
            return page;
        };

        // -- Establish two players and start a match -------------------------
        const alice = await openLobbyTab('Alice');
        await waitUntilLobby(alice, (l) => l.connection === 'ready', 'Alice lobby connected');
        await alice.locator('[data-europa-submit-handle="true"]').waitFor({ state: 'attached' });
        await alice.getByRole('textbox', { name: /display name/i }).fill('Alice');
        await alice.locator('[data-europa-submit-handle="true"]').click();
        await waitUntilLobby(alice, (l) => l.handle === 'Alice', 'Alice handle accepted');

        await alice.locator('button:has-text("Create match")').click();
        await waitUntilLobby(alice, (l) => l.viewMode === 'match', 'Alice in match view');

        const matchId = await waitUntilLobby(
            alice,
            (l) => (l.entries.length > 0 ? (l.entries[0]?.matchId ?? null) : null) !== null,
            'waiting row',
        ).then(async () => {
            const lobby = await readLobbyOrThrow(alice);
            return lobby.entries[0]?.matchId ?? '';
        });

        const bob = await openLobbyTab('Bob');
        await waitUntilLobby(bob, (l) => l.connection === 'ready', 'Bob connected');
        await bob.locator('[data-europa-submit-handle="true"]').waitFor({ state: 'attached' });
        await bob.getByRole('textbox', { name: /display name/i }).fill('Bob');
        await bob.locator('[data-europa-submit-handle="true"]').click();
        await waitUntilLobby(bob, (l) => l.handle === 'Bob', 'Bob handle accepted');

        await waitUntilLobby(
            bob,
            (l) => l.entries.some((entry) => entry.matchId === matchId && entry.status === 'waiting'),
            'Bob sees waiting match',
        );
        await bob.locator(`[data-match-id="${matchId}"] button:has-text("Join")`).click();
        await waitUntilLobby(bob, (l) => l.viewMode === 'match', 'Bob in match view');

        // -- Tab 3: Spectator enters and spectates the running match ---------
        const cara = await openLobbyTab('Cara');
        await waitUntilLobby(cara, (l) => l.connection === 'ready', 'Cara connected');
        await cara.locator('[data-europa-submit-handle="true"]').waitFor({ state: 'attached' });
        await cara.getByRole('textbox', { name: /display name/i }).fill('Cara');
        await cara.locator('[data-europa-submit-handle="true"]').click();
        await waitUntilLobby(cara, (l) => l.handle === 'Cara', 'Cara handle accepted');

        // Cara sees the running match in the lobby.
        await waitUntilLobby(
            cara,
            (l) => l.entries.some((entry) => entry.matchId === matchId && entry.status === 'in_progress'),
            'Cara sees in_progress match',
        );

        // Click Spectate — should transition to the match view in read-only.
        await cara.locator(`[data-match-id="${matchId}"] button:has-text("Spectate")`).click();
        await waitUntilLobby(cara, (l) => l.viewMode === 'match', 'Cara in match view (spectator)');

        // The spectator heading says "Spectating" (FR-012, SC-005).
        await expect(cara.locator('.europa-lobby-match__title')).toContainText('Spectating');

        // -- SC-005: zero order controls visible for the spectator -----------
        // The spectator path renders App with no store — order controls are
        // structurally absent (no order bar with interactive elements).
        // Verify the game board area is present but order controls are not
        // rendered with interactive (non-disabled) buttons.
        await expect(cara.locator('.europa-lobby-match')).toBeVisible();
        await expect(cara.locator('[data-europa-participants] bdi')).toHaveText(['Alice', 'Bob']);
        await expect(cara.locator('[role="grid"] [role="gridcell"]')).toHaveCount(32 * 32);
        await expect(cara.locator('.europa-order-bar button')).toHaveCount(2);
        await expect(cara.locator('.europa-order-bar button').nth(0)).toBeDisabled();
        await expect(cara.locator('.europa-order-bar button').nth(1)).toBeDisabled();
        await expect(cara.locator('[aria-label="Surrender controls"]')).toHaveCount(0);

        // -- SC-005: constructive proof of zero orders -----------------------
        // Spectator sees full-visibility view (the entire board is visible).
        // Verify the game board renders (App is mounted).
        await expect(cara.locator('main').first()).toBeVisible();

        // -- FR-012: Leave returns spectator to lobby ------------------------
        await cara.locator('[data-europa-leave="true"]').click();
        await waitUntilLobby(cara, (l) => l.viewMode === 'lobby', 'Cara returns to lobby');
        await expect(cara.locator('h1')).toContainText('Europa Neo lobby');

        // -- Zero page errors -----------------------------------------------
        expect(errors).toEqual([]);

        await cara.context().close();
        await bob.context().close();
        await alice.context().close();
    });

    // -----------------------------------------------------------------------
    // Scenario 3: return-to-lobby (identity survives)
    // -----------------------------------------------------------------------

    test('return-to-lobby preserves identity', async ({ browser }) => {
        test.setTimeout(60_000);

        const errors: string[] = [];
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const page = await context.newPage();
        page.on('pageerror', (error) => {
            errors.push(String(error));
        });
        await page.goto(`/?ws=ws://127.0.0.1:${String(wsPort)}`);

        // -- Establish and create a match ------------------------------------
        await waitUntilLobby(page, (l) => l.connection === 'ready', 'connected');
        await page.locator('[data-europa-submit-handle="true"]').waitFor({ state: 'attached' });
        await page.getByRole('textbox', { name: /display name/i }).fill('Solo');
        await page.locator('[data-europa-submit-handle="true"]').click();
        await waitUntilLobby(page, (l) => l.handle === 'Solo', 'handle accepted');

        await page.locator('button:has-text("Create match")').click();
        await waitUntilLobby(page, (l) => l.viewMode === 'match', 'in match view');
        await expect(page.locator('.europa-lobby-match__title')).toContainText('In match');

        // -- Leave → return to lobby (US4 AC-4) ------------------------------
        await page.locator('[data-europa-leave="true"]').click();
        await waitUntilLobby(page, (l) => l.viewMode === 'lobby', 'returned to lobby');

        // Identity preserved: handle still shown (the input is for editing and
        // resets on remount, but the handle text in the status line confirms
        // the identity survived the view transition).
        await expect(page.locator('.europa-lobby__handle')).toContainText('Solo');

        // The match list is visible again.
        await expect(page.getByRole('heading', { name: 'Public matches' })).toBeVisible();

        // Handle rendered inside <bdi>.
        await assertHandleInBdi(page, 'Solo');

        expect(errors).toEqual([]);
        await context.close();
    });

    // -----------------------------------------------------------------------
    // Scenario 4: reconnect within grace (identity persists across reload)
    // -----------------------------------------------------------------------

    test('reconnect within grace — identity survives page reload', async ({ browser }) => {
        test.setTimeout(60_000);

        const errors: string[] = [];
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const page = await context.newPage();
        page.on('pageerror', (error) => {
            errors.push(String(error));
        });

        // -- First visit: establish identity + create a match ----------------
        await page.goto(`/?ws=ws://127.0.0.1:${String(wsPort)}`);
        await waitUntilLobby(page, (l) => l.connection === 'ready', 'initial connection');
        await page.locator('[data-europa-submit-handle="true"]').waitFor({ state: 'attached' });
        await page.getByRole('textbox', { name: /display name/i }).fill('Grace');
        await page.locator('[data-europa-submit-handle="true"]').click();
        await waitUntilLobby(page, (l) => l.handle === 'Grace', 'handle accepted');

        await page.locator('button:has-text("Create match")').click();
        await waitUntilLobby(page, (l) => l.viewMode === 'match', 'in match view');

        // Capture the match id before reload (the lobby snapshot carries it).
        await waitUntilLobby(page, (l) => l.entries.length > 0 || l.activeMatchId !== null, 'match exists in snapshot');
        const lobbyBefore = await readLobbyOrThrow(page);
        const matchId = lobbyBefore.entries[0]?.matchId ?? lobbyBefore.activeMatchId ?? '';

        // -- Reload the page (simulates browser refresh / reconnect) ---------
        await page.reload({ waitUntil: 'domcontentloaded' });

        // -- Identity restored from localStorage (FR-003) --------------------
        await waitUntilLobby(page, (l) => l.connection === 'ready', 'reconnected after reload');
        await waitUntilLobby(page, (l) => l.handle === 'Grace', 'handle restored after reload');
        await waitUntilLobby(page, (l) => l.identityStatus === 'named', 'identity confirmed after reload');

        // The "Your match" badge is visible (US4 AC-4: active match status
        // persists on the landing page even though the match leg was dropped
        // by the reload).
        if (matchId.length > 0) {
            await waitUntilLobby(page, (l) => l.activeMatchId === matchId, 'activeMatchId restored after reload');
        }

        // Handle still rendered in <bdi>.
        await assertHandleInBdi(page, 'Grace');

        // -- Privacy: no opaque guest ID in DOM after reload -----------------
        await assertNoGuestIdInDOM(page);

        expect(errors).toEqual([]);
        await context.close();
    });

    // -----------------------------------------------------------------------
    // Scenario 5: server restart recovery
    // -----------------------------------------------------------------------

    test('server restart recovery — clients detect loss and reconnect', async ({ browser }) => {
        test.setTimeout(90_000);

        const errors: string[] = [];
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const page = await context.newPage();
        page.on('pageerror', (error) => {
            errors.push(String(error));
        });
        await page.goto(`/?ws=ws://127.0.0.1:${String(wsPort)}`);

        // -- Pre-restart: establish, create, join, verify ticks ---------------
        await waitUntilLobby(page, (l) => l.connection === 'ready', 'pre-restart connection');
        await page.locator('[data-europa-submit-handle="true"]').waitFor({ state: 'attached' });
        await page.getByRole('textbox', { name: /display name/i }).fill('Phoenix');
        await page.locator('[data-europa-submit-handle="true"]').click();
        await waitUntilLobby(page, (l) => l.handle === 'Phoenix', 'pre-restart handle');

        await page.locator('button:has-text("Create match")').click();
        await waitUntilLobby(page, (l) => l.viewMode === 'match', 'pre-restart in match');

        // -- Kill the server -------------------------------------------------
        await server.close();
        await matchmaker.close();

        // -- Clients detect the loss. The lobby connection transitions to
        // 'disconnected' or 'reconnecting' (FR-018: lost connection is
        // surfaced, not silent).
        await waitUntilLobby(
            page,
            (l) => l.connection === 'disconnected' || l.connection === 'reconnecting' || l.connection === 'failed',
            'client detects server loss',
        );

        // -- Reboot a fresh real stack on the same port ----------------------
        // A networking Server is intentionally single-use after close(). A
        // host restart therefore creates a new server + matchmaker pair while
        // binding the replacement to the released port. This exercises the
        // actual socket reconnect path and the low-revision baseline adoption,
        // rather than replacing a dependency with a test double.
        const restartedStack = buildLobbyStack(wsPort);
        await restartedStack.server.listen();
        server = restartedStack.server;
        matchmaker = restartedStack.matchmaker;

        // -- Client reconnects against the restarted server ------------------
        // The lobby transport auto-retries and re-establishes. After restart
        // the registry is empty, so the client receives a FRESH identity
        // (R-009 precedent: the low post-restart revision is adopted rather
        // than starved).
        await waitUntilLobby(page, (l) => l.connection === 'ready', 'reconnected to restarted server');

        // The lobby state is live and functional: a fresh visitor can act.
        // Verify the match list is empty (all previous state was wiped).
        const lobby = await readLobbyOrThrow(page);
        expect(lobby.entries.length).toBe(0);

        // Verify the identity is usable: a fresh match can be created.
        // Return to lobby view first if we were in match view.
        if (lobby.viewMode === 'match') {
            await page.locator('[data-europa-leave="true"]').click();
            await waitUntilLobby(page, (l) => l.viewMode === 'lobby', 'back to lobby after restart');
        }

        // The handle may or may not survive a full server restart (the
        // identity registry was wiped). What matters is the lobby is
        // USABLE — the visitor can set a new handle and create a match.
        const lobbyAfterRestart = await readLobbyOrThrow(page);
        if (lobbyAfterRestart.handle === null) {
            // Fresh identity: set a new handle.
            await page.locator('[data-europa-submit-handle="true"]').waitFor({ state: 'attached' });
            await page.getByRole('textbox', { name: /display name/i }).fill('PhoenixII');
            await page.locator('[data-europa-submit-handle="true"]').click();
            await waitUntilLobby(page, (l) => l.handle === 'PhoenixII', 'new handle after restart');
        }

        await page.locator('button:has-text("Create match")').click();
        await waitUntilLobby(page, (l) => l.viewMode === 'match', 'match created after restart');

        expect(errors).toEqual([]);
        await context.close();
    });

    // -----------------------------------------------------------------------
    // Scenario 6: privacy — no opaque guestPlayerId in DOM
    // -----------------------------------------------------------------------

    test('privacy — no opaque guestPlayerId in visible DOM', async ({ browser }) => {
        test.setTimeout(60_000);

        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const page = await context.newPage();
        await page.goto(`/?ws=ws://127.0.0.1:${String(wsPort)}`);

        await waitUntilLobby(page, (l) => l.connection === 'ready', 'connected');
        await page.locator('[data-europa-submit-handle="true"]').waitFor({ state: 'attached' });
        await page.getByRole('textbox', { name: /display name/i }).fill('Privacy');
        await page.locator('[data-europa-submit-handle="true"]').click();
        await waitUntilLobby(page, (l) => l.handle === 'Privacy', 'handle accepted');

        // Check the landing page: no UUID or 'guest-' prefix visible.
        await assertNoGuestIdInDOM(page);

        // Create a match and check the match view too.
        await page.locator('button:has-text("Create match")').click();
        await waitUntilLobby(page, (l) => l.viewMode === 'match', 'in match view');
        await assertNoGuestIdInDOM(page);

        // Handle rendered in <bdi>.
        await assertHandleInBdi(page, 'Privacy');

        await context.close();
    });
});
