/**
 * Browser WebSocket MatchClient — Integration wave (feature 004 ↔ 005).
 *
 * The FIRST runtime implementation of feature 004's contract-only
 * `MatchClient` (`contracts/network-api.ts`): a browser client speaking
 * the exact wire protocol the shipped `createMatchServer` speaks, over
 * the native `WebSocket` API. It closes the "networking has no runtime
 * browser client" gap documented in `src/net/client.ts` and becomes
 * that adapter's DEFAULT `matchClientFactory`.
 *
 * Protocol lifecycle (FR-003/FR-004; see networking's
 * `contracts/network-types.ts` for the envelope grammar):
 *
 *   1. `connect(url)`   — open the socket, send `hello`, resolve on
 *      `helloAck` (version boundary checked via `validateVersion`).
 *   2. `joinMatch(req)` — send `joinMatch`, resolve on `joinAck`
 *      (session token + seat + snapshot retained), reject on an
 *      `error` envelope (`match_not_found`, `match_full`, …).
 *   3. `sendOrder(order)` — send an `order` envelope stamped with the
 *      next per-connection client seq; resolves with the engine's
 *      `CommandResult` when the correlated `orderAck` arrives.
 *   4. Inbound envelopes fan out through {@link onMessage} exactly as
 *      feature 004's contract declares; every frame is decoded and
 *      schema-validated with the server's own codec
 *      (`@europa/networking/browser`) so the two ends cannot drift.
 *      Decoded views are then rehydrated
 *      (`rehydrate-wire-views.ts`): the wire carries Set-typed fields
 *      (`CellView.pipes`) as sorted arrays, and the contract's
 *      `ReadonlySet` shape is restored before any consumer — reducer,
 *      renderer, input layer — sees the envelope.
 *
 * v1 scope notes (honest limitations, not hidden behavior):
 *   - `autoReconnect` is accepted for signature compatibility with the
 *     contract's factory options, but this client performs NO automatic
 *     reconnection loop: a transport loss transitions the state to
 *     `disconnected` (or `closed` pre-join) and rejects pending
 *     handshakes. Hosts/runtimes surface the gap via
 *     {@link WsMatchClient.onConnectionChanged}.
 *   - A `ping` heartbeat is sent at half the server-advertised
 *     `heartbeatIntervalMs` (from `helloAck`) while the socket is
 *     open: the server force-closes connections with no INBOUND
 *     activity past `wsIdleTimeoutMs`, so a quiet receiver must still
 *     knock periodically (FR-002). The timer is transport
 *     infrastructure — the same sanctioned wall-clock boundary
 *     networking's own tick clock uses — and never touches simulation
 *     state.
 *
 * Determinism discipline: no wall-clock reads, no randomness — the
 * heartbeat timer is transport-only; all sequencing is event-driven off
 * socket callbacks. Pure state machine over the wire.
 */

import {
  encodeFrame,
  NETWORK_API_VERSION,
  tryDecodeFrame,
  validateVersion,
} from '@europa/networking/browser';
import type {
  CommandResult,
  ConnectionState,
  MatchId,
  NetworkPayload,
  Order,
  PlayerId,
  ProtocolEnvelope,
  SequenceNumber,
  SessionToken,
} from '../state/types';
import { rehydrateEnvelopeViews } from './rehydrate-wire-views';

// ----------------------------------------------------------------------------
// Structural contract view (mirrors networking's MatchClient / ClientState)
// ----------------------------------------------------------------------------

/**
 * The connection-state snapshot this client exposes. Structurally
 * identical to networking's `ClientState` (contract `network-api.ts`)
 * without importing the server-side barrel.
 */
export interface WsClientState {
  readonly connection: ConnectionState;
  readonly sessionToken: SessionToken | null;
  readonly matchId: MatchId | null;
  readonly playerId: PlayerId | null;
  readonly lastTick: number;
  readonly lastSeenServerSeq: number;
}

/**
 * Structural mirror of feature 004's `MatchClient` interface: any
 * consumer written against the contract accepts this client, and the
 * console's `ConsoleClientImpl` adapter drives it through exactly
 * these five methods.
 */
