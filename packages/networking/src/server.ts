/**
 * Match Server Factory — Feature 004 US1 (T031)
 *
 * Wires the authoritative real-time match channel end-to-end:
 *
 *   - one `Map<MatchId, MatchChannel>` of live matches (FR-003),
 *   - a `StatsCounter` for `/health` + soak instrumentation (SC-005),
 *   - a `createTickClock` scheduler driving every channel's per-tick
 *     pipeline: drain orders → ack → `advance()` → record tick →
 *     fog-filtered broadcast with skip-send deltas → terminal check
 *     (FR-005, FR-006, FR-008, FR-010),
 *   - a `ws` `WebSocketServer` (`perMessageDeflate: false` per
 *     plan.md "Risk & Open Questions" §"Zlib memory fragmentation";
 *     `noServer: true`, bound to a per-instance `http.Server` so
 *     tests can `listen({ port: 0 })`),
 *   - `MatchmakerBridge` callback dispatch (onSeatClaimed on join —
 *     players and spectators alike, spectators carrying
 *     `playerId: null` per US3 —, onSeatDisconnected + registry
 *     registration on ws close, onSeatReconnected on grace-window
 *     reclaim, onSeatExpired on the scheduler's grace sweep,
 *     onMatchTerminal on engine terminal),
 *   - the US3 spectator path (`enableSpectators` /
 *     `disableSpectators` gate; role-dispatched `joinMatch` via
 *     `attachSpectator`; full-board tick views through fog's
 *     `{ spectator: true }` branch; read-only orders enforced in
 *     `orders.ts`),
 *   - the feature-010 lobby dispatcher (T-010): the additive
 *     `lobby*` message family routes to an optionally injected
 *     {@link LobbyServiceSource} facade — identity, handle,
 *     subscribe, create, join, spectate, leave — with per-connection
 *     lobby rate limiting, actionId-correlated replies, directed
 *     event delivery through THE one projection sink, and
 *     `connectionClosed` teardown on every close path. Heartbeat,
 *     reconnect, spectator, and gameplay behavior are untouched;
 *     without `deps.lobby` the lobby family answers gracefully and
 *     nothing else changes.
 *
 * The public surface matches the contract's `Server` interface
 * (`contracts/network-api.ts`) exactly, plus an `__injectSocketForTest`
 * seam so integration tests can drive the full pipeline over
 * MockWebSockets without opening TCP ports.
 *
 * **Wall-clock policy** (constitution Principle II): the tick pipeline
 * uses ONLY the scheduler-provided `nowMs`. Direct clock reads appear
 * solely at socket-event boundaries (connection open / inbound frame /
 * close) to stamp transport metadata — heartbeat timestamps and rate-
 * bucket refills — which never enter simulation state. This mirrors
 * the audited-boundary precedent set by `ids.ts`'s CSPRNG use.
 */

import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';

import { APP_VERSION } from '@europa/version';
import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';

import { buildTickBroadcast, sendTickBroadcast } from './broadcast';
import { createTickClock } from './clock';
import { Connection, type ConnectionSocket, type MutableRateBucket } from './connection';
import { NETWORK_API_VERSION, NETWORK_CONSTANTS, NETWORK_TRANSPORT_CONSTANTS } from './constants';
import type {
    AttachPlayerRequest,
    DetachRequest,
    LobbyFailure,
    LobbyServiceFacade,
    RegisterMatchRequest,
    Server,
    ServerConfig,
    ServerDeps,
    ServerStats,
} from './contracts/network-api';
import type {
    ConnectionId,
    GuestIdentityClaim,
    HelloAckPayload,
    HelloPayload,
    JoinAckPayload,
    JoinMatchPayload,
    LobbyActionId,
    LobbyCreatePayload,
    LobbyEvent,
    LobbyEventPayload,
    LobbyIdentityPayload,
    LobbyJoinPayload,
    LobbyLeavePayload,
    LobbySetHandlePayload,
    LobbySnapshot,
    LobbySpectatePayload,
    LobbySubscribePayload,
    MatchId,
    MessageKind,
    NetworkPayload,
    Order,
    OrderAckPayload,
    OrderSubmissionPayload,
    PingPayload,
    PlayerId,
    ProtocolEnvelope,
    SequenceNumber,
    SessionToken,
    SnapshotPayload,
    TerminalPayload,
} from './contracts/network-types';
import { generateSessionToken } from './ids';
import { MatchChannel } from './match-channel';
import { acceptOrder, applyOrdersAtTickBoundary } from './orders';
import { type ReconnectBinding, ReconnectRegistry } from './reconnect';
import { ResyncBuffer } from './resync';
import { attachSpectator, detachSpectator, SPECTATOR_VIEW_SEAT } from './spectator';
import { StatsCounter } from './stats';
import { validateVersion } from './validate';

// ----------------------------------------------------------------------------
// Socket adapter (real ws.WebSocket → ConnectionSocket seam)
// ----------------------------------------------------------------------------

/**
 * Adapt a production `ws` WebSocket to the narrow {@link ConnectionSocket}
 * seam. Text frames are forwarded as strings; binary frames are ignored
 * (the protocol is JSON-text only, FR-001).
 */
class WsSocketAdapter implements ConnectionSocket {
    private readonly socket: WsWebSocket;

    /**
     * @param socket The live `ws` socket from the upgrade handler.
     */
    constructor(socket: WsWebSocket) {
        this.socket = socket;
    }

    /** Send one text frame. */
    send(data: string): void {
        this.socket.send(data);
    }

    /** Close with code + reason. */
    close(code?: number, reason?: string): void {
        this.socket.close(code ?? NETWORK_TRANSPORT_CONSTANTS.normalCloseCode, reason ?? '');
    }

