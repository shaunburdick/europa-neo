/**
 * Connection — Per-Socket Protocol Wrapper — Feature 004 US1 (T025)
 *
 * Owns one WebSocket conversation: the per-connection `serverSeq`
 * counter (FR-002), the heartbeat timestamps (`lastSeenAtMs` /
 * `lastSentAtMs`), the token-bucket rate limiter (FR-010), the
 * connection state machine, and the inbound decode/error-routing
 * path (FR-001, FR-004, FR-008).
 *
 * Error routing policy (US1):
 *   - major version drift   → `version_mismatch` error + close(1008)
 *   - non-JSON frame        → `malformed_payload` error, stays open
 *   - unknown message kind  → `unknown_message_kind` error, stays open
 *   - other schema violations → forwarded `NetworkError` code, open
 *
 * Determinism discipline (constitution Principle II): there is no
 * `Date.now()` in this module — every timestamp is passed in by the
 * caller (the scheduler sweep or the server's message dispatch). The
 * class is transport plumbing; it never touches simulation state.
 */

import { NETWORK_API_VERSION } from './constants';
import type {
  ConnectionId,
  ConnectionRole,
  ConnectionState,
  ErrorCode,
  MatchId,
  NetworkPayload,
  PlayerId,
  ProtocolEnvelope,
  SequenceNumber,
  SessionToken,
} from './contracts/network-types';
import type { NetworkErrorDetail } from './errors';
import { isNetworkError } from './errors';
import { encodeFrame, tryDecodeFrame } from './frame';
import { generateConnectionId } from './ids';
import { isKnownMessageKind, validateVersion } from './validate';

// ----------------------------------------------------------------------------
// Socket seam
// ----------------------------------------------------------------------------

/**
 * The structural slice of a `ws.WebSocket` this module needs.
 * `MockWebSocket` satisfies it directly; production sockets are
 * adapted in `server.ts`. Keeping the seam narrow means the protocol
 * logic here is testable without opening ports.
 */
export interface ConnectionSocket {
  /** Send one text frame. */
  send(data: string): void;
  /** Close the socket (idempotent at the transport layer). */
  close(code?: number, reason?: string): void;
  /** Subscribe to inbound text frames. */
  on(event: 'message', handler: (data: string) => void): unknown;
  /** Subscribe to transport close. */
  on(event: 'close', handler: (code: number, reason: string) => void): unknown;
}

/** Rate-limit construction parameters (see `NETWORK_CONSTANTS`). */
export interface RateLimitSettings {
  readonly ordersPerSecond: number;
  readonly burstFactor: number;
}

/**
 * The live, mutable rate bucket. Structurally mirrors the contract's
 * `RateLimitBucket`; declared separately because the contract shape
 * is readonly while the bucket's tokens/lastRefillAtMs advance.
 */
export interface MutableRateBucket {
  readonly capacity: number;
  readonly refillPerSec: number;
  tokens: number;
  lastRefillAtMs: number;
}

/** Construction options for {@link Connection}. */
export interface ConnectionOptions {
  readonly socket: ConnectionSocket;
  readonly role: ConnectionRole;
  /** Wall-clock ms at creation (from the caller's clock boundary). */
  readonly nowMs: number;
  /** Token-bucket settings; defaults mirror `ServerConfig` defaults. */
  readonly rateLimit?: RateLimitSettings;
  /** Override the generated connection id (tests). */
  readonly id?: ConnectionId;
  /** Called for every valid, correctly-versioned inbound envelope. */
  readonly onEnvelope?: (
    connection: Connection,
    envelope: ProtocolEnvelope<NetworkPayload>,
  ) => void;
  /** Called once when the underlying socket closes. */
  readonly onClose?: (connection: Connection) => void;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * Normalize a transport message payload to text. Real `ws` sockets
 * deliver strings for text frames but may deliver Buffers/ArrayBuffers
 * depending on configuration; mocks deliver strings. Binary frames
 * that cannot be decoded become the empty string, which the decoder
 * rejects as `malformed_payload`.
 *
 * @param data The raw transport payload.
 * @returns The frame text.
 */
function toWireText(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof Uint8Array) {
    return Buffer.from(data).toString('utf8');
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  if (Array.isArray(data)) {
    return data.map((part) => toWireText(part)).join('');
  }
  return '';
}

// ----------------------------------------------------------------------------
// Connection
// ----------------------------------------------------------------------------

/**
 * Server-side handle for one client WebSocket. Created by
 * `createMatchServer` when a socket connects (or by tests via the
 * mock-injection seam).
 *
 * @example
 * ```ts
 * const conn = new Connection({ socket, role: 'player', nowMs: 0 });
 * conn.send(envelope, nowMs); // stamps seq = 1, 2, …
 * ```
 */
export class Connection {
  /** Unique transport handle (branded UUID). */
  readonly id: ConnectionId;