export interface WsMatchClientContract {
  connect(url: string): Promise<void>;
  disconnect(): void;
  joinMatch(req: {
    readonly matchId: MatchId;
    readonly role: 'player' | 'spectator';
    readonly reconnectToken?: SessionToken;
    readonly displayName: string;
  }): Promise<void>;
  sendOrder(order: Order): Promise<CommandResult>;
  onMessage(handler: (envelope: ProtocolEnvelope<NetworkPayload>) => void): () => void;
  state(): WsClientState;
}

/** Options for {@link createWsMatchClient}. */
export interface WsMatchClientOptions {
  /**
   * Accepted for parity with the contract factory signature
   * (`{ autoReconnect?, verboseLogging? }`). Documented v1 behavior:
   * no automatic reconnection loop — see the module header.
   */
  readonly autoReconnect?: boolean;
  /** When true, protocol transitions are reported to {@link WsMatchClientOptions.logger}. */
  readonly verboseLogging?: boolean;
  /** Injected logger (never `console.*` directly — house rule). */
  readonly logger?: WsClientLogger;
  /**
   * Test seam: constructs the underlying WebSocket for a URL.
   * Defaults to the platform `WebSocket`. Unit tests inject a scripted
   * fake here; production never passes it.
   */
  readonly webSocketFactory?: (url: string) => WebSocket;
}

