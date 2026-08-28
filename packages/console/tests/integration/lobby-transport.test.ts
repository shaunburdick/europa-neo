/**
 * Lobby transport integration — feature 010 (T-013).
 *
 * Drives the REAL browser lobby client (`src/net/ws-lobby-client.ts`)
 * against the REAL stack over real sockets and real timers — the
 * `quiet-client-keepalive` discipline applied to the lobby wire:
 *
 *   ws-lobby-client ⇄ createMatchServer lobby dispatcher (T-010) ⇄
 *   createLobbyService facade (T-007) ⇄ real matchmaker (feature 006,
 *   auto-start) ⇄ engine + terrain + fog.
 *
 * No fakes on the game or lobby path. The only injected doubles are
 * the client's own sanctioned seams: an in-memory `LobbyStorage`
 * (standing in for browser localStorage) and a tapping `WebSocket`
 * factory that records raw inbound frames without altering them.
 * Gameplay legs (players + spectator attach) ride the REAL
 * `ws-match-client`, mirroring how the console runtime mounts both
 * clients side by side.
 *
 * RENAME SETTLEMENT (defect found by this suite, 2026-08-26 — see the
 * regression proof at the bottom): T-012's client originally settled a
 * rename only after BOTH an `actionAccepted` echo AND a confirming
 * identity event, but T-010's dispatcher confirms renames via the
 * directed identity event ALONE (its JSDoc rules out `actionAccepted`:
 * "no arm for data-only updates") — wire-verified: a real round trip
 * emits `identity` only. Every rename therefore hung until
 * LobbyTimeoutError even though the server accepted the handle. Fixed
 * client-side per PM ruling (2026-08-26): the directed identity event
 * alone settles a pending setHandle — it is addressed solely to the
 * owning connection and carries the resulting handle, making it a
 * sufficient, authoritative confirmation; no wire/server change. The
 * bottom test proves a REAL round-trip rename settles end-to-end.
 *
 * Clients in the scenarios below are named through the contract-true
 * US1 AC-3 claim-restore flow (a raw bootstrap connection reserves the
 * handle; the REAL client connects presenting that claim — exactly
 * what a browser reload does) because it exercises MORE of the
 * identity path than a first-session rename would.
 *
 * Scenario map (task T-013):
 *
 *   1. create/join/spectate transitions — waiting entry fan-out,
 *      auto-start handoff hints ('waiting' vs 'match'), spectator
 *      presence through the existing read-only path;
 *   2. stale/duplicate action ids — duplicate-correlation joins echo
 *      exactly once per effect; impostor echoes injected into a live
 *      client are ignored; concurrent final-seat races admit exactly
 *      one player and losers recover;
 *   3. full/unavailable matches — unknown ids, spectating a filling
 *      match, joining an already-filled match: clean typed codes,
 *      connection stays ready;
 *   4. identity across disconnects — within-grace restore preserves
 *      id+handle+revision continuity; post-grace mints fresh and frees
 *      the handle; a full server restart delivers a SUCCESSOR id the
 *      client adopts (R-009) and its low post-restart revisions are
 *      re-adopted instead of starved (T-012 baseline reset);
 *   5. spectator zero-order — spectators receive tick broadcasts but
 *      zero order/orderAck frames, cannot submit orders
 *      (`spectator_readonly`), and LOBBY sockets never carry gameplay
 *      frames at all;
 *   6. privacy spot-check — a bystander's complete raw wire stream
 *      contains no other identity's opaque guest id or handle, while a
 *      positive control proves the capture would have caught one.
 *
 * Determinism discipline: no arbitrary sleeps on observable state —
 * every wait is `pollUntil` against client/server-visible facts (the
 * two bounded real-timer sleeps are grace-window expiry itself and a
 * post-mutation settle for privacy scans; both are the behavior under
 * test). Generous-but-bounded timeouts throughout for CI safety.
 */

import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';

import { computePlayerView } from '@europa/fog';
import type { GuestPlayerId, LobbyEvent, MatchId } from '@europa/matchmaking';
import {
    createLobbyService,
    createMatchmaker,
    type Matchmaker,
    type PublicLobbyEntry,
    type ReservesPct,
} from '@europa/matchmaking';
import {
    createMatchServer,
    type Logger,
    type MatchmakerBridge,
    NETWORK_DEFAULT_CONFIG,
    NULL_LOGGER,
    type Server,
    type ServerDeps,
} from '@europa/networking';
import { NETWORK_API_VERSION } from '@europa/networking/browser';
import { afterEach, describe, expect, test } from 'vitest';
import {
    LOBBY_STORAGE_KEY,
    type LobbyStorage,
    loadStoredClaim,
    type StoredLobbyClaim,
} from '../../src/net/lobby-storage';
import { createWsLobbyClient, LobbyActionRejectedError, type WsLobbyClient } from '../../src/net/ws-lobby-client';
import { createWsMatchClient, type WsMatchClient } from '../../src/net/ws-match-client';
import type { Coord, Order, PlayerId, PlayerView } from '../../src/state/types';

// ----------------------------------------------------------------------------
// Tunables (single location — constitution Principle V / AGENTS.md rule 3)
// ----------------------------------------------------------------------------

/** Tick cadence for fixture servers; match settings MUST use the same value. */
const TICK_MS = 50;

/**
 * Board edge. Terrain placement constraints are tuned for the shipped
 * default (32); smaller boards can exhaust regeneration attempts (the
 * full-stack E2E hit this), so every generated match runs at 32.
 */
const BOARD_SIZE = 32;

/** Short reconnect-grace window for the identity lifecycle tests (ms). */
const GRACE_MS = 700;

/** Margin past the grace window before a post-grace reconnect (ms). */
const POST_GRACE_MARGIN_MS = 500;

/** Advertised heartbeat; clients ping at max(1000, half) = 1000 ms. */
const HEARTBEAT_MS = 2000;

/** Idle window comfortably above the 1 s ping floor (no mid-test reaps). */
const IDLE_TIMEOUT_MS = 5000;

/** Default poll horizon for observable state (CI-safe upper bound). */
const WAIT_TIMEOUT_MS = 10_000;

/** Poll interval for observable-state waits. */
const POLL_INTERVAL_MS = 25;

/** Bounded wait for the reboot listener to win the port back (ms). */
const REBIND_TIMEOUT_MS = 5_000;

/** Delay between rebinding attempts after a restart (ms). */
const REBIND_RETRY_MS = 100;

/** Settle window before freezing privacy captures (ms). */
const PRIVACY_SETTLE_MS = 300;

/**
 * The ONLY frame kinds a healthy lobby socket exchanges. Anything else
 * on that wire — ticks, joinAcks, orders — is gameplay traffic leaking
 * onto the lobby transport (scenario 5's transport-purity assertion).
 */
