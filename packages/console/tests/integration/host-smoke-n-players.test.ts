/**
 * N-player host smoke — feature 012 (T020).
 *
 * Boots the REAL production host stack on an ephemeral single port
 * (011 FR-009: one http.Server for HTTP + WS) and proves, end to end,
 * that the launcher's N-player path actually serves players:
 *
 *   - `GET /version` answers on the SAME port as the WebSocket surface
 *     and returns `APP_VERSION` (feature 009 FR-006);
 *   - a same-origin WebSocket upgrade succeeds (hello → helloAck);
 *   - the REAL exported `prepareMatch` (012 T018) creates + fills an
 *     N-seat public match and yields one session token per seat;
 *   - N Node wire clients join through the exact token-bearing join URLs
 *     the launcher prints (semantic `/match/<id>` links), receive
 *     tick broadcasts, and get authoritative order acks;
 *   - a SIGINT-driven shutdown is idempotent (the second signal is a no-op).
 *
 * The wiring recipe mirrors `scripts/host.ts`'s `buildStack` exactly
 * (the production `buildStack` is launcher-internal and not exported), but
 * the match lifecycle is driven by the REAL `prepareMatch` — the code
 * under test for T018. Board sizes 32 / 48 are each exercised so the
 * matrix covers every allowed value (64 is temporarily disabled — terrain
 * issue #26 — and is asserted rejected by a dedicated check below).
 *
 * Determinism discipline: no arbitrary sleeps — every wait is a bounded
 * `pollUntil` against observable client/server state (mirrors
 * lobby-transport.test.ts).
 */

import { createServer as createHttpServer, type Server as HttpServer, get as httpGet } from 'node:http';

import { computePlayerView } from '@europa/fog';
import { createLobbyService, createMatchmaker, type Matchmaker, type ReservesPct } from '@europa/matchmaking';
import {
    createMatchServer,
    type Logger,
    type MatchmakerBridge,
    NETWORK_API_VERSION,
    NETWORK_DEFAULT_CONFIG,
    NULL_LOGGER,
    type Server,
    type ServerDeps,
} from '@europa/networking';
import { APP_VERSION } from '@europa/version';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { prepareMatch, resolveConfig } from '../../scripts/host';
import { handleVersionRoute } from '../../scripts/version-route';
import { createWsMatchClient, type WsMatchClient } from '../../src/net/ws-match-client';
import type { CommandResult, Coord, MatchId, Order, PlayerId, PlayerView, SessionToken } from '../../src/state/types';

// ----------------------------------------------------------------------------
// Tunables (single location — constitution Principle V / AGENTS.md rule 3)
// ----------------------------------------------------------------------------

/**
 * Tick cadence. MUST equal `prepareMatch`'s `TICK_MS` (host.ts): the
 * matchmaker creates the match with `tickIntervalMs: TICK_MS` and the
 * server's `tickRateMs` must match or `registerMatch` rejects it.
 */
const TICK_MS = 250;

/** Advertised heartbeat; clients ping at max(1000, half) = 1000 ms. */
const HEARTBEAT_MS = 2000;

/** Idle window comfortably above the 1 s ping floor (no mid-test reaps). */
const IDLE_TIMEOUT_MS = 5000;

/** Default poll horizon for observable state (CI-safe upper bound). */
const WAIT_TIMEOUT_MS = 10_000;

/** Poll interval for observable-state waits. */
const POLL_INTERVAL_MS = 25;

// ----------------------------------------------------------------------------
// Small async helpers
// ----------------------------------------------------------------------------

/** Real-timer delay (integration suites run on the platform clock). */
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Poll until `read` returns a non-null/undefined value, then return it.
 * The deterministic-wait primitive: every wait targets an observable fact
 * with a bounded horizon and a descriptive failure.
 */
async function pollUntil<T>(
    read: () => T | null | undefined,
    description: string,
    timeoutMs = WAIT_TIMEOUT_MS,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = read();
        if (value !== null && value !== undefined) {
            return value;
        }
        if (Date.now() > deadline) {
            throw new Error(`timed out after ${String(timeoutMs)}ms waiting for ${description}`);
        }
        await delay(POLL_INTERVAL_MS);
    }
}