/** Minimal structural logger mirror (avoids importing contracts/api). */
export interface WsClientLogger {
  debug(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  info(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  warn(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  error(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
}

/**
 * The concrete client handle: the contract surface plus two
 * beyond-contract extensions runtimes need:
 *
 *   - {@link WsMatchClient.onConnectionChanged} observes transport-loss
 *     transitions (the wire has no "socket closed" envelope);
 *   - {@link WsMatchClient.lastOrderSeq} reports the wire
 *     `SequenceNumber` assigned to the most recent `sendOrder`. The
 *     wire counter covers EVERY outbound frame (hello = 1, joinMatch =
 *     2, …), so the console adapter must consult it — assuming orders
 *     are numbered from 1 mis-correlates every `orderAck`.
 */
export interface WsMatchClient extends WsMatchClientContract {
  /**
   * Subscribe to connection-state transitions. Fires for every
   * {@link ConnectionState} change including transport loss
   * (`disconnected`) and explicit close (`closed`). Returns the
   * unsubscribe function.
   */
  onConnectionChanged(handler: (state: ConnectionState) => void): () => void;
  /**
   * The wire seq assigned to the most recent `sendOrder` (set
   * synchronously during that call), or `null` before the first order.
   * Single-threaded call order makes read-after-send pairing exact.
   */
  lastOrderSeq(): SequenceNumber | null;
}

// ----------------------------------------------------------------------------
// Implementation
// ----------------------------------------------------------------------------

/**
 * Build a browser WebSocket client speaking feature 004's wire
 * protocol. Does NOT connect — call {@link WsMatchClient.connect}
 * first, then `joinMatch` (contract lifecycle).
 *
 * @param options See {@link WsMatchClientOptions}.
 * @returns A client satisfying feature 004's `MatchClient` contract.
 */
export function createWsMatchClient(options: WsMatchClientOptions = {}): WsMatchClient {
  const { logger } = options;
  const newSocket =
    options.webSocketFactory ??
    ((url: string) => {
      // Platform default. Node ≥ 21 and every evergreen browser ship a
      // global WebSocket; the indirection exists purely for tests.
      return new WebSocket(url);
    });

  // -- Mutable protocol state -------------------------------------------------
  let connection: ConnectionState = 'pending';
  let sessionToken: SessionToken | null = null;
  let matchId: MatchId | null = null;
  let playerId: PlayerId | null = null;
  let lastTick = 0;
  let lastSeenServerSeq: SequenceNumber = 0 as SequenceNumber;
  let clientSeq = 0;
  let socket: WebSocket | null = null;
  /** True when the close was locally requested (→ 'closed', not 'disconnected'). */
  let closedByUs = false;

  /** Wire seq of the most recent sendOrder (see {@link WsMatchClient.lastOrderSeq}). */
  let lastOrderSeqValue: SequenceNumber | null = null;

  /**
   * Heartbeat cadence (ms) from `helloAck.heartbeatIntervalMs`; pings
   * go at half of it. 0 = no heartbeat yet (pre-helloAck).
   */
  let heartbeatIntervalMs = 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  /** Stop the ping timer (idempotent). */
  function stopHeartbeat(): void {
    if (heartbeatTimer !== undefined) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
  }

  /**
   * Start the ping loop at half the advertised interval (bounded below
   * by 1 s so a misconfigured server cannot busy-loop the socket).
   * Transport-layer wall clock only — `clientTimeMs` is informational
   * per the wire contract and never enters simulation state.
   */
  function startHeartbeat(): void {
    stopHeartbeat();
    if (heartbeatIntervalMs <= 0) {
      return;
    }
    const periodMs = Math.max(1000, Math.floor(heartbeatIntervalMs / 2));
    heartbeatTimer = setInterval(() => {
      if (
        socket === null ||
        (connection !== 'greeted' && connection !== 'joined' && connection !== 'rejoined')
      ) {
        return;
      }
      try {
        sendEnvelope({ clientTimeMs: Date.now() }, 'ping');
      } catch {
        // Socket mid-close; the close handler owns teardown.
      }
    }, periodMs);
  }

  const messageHandlers = new Set<(envelope: ProtocolEnvelope<NetworkPayload>) => void>();
  const stateHandlers = new Set<(state: ConnectionState) => void>();

  /** Outbound handshake/order promises awaiting their server reply. */
  let pendingConnect: (() => void) | null = null;
  let rejectConnect: ((error: Error) => void) | null = null;
  let pendingJoin: (() => void) | null = null;
  let rejectJoin: ((error: Error) => void) | null = null;
  /**
   * The most recent joinMatch request. Retained so a token-based
   * reconnect (whose server reply is a `snapshot`, carrying no echo of
   * the token or seat) can still record the presented session token.
   */
  let lastJoinRequest: Parameters<WsMatchClientContract['joinMatch']>[0] | null = null;
  const pendingAcks = new Map<SequenceNumber, (result: CommandResult) => void>();
  const pendingAckRejects = new Map<SequenceNumber, (error: Error) => void>();

  function setState(next: ConnectionState): void {
    if (connection === next) {
      return;
    }
    connection = next;
    log('debug', 'connection state', { state: next });
    for (const handler of stateHandlers) {
      handler(next);
    }
  }

  function log(
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    ctx: Record<string, unknown>,
  ): void {
    if (options.verboseLogging !== true || logger === undefined) {
      return;
    }
    logger[level](msg, ctx);
  }

  /** Reject every outstanding handshake/ack promise (transport loss). */
  function flushPendingRejections(error: Error): void {
    if (rejectConnect !== null) {
      rejectConnect(error);
      rejectConnect = null;
      pendingConnect = null;
    }
    if (rejectJoin !== null) {
      rejectJoin(error);
      rejectJoin = null;
      pendingJoin = null;
    }
    for (const reject of pendingAckRejects.values()) {
      reject(error);
    }
    pendingAcks.clear();
    pendingAckRejects.clear();
  }

  /** Send one client→server envelope with the next per-connection seq. */
  function sendEnvelope(
    payload: NetworkPayload,
    type: ProtocolEnvelope<NetworkPayload>['type'],
  ): SequenceNumber {
    if (socket === null) {
      throw new Error(`ws-match-client: cannot send ${type} before connect()`);
    }
    clientSeq += 1;
    const seq = clientSeq as SequenceNumber;
    const envelope: ProtocolEnvelope<NetworkPayload> = {
      type,
      version: NETWORK_API_VERSION,
      seq,
      payload,
    };
    socket.send(encodeFrame(envelope));
    return seq;
  }

  /** Fan an inbound envelope out to subscribers after bookkeeping. */
  function dispatchInbound(envelope: ProtocolEnvelope<NetworkPayload>): void {
    lastSeenServerSeq = envelope.seq;
    switch (envelope.type) {
      case 'tick': {
        const payload = envelope.payload as Extract<
          NetworkPayload,
          { tick: number; view: unknown }
        >;
        if (payload.tick > lastTick) {
          lastTick = payload.tick;
        }
        break;
      }
      case 'snapshot':
      case 'joinAck': {
        const payload = envelope.payload as Extract<NetworkPayload, { tick: number }>;
        if (payload.tick > lastTick) {
          lastTick = payload.tick;
        }
        break;
      }
      default:
        break;
    }
    for (const handler of messageHandlers) {
      handler(envelope);
    }
  }

  /**
   * Handle one decoded inbound envelope: the handshake/ack state
   * machine first (connect/join resolution, ack correlation), then
   * fan-out to subscribers. Payload narrowing uses the same
   * "documented cast" pattern as networking's server dispatcher — the
   * wire union is not discriminated in TS.
   */
  function handleEnvelope(envelope: ProtocolEnvelope<NetworkPayload>): void {
    switch (envelope.type) {
      case 'helloAck': {
        const payload = envelope.payload as Extract<
          NetworkPayload,
          { protocolVersion: string; connectionId: string; heartbeatIntervalMs: number }
        >;
        const version = validateVersion(payload.protocolVersion);
        if (!version.ok) {
          const { error } = version;
          log('error', 'helloAck version mismatch', { received: payload.protocolVersion });
          setState('closed');
          if (rejectConnect !== null) {
            rejectConnect(new Error(`ws-match-client: ${error.message}`));
            rejectConnect = null;
            pendingConnect = null;
          }
          socket?.close(1008, 'version mismatch');
          return;
        }
        setState('greeted');
        ({ heartbeatIntervalMs } = payload);
        startHeartbeat();
        if (pendingConnect !== null) {
          pendingConnect();
          pendingConnect = null;
          rejectConnect = null;
        }
        return;
      }
      case 'joinAck': {
        // Documented cast: JoinAckPayload carries sessionToken/playerId.
        const payload = envelope.payload as Extract<
          NetworkPayload,
          { sessionToken: SessionToken; playerId: PlayerId | null; tick: number }
        >;
        ({ sessionToken, playerId } = payload);
        matchId = lastJoinRequest?.matchId ?? matchId;
        setState('joined');
        if (pendingJoin !== null) {
          pendingJoin();
          pendingJoin = null;
          rejectJoin = null;
        }
        return;
      }
      case 'snapshot': {
        // Reconnect resync (US2): a token join is completed by a
        // snapshot + replay window, NOT a joinAck. The snapshot body
        // echoes neither token nor seat, so the presented token stays
        // authoritative and the seat remains whatever this client last
        // knew (v1 limitation, documented in the module header).
        if (pendingJoin !== null && lastJoinRequest?.reconnectToken !== undefined) {
          sessionToken = lastJoinRequest.reconnectToken;
          ({ matchId } = lastJoinRequest);
          setState('rejoined');
          pendingJoin();
          pendingJoin = null;
          rejectJoin = null;
        }
        return;
      }
      case 'orderAck': {
        // Documented cast: OrderAckPayload correlates by envelope seq.
        const payload = envelope.payload as Extract<
          NetworkPayload,
          { seq: number; result: CommandResult }
        >;
        const seq = payload.seq as SequenceNumber;
        const resolver = pendingAcks.get(seq);
        if (resolver !== undefined) {
          pendingAcks.delete(seq);
          pendingAckRejects.delete(seq);
          resolver(payload.result);
        }
        return;
      }
      case 'terminal': {
        // Match over: the server closes the socket after delivery; no
        // further pings are needed (and none would be protocol-legal).
        stopHeartbeat();
        setState('terminal');
        return;
      }
      case 'error': {
        // Documented cast: ErrorPayload carries code/message.
        const payload = envelope.payload as Extract<
          NetworkPayload,
          { code: string; message: string }
        >;
        // An error during the join window fails the join promise with
        // the server's own words (match_not_found / match_full / …).
        if (rejectJoin !== null) {
          rejectJoin(new Error(`ws-match-client: ${payload.code}: ${payload.message}`));
          rejectJoin = null;
          pendingJoin = null;
        }
        return;
      }
      default:
        return;
    }
  }

  function attach(socketToAttach: WebSocket): void {
    socketToAttach.onopen = () => {
      log('debug', 'socket open', {});
      // FR-003: hello is the first frame on every fresh connection.
      sendEnvelope({ protocolVersion: NETWORK_API_VERSION }, 'hello');
    };
    socketToAttach.onmessage = (event: MessageEvent<string>) => {
      const decoded = tryDecodeFrame(event.data);
      if (!decoded.ok) {
        // Malformed inbound frames are dropped (and logged); the server
        // owns protocol enforcement, and a bad frame never advances our
        // state machine.
        log('warn', 'inbound frame failed validation', { detail: decoded.error.message });
        return;
      }
      // Decode-boundary rehydration: the wire codec serializes Set-typed
      // view fields (CellView.pipes) as sorted arrays; the contract
      // types (and every downstream consumer) expect ReadonlySet. Every
      // inbound path — live ticks, join snapshots, and the reconnect
      // snapshot + replay window — funnels through this one handler, so
      // rehydrating here covers them all by construction.
      const envelope = rehydrateEnvelopeViews(decoded.envelope);
      handleEnvelope(envelope);
      dispatchInbound(envelope);
    };
    socketToAttach.onclose = (event: CloseEvent) => {
      socket = null;
      stopHeartbeat();
      const wasJoined = connection === 'joined' || connection === 'rejoined';
      flushPendingRejections(
        new Error(`ws-match-client: socket closed (${String(event.code)}) before completion`),
      );
      setState(closedByUs || !wasJoined ? 'closed' : 'disconnected');
    };
    socketToAttach.onerror = () => {
      log('warn', 'socket transport error', {});
    };
  }

  const client: WsMatchClient = {
    connect(url: string): Promise<void> {
      if (socket !== null) {
        return Promise.reject(new Error('ws-match-client: connect() called on a live client'));
      }
      closedByUs = false;
      setState('pending');
      return new Promise<void>((resolve, reject) => {
        pendingConnect = resolve;
        rejectConnect = reject;
        const created = newSocket(url);
        socket = created;
        attach(created);
      });
    },

    disconnect(): void {
      closedByUs = true;
      stopHeartbeat();
      flushPendingRejections(new Error('ws-match-client: disconnected locally'));
      socket?.close(1000, 'client closing');
      socket = null;
      setState('closed');
    },

    joinMatch(req): Promise<void> {
      if (connection !== 'greeted') {
        return Promise.reject(
          new Error(`ws-match-client: joinMatch requires greeted state (got ${connection})`),
        );
      }
      lastJoinRequest = req;
      return new Promise<void>((resolve, reject) => {
        pendingJoin = resolve;
        rejectJoin = reject;
        // exactOptionalPropertyTypes: only carry the token when set.
        const payload: NetworkPayload =
          req.reconnectToken === undefined
            ? { matchId: req.matchId, role: req.role, displayName: req.displayName }
            : {
                matchId: req.matchId,
                role: req.role,
                displayName: req.displayName,
                reconnectToken: req.reconnectToken,
              };
        sendEnvelope(payload, 'joinMatch');
      });
    },

    sendOrder(order: Order): Promise<CommandResult> {
      if (connection !== 'joined' && connection !== 'rejoined') {
        return Promise.reject(
          new Error(`ws-match-client: sendOrder requires a joined seat (got ${connection})`),
        );
      }
      const seq = sendEnvelope({ order }, 'order');
      lastOrderSeqValue = seq;
      return new Promise<CommandResult>((resolve, reject) => {
        pendingAcks.set(seq, resolve);
        pendingAckRejects.set(seq, reject);
      });
    },

    lastOrderSeq(): SequenceNumber | null {
      return lastOrderSeqValue;
    },

    onMessage(handler: (envelope: ProtocolEnvelope<NetworkPayload>) => void): () => void {
      messageHandlers.add(handler);
      return () => {
        messageHandlers.delete(handler);
      };
    },

    onConnectionChanged(handler: (state: ConnectionState) => void): () => void {
      stateHandlers.add(handler);
      return () => {
        stateHandlers.delete(handler);
      };
    },

    state(): WsClientState {
      return {
        connection,
        sessionToken,
        matchId,
        playerId,
        lastTick,
        lastSeenServerSeq,
      };
    },
  };

  return client;
}