const LOBBY_SOCKET_KINDS: ReadonlySet<string> = new Set([
    'hello',
    'helloAck',
    'ping',
    'pong',
    'lobbyIdentity',
    'lobbySetHandle',
    'lobbySubscribe',
    'lobbyCreate',
    'lobbyJoin',
    'lobbySpectate',
    'lobbyLeave',
    'lobbyEvent',
]);

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
 * Poll until `read` returns a non-null/undefined value, then return
 * it. The deterministic-wait primitive for this suite: every wait
 * targets an observable fact (client state, captured frames) with a
 * bounded horizon and a descriptive failure.
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
// In-memory claim storage (browser localStorage stand-in)
// ----------------------------------------------------------------------------

/**
 * Records every persisted claim so tests can observe the client's
 * ADOPTED opaque guest id — the public API deliberately exposes no
 * accessor for the bearer secret, but persistence is the FR-003
 * contract surface, so the storage double is the honest observation
 * point (it sees exactly what a browser would have stored).
 */
class MemoryClaimStorage implements LobbyStorage {
    private readonly store = new Map<string, string>();

    /** Claim snapshot as of each write, in write order. */
    readonly writeHistory: Array<ReturnType<typeof loadStoredClaim>> = [];

    getItem(key: string): string | null {
        return this.store.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.store.set(key, value);
        // Read back through the module's own parser so history entries
        // share the exact shape the client restored on reload.
        this.writeHistory.push(loadStoredClaim(this));
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }

    /**
     * Pre-seed the persisted claim BEFORE a client connects (the
     * reload-restore setup: a previous browser session "wrote" this
     * claim, and the next establish cycle must present it).
     */
    seed(claim: StoredLobbyClaim): void {
        this.setItem(LOBBY_STORAGE_KEY, JSON.stringify(claim));
    }

    /** Current persisted claim, or `null` before the first write. */
    current(): ReturnType<typeof loadStoredClaim> {
        return loadStoredClaim(this);
    }

    /** The adopted opaque guest id (server-delivered per R-009). */
    adoptedId(): GuestPlayerId | null {
        return this.current()?.guestPlayerId ?? null;
    }
}

// ----------------------------------------------------------------------------
// Tapping WebSocket (records the raw wire; alters nothing)
// ----------------------------------------------------------------------------

/**
 * A real WebSocket subclass that mirrors every inbound text frame into
 * {@link inboundText} / {@link inboundKinds} WITHOUT changing delivery.
 * Used both for privacy scans (raw bytes, scenario 6) and transport
 * purity (frame-kind sets, scenario 5).
 *
 * The tap listener registers in the constructor — BEFORE the client
 * assigns its `onmessage` handler — so capture is complete even if
 * client-side processing throws.
 */
class TapSocket extends WebSocket {
    /** Every inbound text frame verbatim, in arrival order. */
    readonly inboundText: string[] = [];

    /** Envelope `type` of every inbound frame, in arrival order. */
    readonly inboundKinds: string[] = [];

    constructor(url: string) {
        super(url);
        this.addEventListener('message', (event: MessageEvent<string>) => {
            this.inboundText.push(event.data);
            try {
                const parsed: unknown = JSON.parse(event.data);
                if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
                    const kind = (parsed as { type: unknown }).type;
                    if (typeof kind === 'string') {
                        this.inboundKinds.push(kind);
                    }
                }
            } catch {
                // Unparseable frames still count as traffic; the client's
                // own validator owns the protocol complaint.
                this.inboundKinds.push('<unparseable>');
            }
        });
    }

    /**
     * Inject a fabricated server frame into the client's inbound path
     * (impostor/stale echo probes). Delivers through the SAME
     * `onmessage` property the client installed, so the client cannot
     * tell it apart from wire traffic.
     */
    inject(rawFrame: string): void {
        this.onmessage?.(new MessageEvent<string>('message', { data: rawFrame }));
    }
}

// ----------------------------------------------------------------------------
// Raw seat (hand-rolled lobby/match protocol speaker)
// ----------------------------------------------------------------------------

/** One decoded inbound envelope from the raw seat's perspective. */
interface WireFrame {
    readonly type: string;
    readonly payload: unknown;
}

/**
 * Minimal hand-rolled seat speaking raw JSON envelopes (keepalive-suite
 * pattern). Exists for probes the client API intentionally does not
 * expose: duplicate correlation ids on the wire and the spectator
 * read-only rejection path.
 */
class RawSeat {
    readonly socket: WebSocket;

    private readonly queue: WireFrame[] = [];

    private waiter: ((frame: WireFrame) => void) | null = null;

    private nextSeq = 0;

    constructor(url: string) {
        this.socket = new WebSocket(url);
        // Auto-registration: an open raw seat keeps the server's HTTP
        // close callback pending, so EVERY seat closes during teardown
        // even when its test failed mid-flight.
        trackCloser(() => {
            this.socket.close();
        });
        this.socket.addEventListener('message', (event: MessageEvent<string>) => {
            const frame = JSON.parse(event.data) as WireFrame;
            const parked = this.waiter;
            if (parked !== null) {
                this.waiter = null;
                parked(frame);
                return;
            }
            this.queue.push(frame);
        });
    }

    /** Resolve when the socket is open. */
    open(): Promise<void> {
        return new Promise((resolve) => {
            this.socket.addEventListener('open', () => resolve(), { once: true });
        });
    }

    /** Send one envelope with the next sequence number. */
    send(type: string, payload: Record<string, unknown>): void {
        this.nextSeq += 1;
        this.socket.send(JSON.stringify({ type, version: NETWORK_API_VERSION, seq: this.nextSeq, payload }));
    }

    /**
     * Next inbound frame matching `matcher` (or simply the next frame
     * when omitted). Already-received frames are scanned first, so
     * bursts followed by late consumption behave like a queue.
     */
    async next(matcher: ((frame: WireFrame) => boolean) | null, description: string): Promise<WireFrame> {
        const deadline = Date.now() + WAIT_TIMEOUT_MS;
        for (;;) {
            const index = matcher === null ? 0 : this.queue.findIndex(matcher);
            const frame = index >= 0 ? this.queue.splice(index, 1)[0] : undefined;
            if (frame !== undefined) {
                return frame;
            }
            if (Date.now() > deadline) {
                throw new Error(`raw seat timed out waiting for ${description}`);
            }
            const delivered = await new Promise<WireFrame | null>((resolve) => {
                this.waiter = resolve;
                setTimeout(
                    () => {
                        if (this.waiter === resolve) {
                            this.waiter = null;
                            resolve(null);
                        }
                    },
                    Math.max(POLL_INTERVAL_MS, deadline - Date.now()),
                );
            });
            if (delivered !== null) {
                // Guard: the waiter fires with the next raw frame, which
                // may not match the caller's predicate (e.g. a tick frame
                // arriving while waiting for an error).  Non-matching
                // frames are pushed back into the queue so the loop
                // retries — otherwise they would be silently dropped or,
                // worse, misdelivered as a false positive.
                if (matcher === null || matcher(delivered)) {
                    return delivered;
                }
                this.queue.push(delivered);
            }
        }
    }

