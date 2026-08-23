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
 *   - `MatchmakerBridge` callback dispatch (onSeatClaimed on join,
 *     onSeatDisconnected on ws close, onMatchTerminal on engine
 *     terminal; onSeatReconnected/onSeatExpired arrive in US2).
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
import { NETWORK_API_VERSION } from './constants';
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
  TerminalPayload,
} from './contracts/network-types';
import { generateSessionToken } from './ids';
import { MatchChannel } from './match-channel';
import { acceptOrder, applyOrdersAtTickBoundary } from './orders';
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
    this.socket.close(code ?? 1000, reason ?? '');
  }

  /** Subscribe to text frames / transport close (ws semantics). */
  on(event: 'message', handler: (data: string) => void): unknown;
  on(event: 'close', handler: (code: number, reason: string) => void): unknown;
  on(
    event: 'message' | 'close',
    handler: ((data: string) => void) | ((code: number, reason: string) => void),
  ): unknown {
    if (event === 'message') {
      // Safe: the overload contract guarantees a message handler here.
      const onMessage = handler as (data: string) => void;
      this.socket.on('message', (data, isBinary) => {
        if (!isBinary) {
          onMessage(data.toString());
        }
      });
    } else {
      // Safe: the overload contract guarantees a close handler here.
      const onClose = handler as (code: number, reason: string) => void;
      this.socket.on('close', (code) => {
        onClose(code, '');
      });
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
} {
  const channels = new Map<MatchId, MatchChannel>();
  const connections = new Map<ConnectionId, Connection>();
  let closed = false;
  let listening = false;
  let httpServer: HttpServer | undefined;

  const statsCounter = new StatsCounter(Date.now());

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
   * heartbeats. Duration measurement is the only direct clock read.
   *
   * @param nowMs Scheduler-provided timestamp.
   */
  function runTickPipeline(nowMs: number): void {
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
      }

      // Heartbeat sweep: advance lastSeenAtMs for connections that
      // received frames since the previous fire.
      for (const connection of liveConnections) {
        connection.sweep(nowMs);
      }
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
      playerId: playerId ?? 1,
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

    const channel = channels.get(payload.matchId);
    if (!channel) {
      connection.sendError('match_not_found', `unknown match ${payload.matchId}`);
      return;
    }

    if (payload.role === 'spectator') {
      // Full spectator attach ships in US3; US1 honors the gate flag
      // being observable while attach stays rejected.
      connection.sendError('match_not_joinable', 'spectator attach is not available in this build');
      return;
    }

    // Resolve the target seat: explicit token > requested seat > first open.
    let target: { playerId: PlayerId; token: SessionToken } | undefined;
    if (payload.reconnectToken !== undefined) {
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
   * Handle `order`: route through the accept pipeline (role/state/
   * rate checks happen there, including wire-level error replies) and
   * record stats. Accepted orders are acked at the next tick boundary.
   *
   * @param connection Submitting connection.
   * @param order      The engine order from the envelope payload.
   */
  function handleOrder(connection: Connection, order: Order): void {
    const matchId = connection.matchId;
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
  function handleEnvelope(
    connection: Connection,
    envelope: ProtocolEnvelope<NetworkPayload>,
  ): void {
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
          connection.close(1008, 'policy violation');
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
        connection.sendError(
          'protocol_sequence_error',
          `${envelope.type} is a server-to-client message`,
        );
    }
  }

  /**
   * Transport-close handler: release the connection from its seat /
   * spectator list and notify matchmaking (US2 adds grace-window
   * reclaim on top of this).
   *
   * @param connection The closed connection.
   */
  function handleDisconnect(connection: Connection): void {
    connections.delete(connection.id);
    const matchId = connection.matchId;
    if (!matchId) {
      return;
    }
    const channel = channels.get(matchId);
    if (!channel || connection.sessionToken === null) {
      return;
    }
    connection.markDisconnected();
    const playerId = connection.playerId;
    if (playerId !== null) {
      const seat = channel.seats.get(playerId);
      if (seat && seat.connection === connection) {
        seat.connection = null;
        seat.disconnectedAtMs = null; // grace-window stamping lands in US2
        deps.matchmaker.onSeatDisconnected?.({
          matchId,
          connectionId: connection.id,
          sessionToken: connection.sessionToken,
        });
      }
    }
    if (connection.role === 'spectator') {
      channel.removeSpectator(connection.id);
    }
  }

  // ------------------------------------------------------------------
  // Transport wiring
  // ------------------------------------------------------------------

  const wss = new WebSocketServer({
    perMessageDeflate: false,
    clientTracking: true,
    noServer: true,
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
        throw new Error(
          `registerMatch: maxConcurrentMatches (${String(config.maxConcurrentMatches)}) reached`,
        );
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
        connection.close(1001, 'match unregistered');
      }
      channels.delete(matchId);
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
          connection.close(1001, 'server going away');
        }
      }
      channels.clear();
      connections.clear();
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
  };
}