  private readonly socket: ConnectionSocket;
  private readonly onEnvelopeFn?: ConnectionOptions['onEnvelope'];
  private readonly onCloseFn?: ConnectionOptions['onClose'];

  private st: ConnectionState = 'pending';
  private roleValue: ConnectionRole;
  private sessionTokenValue: SessionToken | null = null;
  private playerIdValue: PlayerId | null = null;
  private matchIdValue: MatchId | null = null;

  private serverSeqCounter = 0;
  private lastSeenAtMsValue: number;
  private lastSentAtMsValue: number;
  private receivedSinceSweep = false;
  private closed = false;

  /** Last inbound client sequence number seen (for ack correlation). */
  private clientSeqSeen: SequenceNumber = 0 as SequenceNumber;

  /**
   * Live rate-limit bucket. Public so the pure order pipeline
   * (`orders.ts`) can refill/consume it without reaching into privates.
   */
  readonly rateBucket: MutableRateBucket;

  /**
   * @param options See {@link ConnectionOptions}.
   */
  constructor(options: ConnectionOptions) {
    this.id = options.id ?? generateConnectionId();
    this.roleValue = options.role;
    this.socket = options.socket;
    this.onEnvelopeFn = options.onEnvelope;
    this.onCloseFn = options.onClose;
    this.lastSeenAtMsValue = options.nowMs;
    this.lastSentAtMsValue = options.nowMs;

    const perSecond = options.rateLimit?.ordersPerSecond ?? 10;
    const burstFactor = options.rateLimit?.burstFactor ?? 2.0;
    this.rateBucket = {
      capacity: Math.floor(perSecond * burstFactor),
      refillPerSec: perSecond,
      tokens: Math.floor(perSecond * burstFactor),
      lastRefillAtMs: options.nowMs,
    };

    this.socket.on('message', (data) => {
      this.handleInbound(toWireText(data));
    });
    this.socket.on('close', () => {
      this.handleTransportClose();
    });
  }

  // ---------------------------------------------------------------------------
  // Observers
  // ---------------------------------------------------------------------------

  /** Current lifecycle state. */
  state(): ConnectionState {
    return this.st;
  }

  /**
   * Bound role: `player` from construction; flips to `spectator`
   * only via {@link markSpectatorJoined} (US3). Read by the order
   * pipeline (`spectator_readonly`) and the broadcast builder
   * (full-board views).
   */
  get role(): ConnectionRole {
    return this.roleValue;
  }

  /** Epoch ms of the last inbound activity (advanced by `sweep`). */
  get lastSeenAtMs(): number {
    return this.lastSeenAtMsValue;
  }

  /** Epoch ms of the last outbound frame (advanced by `send`). */
  get lastSentAtMs(): number {
    return this.lastSentAtMsValue;
  }

  /** Seat player id once joined (`null` before join / for spectators). */
  get playerId(): PlayerId | null {
    return this.playerIdValue;
  }

  /** Session token once joined (`null` before join). */
  get sessionToken(): SessionToken | null {
    return this.sessionTokenValue;
  }

  /** Match this connection has joined (`null` before join). */
  get matchId(): MatchId | null {
    return this.matchIdValue;
  }

  /** Last seen inbound client sequence number (ack correlation). */
  get lastClientSeq(): SequenceNumber {
    return this.clientSeqSeen;
  }

  // ---------------------------------------------------------------------------
  // State transitions (invoked by the server's protocol handlers)
  // ---------------------------------------------------------------------------

  /** `pending → greeted` after a valid hello handshake. */
  markGreeted(): void {
    if (this.st === 'pending') {
      this.st = 'greeted';
    }
  }

  /**
   * `→ joined`: bind seat identity. Accepts from `pending` (direct
   * construction in tests / mock-injection seam) or `greeted` (the
   * production hello-first path). Spectators pass `playerId: null`.
   */
  markJoined(token: SessionToken, playerId: PlayerId | null, matchId: MatchId): void {
    if (this.st === 'pending' || this.st === 'greeted') {
      this.st = 'joined';
      this.sessionTokenValue = token;
      this.playerIdValue = playerId;
      this.matchIdValue = matchId;
    }
  }