/** Poll until the boolean probe holds (convenience wrapper). */
async function pollUntilTrue(probe: () => boolean, description: string, timeoutMs = WAIT_TIMEOUT_MS): Promise<void> {
    await pollUntil(() => (probe() ? true : null), description, timeoutMs);
}

// ----------------------------------------------------------------------------
// Stack harness (real server ⇄ real facade ⇄ real matchmaker)
// ----------------------------------------------------------------------------

/** The lazy lobby facade type produced by `createLobbyService`. */
type LobbyFacade = ReturnType<typeof createLobbyService>;

/** A booted production stack on an ephemeral (or pinned) port — single-port (011): one http.Server for HTTP + WS. */
interface BootedStack {
    readonly httpServer: HttpServer;
    readonly server: Server;
    readonly matchmaker: Matchmaker;
    readonly lobbyFacade: () => LobbyFacade | null;
}

/**
 * Mirror of the production `buildStack` recipe in `scripts/host.ts`
 * (012 T018): the same matchmaker ⇄ match-server ⇄ lazy-lobby-facade
 * wiring the launcher uses, booted on a CALLER-OWNED http.Server so the
 * test controls the port and lifecycle. The production `buildStack` is
 * not exported (launcher-internal), so this harness reproduces its exact
 * wiring — the REAL exported `prepareMatch` (the code under test) drives
 * match creation/fill against it.
 *
 * @param httpServer The single externally owned http.Server (HTTP + WS).
 * @returns The bound server + matchmaker and a lobby-facade accessor.
 */