    /** Next `lobbyEvent` frame, narrowed to the contract union. */
    async nextLobbyEvent(description: string): Promise<LobbyEvent> {
        const frame = await this.next((candidate) => candidate.type === 'lobbyEvent', description);
        // Documented cast: the wire payload is the JSON form of the
        // shared LobbyEvent contract (same codec both sides).
        return (frame.payload as { event: LobbyEvent }).event;
    }

    /**
     * Next `lobbyEvent` matching `matches`, skipping non-matching
     * events (broadcast snapshots interleave with directed echoes).
     * Bounded by BOTH the per-frame wait deadline and an iteration cap
     * so a wrong expectation fails fast instead of consuming forever.
     */
    async nextLobbyEventWhere(
        matches: (event: LobbyEvent) => boolean,
        description: string,
        maxSkips = 8,
    ): Promise<LobbyEvent> {
        for (let seen = 0; seen < maxSkips; seen++) {
            const event = await this.nextLobbyEvent(description);
            if (matches(event)) {
                return event;
            }
        }
        throw new Error(`raw seat never received ${description} within ${String(maxSkips)} lobby events`);
    }
}

// ----------------------------------------------------------------------------
// Stack harness (real server ⇄ real facade ⇄ real matchmaker)
// ----------------------------------------------------------------------------

/** Options for {@link bootLobbyStack}. */
interface StackOptions {
    /** Reconnect-grace override passed to the lobby facade's registry. */
    readonly graceMs?: number;
}

/** A booted production stack on an ephemeral (or pinned) port — single-port (011): one http.Server for HTTP + WS. */
interface LobbyStack {
    readonly httpServer: HttpServer;
    readonly server: Server;
    readonly matchmaker: Matchmaker;
    readonly url: string;
    readonly port: number;
}

/**
 * Boot the full production stack on one port using the documented host
 * recipe (ServerDeps.lobby JSDoc + full-stack E2E buildStack): the
 * server takes a forwarding bridge plus a LAZY lobby-facade source
 * that closes over a mutable wiring slot, the matchmaker binds itself
 * via the optional `bindMatchmaker` seam right after creation, and the
 * first lobby frame builds the facade against the now-known matchmaker.
 *
 * Single-port (011 FR-009): one externally owned http.Server on 127.0.0.1:0
 * (or a pinned port for reboot) — HTTP and WS share the same listener.
 * The networking server's `httpServer` seam owns the upgrade delegation;
 * `__boundPortForTest()` reads the external server's bound port.
 */
async function bootLobbyStack(options: StackOptions = {}, port = 0): Promise<LobbyStack> {
    let bound: MatchmakerBridge = {};
    const forwardingBridge: MatchmakerBridge = {
        onSeatClaimed: (event) => bound.onSeatClaimed?.(event),
        onSeatDisconnected: (event) => bound.onSeatDisconnected?.(event),
        onSeatReconnected: (event) => bound.onSeatReconnected?.(event),
        onSeatExpired: (event) => bound.onSeatExpired?.(event),
        onMatchTerminal: (event) => bound.onMatchTerminal?.(event),
    };
    const wiring: { matchmaker: Matchmaker | null } = { matchmaker: null };

    // Single-port seam (011 FR-002): host owns the http.Server.
    const httpServer: HttpServer = createHttpServer();

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
                return createLobbyService({
                    matchmaker,
                    deliver: sink.deliver,
                    ...(options.graceMs === undefined ? {} : { graceMs: options.graceMs }),
                });
            },
        },
    };

    const server = createMatchServer(
        {
            ...NETWORK_DEFAULT_CONFIG,
            host: '127.0.0.1',
            port,
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

    const listenHttp = async (targetPort: number): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            httpServer.once('error', reject);
            httpServer.listen(targetPort, '127.0.0.1', () => resolve());
        });

    if (port === 0) {
        await listenHttp(0);
        await server.listen();
    } else {
        // Reboot on a pinned port: the previous holder just closed, but
        // teardown races can briefly delay the OS release — retry bounded.
        const deadline = Date.now() + REBIND_TIMEOUT_MS;
        for (;;) {
            try {
                await listenHttp(port);
                await server.listen();
                break;
            } catch (error) {
                if (Date.now() >= deadline) {
                    throw error;
                }
                // Clear a half-bound listener before retrying.
                await new Promise<void>((resolve) => {
                    httpServer.close(() => resolve());
                });
                await delay(REBIND_RETRY_MS);
            }
        }
    }

    wiring.matchmaker = createMatchmaker({}, { server: bindable });
    const boundPort = server.__boundPortForTest();
    if (boundPort === undefined) {
        throw new Error('server did not report a bound port');
    }
    // Single-port proof: same http.Server answers both HTTP + WS.
    const httpPort = (httpServer.address() as { port: number } | null)?.port;
    if (httpPort !== undefined && httpPort !== boundPort) {
        throw new Error(`single-port invariant violated: http ${String(httpPort)} !== ws ${String(boundPort)}`);
    }
    return {
        httpServer,
        server,
        matchmaker: wiring.matchmaker,
        url: `ws://127.0.0.1:${String(boundPort)}`,
        port: boundPort,
    };
}

// ----------------------------------------------------------------------------
// Client helpers
// ----------------------------------------------------------------------------

/** A connected lobby client plus its observation seams. */
interface LobbyHandle {
    readonly client: WsLobbyClient;
    readonly storage: MemoryClaimStorage;
    /** The tapped socket (null only before the first connect attempt). */
    socket(): TapSocket | null;
}

/** Reconnect-tuning options accepted by {@link connectLobbyClient}. */
interface ReconnectOptions {
    readonly reconnectBaseDelayMs?: number;
    readonly reconnectMaxDelayMs?: number;
    readonly maxReconnectAttempts?: number;
}

/**
 * Connect a real lobby client with an in-memory claim store and a
 * tapping socket factory. Resolves only after the FULL establish cycle
 * (identity → subscribe → baseline applied → `'ready'`), because the
 * client's `connect()` promise is gated on exactly that.
 *
 * `preseedClaim` plants a persisted claim BEFORE connecting — the
 * reload-restore setup (US1 AC-3): the establish cycle presents it and
 * the server restores the identity when its registry still holds it.
 */
