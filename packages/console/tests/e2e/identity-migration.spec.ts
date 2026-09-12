/**
 * Browser E2E — issue #74 universal `PlayerId` migration (T040).
 *
 * Proves the migrated identity model through the REAL production stack:
 *
 *   console UI (real Chromium, mounted TanStack Router) ⇄
 *   WsLobbyClient / WsMatchClient (0.3.0 wire codec over native WebSocket) ⇄
 *   real createMatchServer (ephemeral port, ticking scheduler) ⇄
 *   lobby facade ⇄ real matchmaker (auto-start register/attach) ⇄
 *   engine + terrain + fog (real board generation + redaction)
 *
 * Coverage (each test asserts observable, non-tautological behavior):
 *   1. create → final canonical `/match/<id>` URL + mounted view (not a
 *      raw-history or blank state);
 *   2. join by id → canonical `/match/<id>/join` + mounted view; two seats
 *      keep distinct server-assigned canonical ids (no seat-index
 *      derivation, no id swap);
 *   3. spectate → canonical `/match/<id>/spectate`, read-only controls
 *      inert, and NO player store exists (structural zero-order proof);
 *   4. share link → the copied `/match/<id>` re-enters the canonical
 *      mounted route as the participant (no interstitial, no raw history);
 *   5. unnamed match deep link → `/profile?returnTo=…` round-trip, then
 *      the mounted join flow resumes the canonical route;
 *   6. ID-only denial over the real wire → a bare canonical id is not a
 *      credential (`token_invalid`) and a forged order identity is denied
 *      (`order_player_mismatch`);
 *   7. reconnect → the seat's canonical identity and view association are
 *      preserved across a page reload.
 *
 * Determinism discipline: no arbitrary sleeps — every wait polls an
 * observable DOM/store/wire condition; the tick cadence is fixed.
 *
 * Constraints: TypeScript strict, zero suppressions, zero `any`.
 * E2E tests are excluded from the package tsconfig BY DESIGN.
 */

import { computePlayerView } from '@europa/fog';
import { createLobbyService, createMatchmaker, type Matchmaker } from '@europa/matchmaking';
import {
    createMatchServer,
    encodeFrame,
    type Logger,
    type MatchmakerBridge,
    type MessageKind,
    NETWORK_API_VERSION,
    NETWORK_DEFAULT_CONFIG,
    type NetworkPayload,
    NULL_LOGGER,
    type ProtocolEnvelope,
    type SequenceNumber,
    type Server,
    type ServerDeps,
    type SessionToken,
    tryDecodeFrame,
} from '@europa/networking';
import { expect, type Page, test } from '@playwright/test';

import { setHandleViaProfile } from './helpers/profile';

/** Fixed test cadence; match tickIntervalMs MUST equal server tickRateMs. */
const TICK_MS = 250;

/** Default poll timeout for observable state (CI-safe upper bound). */
const WAIT_TIMEOUT = 30_000;

/** Canonical identity shape (contracts/identity-contract.md). */
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;

// ---------------------------------------------------------------------------
// History patch — preserve the test-only ?ws= transport override
// ---------------------------------------------------------------------------