function buildStack(httpServer: HttpServer): BootedStack {
    let bound: MatchmakerBridge = {};
    const forwardingBridge: MatchmakerBridge = {
        onSeatClaimed: (event) => bound.onSeatClaimed?.(event),
        onSeatDisconnected: (event) => bound.onSeatDisconnected?.(event),
        onSeatReconnected: (event) => bound.onSeatReconnected?.(event),
        onSeatExpired: (event) => bound.onSeatExpired?.(event),
        onMatchTerminal: (event) => bound.onMatchTerminal?.(event),
    };
    const wiring: { matchmaker: Matchmaker | null; lobby: LobbyFacade | null } = { matchmaker: null, lobby: null };

    // Single-port seam (011 FR-002): host owns the http.Server.
    const deps: ServerDeps = {
        engine: {
            // Real sessions arrive pre-built from matchmaking auto-start.
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
            heartbeatIntervalMs: HEARTBEAT_MS,
            wsIdleTimeoutMs: IDLE_TIMEOUT_MS,
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
    return { httpServer, server, matchmaker, lobbyFacade: () => wiring.lobby };
}

/**
 * Listen the externally owned http.Server on an ephemeral port, start the
 * match server, and return the single bound port (proving the
 * single-port invariant: HTTP and WS share one listener).
 *
 * @param stack The booted stack.
 * @returns The bound port (same for HTTP and WS).
 */
async function listen(stack: BootedStack): Promise<number> {
    await new Promise<void>((resolve, reject) => {
        stack.httpServer.once('error', reject);
        stack.httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    await stack.server.listen();
    const port = stack.server.__boundPortForTest();
    if (port === undefined) {
        throw new Error('server did not report a bound port');
    }
    // Single-port proof: same http.Server answers both HTTP + WS.
    const httpPort = (stack.httpServer.address() as { port: number } | null)?.port;
    if (httpPort !== undefined && httpPort !== port) {
        throw new Error(`single-port invariant violated: http ${String(httpPort)} !== ws ${String(port)}`);
    }
    return port;
}

/** Parsed `GET /version` response. */
interface VersionResponse {
    readonly status: number;
    readonly appVersion: string;
    readonly protocolVersion: string;
}

/**
 * Perform a real `GET /version` against the running stack and return the
 * parsed body. Proves the static surface answers on the SAME port as WS.
 *
 * @param port The bound single port.
 * @returns Status + decoded version fields.
 */
function getVersion(port: number): Promise<VersionResponse> {
    return new Promise<VersionResponse>((resolve, reject) => {
        const req = httpGet(`http://127.0.0.1:${String(port)}/version`, (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => {
                data += chunk.toString();
            });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data) as { appVersion: string; protocolVersion: string };
                    resolve({
                        status: res.statusCode ?? 0,
                        appVersion: json.appVersion,
                        protocolVersion: json.protocolVersion,
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });
        req.on('error', reject);
    });
}

/** A connected match client plus the fog views it has received so far. */
interface SeatLeg {
    readonly client: WsMatchClient;
    readonly views: PlayerView[];
    readonly playerId: PlayerId;
}

/**
 * Connect a REAL match client and complete a token-bearing join through
 * the exact join URL the launcher prints. The seat's session token is
 * presented as `reconnectToken` (the URL's `?token=`); for a seat that
 * has never connected this resolves via the server's seat-scan path and
 * claims that specific seat — the same "refresh reclaims own seat"
 * behavior the URL exists for.
 *
 * @param wsUrl      Same-origin WebSocket URL (`ws://127.0.0.1:<port>`).
 * @param matchId   Match id from the prepared match.
 * @param token     The seat's session token (URL `?token=`).
 * @param displayName Cosmetic seat handle (URL `?name=`).
 * @returns The joined leg with its recorded views.
 */
async function joinSeat(wsUrl: string, matchId: MatchId, token: string, displayName: string): Promise<SeatLeg> {
    const views: PlayerView[] = [];
    const client = createWsMatchClient({});
    client.onMessage((envelope) => {
        if (envelope.type === 'joinAck' || envelope.type === 'tick') {
            // Documented cast: both payloads carry a fog view.
            views.push((envelope.payload as { view: PlayerView }).view);
        }
    });
    trackCloser(() => {
        client.disconnect();
    });
    await client.connect(wsUrl);
    await client.joinMatch({ matchId, role: 'player', displayName, reconnectToken: token as SessionToken });
    expect(client.state().connection).toBe('joined');
    const playerId = client.state().playerId;
    if (playerId === null) {
        throw new Error('seat joined but playerId is null');
    }
    return { client, views, playerId };
}

/** Find the given seat's own city in a fog view (always visible to it). */
function ownCity(view: PlayerView, player: PlayerId): Coord {
    const cell = view.visibleCells.find((candidate) => candidate.cityOwner === player);
    if (cell === undefined) {
        throw new Error(`seat ${String(player)} cannot see its own city in its fog view`);
    }
    return cell.coord;
}

/** Build an engine-valid setReserves order aimed at the given cell. */
function reservesOrder(player: PlayerId, cell: Coord): Order {
    return { kind: 'setReserves', player, cell, percent: 7 as ReservesPct };
}

// ----------------------------------------------------------------------------
// Teardown plumbing
// ----------------------------------------------------------------------------

/**
 * Everything booted/connected by the running test, torn down after it
 * ends. CLIENT closers run FIRST (open client sockets keep the HTTP
 * server's close callback pending), then stack closes — each raced
 * against a small bound so one wedged socket can never hang the hook.
 */
let teardownStacks: Array<() => Promise<void>> = [];

/** Race a teardown step against a bound so the hook cannot hang. */
async function bounded(promise: Promise<void>, ms: number): Promise<void> {
    await Promise.race([promise, delay(ms)]);
}

afterEach(async () => {
    const teardowns = teardownStacks.reverse();
    teardownStacks = [];
    for (const teardown of teardowns) {
        try {
            await bounded(teardown(), 3_000);
        } catch {
            // Best-effort teardown: a failed close must not mask the
            // test's own outcome (mirrors the keepalive suite's stance).
        }
    }
}, 30_000);

/** Register any closer (stack shutdown, client disconnect, …). */
function trackCloser(close: () => void): void {
    teardownStacks.push(async () => {
        close();
    });
}

/**
 * Build an idempotent stack closer (mirrors host.ts `shutdown`). The
 * `closing` guard ensures the underlying teardown runs at most once even
 * if SIGINT fires repeatedly; `closeCount` lets the test prove that.
 *
 * @param stack The booted stack to close.
 * @returns An idempotent `close` plus a `closeCount` probe.
 */
function makeStackCloser(stack: BootedStack): { close: () => Promise<void>; closeCount: () => number } {
    let closing = false;
    let count = 0;
    const close = async (): Promise<void> => {
        if (closing) {
            return;
        }
        closing = true;
        count += 1;
        await stack.server.close();
        await stack.lobbyFacade()?.close();
        await stack.matchmaker.close();
        await new Promise<void>((resolve) => {
            stack.httpServer.close(() => resolve());
        });
    };
    return { close, closeCount: () => count };
}

// ----------------------------------------------------------------------------
// The proofs
// ----------------------------------------------------------------------------

/**
 * Prove a SIGINT-driven shutdown is idempotent: wire `close` to SIGINT,
 * fire it twice, and assert the underlying teardown ran exactly once and
 * the http.Server is no longer listening. Mirrors host.ts `shutdown`.
 *
 * @param stack The booted stack.
 * @param httpServer The externally owned http.Server (listening check).
 */
async function assertIdempotentSigintClose(stack: BootedStack, httpServer: HttpServer): Promise<void> {
    const closer = makeStackCloser(stack);
    trackCloser(() => {
        void closer.close();
    });
    const sigintHandler = (): void => {
        void closer.close();
    };
    process.on('SIGINT', sigintHandler);
    try {
        await closer.close(); // first SIGINT
        await closer.close(); // second SIGINT — must be a no-op
        expect(closer.closeCount()).toBe(1);
        expect(httpServer.listening).toBe(false);
    } finally {
        process.off('SIGINT', sigintHandler);
    }
}

/**
 * One smoke case: boot the real stack on an ephemeral port, prove the
 * version route + same-origin WS upgrade, prepare an N-seat match via the
 * REAL `prepareMatch`, drive N token-bearing join URLs to hello→join→
 * ticks→ack, then prove a SIGINT-driven shutdown is idempotent.
 *
 * Board size `64` is NOT exercised here — it is temporarily disabled in the
 * host CLI (terrain generation is unreliable, follow-up issue #26); its
 * rejection is asserted by the dedicated `resolveConfig` check below. The
 * matrix therefore covers the two selectable sizes, 32 and 48.
 *
 * @param playerCount Requested player count (2 | 3 | 4).
 * @param boardSize   Requested board edge (32 | 48).
 */
async function runNPlayerSmoke(playerCount: 2 | 3 | 4, boardSize: 32 | 48): Promise<void> {
    // Single-port surface: the host attaches serveStatic (which serves
    // /version) to the externally owned http.Server. Replicate that exact
    // request handling so GET /version answers on the same port as WS.
    const httpServer = createHttpServer((req, res) => {
        const [pathWithoutQuery] = (req.url ?? '/').split('?');
        if (handleVersionRoute(req, res, pathWithoutQuery)) {
            return;
        }
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    });
    const stack = buildStack(httpServer);
    const port = await listen(stack);

    // -- Version route on the SAME port as WS (feature 009 FR-006) --------
    const version = await getVersion(port);
    expect(version.status).toBe(200);
    expect(version.appVersion).toBe(APP_VERSION);
    expect(version.protocolVersion).toBe(NETWORK_API_VERSION);

    // -- Same-origin WS upgrade works (hello → helloAck) -------------------
    const wsUrl = `ws://127.0.0.1:${String(port)}`;
    const probe = createWsMatchClient({});
    await probe.connect(wsUrl);
    expect(probe.state().connection).toBe('greeted');
    probe.disconnect();

    // -- Prepare the N-seat match via the REAL production prepareMatch -----
    const match = prepareMatch(stack.matchmaker, { playerCount, boardSize });
    if (match === null) {
        // matchmaking rejected the settings (should not happen for 32/48).
        throw new Error(
            `prepareMatch returned null for ${playerCount}P board ${boardSize} (matchmaking rejected the settings)`,
        );
    }

    expect(match.seatTokens.length).toBe(playerCount);
    expect(match.playerCount).toBe(playerCount);
    expect(match.boardSize).toBe(boardSize);

    // -- Drive N token-bearing join URLs (hello → join → ticks → ack) ------
    const legs: SeatLeg[] = [];
    for (let seat = 1; seat <= playerCount; seat += 1) {
        const token = match.seatTokens[seat - 1];
        if (token === undefined) {
            throw new Error(`missing seat token for seat ${String(seat)}`);
        }
        const name = `P${String(seat)}`;
        // Build the semantic match URL the launcher prints. The test-only
        // server seam remains the direct wire client below; credentials and
        // transport details are intentionally absent from the browser URL.
        const joinUrl = `http://127.0.0.1:${String(port)}/match/${encodeURIComponent(match.matchId)}/join`;
        const parsed = new URL(joinUrl);
        expect(parsed.pathname).toBe(`/match/${match.matchId}/join`);
        expect(parsed.search).toBe('');
        const leg = await joinSeat(wsUrl, match.matchId, token, name);
        legs.push(leg);
    }

    // Every seat joined with its own distinct id (1..N).
    const ids = legs.map((leg) => leg.playerId).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: playerCount }, (_, i) => (i + 1) as PlayerId));

    // Ticks flowed to every seat (join snapshot + at least one tick).
    for (const leg of legs) {
        await pollUntilTrue(() => leg.views.length >= 2, `seat ${String(leg.playerId)} receives ticks`);
    }

    // Every seat issues an order and gets an authoritative ack (FR-008).
    for (const leg of legs) {
        const latest = leg.views[leg.views.length - 1];
        const cell = ownCity(latest, leg.playerId);
        const result: CommandResult = await leg.client.sendOrder(reservesOrder(leg.playerId, cell));
        expect(result.ok).toBe(true);
    }

    // Match is live on the server.
    expect(stack.server.stats().activeMatches).toBe(1);

    // -- SIGINT idempotent close -------------------------------------------
    await assertIdempotentSigintClose(stack, httpServer);
}

/**
 * Matrix over N∈{2,3,4} and the two selectable board sizes {32,48}. The 2P
 * case is the no-flag baseline: `pnpm host` defaults to `--players 2` and
 * `DEFAULT_MATCH_SETTINGS.boardSize === 32` (FR-001), so it must be exercised
 * explicitly as the shipped path (012 SC-006 / T025). The 3-/4-player cases
 * use their default boards (48 each) and cover the N>2 path; the
 * `boardSize=32` override (3P) covers the 32 value. N∈{3,4} remain covered at
 * their default 48 board.
 *
 * Board size `64` is intentionally absent: it is temporarily disabled in the
 * host CLI (terrain generation is unreliable — follow-up issue #26). Its
 * rejection is asserted by the dedicated `resolveConfig` check below, so the
 * override path is still proven wired through without booting a real stack.
 */
const SMOKE_MATRIX: ReadonlyArray<{
    readonly playerCount: 2 | 3 | 4;
    readonly boardSize: 32 | 48;
    readonly note: string;
}> = [
    { playerCount: 2, boardSize: 32, note: 'N=2 default board (no-flag baseline, FR-001 boardSize 32)' },
    { playerCount: 3, boardSize: 48, note: 'N=3 default board' },
    { playerCount: 4, boardSize: 48, note: 'N=4 default board' },
    { playerCount: 3, boardSize: 32, note: 'boardSize=32 override (covers the 32 value)' },
];

describe('N-player host smoke (012 T020)', () => {
    for (const cfg of SMOKE_MATRIX) {
        test(`boots real ${String(cfg.playerCount)}P stack (board ${String(cfg.boardSize)}) — ${cfg.note}`, async () => {
            await runNPlayerSmoke(cfg.playerCount, cfg.boardSize);
        }, 60_000);
    }

    test('rejects --board-size 64 (temporarily disabled, terrain issue #26) without booting a stack', () => {
        const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
            const result = resolveConfig(['--board-size', '64'], {});
            expect(result).toBeNull();
            const stderr = errSpy.mock.calls.map((c) => String(c[0])).join('');
            expect(stderr).toContain(
                'host: --board-size 64 is temporarily disabled — 64×64 generation is unreliable (terrain issue #26 pending fix)',
            );
        } finally {
            errSpy.mockRestore();
        }
    });
});