async function connectLobbyClient(
    url: string,
    options: ReconnectOptions & { readonly preseedClaim?: StoredLobbyClaim } = {},
): Promise<LobbyHandle> {
    const storage = new MemoryClaimStorage();
    if (options.preseedClaim !== undefined) {
        storage.seed(options.preseedClaim);
    }
    let tapped: TapSocket | null = null;
    const client = createWsLobbyClient({
        storage,
        webSocketFactory: (socketUrl: string) => {
            const socket = new TapSocket(socketUrl);
            tapped = socket;
            return socket;
        },
        reconnectBaseDelayMs: options.reconnectBaseDelayMs,
        reconnectMaxDelayMs: options.reconnectMaxDelayMs,
        maxReconnectAttempts: options.maxReconnectAttempts,
    });
    trackCloser(() => {
        client.disconnect();
    });
    await client.connect(url);
    return {
        client,
        storage,
        socket: () => tapped,
    };
}

/**
 * Connect AND name a lobby client through the US1 AC-3 claim-restore
 * flow: a raw bootstrap connection reserves `handle` server-side and
 * learns the server-minted guest id from its directed identity event;
 * the REAL client then connects presenting that claim from its
 * "localStorage" — exactly what a browser reload does. The identity
 * event carrying the accepted handle arrives DURING the establish
 * cycle, so resolution here is a full synchronization point.
 *
 * (This flow is preferred over a first-session `client.setHandle()`
 * because it exercises MORE of the identity path: raw reservation,
 * grace-window restore, and claim presentation in one setup.)
 */
async function establishNamedClient(
    url: string,
    handle: string,
    reconnectOptions: ReconnectOptions = {},
): Promise<LobbyHandle> {
    const bootstrap = new RawSeat(url);
    await bootstrap.open();
    bootstrap.send('hello', { protocolVersion: NETWORK_API_VERSION });
    await bootstrap.next((frame) => frame.type === 'helloAck', 'bootstrap helloAck');
    bootstrap.send('lobbyIdentity', { claim: { guestPlayerId: crypto.randomUUID() as GuestPlayerId } });
    const established = await bootstrap.nextLobbyEvent('bootstrap identity establishment');
    if (established.kind !== 'identity' || established.identity.guestPlayerId === undefined) {
        throw new Error('bootstrap connection received no server-delivered guest id');
    }
    const guestId = established.identity.guestPlayerId;
    bootstrap.send('lobbySetHandle', { handle, actionId: 1 });
    const named = await bootstrap.nextLobbyEvent('bootstrap handle confirmation');
    if (named.kind !== 'identity' || named.identity.handle !== handle) {
        throw new Error(`bootstrap handle reservation failed (${named.kind})`);
    }
    // Close BEFORE the client claims the same guest: the close starts
    // the registry grace window, and the client's establish restores
    // the identity out of it within microseconds of wall time.
    bootstrap.socket.close();

    const lobby = await connectLobbyClient(url, {
        ...reconnectOptions,
        preseedClaim: { guestPlayerId: guestId, handle },
    });
    expect(lobby.client.state().connection).toBe('ready');
    expect(lobby.client.state().handle).toBe(handle);
    expect(adoptedId(lobby)).toBe(guestId);
    return lobby;
}

/** Read one lobby client's adopted opaque guest id (via its storage). */
function adoptedId(lobby: LobbyHandle): GuestPlayerId {
    const id = lobby.storage.adoptedId();
    if (id === null) {
        throw new Error('client never persisted an adopted guest id');
    }
    return id;
}

/** Read one entry of a client's latest applied snapshot, if present. */
function entryOf(lobby: LobbyHandle, matchId: MatchId): PublicLobbyEntry | null {
    return lobby.client.state().snapshot?.entries.find((entry) => entry.matchId === matchId) ?? null;
}

/** A joined match client plus the fog views it has received so far. */
interface MatchLeg {
    readonly client: WsMatchClient;
    readonly views: PlayerView[];
}

/**
 * Attach a REAL match client to a started match as a player (open-seat
 * scan — lobby-reserved seats have no live connection yet) or
 * spectator. Resolves after the joinAck-path join completes; every
 * joinAck/tick view is recorded on the returned leg.
 */
async function attachMatchClient(
    url: string,
    matchId: MatchId,
    role: 'player' | 'spectator',
    displayName: string,
): Promise<MatchLeg> {
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
    await client.connect(url);
    await client.joinMatch({ matchId, role, displayName });
    expect(client.state().connection).toBe('joined');
    return { client, views };
}

/** Latest view received on a leg (join snapshot or newest tick). */
function latestView(leg: MatchLeg): PlayerView {
    const view = leg.views[leg.views.length - 1];
    if (view === undefined) {
        throw new Error('match leg has received no views yet');
    }
    return view;
}

/** Build an engine-valid setReserves order aimed at the given cell. */
function reservesOrder(player: PlayerId, cell: Coord): Order {
    return { kind: 'setReserves', player, cell, percent: 7 as ReservesPct };
}

/** Find the given seat's own city in a fog view (always visible to it). */
function ownCity(view: PlayerView, player: PlayerId): Coord {
    const cell = view.visibleCells.find((candidate) => candidate.cityOwner === player);
    if (cell === undefined) {
        throw new Error(`seat ${String(player)} cannot see its own city in its fog view`);
    }
    return cell.coord;
}

/** Settle an action promise into either its value or its rejection. */
async function outcomeOf<T>(action: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
    return action.then(
        (value: T): { ok: true; value: T } => ({ ok: true, value }),
        (error: unknown): { ok: false; error: unknown } => ({ ok: false, error }),
    );
}

/** Extract the typed code from a rejected lobby action error. */
function rejectionCode(error: unknown): string | null {
    return error instanceof LobbyActionRejectedError ? error.code : null;
}