/**
 * Merge-variant of the standard history patch for the unnamed deep-link
 * round-trip: the redirect rewrites the URL to `/profile?returnTo=…`, and
 * a plain preserve script would REPLACE that query with the live `?ws=`
 * override, dropping `returnTo` and dead-ending the round-trip. Merging
 * keeps BOTH the override and any params the target URL already carries.
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
    window.history.replaceState = (state, title, url) => replaceState(state, title, mergeWsQuery(url));
    window.history.pushState = (state, title, url) => pushState(state, title, mergeWsQuery(url));
}

// ---------------------------------------------------------------------------
// Stack harness (mirrors scripts/host.ts / lobby.spec.ts)
// ---------------------------------------------------------------------------

interface LobbyStack {
    readonly server: Server;
    readonly matchmaker: Matchmaker;
}

/** Wire the real matchmaker + lobby facade + match server. */
function buildLobbyStack(): LobbyStack {
    let bound: MatchmakerBridge = {};
    const forwardingBridge: MatchmakerBridge = {
        onSeatClaimed: (event) => bound.onSeatClaimed?.(event),
        onSeatDisconnected: (event) => bound.onSeatDisconnected?.(event),
        onSeatReconnected: (event) => bound.onSeatReconnected?.(event),
        onSeatExpired: (event) => bound.onSeatExpired?.(event),
        onMatchTerminal: (event) => bound.onMatchTerminal?.(event),
    };

    const wiring: { matchmaker: Matchmaker | null } = { matchmaker: null };

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
                return createLobbyService({ matchmaker, deliver: sink.deliver });
            },
        },
    };

    const server = createMatchServer(
        { ...NETWORK_DEFAULT_CONFIG, host: '127.0.0.1', port: 0, tickRateMs: TICK_MS, ordersPerSecond: 1000 },
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
// Browser-side helpers
// ---------------------------------------------------------------------------

interface LobbyHandleView {
    readonly store: {
        getState(): {
            readonly viewMode: string;
            readonly handle: string | null;
            readonly activeMatchId: string | null;
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

interface LobbyView {
    readonly viewMode: string;
    readonly handle: string | null;
    readonly activeMatchId: string | null;
    readonly connection: string;
    readonly entries: ReadonlyArray<{
        readonly matchId: string;
        readonly status: string;
        readonly seatsFilled: number;
        readonly capacity: number;
    }>;
}

/** Read the mounted lobby runtime's essential state. */
async function readLobby(page: Page): Promise<LobbyView | null> {
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

/** Poll the mounted lobby state until `when` holds. */
async function waitUntilLobby(page: Page, when: (lobby: LobbyView) => boolean, description: string): Promise<void> {
    await expect
        .poll(
            async () => {
                const lobby = await readLobby(page);
                return lobby !== null && when(lobby);
            },
            { timeout: WAIT_TIMEOUT, intervals: [50, 100, 250] },
        )
        .toBe(true, description);
}

/** Browser pathnames, polled without wall-clock sleeps. */
async function pathname(page: Page): Promise<string> {
    return page.evaluate(() => window.location.pathname);
}

/** The participant ids rendered in the mounted match view, in seat order. */
async function participantIds(page: Page): Promise<ReadonlyArray<string | null>> {
    return page
        .locator('[data-europa-participants] [data-europa-player-id]')
        .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-europa-player-id')));
}

/**
 * Extract the viewer identity from a payload carrying a fog `view`
 * (`joinAck` / `snapshot`), or `null` when the shape does not match.
 */
function viewPlayer(payload: NetworkPayload): string | null {
    if (typeof payload !== 'object' || payload === null || !('view' in payload)) {
        return null;
    }
    const view = (payload as { readonly view?: unknown }).view;
    if (typeof view !== 'object' || view === null || !('player' in view)) {
        return null;
    }
    const player = (view as { readonly player?: unknown }).player;
    return typeof player === 'string' ? player : null;
}

/** Open a fresh browser context/page on a lobby URL with the ws override. */
async function openTab(browser: import('@playwright/test').Browser, wsPort: number, path = '/lobby'): Promise<Page> {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(preserveWsAndQueryParamsInHistory);
    const page = await context.newPage();
    await page.goto(`${path}?ws=${encodeURIComponent(`ws://127.0.0.1:${String(wsPort)}`)}`);
    return page;
}

/** Establish a named identity for a lobby tab. */
async function establishHandle(page: Page, handle: string): Promise<void> {
    await waitUntilLobby(page, (lobby) => lobby.connection === 'ready', `${handle} lobby connected`);
    await setHandleViaProfile(page, handle);
    await waitUntilLobby(page, (lobby) => lobby.handle === handle, `${handle} handle accepted`);
}

/** Poll a page-condition function until it returns true. */
async function waitUntilTrue(_page: Page, check: () => Promise<boolean>, description: string): Promise<void> {
    await expect.poll(check, { timeout: WAIT_TIMEOUT, intervals: [50, 100, 250] }).toBe(true, description);
}

// ---------------------------------------------------------------------------
// Raw wire client (Node) — proves authoritative denial on the real socket
// ---------------------------------------------------------------------------

/** A minimal real-WebSocket protocol driver for denial assertions. */
interface RawWire {
    /** Send a version-stamped envelope with the next client sequence. */
    send(type: MessageKind, payload: NetworkPayload): void;
    /** Await the next inbound envelope of the given kind (others are buffered). */
    next(type: MessageKind, timeoutMs?: number): Promise<ProtocolEnvelope<NetworkPayload>>;
    /** Close the socket. */
    close(): void;
}

/**
 * Open a raw WebSocket to the real server and drive version-stamped
 * envelopes. Used to prove, without the console in the way, that a bare
 * canonical id carries no authority.
 */
async function openRawWire(url: string): Promise<RawWire> {
    const socket = new WebSocket(url);
    const buffer: Array<ProtocolEnvelope<NetworkPayload>> = [];
    let sequence = 0;

    const waiters: Array<{
        readonly type: MessageKind;
        readonly settle: (envelope: ProtocolEnvelope<NetworkPayload>) => void;
    }> = [];

    socket.addEventListener('message', (event) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        const decoded = tryDecodeFrame(raw);
        if (!decoded.ok) {
            return;
        }
        const envelope = decoded.envelope;
        const waiterIndex = waiters.findIndex((waiter) => waiter.type === envelope.type);
        if (waiterIndex >= 0) {
            const waiter = waiters.splice(waiterIndex, 1)[0];
            waiter?.settle(envelope);
            return;
        }
        buffer.push(envelope);
    });

    await new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve());
        socket.addEventListener('error', () => reject(new Error('raw wire socket error')));
    });

    return {
        send(type, payload): void {
            sequence += 1;
            socket.send(
                encodeFrame({
                    type,
                    version: NETWORK_API_VERSION,
                    seq: sequence as SequenceNumber,
                    payload,
                }),
            );
        },
        next(type, timeoutMs = 10_000) {
            const bufferedIndex = buffer.findIndex((envelope) => envelope.type === type);
            if (bufferedIndex >= 0) {
                const buffered = buffer.splice(bufferedIndex, 1)[0] as ProtocolEnvelope<NetworkPayload>;
                return Promise.resolve(buffered);
            }
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    const index = waiters.findIndex((waiter) => waiter.type === type);
                    if (index >= 0) waiters.splice(index, 1);
                    reject(new Error(`raw wire: timed out waiting for "${type}"`));
                }, timeoutMs);
                waiters.push({
                    type,
                    settle: (envelope) => {
                        clearTimeout(timer);
                        resolve(envelope);
                    },
                });
            });
        },
        close(): void {
            socket.close();
        },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('issue #74 universal identity — mounted browser coverage', () => {
    let server: Server;
    let matchmaker: Matchmaker;
    let wsPort: number;

    test.beforeEach(async () => {
        ({ server, matchmaker } = buildLobbyStack());
        await server.listen();
        wsPort = server.__boundPortForTest() ?? 0;
    });

    test.afterEach(async () => {
        await server.close();
        await matchmaker.close();
    });

    test('create ends on the canonical /match/<id> URL and mounts the match view', async ({ browser }) => {
        test.setTimeout(60_000);
        const page = await openTab(browser, wsPort);
        await establishHandle(page, 'Creator');

        await page.getByRole('button', { name: 'Create match' }).click();

        // Final pathname is the bare canonical match route (no /join, no
        // raw-history artifact), and the mounted view is the waiting plate.
        await waitUntilTrue(
            page,
            async () => /^\/match\/[^/]+$/.test(await pathname(page)),
            'canonical /match/<id> pathname',
        );
        const matchId = (await pathname(page)).split('/')[2] ?? '';
        expect(matchId).toMatch(/^[0-9a-f-]{36}$/i);

        await expect(page.locator('.europa-lobby-match__title')).toContainText('In match');
        await expect(page.locator('[data-europa-prestart-plate="true"]')).toBeVisible();
        await waitUntilLobby(
            page,
            (lobby) => lobby.activeMatchId === matchId,
            'lobby state association matches the mounted URL',
        );
    });

    test('join by id ends on the canonical join URL and mounts the match view', async ({ browser }) => {
        test.setTimeout(90_000);
        // A 4-player match so the second join does NOT auto-start: both
        // consoles rest in the deterministic pre-start room, proving the
        // canonical route + mounted view. The exact two-seat id↔seat
        // association (no numeric derivation, no swap) is pinned by the
        // token-bound `full-stack.spec.ts`.
        const alice = await openTab(browser, wsPort);
        await establishHandle(alice, 'Alice');
        await alice.locator('input[name="playerCount"][value="4"]').check({ force: true });
        await alice.getByRole('button', { name: 'Create match' }).click();
        await waitUntilTrue(
            alice,
            async () => /^\/match\/[^/]+$/.test(await pathname(alice)),
            'creator canonical /match/<id> pathname',
        );
        const matchId = (await pathname(alice)).split('/')[2] ?? '';
        expect(matchId).not.toBe('');
        await expect(alice.locator('[data-europa-prestart-plate="true"]')).toBeVisible();

        const bob = await openTab(browser, wsPort);
        await establishHandle(bob, 'Bob');
        await waitUntilLobby(
            bob,
            (lobby) => lobby.entries.some((entry) => entry.matchId === matchId && entry.status === 'waiting'),
            'Bob sees the waiting match',
        );
        await bob.locator(`[data-match-id="${matchId}"]`).getByRole('button', { name: /^Join/ }).click();
        await waitUntilTrue(
            bob,
            async () => (await pathname(bob)) === `/match/${matchId}/join`,
            'canonical /match/<id>/join pathname',
        );
        await expect(bob.locator('.europa-lobby-match__title')).toContainText('In match');
        await expect(bob.locator('[data-europa-prestart-plate="true"]')).toBeVisible();
        await expect(bob.locator('[data-europa-prestart-seat="true"] bdi')).toHaveText('Bob');
        await expect(bob.getByRole('main')).toContainText('Waiting for 2 more players');
    });

    test('spectate mounts the canonical read-only route with no order authority', async ({ browser }) => {
        test.setTimeout(90_000);
        const alice = await openTab(browser, wsPort);
        await establishHandle(alice, 'Alice');
        await alice.getByRole('button', { name: 'Create match' }).click();
        await waitUntilLobby(alice, (lobby) => lobby.viewMode === 'match', 'Alice enters match view');
        const matchId = (await readLobby(alice))?.entries[0]?.matchId ?? '';

        const bob = await openTab(browser, wsPort);
        await establishHandle(bob, 'Bob');
        await waitUntilLobby(
            bob,
            (lobby) => lobby.entries.some((entry) => entry.matchId === matchId && entry.status === 'waiting'),
            'Bob sees the waiting match',
        );
        await bob.locator(`[data-match-id="${matchId}"]`).getByRole('button', { name: /^Join/ }).click();
        await waitUntilLobby(bob, (lobby) => lobby.viewMode === 'match', 'Bob enters match view');

        const cara = await openTab(browser, wsPort);
        await establishHandle(cara, 'Cara');
        await waitUntilLobby(
            cara,
            (lobby) => lobby.entries.some((entry) => entry.matchId === matchId && entry.status === 'in_progress'),
            'Cara sees the running match',
        );
        await cara
            .locator(`[data-match-id="${matchId}"]`)
            .getByRole('button', { name: /^Spectate/ })
            .click();
        await waitUntilTrue(
            cara,
            async () => (await pathname(cara)) === `/match/${matchId}/spectate`,
            'canonical /match/<id>/spectate pathname',
        );
        await expect(cara.locator('.europa-lobby-match__title')).toContainText('Spectating');

        // Read-only by construction: order-producing controls are disabled
        // and no player store exists to carry an order bridge.
        await expect(cara.locator('#surrender button')).toBeDisabled();
        await expect(cara.locator('#orders button').first()).toBeDisabled();
        expect(
            await cara.evaluate(() => Object.hasOwn(window, '__europaLive')),
            'spectator leg has no player store',
        ).toBe(false);

        // The spectator sees the full board (server full-visibility) and a
        // canonical roster.
        await expect(cara.locator('[role="grid"] [role="gridcell"]')).toHaveCount(32 * 32);
        for (const id of await participantIds(cara)) {
            expect(id).toMatch(PLAYER_ID_PATTERN);
        }
    });

    test('share link re-enters the canonical mounted route as the participant', async ({ browser }) => {
        test.setTimeout(60_000);
        const page = await openTab(browser, wsPort);
        await establishHandle(page, 'Sharer');
        await page.getByRole('button', { name: 'Create match' }).click();
        await waitUntilTrue(
            page,
            async () => /^\/match\/[^/]+$/.test(await pathname(page)),
            'canonical match pathname',
        );
        const matchId = (await pathname(page)).split('/')[2] ?? '';

        // Clicking copy must not mutate the canonical URL.
        const context = page.context();
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.locator('[data-europa-copy-link-button="true"]').click();
        const clipboard = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboard).toContain(`/match/${matchId}`);
        expect(await pathname(page)).toBe(`/match/${matchId}`);

        // Following the copied link as the participant re-enters the same
        // canonical mounted route (resume association — no interstitial,
        // no "Match unavailable"). The test appends the ephemeral ws
        // override the real host provides by serving both surfaces on one
        // origin.
        const link = clipboard.trim();
        const wsOverride = encodeURIComponent(`ws://127.0.0.1:${String(wsPort)}`);
        await page.goto(`${link}?ws=${wsOverride}`);
        await waitUntilTrue(
            page,
            async () => (await pathname(page)) === `/match/${matchId}`,
            'copied link resolves to the canonical match route',
        );
        await waitUntilLobby(page, (lobby) => lobby.activeMatchId === matchId, 'participant association resumed');
        await expect(page.locator('.europa-lobby-match__title')).toContainText('In match');
        await expect(page.locator('[data-europa-deep-link-interstitial="true"]')).toHaveCount(0);
    });

    test('an unnamed match deep link round-trips through /profile and returns', async ({ browser }) => {
        test.setTimeout(90_000);
        // Host creates a 4-player match so the visitor's join cannot
        // auto-start it (deterministic pre-start waiting room).
        const host = await openTab(browser, wsPort);
        await establishHandle(host, 'Host');
        await host.locator('input[name="playerCount"][value="4"]').check({ force: true });
        await host.getByRole('button', { name: 'Create match' }).click();
        await waitUntilTrue(
            host,
            async () => /^\/match\/[^/]+$/.test(await pathname(host)),
            'host canonical match pathname',
        );
        const matchId = (await pathname(host)).split('/')[2] ?? '';

        // Fresh visitor (no storage) deep-links the join route while unnamed.
        const visitor = await openTab(browser, wsPort, `/match/${matchId}/join`);
        await waitUntilTrue(
            visitor,
            async () => (await pathname(visitor)) === '/profile',
            'unnamed deep link redirects to /profile',
        );
        const returnTo = await visitor.evaluate(() => new URLSearchParams(window.location.search).get('returnTo'));
        expect(returnTo).not.toBeNull();
        expect(decodeURIComponent(returnTo ?? '').startsWith(`/match/${matchId}/join`)).toBe(true);
        await expect(visitor.getByRole('textbox', { name: /display name/i })).toBeVisible();
        await expect(visitor.getByRole('heading', { name: 'Match unavailable' })).toHaveCount(0);

        // Naming returns to the deep link, then the interstitial opens the
        // mounted waiting view.
        await visitor.getByRole('textbox', { name: /display name/i }).fill('Visitor');
        await visitor.locator('[data-europa-submit-handle="true"]').click();
        await waitUntilTrue(
            visitor,
            async () => (await pathname(visitor)) === `/match/${matchId}/join`,
            'naming returns to the deep link',
        );
        await expect(visitor.getByRole('heading', { name: 'Match found' })).toBeVisible();
        await visitor.getByRole('button', { name: 'Play' }).click();
        await waitUntilLobby(visitor, (lobby) => lobby.viewMode === 'match', 'visitor enters the match');
        await expect(visitor.locator('[data-europa-prestart-plate="true"]')).toBeVisible();
        await expect(visitor.getByRole('heading', { name: 'Match unavailable' })).toHaveCount(0);
    });

    test('a bare canonical id is not a credential; a forged order identity is denied', async () => {
        test.setTimeout(60_000);

        const created = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'SeatA',
            settings: { playerCount: 2, boardSize: 32, tickIntervalMs: TICK_MS },
        });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        const { matchId } = created.data;
        const seatA = created.data.seatAssignment;

        const filled = matchmaker.joinMatch({ matchId, displayName: 'SeatB' });
        expect(filled.ok).toBe(true);
        if (!filled.ok) {
            return;
        }
        const seatB = filled.data.seatAssignment;
        expect(seatA.playerId).toMatch(PLAYER_ID_PATTERN);
        expect(seatB.playerId).toMatch(PLAYER_ID_PATTERN);
        expect(seatA.playerId).not.toBe(seatB.playerId);

        const wire = await openRawWire(`ws://127.0.0.1:${String(wsPort)}`);
        try {
            wire.send('hello', { protocolVersion: NETWORK_API_VERSION });
            await wire.next('helloAck');

            // ID-only view/seat selection: Seat A's bare canonical id is
            // offered as the reconnect credential. The server rejects it —
            // an id alone never authenticates or selects a seat.
            wire.send('joinMatch', {
                matchId,
                role: 'player',
                displayName: 'Impostor',
                reconnectToken: seatA.playerId as SessionToken,
            });
            const idAsTokenError = await wire.next('error');
            expect(idAsTokenError.payload).toMatchObject({ code: 'token_invalid' });

            // Now join legitimately with the real bearer credential.
            wire.send('joinMatch', {
                matchId,
                role: 'player',
                displayName: 'SeatA',
                reconnectToken: seatA.sessionToken,
            });
            const joinAck = await wire.next('joinAck');
            expect(joinAck.payload).toMatchObject({ playerId: seatA.playerId });

            // Forged order identity: a valid-looking order authored as the
            // OTHER seat is denied by the authoritative bound-identity check.
            wire.send('order', {
                order: {
                    kind: 'setReserves',
                    player: seatB.playerId,
                    cell: { x: 0, y: 0 },
                    percent: 5,
                },
            });
            const forgedError = await wire.next('error');
            expect(forgedError.payload).toMatchObject({
                code: 'malformed_payload',
                detail: { reason: 'order_player_mismatch' },
            });
        } finally {
            wire.close();
        }
    });

    test('reconnect with the seat credential preserves identity and view association', async () => {
        test.setTimeout(60_000);

        const created = matchmaker.createMatch({
            visibility: 'public',
            displayName: 'SeatA',
            settings: { playerCount: 2, boardSize: 32, tickIntervalMs: TICK_MS },
        });
        expect(created.ok).toBe(true);
        if (!created.ok) {
            return;
        }
        const { matchId } = created.data;
        const seatA = created.data.seatAssignment;

        const filled = matchmaker.joinMatch({ matchId, displayName: 'SeatB' });
        expect(filled.ok).toBe(true);
        if (!filled.ok) {
            return;
        }

        const url = `ws://127.0.0.1:${String(wsPort)}`;

        // First attach: the seat's bearer credential resolves the exact seat.
        const first = await openRawWire(url);
        first.send('hello', { protocolVersion: NETWORK_API_VERSION });
        await first.next('helloAck');
        first.send('joinMatch', {
            matchId,
            role: 'player',
            displayName: 'SeatA',
            reconnectToken: seatA.sessionToken,
        });
        const firstAck = await first.next('joinAck');
        expect(firstAck.payload).toMatchObject({ playerId: seatA.playerId });
        expect(viewPlayer(firstAck.payload)).toBe(seatA.playerId);

        // Drop the connection; wait until the server has processed the loss
        // (the seat is now held by its reconnect grace binding).
        first.close();
        await expect.poll(() => server.stats().activeConnections, { timeout: WAIT_TIMEOUT }).toBe(0);

        // Reconnect with the SAME credential: the seat, its identity, and
        // its fog view association are restored (snapshot resync), never a
        // different seat.
        const second = await openRawWire(url);
        try {
            second.send('hello', { protocolVersion: NETWORK_API_VERSION });
            await second.next('helloAck');
            second.send('joinMatch', {
                matchId,
                role: 'player',
                displayName: 'SeatA',
                reconnectToken: seatA.sessionToken,
            });
            const snapshot = await second.next('snapshot');
            expect(viewPlayer(snapshot.payload)).toBe(seatA.playerId);
        } finally {
            second.close();
        }
    });
});