    /** Subscribe to text frames / transport close (ws semantics). */
    on(event: 'message', handler: (data: string) => void): unknown;
    on(event: 'close', handler: (code: number, reason: string) => void): unknown;
    on(event: 'error', handler: (error: Error) => void): unknown;
    on(
        event: 'message' | 'close' | 'error',
        handler: ((data: string) => void) | ((code: number, reason: string) => void) | ((error: Error) => void),
    ): unknown {
        if (event === 'message') {
            // Safe: the overload contract guarantees a message handler here.
            const onMessage = handler as (data: string) => void;
            this.socket.on('message', (data, isBinary) => {
                if (!isBinary) {
                    onMessage(data.toString());
                }
            });
        } else if (event === 'close') {
            // Safe: the overload contract guarantees a close handler here.
            const onClose = handler as (code: number, reason: string) => void;
            this.socket.on('close', (code) => {
                onClose(code, '');
            });
        } else {
            // Safe: the overload contract guarantees an error handler here.
            const onError = handler as (error: Error) => void;
            this.socket.on('error', onError);
        }
        return this.socket;
    }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * Build an outbound server envelope with the placeholder seq (server
 * envelopes are request-scoped; per-client ordering lives in the
 * payload, e.g. `orderAck.seq` echoes the client's submitted seq).
 *
 * @param type    Wire message kind.
 * @param payload One of the protocol payloads.
 * @returns A ready-to-stamp envelope.
 */
function envelopeOf(type: MessageKind, payload: NetworkPayload): ProtocolEnvelope<NetworkPayload> {
    return { type, version: NETWORK_API_VERSION, seq: 0 as SequenceNumber, payload };
}

/**
 * The client→server message kinds, used by the dispatcher's default
 * arm for DIRECTION-AWARE diagnostics (feature 010 Wave-2 audit item
 * 9, fixing review defect F-4): a client→server kind that reaches the
 * default arm is an unrouted inbound request and gets a diagnostic
 * that says so; a server→client kind keeps the historical "is a
 * server-to-client message" wording. Every kind listed here has its
 * own dispatch arm, so hitting the default with one of these means a
 * routing gap — the message text makes that diagnosable instead of
 * gaslighting the client about frame direction.
 */
const CLIENT_TO_SERVER_KINDS: ReadonlySet<MessageKind> = new Set<MessageKind>([
    'hello',
    'joinMatch',
    'order',
    'ping',
    'lobbyIdentity',
    'lobbySetHandle',
    'lobbySubscribe',
    'lobbyCreate',
    'lobbyJoin',
    'lobbySpectate',
    'lobbyLeave',
]);

// ----------------------------------------------------------------------------
// createMatchServer
// ----------------------------------------------------------------------------

/**
 * Construct the match server. Does NOT start listening or ticking —
 * call {@link Server.listen} afterwards.
 *
 * @param config Server-wide configuration (`NETWORK_DEFAULT_CONFIG`
 *               spread + overrides).
 * @param deps   Injected engine/fog/matchmaker/logger dependencies.
 * @returns A `Server` matching the contract surface.
 */
export function createMatchServer(
    config: ServerConfig,
    deps: ServerDeps,
): Server & {
    /** Test seam: attach a mock socket without opening a port. @internal */
    readonly __injectSocketForTest: (socket: ConnectionSocket) => Connection;
    /**
     * Test seam: the actual bound TCP port after {@link Server.listen}
     * (undefined before listen / after close). Lets integration tests
     * drive REAL sockets against the ephemeral port. @internal
     */
    readonly __boundPortForTest: () => number | undefined;
} {
    const channels = new Map<MatchId, MatchChannel>();
    const connections = new Map<ConnectionId, Connection>();
    let closed = false;
    let listening = false;
    let httpServer: HttpServer | undefined;

    const statsCounter = new StatsCounter(Date.now());

    // US2 reconnect machinery: one token→binding registry per server
    // (tokens are globally unique), and per-channel/per-seat replay
    // buffers. Buffers are keyed by SEAT, not connection: a seat
    // survives disconnects, so its buffer keeps recording while no
    // connection is attached and the reconnecting client sees exactly
    // the stream its seat produced (fog views are seat-specific —
    // sharing one ring across seats would leak another player's view,
    // violating FR-005 / SC-004).
    const reconnectRegistry = new ReconnectRegistry(config.reconnectGraceMs);
    const resyncBuffers = new Map<MatchId, Map<PlayerId, ResyncBuffer>>();

    /**
     * Get-or-create the resync buffer for one seat.
     *
     * @param matchId  Owning match channel.
     * @param playerId Seat whose boundary views are retained.
     * @returns The seat's ring buffer.
     */
    function seatBuffer(matchId: MatchId, playerId: PlayerId): ResyncBuffer {
        let perChannel = resyncBuffers.get(matchId);
        if (!perChannel) {
            perChannel = new Map<PlayerId, ResyncBuffer>();
            resyncBuffers.set(matchId, perChannel);
        }
        let buffer = perChannel.get(playerId);
        if (!buffer) {
            buffer = new ResyncBuffer();
            perChannel.set(playerId, buffer);
        }
        return buffer;
    }

    // ------------------------------------------------------------------
    // Live gauges for stats snapshots
    // ------------------------------------------------------------------

    /**
     * Count live seats + spectators across all channels.
     *
     * @returns Active match and connection counts.
     */
    function liveCounts(): { activeMatches: number; activeConnections: number } {
        let activeConnections = 0;
        for (const channel of channels.values()) {
            for (const seat of channel.seats.values()) {
                if (seat.connection) {
                    activeConnections += 1;
                }
            }
            activeConnections += channel.spectators.size;
        }
        return { activeMatches: channels.size, activeConnections };
    }

    // ------------------------------------------------------------------
    // Tick pipeline (scheduler-owned; nowMs comes from the clock)
    // ------------------------------------------------------------------

    /**
     * One scheduler fire: run every non-terminal channel through
     * orders → advance → broadcast → terminal check, then sweep
     * heartbeats and reconnect-binding grace windows. Duration
     * measurement is the only direct clock read.
     *
     * Bound directly as the clock's `onTick`, so the parameter order
     * must match `createTickClock`'s `(tickNumber, nowMs)` callback
     * signature — the epoch timestamp is the SECOND argument. (US2 fix:
     * binding a single-`(nowMs)` function here silently received the
     * tick number instead, which made every `Date.now()`-stamped value
     * compared against it — reconnect grace expiry — unreachably stale.
     * The heartbeat sweep never noticed because both sides of that
     * comparison shared the same misbound domain.)
     *
     * @param _tickNumber Scheduler fire count (unused here).
     * @param nowMs Scheduler-provided epoch ms (from the clock).
     */
    function runTickPipeline(_tickNumber: number, nowMs: number): void {
        const startedAtMs = Date.now(); // duration measurement only

        for (const channel of channels.values()) {
            if (channel.terminalSent) {
                continue;
            }

            // 1. Drain pending orders through the engine; ack each outcome.
            const outcomes = applyOrdersAtTickBoundary(channel);
            for (const outcome of outcomes) {
                const connection = channel.seats.get(outcome.playerId)?.connection;
                if (!connection) {
                    continue;
                }
                const payload: OrderAckPayload = {
                    seq: outcome.submittedAtSeq as SequenceNumber,
                    result: outcome.result,
                };
                connection.send(envelopeOf('orderAck', payload), nowMs);
                statsCounter.recordFrameSent('orderAck');
            }

            // 2. Advance the simulation one boundary.
            channel.engineSession.advance();
            channel.recordTick();

            // 3. Fog-filtered broadcast with skip-send deltas.
            const liveConnections = channel.connections();
            const broadcast = buildTickBroadcast(channel, { fog: deps.fog }, nowMs);
            const sentCount = sendTickBroadcast(channel, liveConnections, broadcast, nowMs);
            for (let i = 0; i < sentCount; i++) {
                statsCounter.recordFrameSent('tick');
            }

            // 3.5 Retain each seat's boundary view for reconnect resync
            // (US2 AC-1). Seats without a live connection keep recording —
            // their buffer must bridge the absence window on reconnect.
            // Skipped connections (byte-identical view) recompute the same
            // content so their ring stays dense.
            const world = channel.engineSession.world();
            for (const playerId of [...channel.seats.keys()].sort((a, b) => a - b)) {
                const seat = channel.seats.get(playerId);
                if (!seat) {
                    continue;
                }
                const payload = seat.connection ? broadcast.get(seat.connection.id) : undefined;
                const view =
                    payload && payload !== 'skip'
                        ? payload.view
                        : deps.fog.computePlayerView({ world, playerId, spectator: false });
                seatBuffer(channel.matchId, playerId).push(channel.tickCounter, view);
            }

            // 4. Terminal check (cheap post-tick status read).
            const terminal = channel.engineSession.status();
            if (terminal && !channel.terminalSent) {
                channel.terminalSent = true;
                const payload: TerminalPayload = { result: terminal };
                for (const connection of liveConnections) {
                    connection.send(envelopeOf('terminal', payload), nowMs);
                    connection.markTerminal();
                    statsCounter.recordFrameSent('terminal');
                }
                deps.matchmaker.onMatchTerminal?.({
                    matchId: channel.matchId,
                    result: terminal,
                    tick: channel.tickCounter,
                });
                // No reconnect after terminal: drop the retained replay.
                for (const buffer of resyncBuffers.get(channel.matchId)?.values() ?? []) {
                    buffer.clear();
                }
            }
        }

        // Heartbeat + staleness sweep (FR-002 / FR-009 first clause).
        // Runs over EVERY tracked connection — not just channel members —
        // so unjoined sockets cannot leak either. `sweep` advances
        // `lastSeenAtMs` for connections that received frames since the
        // previous fire; a client silent past the idle timeout is then
        // force-closed through the same lifecycle path as a transport
        // loss, which is what engages disconnect → grace-expiry wiring
        // (a half-open TCP death would otherwise hold a seat until
        // restart). The timeout honors ServerConfig.wsIdleTimeoutMs
        // (default NETWORK_CONSTANTS.defaultWsIdleTimeoutMs = 2 ×
        // heartbeatIntervalMs). Deleting from `connections` during
        // iteration is safe: Map iteration tolerates concurrent deletes,
        // and closeIdleTimeout is idempotent.
        for (const connection of connections.values()) {
            connection.sweep(nowMs);
            if (nowMs - connection.lastSeenAtMs >= config.wsIdleTimeoutMs) {
                connection.closeIdleTimeout();
            }
        }

        // Grace sweep (US2 AC-2): expire lapsed reconnect bindings, fire
        // onSeatExpired per binding (matchmaking applies its forfeit
        // policy), and detach the seat per the disconnect policy. Runs
        // outside the channel loop so expiry is enforced even when every
        // channel is already terminal.
        for (const expired of reconnectRegistry.expireOld(nowMs)) {
            const expiredChannel = channels.get(expired.matchId);
            if (expiredChannel) {
                expiredChannel.detachSeat(expired.playerId);
                resyncBuffers.get(expired.matchId)?.get(expired.playerId)?.clear();
            }
            deps.matchmaker.onSeatExpired?.({
                matchId: expired.matchId,
                sessionToken: expired.sessionToken,
                playerId: expired.playerId,
            });
        }

        statsCounter.recordTick(Date.now() - startedAtMs);
    }

    const clock = createTickClock(config.tickRateMs, runTickPipeline);

    // ------------------------------------------------------------------
    // Feature 010 lobby composition + dispatch
    // ------------------------------------------------------------------

    /**
     * The memoized lobby facade built from `deps.lobby` (undefined →
     * null forever: no lobby wired). The factory runs LAZILY at the
     * first lobby frame so hosts can forward-reference their
     * matchmaker (see `ServerDeps.lobby` for the recipe); by then the
     * host wiring is complete and no facade lifecycle event can be
     * missed. A factory that throws is logged and retried on the next
     * frame — a transient host boot bug must not poison the server.
     */
    let lobbyInstance: LobbyServiceFacade | null = null;

    /**
     * Per-connection lobby rate-limit buckets (Wave-2 audit item 7).
     * Deliberately SEPARATE from the order bucket on {@link Connection}
     * so a lobby flood can never starve gameplay orders and vice
     * versa; same token-bucket math, refilled lazily per check.
     */
    const lobbyBuckets = new Map<ConnectionId, MutableRateBucket>();

    /**
     * Dispatch-local snapshot peek (single-projection discipline,
     * audit item 2): while a mutating facade call runs, the sink
     * records any snapshot event it delivers to the ACTING connection.
     * Facade methods are synchronous and dispatch is single-threaded,
     * so this state is dead again by the time the handler reads it —
     * no persistent dispatcher-side projection state exists. Held as
     * an object (not bare lets) so cross-closure writes stay visible
     * without control-flow narrowing lies.
     */
    const peek = {
        /** Connection whose snapshot deliveries are being observed. */
        connectionId: null as ConnectionId | null,
        /** Latest snapshot delivered to that connection, if any. */
        snapshot: null as LobbySnapshot | null,
    };

    /**
     * Read the peeked post-action status of one match row, if the
     * acting connection's snapshot stream carried it.
     *
     * @param matchId The acted-on match.
     * @returns The row's status, or undefined when nothing was peeked.
     */
    function peekedRowStatus(matchId: MatchId): import('./contracts/network-types').LobbyStatus | undefined {
        const snapshot: LobbySnapshot | null = peek.snapshot;
        if (snapshot === null) {
            return undefined;
        }
        return snapshot.entries.find((entry) => entry.matchId === matchId)?.status;
    }

    /**
     * Resolve the lobby facade, invoking (and memoizing) the injected
     * factory on first use. Returns null when no source is configured
     * or the factory throws (logged; retried next frame).
     *
     * @returns The live facade, or null when lobby is unavailable.
     */
    function lobbyFacadeOrNull(): LobbyServiceFacade | null {
        const source = deps.lobby;
        if (source === undefined) {
            return null;
        }
        if (lobbyInstance !== null) {
            return lobbyInstance;
        }
        try {
            lobbyInstance = source.create({ deliver: deliverLobbyEvent });
        } catch (error) {
            deps.logger.warn('lobby service factory threw; lobby unavailable', { error: String(error) });
            return null;
        }
        return lobbyInstance;
    }

    /**
     * THE projection sink handed to the lobby facade: frames one
     * facade-produced event to one connection. Audience decisions are
     * entirely the facade's — directed identity/action events reach
     * their connection regardless of lobby subscription (audit item
     * 8); snapshot broadcasts reach only subscribers because only they
     * are addressed. Unknown/closed ids are dropped silently.
     *
     * @param connectionId Recipient transport connection.
     * @param event        Facade-produced event (sent verbatim).
     */
    function deliverLobbyEvent(connectionId: ConnectionId, event: LobbyEvent): void {
        if (peek.connectionId !== null && connectionId === peek.connectionId && event.kind === 'snapshot') {
            peek.snapshot = event.snapshot;
        }
        const target = connections.get(connectionId);
        if (target === undefined) {
            return;
        }
        target.send(envelopeOf('lobbyEvent', { event }));
        statsCounter.recordFrameSent('lobbyEvent');
    }

    /**
     * Frame one facade-produced event to one connection directly (the
     * dispatcher half of the projection path — used for facade RETURN
     * values the facade does not push itself, e.g. subscribe's
     * baseline snapshot). Never synthesizes content: the event object
     * originates from the facade verbatim.
     *
     * @param connection Recipient.
     * @param event      Facade-produced event.
     */
    function sendLobbyEvent(connection: Connection, event: LobbyEvent): void {
        connection.send(envelopeOf('lobbyEvent', { event }));
        statsCounter.recordFrameSent('lobbyEvent');
    }

    /**
     * Build the actionId-correlated error event for a failed lobby
     * action (audit item 6: the correlation id is echoed ONLY here —
     * on the response to the request that carried it — never broadcast
     * or persisted). `detail` passes through verbatim when present.
     *
     * @param actionId The requesting frame's correlation id.
     * @param failure  The facade's mapped failure.
     * @returns The wire payload for a `lobbyEvent` frame.
     */
    function lobbyErrorPayload(actionId: LobbyActionId, failure: LobbyFailure): LobbyEventPayload {
        const base: LobbyEvent = {
            kind: 'error',
            actionId,
            code: failure.code,
            message: failure.message,
        };
        // exactOptionalPropertyTypes: attach detail only when present.
        const event: LobbyEvent = failure.detail === undefined ? base : { ...base, detail: failure.detail };
        return { event };
    }

    /**
     * Lazy refill + consume on the connection's dedicated lobby bucket
     * (same token-bucket math as `Connection.takeToken`; duplicated
     * here because that method is bound to the orders bucket and this
     * file owns the lobby bucket). First lobby message allocates.
     *
     * @param connection Requesting connection.
     * @returns True when the message may proceed; false after sending
     *          the `'rate_limited'` rejection (connection stays open).
     */
    function allowLobbyMessage(connection: Connection): boolean {
        const nowMs = Date.now(); // socket-event boundary read (sanctioned)
        let bucket = lobbyBuckets.get(connection.id);
        if (bucket === undefined) {
            const capacity = Math.floor(
                NETWORK_CONSTANTS.defaultLobbyMessagesPerSecond * NETWORK_CONSTANTS.defaultRateLimitBurstFactor,
            );
            bucket = {
                capacity,
                refillPerSec: NETWORK_CONSTANTS.defaultLobbyMessagesPerSecond,
                tokens: capacity,
                lastRefillAtMs: nowMs,
            };
            lobbyBuckets.set(connection.id, bucket);
        }
        const elapsedSec = Math.max(
            0,
            (nowMs - bucket.lastRefillAtMs) / NETWORK_TRANSPORT_CONSTANTS.millisecondsPerSecond,
        );
        bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsedSec * bucket.refillPerSec);
        bucket.lastRefillAtMs = nowMs;
        if (bucket.tokens < 1) {
            // Secrecy note (audit item 5): the rejection names no kind,
            // handle, or claim content — just the policy violation.
            connection.sendError('rate_limited', 'lobby message rate limit exceeded');
            return false;
        }
        bucket.tokens -= 1;
        return true;
    }

    /**
     * Run one lobby handler against the facade with uniform guard
     * rails: unavailable lobby → polite transport-level error; thrown
     * facade errors (invariant breaches, closed facade) → logged +
     * `internal_error`, connection stays open. Payload contents are
     * NEVER included in messages or logs (audit item 5: the identity
     * claim carries the bearer-secret guest id).
     *
     * @param connection Requesting connection.
     * @param handler    Synchronous facade call + reply logic.
     */
    function withLobbyFacade(connection: Connection, handler: (facade: LobbyServiceFacade) => void): void {
        const facade = lobbyFacadeOrNull();
        if (facade === null) {
            connection.sendError('internal_error', 'no lobby service is available on this server');
            return;
        }
        try {
            handler(facade);
        } catch (error) {
            deps.logger.warn('lobby action threw', { connectionId: connection.id, error: String(error) });
            connection.sendError('internal_error', 'lobby action failed');
        }
    }

    /**
     * Handle `lobbyIdentity`: establish or restore the connection's
     * guest identity. No actionId exists on this payload — the
     * facade's DIRECTED `identity` event (pushed through the sink
     * regardless of subscription, audit item 8) IS the confirmation.
     * Establishment cannot fail recoverably (stale/forged claims
     * silently mint a fresh identity), so there is no error arm.
     *
     * @param connection Requesting connection.
     * @param payload    Advisory resume claim (input only — the server-
     *                   resolved opaque id is delivered back ONLY on this
     *                   connection's directed `identity` event, feature
     *                   010 Clarifications v1.6).
     */
    function handleLobbyIdentity(connection: Connection, payload: LobbyIdentityPayload): void {
        withLobbyFacade(connection, (facade) => {
            const claim: GuestIdentityClaim | undefined = payload.claim;
            facade.establishIdentity(claim, connection.id);
        });
    }

    /**
     * Handle `lobbySetHandle`: claim/rename the identity's public
     * handle. Success confirms via the facade's directed `identity`
     * event (no `actionAccepted` — the closed transition union has no
     * arm for data-only updates); failure replies with an `error`
     * event echoing the request's actionId plus code/message/detail.
     *
     * @param connection Requesting connection.
     * @param payload    Handle + correlation id.
     */
    function handleLobbySetHandle(connection: Connection, payload: LobbySetHandlePayload): void {
        withLobbyFacade(connection, (facade) => {
            const result = facade.setHandle(connection.id, payload.handle);
            if (!result.ok) {
                sendLobbyEvent(connection, lobbyErrorPayload(payload.actionId, result.error).event);
            }
        });
    }

    /**
     * Handle `lobbySubscribe`: opt into revision broadcasts. The
     * facade returns the baseline snapshot without pushing it — the
     * dispatcher frames THAT returned value verbatim as the directed
     * reply (a fresh client learns the current list even before any
     * mutation broadcasts).
     *
     * @param connection Requesting connection.
     * @param payload    Correlation id.
     */
    function handleLobbySubscribe(connection: Connection, payload: LobbySubscribePayload): void {
        withLobbyFacade(connection, (facade) => {
            const result = facade.subscribe(connection.id);
            if (!result.ok) {
                sendLobbyEvent(connection, lobbyErrorPayload(payload.actionId, result.error).event);
                return;
            }
            sendLobbyEvent(connection, { kind: 'snapshot', snapshot: result.data });
        });
    }

    /**
     * Handle `lobbyCreate`: create a public match, creator's seat
     * reserved. Success always leaves the creator in a filling match
     * (auto-start needs ≥2 seats), so the transition hint is constant
     * `'waiting'`.
     *
     * @param connection Requesting connection.
     * @param payload    Optional settings presets + correlation id.
     */
    function handleLobbyCreate(connection: Connection, payload: LobbyCreatePayload): void {
        withLobbyFacade(connection, (facade) => {
            const settings = payload.settings;
            const result =
                settings === undefined ? facade.create(connection.id) : facade.create(connection.id, settings);
            if (!result.ok) {
                sendLobbyEvent(connection, lobbyErrorPayload(payload.actionId, result.error).event);
                return;
            }
            sendLobbyEvent(connection, { kind: 'actionAccepted', actionId: payload.actionId, transition: 'waiting' });
        });
    }

    /**
     * Handle `lobbyJoin`: join a listed waiting match. Atomic
     * matchmaking-side; losers get the mapped error. The transition
     * hint distinguishes auto-start (feature 006 starts deterministically
     * when the final seat fills): the peeked snapshot — delivered to
     * this connection by the facade DURING the join call, when
     * subscribed — shows the row's post-join status. Unsubscribed
     * actors (and rows absent from the peek) get `'waiting'`, which
     * stays truthful because such a client also misses the broadcast
     * that would have told it to enter live play.
     *
     * @param connection Requesting connection.
     * @param payload    Target match + correlation id.
     */
    function handleLobbyJoin(connection: Connection, payload: LobbyJoinPayload): void {
        withLobbyFacade(connection, (facade) => {
            peek.connectionId = connection.id;
            peek.snapshot = null;
            try {
                const result = facade.join(connection.id, payload.matchId);
                if (!result.ok) {
                    sendLobbyEvent(connection, lobbyErrorPayload(payload.actionId, result.error).event);
                    return;
                }
                sendLobbyEvent(connection, {
                    kind: 'actionAccepted',
                    actionId: payload.actionId,
                    transition: peekedRowStatus(result.data.matchId) === 'in_progress' ? 'match' : 'waiting',
                });
            } finally {
                peek.connectionId = null;
                peek.snapshot = null;
            }
        });
    }

    /**
     * Handle `lobbySpectate`: attach read-only to an in-progress
     * match through the existing spectator path (no seat, no token,
     * no order rights). Success hands the browser to the live
     * read-only view (`'match'`).
     *
     * @param connection Requesting connection.
     * @param payload    Target match + correlation id.
     */
    function handleLobbySpectate(connection: Connection, payload: LobbySpectatePayload): void {
        withLobbyFacade(connection, (facade) => {
            const result = facade.spectate(connection.id, payload.matchId);
            if (!result.ok) {
                sendLobbyEvent(connection, lobbyErrorPayload(payload.actionId, result.error).event);
                return;
            }
            sendLobbyEvent(connection, { kind: 'actionAccepted', actionId: payload.actionId, transition: 'match' });
        });
    }

    /**
     * Handle `lobbyLeave`: release the identity's match association
     * and return to the lobby. Mapping ruling (documented honestly):
     * the closed `transition` union has no "back to lobby" arm, so the
     * confirmation carries the neutral `'waiting'` value — clients
     * correlate by actionId and know a leave returns them to the
     * lobby view; the authoritative post-leave state arrives via the
     * next snapshot (activeMatchId null).
     *
     * @param connection Requesting connection.
     * @param payload    Correlation id.
     */
    function handleLobbyLeave(connection: Connection, payload: LobbyLeavePayload): void {
        withLobbyFacade(connection, (facade) => {
            const result = facade.leave(connection.id);
            if (!result.ok) {
                sendLobbyEvent(connection, lobbyErrorPayload(payload.actionId, result.error).event);
                return;
            }
            sendLobbyEvent(connection, { kind: 'actionAccepted', actionId: payload.actionId, transition: 'waiting' });
        });
    }

    // ------------------------------------------------------------------
    // Inbound protocol dispatch
    // ------------------------------------------------------------------

    /**
     * Send a joinAck carrying the fog-filtered snapshot of the current
     * world state.
     *
     * @param connection Newly joined connection.
     * @param channel    Target match channel.
     * @param playerId   Claimed seat (null for spectators).
     * @param spectator  Whether the view is spectator (unredacted).
     */
    function sendJoinAck(
        connection: Connection,
        channel: MatchChannel,
        playerId: PlayerId | null,
        spectator: boolean,
    ): void {
        const view = deps.fog.computePlayerView({
            world: channel.engineSession.world(),
            // Null seat (spectator) uses the out-of-domain sentinel, same as
            // buildTickBroadcast's fallback — never a fabricated real seat.
            playerId: playerId ?? SPECTATOR_VIEW_SEAT,
            spectator,
        });
        const payload: JoinAckPayload = {
            sessionToken: connection.sessionToken ?? generateSessionToken(),
            playerId,
            view,
            tick: channel.tickCounter,
            // Feature 010 FR-020/SC-008: registration-time authoritative
            // seat labels overlaid onto the engine roster (engine world
            // untouched — see MatchChannel.joinAckPlayers).
            players: channel.joinAckPlayers(),
        };
        connection.send(envelopeOf('joinAck', payload));
        statsCounter.recordFrameSent('joinAck');
    }

    /**
     * Handle `joinMatch`: resolve the requested seat (token > requested
     * seat > first open seat), bind it, ack with a fresh snapshot, and
     * notify matchmaking.
     *
     * @param connection Requesting connection (must be greeted).
     * @param payload    Client's join request.
     */
    function handleJoinMatch(connection: Connection, payload: JoinMatchPayload): void {
        const state = connection.state();
        if (state !== 'greeted') {
            connection.sendError(
                'protocol_sequence_error',
                `joinMatch requires a greeted connection (state: ${state})`,
            );
            return;
        }

        // Review N5: wire-level schema validation only checks that `role`
        // is a string — an out-of-union value would otherwise fall through
        // to the player path and silently claim a seat. Reject it like any
        // other malformed payload.
        if (payload.role !== 'player' && payload.role !== 'spectator') {
            connection.sendError(
                'malformed_payload',
                `joinMatch.role must be "player" or "spectator" (got "${String(payload.role)}")`,
            );
            return;
        }

        const channel = channels.get(payload.matchId);
        if (!channel) {
            connection.sendError('match_not_found', `unknown match ${payload.matchId}`);
            return;
        }

        if (payload.role === 'spectator') {
            // US3 late-join: gate-checked attach. Spectators bypass seat
            // allocation entirely — no seat scan, no capacity check, no
            // reconnect registry. `attachSpectator` binds the connection
            // (role flip + spectator map) and fires `onSeatClaimed` with
            // `playerId: null`; on rejection it has already sent the
            // `match_not_joinable` error frame.
            const attached = attachSpectator(channel, connection, deps, Date.now());
            if (!attached.ok) {
                return;
            }
            const ackPayload: JoinAckPayload = {
                sessionToken: attached.sessionToken,
                playerId: null,
                view: attached.snapshot.view,
                tick: attached.snapshot.tick,
                // Same overlay as the seated path (FR-023: spectator views
                // MAY expose all participant handles).
                players: channel.joinAckPlayers(),
            };
            connection.send(envelopeOf('joinAck', ackPayload));
            statsCounter.recordFrameSent('joinAck');
            return;
        }

        // Resolve the target seat: explicit token > requested seat > first open.
        let target: { playerId: PlayerId; token: SessionToken } | undefined;
        if (payload.reconnectToken !== undefined) {
            // US2 reconnect path: the registry is the source of truth for
            // seats whose connection dropped mid-match. Review S2: LOOKUP
            // first and validate BEFORE consuming — a join aimed at the
            // wrong match must not burn the binding (the corrected retry
            // must still resync with snapshot + replay).
            const nowMs = Date.now();
            const looked = reconnectRegistry.lookup(payload.reconnectToken, nowMs);
            if (looked !== null) {
                if ('expired' in looked) {
                    // Expired bindings are consumed too so stale entries never
                    // linger (mirrors the registry's own consume semantics).
                    reconnectRegistry.consume(payload.reconnectToken, nowMs);
                    connection.sendError('token_expired', 'reconnect grace window elapsed');
                    return;
                }
                if (looked.matchId !== payload.matchId) {
                    connection.sendError('token_mismatch', 'session token belongs to a different match');
                    return;
                }
                // Single-threaded dispatch: the binding validated above cannot
                // vanish between lookup and consume; the guard keeps the
                // narrowing honest for `restoreReconnectedSeat`.
                const consumed = reconnectRegistry.consume(payload.reconnectToken, nowMs);
                if (consumed === null || 'expired' in consumed) {
                    connection.sendError('internal_error', 'reconnect binding vanished mid-validation');
                    return;
                }
                restoreReconnectedSeat(connection, consumed);
                return;
            }
            // Unknown to the registry → fall through to the US1 seat scan
            // (covers tokens for seats that never disconnected, surfacing
            // `seat_taken` for a live holder rather than a bogus miss).
            for (const seat of channel.seats.values()) {
                if (seat.sessionToken === payload.reconnectToken) {
                    target = { playerId: seat.playerId, token: seat.sessionToken };
                    break;
                }
            }
            if (!target) {
                connection.sendError('token_invalid', 'no seat bound to that session token');
                return;
            }
        } else if (payload.requestedSeat !== undefined && payload.requestedSeat !== null) {
            // Contract types `requestedSeat` as a plain number (wire-friendly);
            // seat keys are branded PlayerIds over the same value domain.
            const seat = channel.seats.get(payload.requestedSeat as PlayerId);
            if (!seat) {
                connection.sendError('match_full', `seat ${String(payload.requestedSeat)} is not bound`);
                return;
            }
            target = { playerId: seat.playerId, token: seat.sessionToken };
        } else {
            for (const playerId of [...channel.seats.keys()].sort((a, b) => a - b)) {
                const seat = channel.seats.get(playerId);
                if (seat && seat.connection === null) {
                    target = { playerId: seat.playerId, token: seat.sessionToken };
                    break;
                }
            }
            if (!target) {
                connection.sendError('match_full', 'no open seats');
                return;
            }
        }

        const existing = channel.seats.get(target.playerId);
        if (existing?.connection && existing.connection !== connection) {
            connection.sendError('seat_taken', 'another connection holds this seat');
            return;
        }

        channel.attachSeat(target.playerId, target.token, connection);
        connection.markJoined(target.token, target.playerId, payload.matchId);
        sendJoinAck(connection, channel, target.playerId, false);
        // Feature 009 FR-005: every successful seat claim logs the release
        // identity with the seat/connection detail ("at each seat join").
        deps.logger.info('seat joined', {
            appVersion: APP_VERSION,
            matchId: channel.matchId,
            playerId: target.playerId,
            connectionId: connection.id,
        });
        deps.matchmaker.onSeatClaimed?.({
            matchId: channel.matchId,
            connectionId: connection.id,
            sessionToken: target.token,
            playerId: target.playerId,
            role: 'player',
        });
    }

    /**
     * Restore a disconnected seat for a reconnecting client (US2 AC-1):
     * re-bind the seat, transition the fresh connection to `rejoined`,
     * send a `snapshot` envelope with the current fog-filtered
     * PlayerView, then stream the seat's retained replay window as
     * `tick` envelopes so the client's stream bridges the ticks its
     * dropped connection never saw.
     *
     * Wire note: the snapshot envelope carries the seat's fog-filtered
     * PlayerView plus the boundary it was taken at (`SnapshotPayload`).
     * The contract originally declared that payload as `{ world }`, but
     * shipping a raw World would leak every other seat's fog-hidden
     * state (FR-005 / SC-004) while the contract's own prose called it a
     * "Full PlayerView snapshot" — the contract was corrected to the
     * `{ tick, view }` body in this change set (specs stay truthful).
     *
     * @param connection The reconnecting client's fresh connection.
     * @param binding    The consumed registry binding (seat to restore).
     */
    function restoreReconnectedSeat(connection: Connection, binding: ReconnectBinding): void {
        const channel = channels.get(binding.matchId);
        if (!channel) {
            connection.sendError('match_not_found', `unknown match ${binding.matchId}`);
            return;
        }
        const seat = channel.seats.get(binding.playerId);
        if (!seat) {
            connection.sendError('token_invalid', 'seat is no longer bound');
            return;
        }
        if (seat.connection && seat.connection !== connection) {
            connection.sendError('seat_taken', 'another connection holds this seat');
            return;
        }

        channel.attachSeat(binding.playerId, binding.sessionToken, connection);
        seat.disconnectedAtMs = null;
        connection.markReconnected(binding.sessionToken, binding.playerId, binding.matchId);

        // Snapshot first: the full current view for the restored seat.
        const view = deps.fog.computePlayerView({
            world: channel.engineSession.world(),
            playerId: binding.playerId,
            spectator: false,
        });
        const snapshotPayload: SnapshotPayload = { tick: channel.tickCounter, view };
        connection.send(envelopeOf('snapshot', snapshotPayload));
        statsCounter.recordFrameSent('snapshot');

        // Then the retained window as tick envelopes. Every payload is a
        // self-contained full view stamped with its own tick, so replaying
        // history after the snapshot leaves the client consistent at the
        // newest tick. The server cannot know the client's exact last-seen
        // tick (`JoinMatchPayload` carries no cursor), so the whole
        // retained window — bounded by `replayRingBufferTicks` — streams.
        const buffer = resyncBuffers.get(binding.matchId)?.get(binding.playerId);
        for (const entry of buffer?.getSince(0) ?? []) {
            connection.send(envelopeOf('tick', { tick: entry.tick, view: entry.view }));
            statsCounter.recordFrameSent('tick');
        }

        deps.matchmaker.onSeatReconnected?.({
            matchId: binding.matchId,
            connectionId: connection.id,
            sessionToken: binding.sessionToken,
        });
    }

    /**
     * Handle `order`: route through the accept pipeline (role/state/
     * rate checks happen there, including wire-level error replies) and
     * record stats. Accepted orders are acked at the next tick boundary.
     *
     * @param connection Submitting connection.
     * @param order      The engine order from the envelope payload.
     */
    function handleOrder(connection: Connection, order: Order): void {
        const { matchId } = connection;
        const channel = matchId ? channels.get(matchId) : undefined;
        if (!channel) {
            connection.sendError('protocol_sequence_error', 'order before joinMatch');
            statsCounter.recordOrderRejected();
            return;
        }
        const result = acceptOrder(channel, connection, order, Date.now());
        if (result.ok) {
            statsCounter.recordOrderAccepted();
        } else {
            statsCounter.recordOrderRejected();
            if (result.error.code === 'rate_limited') {
                statsCounter.recordRateLimitDrop();
            }
        }
    }

    /**
     * Central inbound-envelope dispatcher wired into every Connection.
     *
     * @param connection The sending connection.
     * @param envelope   Decoded, schema-valid envelope.
     */
    function handleEnvelope(connection: Connection, envelope: ProtocolEnvelope<NetworkPayload>): void {
        statsCounter.recordFrameReceived(envelope.type);
        switch (envelope.type) {
            case 'hello': {
                // `ProtocolEnvelope` correlates type↔payload only at the wire
                // level; the union isn't discriminated in TS, so each arm
                // narrows with a documented cast.
                const hello = envelope.payload as HelloPayload;
                const version = validateVersion(hello.protocolVersion);
                if (!version.ok) {
                    connection.sendError(version.error.code, version.error.message, version.error.detail);
                    connection.close(NETWORK_TRANSPORT_CONSTANTS.policyViolationCloseCode, 'policy violation');
                    return;
                }
                connection.markGreeted();
                const payload: HelloAckPayload = {
                    protocolVersion: NETWORK_API_VERSION,
                    connectionId: connection.id,
                    heartbeatIntervalMs: config.heartbeatIntervalMs,
                    // Feature 009 FR-003: additive release identity. Distinct
                    // from `protocolVersion` (FR-004) — never derived from it.
                    appVersion: APP_VERSION,
                };
                connection.send(envelopeOf('helloAck', payload));
                statsCounter.recordFrameSent('helloAck');
                return;
            }
            case 'joinMatch':
                handleJoinMatch(connection, envelope.payload as JoinMatchPayload);
                return;
            case 'order':
                handleOrder(connection, (envelope.payload as OrderSubmissionPayload).order);
                return;
            case 'ping': {
                const pinged = envelope.payload as PingPayload;
                connection.send(
                    envelopeOf('pong', {
                        clientTimeMs: pinged.clientTimeMs,
                        serverTimeMs: Date.now(),
                    }),
                );
                statsCounter.recordFrameSent('pong');
                return;
            }
            // Feature 010 lobby family: rate-gated, then routed to the
            // injected facade (see the lobby composition section). The
            // gate precedes routing so a flood cannot reach the facade
            // (each unknown identity claim would mint a registry entry).
            case 'lobbyIdentity':
                if (allowLobbyMessage(connection)) {
                    handleLobbyIdentity(connection, envelope.payload as LobbyIdentityPayload);
                }
                return;
            case 'lobbySetHandle':
                if (allowLobbyMessage(connection)) {
                    handleLobbySetHandle(connection, envelope.payload as LobbySetHandlePayload);
                }
                return;
            case 'lobbySubscribe':
                if (allowLobbyMessage(connection)) {
                    handleLobbySubscribe(connection, envelope.payload as LobbySubscribePayload);
                }
                return;
            case 'lobbyCreate':
                if (allowLobbyMessage(connection)) {
                    handleLobbyCreate(connection, envelope.payload as LobbyCreatePayload);
                }
                return;
            case 'lobbyJoin':
                if (allowLobbyMessage(connection)) {
                    handleLobbyJoin(connection, envelope.payload as LobbyJoinPayload);
                }
                return;
            case 'lobbySpectate':
                if (allowLobbyMessage(connection)) {
                    handleLobbySpectate(connection, envelope.payload as LobbySpectatePayload);
                }
                return;
            case 'lobbyLeave':
                if (allowLobbyMessage(connection)) {
                    handleLobbyLeave(connection, envelope.payload as LobbyLeavePayload);
                }
                return;
            default:
                // Direction-aware diagnostics (F-4 fix): every inbound
                // kind has an arm above, so landing here means either a
                // server→client frame sent upstream (historical case —
                // keep that wording) or a client→server kind that
                // somehow escaped routing (say THAT, so the gap is
                // diagnosable instead of misdescribed).
                connection.sendError(
                    'protocol_sequence_error',
                    CLIENT_TO_SERVER_KINDS.has(envelope.type)
                        ? `${envelope.type} is a client-to-server message but was not routed by this server`
                        : `${envelope.type} is a server-to-client message`,
                );
        }
    }

    /**
     * Transport-close handler: release the connection from its seat /
     * spectator list and notify matchmaking. For a seat that was live
     * (`joined`/`rejoined`), US2 adds: stamp the disconnect time on the
     * seat and register the token with the reconnect registry so the
     * client can reclaim within `reconnectGraceMs` (US2 AC-1); the
     * scheduler's grace sweep handles expiry (AC-2).
     *
     * Feature 010 (Wave-2 audit item 1): EVERY close path funnels
     * through here — clean close, transport loss, idle-timeout reap —
     * so this is the one place the lobby teardown hook fires. It runs
     * BEFORE any match-id early return: a lobby-only connection has no
     * matchId, and skipping its teardown would let the identity squat
     * its reserved handle forever. Only an ALREADY-BUILT facade is
     * notified (teardown must not lazily construct one), and the call
     * is guarded because the facade throws only on its own closed
     * invariant (host shut the lobby down first).
     *
     * @param connection The closed connection.
     */
    function handleDisconnect(connection: Connection): void {
        connections.delete(connection.id);
        lobbyBuckets.delete(connection.id);
        if (lobbyInstance !== null) {
            try {
                lobbyInstance.connectionClosed(connection.id);
            } catch (error) {
                deps.logger.warn('lobby connectionClosed threw', { connectionId: connection.id, error: String(error) });
            }
        }
        const { matchId } = connection;
        if (!matchId) {
            return;
        }
        const channel = channels.get(matchId);
        if (!channel) {
            return;
        }
        // Spectators hold no seat: no reconnect lifecycle, no registry.
        // Their departure rides the same bridge event players use,
        // carrying the per-connection spectator token (`detachSpectator`
        // is idempotent, so an explicit detach followed by the socket
        // close fires `onSeatDisconnected` exactly once).
        if (connection.role === 'spectator') {
            detachSpectator(channel, connection.id, deps);
            return;
        }
        if (connection.sessionToken === null) {
            return;
        }
        // Only a live seated session enters the reconnect lifecycle:
        // `markDisconnected` transitions just `joined`/`rejoined` →
        // `disconnected` (transport losses; server-initiated closes and
        // post-terminal sockets are already `closed`/`terminal`).
        connection.markDisconnected();
        const reclaimsSeat = connection.state() === 'disconnected';
        const nowMs = Date.now(); // socket-event boundary read (sanctioned)
        const { playerId } = connection;
        if (playerId !== null) {
            const seat = channel.seats.get(playerId);
            if (seat && seat.connection === connection) {
                seat.connection = null;
                seat.disconnectedAtMs = nowMs;
                if (reclaimsSeat) {
                    reconnectRegistry.register(connection.sessionToken, connection.id, playerId, matchId, nowMs);
                    deps.matchmaker.onSeatDisconnected?.({
                        matchId,
                        connectionId: connection.id,
                        sessionToken: connection.sessionToken,
                    });
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Transport wiring
    // ------------------------------------------------------------------

    const wss = new WebSocketServer({
        perMessageDeflate: false,
        clientTracking: true,
        noServer: true,
        // B1 (review): cap inbound frames at the documented 16 KiB limit.
        // Without `maxPayload`, `ws` buffers up to ~100 MiB per frame on
        // unauthenticated sockets before any JSON.parse — a trivial
        // memory-exhaustion DoS. Oversized frames are rejected by the
        // transport itself (close 1009) and never reach the protocol
        // layer. See NETWORK_CONSTANTS.defaultMaxFrameBytes.
        maxPayload: NETWORK_CONSTANTS.defaultMaxFrameBytes,
    });

    wss.on('connection', (socket: WsWebSocket) => {
        attachConnection(new WsSocketAdapter(socket));
    });

    /**
     * Create a `Connection` over any compliant socket seam (real ws via
     * upgrade, or a test double via the injection hook below).
     *
     * @param socket Compliant socket seam.
     * @returns The registered connection.
     */
    function attachConnection(socket: ConnectionSocket): Connection {
        const connection = new Connection({
            socket,
            role: 'player',
            nowMs: Date.now(),
            rateLimit: {
                ordersPerSecond: config.ordersPerSecond,
                burstFactor: config.rateLimitBurstFactor,
            },
            onEnvelope: handleEnvelope,
            onClose: handleDisconnect,
        });
        // Transport-error observer (review B1 companion): oversized-frame
        // rejections, resets, and protocol violations surface here. ws
        // tears the socket down itself and the 'close' event then drives
        // the normal lifecycle — this handler exists so the event is
        // never left unhandled (an unhandled 'error' on a WebSocket
        // crashes the process) and so the failure is observable.
        socket.on('error', (error: Error) => {
            deps.logger.warn('socket transport error', {
                connectionId: connection.id,
                message: error.message,
            });
        });
        connections.set(connection.id, connection);
        return connection;
    }

    /**
     * Fetch a channel or throw (used by management ops that contractually
     * throw on unknown matches).
     *
     * @param matchId Match to fetch.
     * @returns The channel.
     */
    function requireChannel(matchId: MatchId): MatchChannel {
        const channel = channels.get(matchId);
        if (!channel) {
            throw new Error(`unknown match ${matchId}`);
        }
        return channel;
    }

    // ------------------------------------------------------------------
    // Public Server surface
    // ------------------------------------------------------------------

    return {
        async listen(): Promise<void> {
            if (listening || closed) {
                return;
            }
            listening = true;
            httpServer = createHttpServer();
            httpServer.on('upgrade', (request, socket, head) => {
                wss.handleUpgrade(request, socket, head, (ws) => {
                    wss.emit('connection', ws, request);
                });
            });
            await new Promise<void>((resolve, reject) => {
                httpServer?.once('error', reject);
                httpServer?.listen({ host: config.host, port: config.port }, () => {
                    resolve();
                });
            });
            // Feature 009 FR-005: the boot log carries the release identity
            // alongside the listener detail. Production defaults to a no-op
            // logger; hosts injecting a real one get the version at startup.
            deps.logger.info('match server listening', {
                appVersion: APP_VERSION,
                host: config.host,
                port: config.port,
                tickRateMs: config.tickRateMs,
            });
            clock.start();
        },

        registerMatch(req: RegisterMatchRequest): void {
            if (channels.has(req.matchId)) {
                throw new Error(`registerMatch: match ${req.matchId} already registered`);
            }
            if (req.matchConfig.tickIntervalMs !== config.tickRateMs) {
                throw new Error(
                    `registerMatch: matchConfig.tickIntervalMs (${String(req.matchConfig.tickIntervalMs)}) must equal server tickRateMs (${String(config.tickRateMs)})`,
                );
            }
            if (channels.size >= config.maxConcurrentMatches) {
                throw new Error(`registerMatch: maxConcurrentMatches (${String(config.maxConcurrentMatches)}) reached`);
            }
            channels.set(
                req.matchId,
                new MatchChannel({
                    matchId: req.matchId,
                    engineSession: req.engineSession,
                    matchConfig: req.matchConfig,
                    // Feature 010 FR-020/SC-008: the registration-time seat
                    // labels ride into the channel for joinAck overlaying
                    // (conditional spread honors exactOptionalPropertyTypes;
                    // absent → legacy engine-placeholder behavior).
                    ...(req.displayNames === undefined ? {} : { displayNames: req.displayNames }),
                }),
            );
        },

        unregisterMatch(matchId: MatchId): void {
            const channel = channels.get(matchId);
            if (!channel) {
                return;
            }
            for (const connection of channel.connections()) {
                connection.close(NETWORK_TRANSPORT_CONSTANTS.goingAwayCloseCode, 'match unregistered');
            }
            channels.delete(matchId);
            resyncBuffers.delete(matchId);
        },

        attachPlayer(req: AttachPlayerRequest): void {
            requireChannel(req.matchId).attachSeat(req.playerId, req.sessionToken);
        },

        detachPlayer(req: DetachRequest): void {
            const channel = channels.get(req.matchId);
            if (!channel) {
                return;
            }
            if (req.playerId !== undefined && req.playerId !== null) {
                channel.detachSeat(req.playerId);
                return;
            }
            // Token-addressed detach: find the seat holding this token.
            for (const [playerId, seat] of channel.seats) {
                if (seat.sessionToken === req.sessionToken) {
                    channel.detachSeat(playerId);
                    return;
                }
            }
        },

        enableSpectators(matchId: MatchId): void {
            requireChannel(matchId).spectatorsAllowed = true;
        },

        disableSpectators(matchId: MatchId): void {
            requireChannel(matchId).spectatorsAllowed = false;
        },

        async close(): Promise<void> {
            if (closed) {
                return;
            }
            closed = true;
            clock.stop();
            // Contract lifecycle step 4 (network-api `Server` doc): close()
            // closes ALL connections with 1001 "going away" — match-bound
            // AND lobby-only. Every live connection is tracked in
            // `connections` (attachConnection is the sole creation path),
            // so this single pass covers seated players, spectators, and
            // lobby-only clients alike; Connection.close() is idempotent
            // and synchronously drives handleDisconnect, so each
            // connection's normal-close teardown (lobby connectionClosed,
            // seat release) fires exactly as on any other close path.
            // Snapshot first: the teardown deletes from this very map
            // while we iterate. Draining every socket here is also what
            // lets the httpServer.close() await below complete: an
            // upgraded WebSocket stays in the HTTP server's connection
            // count until its closing handshake finishes, so any socket
            // left open would hold the callback open forever (the
            // zombie-socket defect: a lobby client sat 'ready' on a dead
            // server through a kill+reboot).
            for (const connection of [...connections.values()]) {
                connection.close(NETWORK_TRANSPORT_CONSTANTS.goingAwayCloseCode, 'server going away');
            }
            channels.clear();
            connections.clear();
            resyncBuffers.clear();
            // Lobby buckets die with the server. The FACADE is
            // deliberately NOT closed here: matchmaking's facade cascades
            // `close()` into `matchmaker.close()`, which is the host's
            // lifecycle decision (see ServerDeps.lobby).
            lobbyBuckets.clear();
            wss.close();
            await new Promise<void>((resolve) => {
                if (!httpServer || !listening) {
                    resolve();
                    return;
                }
                httpServer.close(() => {
                    resolve();
                });
            });
            httpServer = undefined;
            listening = false;
        },

        stats(): ServerStats {
            return statsCounter.snapshot(Date.now(), liveCounts());
        },

        __injectSocketForTest: (socket: ConnectionSocket) => attachConnection(socket),

        __boundPortForTest: () => {
            const address = httpServer?.address();
            return typeof address === 'object' && address !== null ? address.port : undefined;
        },
    };
}