/** Cast a plain string to the branded MatchId for negative-path probes. */
function bogusMatchId(value: string): MatchId {
    // Documented cast: negative tests need an id-shaped value the
    // server will not recognize; the brand exists to prevent ACCIDENTAL
    // confusion, not to block deliberate invalid input.
    return value as MatchId;
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

/** Register a stack for automatic afterEach teardown — single-port: WS `close()` does NOT close the externally owned httpServer. */
function trackTeardown(stack: LobbyStack): void {
    teardownStacks.push(async () => {
        await stack.server.close();
        await new Promise<void>((resolve) => {
            stack.httpServer.close(() => resolve());
        });
        await stack.matchmaker.close();
    });
}

/** Register any closer (client disconnect, raw-seat socket close, …). */
function trackCloser(close: () => void): void {
    teardownStacks.push(async () => {
        close();
    });
}

// ----------------------------------------------------------------------------
// The proofs
// ----------------------------------------------------------------------------

describe('lobby transport integration (feature 010 T-013)', () => {
    test('create/join/spectate transitions drive waiting → in_progress fan-out and the read-only handoff', async () => {
        const stack = await bootLobbyStack();
        trackTeardown(stack);

        const alice = await establishNamedClient(stack.url, 'Alice');
        const bob = await establishNamedClient(stack.url, 'Bob');

        // -- Create: creator seated, transition hint 'waiting' -------------
        const created = await alice.client.createMatch({
            playerCount: 2,
            boardSize: BOARD_SIZE,
            tickIntervalMs: TICK_MS,
        });
        expect(created).toBe('waiting');

        const matchId = await pollUntil(
            () => alice.client.state().snapshot?.entries[0]?.matchId ?? null,
            'creator sees its waiting row',
        );
        const bobRow = await pollUntil(() => {
            const row = entryOf(bob, matchId);
            return row !== null && row.status === 'waiting' && row.seatsFilled === 1 ? row : null;
        }, 'subscriber B sees the waiting entry (1/2)');
        expect(bobRow.capacity).toBe(2);

        // -- Join: final seat fills ⇒ auto-start ⇒ handoff hint 'match' ----
        const joined = await bob.client.joinMatch(matchId);
        expect(joined).toBe('match');

        await pollUntilTrue(
            () => entryOf(alice, matchId)?.status === 'in_progress',
            "creator's row flips to in_progress",
        );
        // Both participants' snapshots carry their own active association.
        expect(alice.client.state().snapshot?.activeMatchId).toBe(matchId);
        expect(bob.client.state().snapshot?.activeMatchId).toBe(matchId);

        // -- Spectate: third client attaches read-only to the running match
        const cara = await establishNamedClient(stack.url, 'Cara');
        const caraBaseline = await pollUntil(() => {
            const snapshot = cara.client.state().snapshot;
            return snapshot?.entries.some((entry) => entry.matchId === matchId) === true ? snapshot : null;
        }, 'spectator baseline shows the in-progress entry');
        expect(caraBaseline.entries.find((entry) => entry.matchId === matchId)?.status).toBe('in_progress');
        const spectated = await cara.client.spectateMatch(matchId);
        expect(spectated).toBe('match');

        // Spectator presence rides the NEXT revision bump (US4 AC-4):
        // a fourth visitor creating a match publishes fresh snapshots.
        const dave = await establishNamedClient(stack.url, 'Dave');
        await dave.client.createMatch({ playerCount: 2, boardSize: BOARD_SIZE, tickIntervalMs: TICK_MS });
        const caraActive = await pollUntil(() => {
            const snapshot = cara.client.state().snapshot;
            return snapshot !== null && snapshot.activeMatchId === matchId ? snapshot : null;
        }, 'spectator presence projected into later snapshots');
        expect(caraActive.entries.length).toBe(2);

        // -- The existing read-only path hands the spectator a live view ---
        const spectator = await attachMatchClient(stack.url, matchId, 'spectator', 'Cara');
        expect(spectator.client.state().playerId).toBeNull();
        await pollUntilTrue(() => spectator.views.length >= 3, 'spectator receives joinAck + tick views');
        // Full-visibility spectator view covers the whole board.
        expect(latestView(spectator).visibleCells.length).toBe(BOARD_SIZE * BOARD_SIZE);

        spectator.client.disconnect();
        dave.client.disconnect();
        cara.client.disconnect();
        bob.client.disconnect();
        alice.client.disconnect();
    }, 45_000);

    test('duplicate correlation ids echo once per effect; impostor echoes are ignored; losers recover', async () => {
        const stack = await bootLobbyStack();
        trackTeardown(stack);

        const alice = await establishNamedClient(stack.url, 'Alice');
        await alice.client.createMatch({ playerCount: 2, boardSize: BOARD_SIZE, tickIntervalMs: TICK_MS });
        const matchId = await pollUntil(
            () => alice.client.state().snapshot?.entries[0]?.matchId ?? null,
            'waiting row exists',
        );

        // -- Raw seat fires the SAME lobbyJoin correlation id twice -------
        const racer = new RawSeat(stack.url);
        await racer.open();
        racer.send('hello', { protocolVersion: NETWORK_API_VERSION });
        await racer.next((frame) => frame.type === 'helloAck', 'helloAck');
        racer.send('lobbyIdentity', {
            claim: { guestPlayerId: crypto.randomUUID() as GuestPlayerId },
        });
        await racer.nextLobbyEvent('raw identity establishment');
        racer.send('lobbySetHandle', { handle: 'Racer', actionId: 1 });
        await racer.nextLobbyEvent('raw handle confirmation');
        racer.send('lobbySubscribe', { actionId: 2 });
        await racer.nextLobbyEvent('raw baseline snapshot');

        racer.send('lobbyJoin', { matchId, actionId: 777 });
        racer.send('lobbyJoin', { matchId, actionId: 777 });

        // Collect events until BOTH echoes for correlation id 777 have
        // arrived. Snapshot broadcasts interleave freely (the fill makes
        // the facade publish), so a fixed two-event pull would grab one.
        const echoes: LobbyEvent[] = [];
        let acceptedCount = 0;
        let rejectedCount = 0;
        while (acceptedCount < 1 || rejectedCount < 1) {
            if (echoes.length >= 8) {
                throw new Error(
                    `duplicate-join echoes never both arrived (got ${JSON.stringify(echoes.map((event) => event.kind))})`,
                );
            }
            const event = await racer.nextLobbyEvent('duplicate-join echo');
            echoes.push(event);
            if (event.kind === 'actionAccepted' && event.actionId === 777) {
                acceptedCount += 1;
            }
            if (event.kind === 'error' && event.actionId === 777) {
                rejectedCount += 1;
            }
        }
        expect(acceptedCount).toBe(1);
        expect(rejectedCount).toBe(1);
        const rejectedEcho = echoes.find((event) => event.kind === 'error' && event.actionId === 777);
        if (rejectedEcho !== undefined && rejectedEcho.kind === 'error') {
            // The duplicate lost cleanly: already committed to the match.
            expect(rejectedEcho.code).toBe('identity_in_match');
        }

        // Exactly-once effect: occupancy advanced 1 → 2 exactly (never 3).
        const occupancy = await pollUntil(() => {
            const row = entryOf(alice, matchId);
            return row !== null && row.status === 'in_progress' ? row : null;
        }, 'match auto-started after the single admitted seat');
        expect(occupancy.seatsFilled).toBe(2);
        expect(occupancy.capacity).toBe(2);

        // Recoverable loser: the racer WON the duplicate race (its first
        // frame took the final seat), so it is presence-committed — the
        // honest recovery path is leave (release) then create, proving
        // the identity_in_match rejection left a fully usable connection.
        racer.send('lobbyLeave', { actionId: 800 });
        const left = await racer.nextLobbyEventWhere(
            (event) => event.kind === 'actionAccepted' && event.actionId === 800,
            'post-error leave echo',
        );
        expect(left.kind).toBe('actionAccepted');
        racer.send('lobbyCreate', { actionId: 900 });
        const recovery = await racer.nextLobbyEventWhere(
            (event) => event.kind === 'actionAccepted' && event.actionId === 900,
            'post-error recovery create echo',
        );
        expect(recovery.kind).toBe('actionAccepted');
        racer.socket.close();

        // -- Impostor echoes injected into a LIVE client are ignored ------
        const eve = await connectLobbyClient(stack.url);
        let reportedErrors = 0;
        eve.client.onError(() => {
            reportedErrors += 1;
        });
        const tap = eve.socket();
        expect(tap).not.toBeNull();
        tap?.inject(
            JSON.stringify({
                type: 'lobbyEvent',
                version: NETWORK_API_VERSION,
                seq: 10_001,
                payload: { event: { kind: 'actionAccepted', actionId: 4242, transition: 'match' } },
            }),
        );
        tap?.inject(
            JSON.stringify({
                type: 'lobbyEvent',
                version: NETWORK_API_VERSION,
                seq: 10_002,
                payload: {
                    event: { kind: 'error', actionId: 4243, code: 'match_not_found', message: 'forged impostor echo' },
                },
            }),
        );
        await delay(POLL_INTERVAL_MS * 4);
        expect(reportedErrors).toBe(0);
        expect(eve.client.state().connection).toBe('ready');
        // The client is uncorrupted: a real correlated action still
        // round-trips (leave is idempotently OK for a lobby-bound identity).
        await eve.client.leaveMatch();
        eve.client.disconnect();
        alice.client.disconnect();
    }, 45_000);

    test('concurrent final-seat requests admit exactly one player; the loser recovers', async () => {
        const stack = await bootLobbyStack();
        trackTeardown(stack);

        const host = await establishNamedClient(stack.url, 'Host');
        await host.client.createMatch({ playerCount: 2, boardSize: BOARD_SIZE, tickIntervalMs: TICK_MS });
        const matchId = await pollUntil(
            () => host.client.state().snapshot?.entries[0]?.matchId ?? null,
            'waiting row exists',
        );

        const finn = await establishNamedClient(stack.url, 'Finn');
        const greta = await establishNamedClient(stack.url, 'Greta');

        const outcomes = await Promise.allSettled([finn.client.joinMatch(matchId), greta.client.joinMatch(matchId)]);
        const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
        const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(1);
        expect(fulfilled[0]?.status === 'fulfilled' ? fulfilled[0].value : null).toBe('match');

        const loserError = rejected[0]?.reason;
        expect(loserError).toBeInstanceOf(LobbyActionRejectedError);
        if (loserError instanceof LobbyActionRejectedError) {
            // Auto-start means the "full" match presents as in-progress;
            // both mapped codes are the clean full/unavailable family.
            expect(['match_full', 'match_not_joinable']).toContain(loserError.code);
        }

        // Exactly-once seating: the winner's snapshot shows a full,
        // started match — capacity was never exceeded.
        const winner = fulfilled.length === 1 && outcomes[0]?.status === 'fulfilled' ? finn : greta;
        const finalRow = await pollUntil(() => {
            const row = entryOf(winner, matchId);
            return row !== null && row.status === 'in_progress' ? row : null;
        }, 'winner sees the started match');
        expect(finalRow.seatsFilled).toBe(2);

        // Recoverable: the loser's connection is still ready and can act.
        const loser = winner === finn ? greta : finn;
        expect(loser.client.state().connection).toBe('ready');
        const recovered = await loser.client.createMatch({
            playerCount: 2,
            boardSize: BOARD_SIZE,
            tickIntervalMs: TICK_MS,
        });
        expect(recovered).toBe('waiting');

        host.client.disconnect();
        finn.client.disconnect();
        greta.client.disconnect();
    }, 45_000);

    test('unknown and unavailable matches reject cleanly and recoverably', async () => {
        const stack = await bootLobbyStack();
        trackTeardown(stack);

        const alice = await establishNamedClient(stack.url, 'Alice');
        const cara = await establishNamedClient(stack.url, 'Cara');

        // Join / spectate unknown ids → clean match_not_found.
        const joinUnknown = await outcomeOf(cara.client.joinMatch(bogusMatchId('lobby-it-unknown')));
        expect(joinUnknown.ok).toBe(false);
        expect(rejectionCode(joinUnknown.ok ? null : joinUnknown.error)).toBe('match_not_found');

        const spectateUnknown = await outcomeOf(cara.client.spectateMatch(bogusMatchId('lobby-it-unknown')));
        expect(spectateUnknown.ok).toBe(false);
        expect(rejectionCode(spectateUnknown.ok ? null : spectateUnknown.error)).toBe('match_not_found');

        // Spectating a STILL-FILLING match → match_not_joinable.
        await alice.client.createMatch({ playerCount: 2, boardSize: BOARD_SIZE, tickIntervalMs: TICK_MS });
        const waitingId = await pollUntil(
            () => alice.client.state().snapshot?.entries[0]?.matchId ?? null,
            'waiting row exists',
        );
        const spectateWaiting = await outcomeOf(cara.client.spectateMatch(waitingId));
        expect(spectateWaiting.ok).toBe(false);
        expect(rejectionCode(spectateWaiting.ok ? null : spectateWaiting.error)).toBe('match_not_joinable');

        // Joining an ALREADY-FILLED match: matchmaking auto-started it the
        // moment the last seat filled, but the facade's ledger row still
        // says 'waiting' until an event proves it dead — the stale-row
        // join reaches matchmaking, whose capacity check rejects with
        // match_full (mapped verbatim; FR-010's clean full rejection).
        const filled = stack.matchmaker.joinMatch({ matchId: waitingId, displayName: 'Filler' });
        expect(filled.ok).toBe(true);
        const joinFilled = await outcomeOf(cara.client.joinMatch(waitingId));
        expect(joinFilled.ok).toBe(false);
        expect(rejectionCode(joinFilled.ok ? null : joinFilled.error)).toBe('match_full');

        // Every rejection above left the connection healthy and actionable.
        expect(cara.client.state().connection).toBe('ready');
        const recovered = await cara.client.createMatch({
            playerCount: 2,
            boardSize: BOARD_SIZE,
            tickIntervalMs: TICK_MS,
        });
        expect(recovered).toBe('waiting');

        alice.client.disconnect();
        cara.client.disconnect();
    }, 45_000);

    test('reconnect within grace restores identity and handle; post-grace mints fresh and frees the handle', async () => {
        const stack = await bootLobbyStack({ graceMs: GRACE_MS });
        trackTeardown(stack);

        // -- Establish and capture the adopted (server-delivered) id -------
        const grace = await establishNamedClient(stack.url, 'Grace');
        const originalId = adoptedId(grace);
        const revisionBeforeDisconnect = grace.client.state().lastAppliedRevision;
        expect(revisionBeforeDisconnect).not.toBeNull();

        // -- Drop the transport; the registry starts the grace window ------
        grace.client.disconnect();
        await grace.client.connect(stack.url);
        expect(grace.client.state().connection).toBe('ready');
        // Same identity restored within grace: id unchanged, handle kept.
        expect(adoptedId(grace)).toBe(originalId);
        expect(grace.client.state().handle).toBe('Grace');
        // Revision continuity: the counter never reset across the drop.
        expect(grace.client.state().lastAppliedRevision).toBe(revisionBeforeDisconnect);

        // -- Post-grace: expiry frees the identity AND its handle ----------
        grace.client.disconnect();
        await delay(GRACE_MS + POST_GRACE_MARGIN_MS);

        // Another visitor claims the freed handle while the original is
        // still away (handle availability edge case).
        const successorName = await establishNamedClient(stack.url, 'Grace');
        expect(successorName.client.state().handle).toBe('Grace');

        await grace.client.connect(stack.url);
        expect(grace.client.state().connection).toBe('ready');
        // Fresh identity minted; the client adopts the successor id…
        const freshId = adoptedId(grace);
        expect(freshId).not.toBe(originalId);
        // …and starts unnamed (the expired record — handle included — is gone).
        expect(grace.client.state().handle).toBeNull();

        grace.client.disconnect();
        successorName.client.disconnect();
    }, 60_000);

    test('a server restart delivers a successor id the client adopts and re-adopts low revisions', async () => {
        const stack = await bootLobbyStack();
        trackTeardown(stack);

        // Named through the bootstrap claim flow; its persisted claim is
        // what faces the wiped registry after the restart below.
        const phoenix = await establishNamedClient(stack.url, 'Phoenix');
        const originalId = adoptedId(phoenix);

        // Push the pre-restart revision baseline up (create ⇒ publish).
        await phoenix.client.createMatch({ playerCount: 2, boardSize: BOARD_SIZE, tickIntervalMs: TICK_MS });
        const revisionBeforeRestart = phoenix.client.state().lastAppliedRevision;
        expect(revisionBeforeRestart).not.toBeNull();
        expect(revisionBeforeRestart ?? 0).toBeGreaterThanOrEqual(2);

        // -- Kill the whole stack (in-memory lobby state dies with it) -----
        // NOTE: the client disconnects FIRST as scenario hygiene only.
        // Since 7c3e8cd the server's close() drains ALL tracked
        // connections with a 1001 'going away' frame — lobby-only sockets
        // included — so this ordering is no longer load-bearing for
        // detecting the outage; networking's server-close.test.ts pins
        // that drain behavior directly. A real browser reaches the same
        // state through its own failure handling; the semantics under
        // test here are the persisted claim versus a wiped registry.
        phoenix.client.disconnect();
        await stack.server.close();
        await new Promise<void>((resolve) => {
            stack.httpServer.close(() => resolve());
        });
        await stack.matchmaker.close();

        // -- Reboot on the SAME port; the reload flow re-establishes ------
        const rebooted = await bootLobbyStack({}, stack.port);
        trackTeardown(rebooted);

        await phoenix.client.connect(stack.url);
        await pollUntilTrue(
            () => phoenix.client.state().connection === 'ready',
            'client re-establishes against the restarted server',
        );

        // R-009 adoption: the restarted registry could not honor the old
        // claim, minted a fresh identity, and the DIRECTED identity event
        // delivered its id — which the client adopted and re-persisted.
        const successorId = adoptedId(phoenix);
        expect(successorId).not.toBe(originalId);
        // The restarted server holds no handle for the fresh identity.
        expect(phoenix.client.state().handle).toBeNull();

        // T-012 baseline re-adoption: the restarted server's LOW revision
        // was APPLIED (a client that kept its old baseline would discard
        // every post-restart snapshot as stale and starve forever).
        const postRestartRevision = phoenix.client.state().lastAppliedRevision;
        expect(postRestartRevision).not.toBeNull();
        expect(postRestartRevision ?? Number.POSITIVE_INFINITY).toBeLessThan(revisionBeforeRestart ?? 0);
        expect(phoenix.client.state().snapshot?.entries.length).toBe(0);

        // Liveness after adoption: a freshly named visitor acts end-to-end
        // on the rebooted server, and the revision bumps from its match
        // flow through phoenix's re-adopted baseline.
        const regrown = await establishNamedClient(stack.url, 'PhoenixII');
        const createdAfterRestart = await regrown.client.createMatch({
            playerCount: 2,
            boardSize: BOARD_SIZE,
            tickIntervalMs: TICK_MS,
        });
        expect(createdAfterRestart).toBe('waiting');
        await pollUntilTrue(
            () => (phoenix.client.state().lastAppliedRevision ?? 0) > (postRestartRevision ?? 0),
            'post-restart revisions advance past the re-adopted baseline',
        );

        regrown.client.disconnect();
        phoenix.client.disconnect();
    }, 60_000);

    test('spectators receive ticks but zero order traffic, cannot submit orders, and lobby sockets stay pure', async () => {
        const stack = await bootLobbyStack();
        trackTeardown(stack);

        const alice = await establishNamedClient(stack.url, 'Alice');
        const bob = await establishNamedClient(stack.url, 'Bob');
        await alice.client.createMatch({ playerCount: 2, boardSize: BOARD_SIZE, tickIntervalMs: TICK_MS });
        const matchId = await pollUntil(
            () => alice.client.state().snapshot?.entries[0]?.matchId ?? null,
            'waiting row exists',
        );
        expect(await bob.client.joinMatch(matchId)).toBe('match');

        // -- Both seats attach through the real match path -----------------
        const playerA = await attachMatchClient(stack.url, matchId, 'player', 'Alice');
        const playerB = await attachMatchClient(stack.url, matchId, 'player', 'Bob');
        const seatA = playerA.client.state().playerId;
        const seatB = playerB.client.state().playerId;
        if (seatA === null || seatB === null) {
            throw new Error('seats were not assigned to attached players');
        }
        expect(new Set([seatA, seatB])).toEqual(new Set([1, 2]));

        // -- Spectator attaches through the lobby + read-only path --------
        const cara = await establishNamedClient(stack.url, 'Cara');
        expect(await cara.client.spectateMatch(matchId)).toBe('match');
        const spectatorKinds: string[] = [];
        const spectator = createWsMatchClient({});
        spectator.onMessage((envelope) => {
            spectatorKinds.push(envelope.type);
        });
        await spectator.connect(stack.url);
        await spectator.joinMatch({ matchId, role: 'spectator', displayName: 'Cara' });

        // -- Players order; acks come back to THEM -------------------------
        await pollUntilTrue(() => playerA.views.length >= 2, 'player A receives views');
        await pollUntilTrue(() => playerB.views.length >= 2, 'player B receives views');
        const ackA = await playerA.client.sendOrder(reservesOrder(seatA, ownCity(latestView(playerA), seatA)));
        const ackB = await playerB.client.sendOrder(reservesOrder(seatB, ownCity(latestView(playerB), seatB)));
        expect(ackA.ok).toBe(true);
        expect(ackB.ok).toBe(true);

        // -- Zero order/gameplay-order frames reach the spectator ----------
        await pollUntilTrue(
            () => spectatorKinds.filter((kind) => kind === 'tick').length >= 3,
            'spectator keeps receiving tick broadcasts',
        );
        expect(spectatorKinds.filter((kind) => kind === 'orderAck').length).toBe(0);
        expect(spectatorKinds.filter((kind) => kind === 'order').length).toBe(0);
        expect(spectatorKinds.filter((kind) => kind === 'error').length).toBe(0);

        // Fog contrast: players see filtered views, the spectator all.
        expect(latestView(playerA).visibleCells.length).toBeLessThan(BOARD_SIZE * BOARD_SIZE);
        expect(latestView(playerB).visibleCells.length).toBeLessThan(BOARD_SIZE * BOARD_SIZE);

        // -- Raw-seat probe: the spectator order gate is enforced ----------
        const probe = new RawSeat(stack.url);
        await probe.open();
        probe.send('hello', { protocolVersion: NETWORK_API_VERSION });
        await probe.next((frame) => frame.type === 'helloAck', 'helloAck');
        probe.send('joinMatch', { matchId, role: 'spectator', displayName: 'Probe' });
        await probe.next((frame) => frame.type === 'joinAck', 'spectator joinAck');
        probe.send('order', {
            order: reservesOrder(1, { x: 0, y: 0 }),
        });
        const rejection = await probe.next((frame) => frame.type === 'error', 'spectator_readonly rejection');
        expect((rejection.payload as { code: string }).code).toBe('spectator_readonly');
        probe.socket.close();

        // -- Transport purity: LOBBY sockets never carried gameplay frames -
        for (const lobby of [alice, bob, cara]) {
            const kinds = lobby.socket()?.inboundKinds ?? [];
            expect(kinds.length).toBeGreaterThan(0);
            for (const kind of kinds) {
                expect(LOBBY_SOCKET_KINDS.has(kind)).toBe(true);
            }
            expect(kinds.includes('tick')).toBe(false);
            expect(kinds.includes('orderAck')).toBe(false);
        }

        spectator.disconnect();
        playerA.client.disconnect();
        playerB.client.disconnect();
        cara.client.disconnect();
        bob.client.disconnect();
        alice.client.disconnect();
    }, 60_000);

    test('privacy: a bystander wire stream carries no other identity id or handle', async () => {
        const stack = await bootLobbyStack();
        trackTeardown(stack);

        const alice = await establishNamedClient(stack.url, 'Alice');
        const bob = await establishNamedClient(stack.url, 'Bob');
        const diana = await establishNamedClient(stack.url, 'Diana');

        // Drive identity-bearing activity while the bystander watches.
        await alice.client.createMatch({ playerCount: 2, boardSize: BOARD_SIZE, tickIntervalMs: TICK_MS });
        const matchId = await pollUntil(
            () => alice.client.state().snapshot?.entries[0]?.matchId ?? null,
            'waiting row exists',
        );
        expect(await bob.client.joinMatch(matchId)).toBe('match');
        await pollUntilTrue(
            () => entryOf(diana, matchId)?.status === 'in_progress',
            'bystander observed the started match',
        );
        await delay(PRIVACY_SETTLE_MS);

        // Freeze the captures and scan the RAW bytes.
        const aliceStream = alice.socket()?.inboundText.join('\n') ?? '';
        const bobStream = bob.socket()?.inboundText.join('\n') ?? '';
        const dianaStream = diana.socket()?.inboundText.join('\n') ?? '';
        const aliceId = adoptedId(alice);
        const bobId = adoptedId(bob);
        const dianaId = adoptedId(diana);

        // No identity's opaque guest id reaches another connection…
        expect(aliceStream.includes(bobId)).toBe(false);
        expect(aliceStream.includes(dianaId)).toBe(false);
        expect(bobStream.includes(aliceId)).toBe(false);
        expect(bobStream.includes(dianaId)).toBe(false);
        expect(dianaStream.includes(aliceId)).toBe(false);
        expect(dianaStream.includes(bobId)).toBe(false);
        // …and participant handles never ride the lobby projection either.
        expect(dianaStream.includes('Alice')).toBe(false);
        expect(dianaStream.includes('Bob')).toBe(false);

        // Positive controls: each stream DID carry its owner's id (the
        // sanctioned v1.6 directed-identity channel), proving the scan
        // would have caught a leak.
        expect(aliceStream.includes(aliceId)).toBe(true);
        expect(bobStream.includes(bobId)).toBe(true);
        expect(dianaStream.includes(dianaId)).toBe(true);

        alice.client.disconnect();
        bob.client.disconnect();
        diana.client.disconnect();
    }, 60_000);

    // -------------------------------------------------------------------------
    // Rename settlement regression (defect found by this suite; see the
    // module header)
    // -------------------------------------------------------------------------
    //
    // Formerly a `test.fails` pin: while the two-phase settlement bug
    // existed, this scenario passed INVERTED (setHandle rejecting with
    // LobbyTimeoutError) and started failing the moment either side was
    // reconciled — forcing this flip into a positive end-to-end proof.
    test('a real round-trip rename settles on the directed identity event alone', async () => {
        const stack = await bootLobbyStack();
        trackTeardown(stack);

        const storage = new MemoryClaimStorage();
        const client = createWsLobbyClient({
            storage,
            webSocketFactory: (socketUrl: string) => new TapSocket(socketUrl),
            actionTimeoutMs: 750,
        });
        trackCloser(() => {
            client.disconnect();
        });
        await client.connect(stack.url);

        // Wire-verified: the dispatcher confirms a rename with the
        // directed identity event ALONE (no `actionAccepted` follows —
        // the closed transition union has no arm for data-only updates).
        // The client must resolve on exactly that event.
        await expect(client.setHandle('Pinned')).resolves.toEqual({ handle: 'Pinned', hasIdentity: true });
        expect(client.state().connection).toBe('ready');
        expect(client.state().handle).toBe('Pinned');

        // A true RENAME (second round trip on an already-named identity)
        // settles the same way…
        await expect(client.setHandle('Renamed')).resolves.toEqual({ handle: 'Renamed', hasIdentity: true });
        expect(client.state().handle).toBe('Renamed');

        // …and the accepted handle persisted for reload-restore.
        expect(storage.current()?.handle).toBe('Renamed');
    }, 30_000);
});