  /**
   * `greeted/pending → joined` as a spectator (US3): bind per-
   * connection spectator identity — token + match, seat `null`, role
   * `spectator`. Spectators hold no seat: the token authorizes no
   * reclaim, and the role flip is what makes the order pipeline
   * reject their orders (`spectator_readonly`) and the broadcast
   * builder compute full-board views for them.
   *
   * @param token   Per-connection spectator token.
   * @param matchId Match being observed.
   */
  markSpectatorJoined(token: SessionToken, matchId: MatchId): void {
    if (this.st === 'pending' || this.st === 'greeted') {
      this.roleValue = 'spectator';
      this.st = 'joined';
      this.sessionTokenValue = token;
      this.playerIdValue = null;
      this.matchIdValue = matchId;
    }
  }

  /** `joined/rejoined → disconnected` on transport loss. */
  markDisconnected(): void {
    if (this.st === 'joined' || this.st === 'rejoined') {
      this.st = 'disconnected';
    }
  }

  /** `disconnected → expired` when the grace window lapses (US2). */
  markExpired(): void {
    if (this.st === 'disconnected') {
      this.st = 'expired';
    }
  }

  /** `disconnected → rejoined` on successful reconnect (US2). */
  markRejoined(): void {
    if (this.st === 'disconnected') {
      this.st = 'rejoined';
    }
  }

  /**
   * `greeted → rejoined`: bind seat identity on the FRESH transport a
   * reconnecting client opens after its previous socket dropped (US2).
   * The replacement connection arrives here through the normal hello
   * handshake (`greeted`), so the pre-existing {@link markRejoined} —
   * which serves a still-tracked `disconnected` record — does not
   * apply. Ends in the same `rejoined` state the state machine
   * reserves for post-reconnect sessions.
   *
   * @param token    Reclaimed seat's session token.
   * @param playerId Restored seat.
   * @param matchId  Match the seat belongs to.
   */
  markReconnected(token: SessionToken, playerId: PlayerId | null, matchId: MatchId): void {
    if (this.st === 'greeted') {
      this.st = 'rejoined';
      this.sessionTokenValue = token;
      this.playerIdValue = playerId;
      this.matchIdValue = matchId;
    }
  }

  /** Any state → `terminal` after the match-end payload is delivered. */
  markTerminal(): void {
    if (this.st !== 'closed') {
      this.st = 'terminal';
    }
  }

  /** Record the inbound envelope's sequence number for ack correlation. */
  noteClientSeq(seq: SequenceNumber): void {
    this.clientSeqSeen = seq;
  }

