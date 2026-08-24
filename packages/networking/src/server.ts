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
 *     `orders.ts`).
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

import { WebSocketServer, type WebSocket as WsWebSocket } from 'ws';

import { buildTickBroadcast, sendTickBroadcast } from './broadcast';
import { createTickClock } from './clock';
import { Connection, type ConnectionSocket } from './connection';
import { NETWORK_API_VERSION, NETWORK_CONSTANTS, NETWORK_TRANSPORT_CONSTANTS } from './constants';
import type {
    AttachPlayerRequest,
    DetachRequest,
    RegisterMatchRequest,
    Server,
    ServerConfig,
    ServerDeps,
    ServerStats,
} from './contracts/network-api';
import type {
    ConnectionId,
    HelloAckPayload,
    HelloPayload,
    JoinAckPayload,
    JoinMatchPayload,
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
            players: channel.engineSession.world().players,
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
                players: channel.engineSession.world().players,
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
            default:
                // Server→client kinds arriving inbound are sequence errors.
                connection.sendError('protocol_sequence_error', `${envelope.type} is a server-to-client message`);
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
     * @param connection The closed connection.
     */
    function handleDisconnect(connection: Connection): void {
        connections.delete(connection.id);
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
            for (const channel of channels.values()) {
                for (const connection of channel.connections()) {
                    connection.close(NETWORK_TRANSPORT_CONSTANTS.goingAwayCloseCode, 'server going away');
                }
            }
            channels.clear();
            connections.clear();
            resyncBuffers.clear();
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