  /**
   * Heartbeat sweep invoked by the scheduler with its own clock:
   * advances `lastSeenAtMs` iff frames arrived since the last sweep.
   *
   * @param nowMs Scheduler-provided wall-clock ms.
   */
  sweep(nowMs: number): void {
    if (this.receivedSinceSweep) {
      this.lastSeenAtMsValue = nowMs;
      this.receivedSinceSweep = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Outbound path
  // ---------------------------------------------------------------------------

  /**
   * Stamp `envelope.seq` with the next server sequence number and put
   * the frame on the wire. The input envelope is not mutated; a shallow
   * copy carries the stamped seq (key order preserved for byte-stable
   * serialization).
   *
   * No-op after close (defensive: post-terminal broadcasts must not
   * throw into the tick loop).
   *
   * @param envelope Envelope with placeholder/ignored `seq`.
   * @param nowMs    Optional wall-clock ms to stamp `lastSentAtMs`.
   */
  send(envelope: ProtocolEnvelope<NetworkPayload>, nowMs?: number): void {
    if (this.closed) {
      return;
    }
    this.serverSeqCounter += 1;
    const stamped: ProtocolEnvelope<NetworkPayload> = {
      ...envelope,
      seq: this.serverSeqCounter as SequenceNumber,
    };
    if (nowMs !== undefined) {
      this.lastSentAtMsValue = nowMs;
    }
    this.socket.send(encodeFrame(stamped));
  }

  /**
   * Build and send an `error` envelope (protocol-level rejection).
   *
   * @param code    Stable error code (closed union).
   * @param message Human-readable description.
   * @param detail  Optional structured context.
   * @param nowMs   Optional wall-clock ms stamp.
   */
  sendError(code: ErrorCode, message: string, detail?: NetworkErrorDetail, nowMs?: number): void {
    const payload: { code: ErrorCode; message: string; detail?: NetworkErrorDetail } = {
      code,
      message,
    };
    if (detail !== undefined) {
      payload.detail = detail;
    }
    this.send(
      { type: 'error', version: NETWORK_API_VERSION, seq: 0 as SequenceNumber, payload },
      nowMs,
    );
  }

  // ---------------------------------------------------------------------------
  // Rate limiting (FR-010)
  // ---------------------------------------------------------------------------

  /**
   * Lazy token-bucket refill + consume. Refills proportional to elapsed
   * time (capped at capacity), then consumes one token when available.
   *
   * @param nowMs Caller-provided wall-clock ms.
   * @returns `true` when a token was consumed (order may proceed).
   */
  takeToken(nowMs: number): boolean {
    const bucket = this.rateBucket;
    const elapsedSec = Math.max(0, (nowMs - bucket.lastRefillAtMs) / 1000);
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsedSec * bucket.refillPerSec);
    bucket.lastRefillAtMs = nowMs;
    if (bucket.tokens < 1) {
      return false;
    }
    bucket.tokens -= 1;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Close path
  // ---------------------------------------------------------------------------

  /**
   * Close the connection. Idempotent: only the first call reaches the
   * socket and notifies `onClose`. Transitions state to `closed`.
   *
   * @param code   WebSocket close code (default 1000 normal closure).
   * @param reason Human-readable reason.
   */
  close(code = 1000, reason = ''): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.st = 'closed';
    this.socket.close(code, reason);
    this.onCloseFn?.(this);
  }

  /** Transport-initiated close (peer went away). */
  private handleTransportClose(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    // A live seated session enters the reconnect lifecycle — its token
    // stays valid until the grace window lapses (US2; wire-contract
    // state machine: "ws disconnect → disconnected (token still
    // valid)"). Every other state closes outright.
    this.markDisconnected();
    if (this.st !== 'disconnected') {
      this.st = 'closed';
    }
    this.onCloseFn?.(this);
  }

  // ---------------------------------------------------------------------------
  // Inbound path
  // ---------------------------------------------------------------------------

  /**
   * Decode, validate, and route one inbound frame. Malformed frames
   * reply with an `error` envelope and keep the connection open except
   * for major-version drift, which closes with 1008 (FR-004).
   *
   * @param text Raw frame text.
   */
  private handleInbound(text: string): void {
    if (this.closed) {
      return;
    }
    this.receivedSinceSweep = true;

    const decoded = tryDecodeFrame(text);
    if (!decoded.ok) {
      this.replyDecodeFailure(text, decoded.error);
      return;
    }

    const envelope = decoded.envelope;
    this.clientSeqSeen = envelope.seq;

    const version = validateVersion(envelope.version);
    if (!version.ok) {
      this.sendError(version.error.code, version.error.message, version.error.detail);
      this.close(1008, 'policy violation');
      return;
    }

    this.onEnvelopeFn?.(this, envelope);
  }

  /**
   * Route a decode failure. Unknown message kinds get their own code
   * (`unknown_message_kind`) so clients can distinguish "we don't speak
   * that message" from "your frame was garbage" (FR-008); everything
   * else forwards the decoder's code.
   *
   * @param text  The raw frame text.
   * @param error The decoder's rejection.
   */
  private replyDecodeFailure(text: string, error: unknown): void {
    let code: ErrorCode = 'malformed_payload';
    let message = 'frame rejected';
    if (isNetworkError(error)) {
      code = error.code;
      message = error.message;
      if (code === 'malformed_payload' && hasUnknownMessageKind(text)) {
        code = 'unknown_message_kind';
        message = 'envelope.type is not a known MessageKind';
      }
    }
    this.sendError(code, message);
  }
}

// ----------------------------------------------------------------------------
// Module-level helpers
// ----------------------------------------------------------------------------

/**
 * Check whether a raw frame parses to an object carrying a string
 * `type` outside the known `MessageKind` set. Used solely for error
 * classification; the authoritative validation still happens in
 * `validate.ts`.
 *
 * @param text Raw frame text.
 * @returns True when the failure is specifically an unknown kind.
 */
function hasUnknownMessageKind(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      // Destructure (not dot/bracket access): satisfies both
      // `noPropertyAccessFromIndexSignature` and Biome's useLiteralKeys.
      const { type } = parsed as Record<string, unknown>;
      return typeof type === 'string' && !isKnownMessageKind(type);
    }
  } catch {
    // Not JSON — plain malformed_payload.
  }
  return false;
}
