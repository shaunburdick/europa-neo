/**
 * Console network adapter — Feature 005 (T029).
 *
 * Wraps feature 004's `MatchClient` behind the console-owned
 * `ConsoleClient` surface (contracts/console-to-networking.ts): the
 * console never touches WebSocket frames directly.
 *
 * ⚠️ ADAPTED TO SHIPPED FEATURE 004 REALITY (PM directive: verify real
 * export names before importing). `@europa/networking` exports the
 * `MatchClient` / `ClientState` TYPES (factory declared in its
 * contract as `createMatchClient`) but ships NO runtime client
 * implementation yet — feature 004's delivered surface is the server
 * (`createMatchServer`). Therefore:
 *
 *   - `deps.matchClientFactory` is effectively REQUIRED at runtime:
 *     omitting it throws a descriptive construction-time error rather
 *     than silently importing a non-existent function. When feature
 *     004 lands its browser-side client, the default factory wires to
 *     `createMatchClient` from '@europa/networking' (runtime import
 *     of networking is allowed only in this file).
 *   - The produced client is validated structurally at construction
 *     (fail-fast, no `any`) via {@link isMatchClientLike}.
 *
 * Order-ack correlation: each `sendOrder` assigns a monotonically
 * increasing `SequenceNumber` and records `seq → actionId`; incoming
 * `orderAck` envelopes resolve through that map (see T031).
 */

import type {
  ActionId,
  ConnectionState,
  ConsoleClient,
  ConsoleClientConfig,
  ConsoleClientDeps,
  ConsoleClientState,
  MatchId,
  NetworkPayload,
  Order,
  PlayerId,
  ProtocolEnvelope,
  SequenceNumber,
  SessionToken,
} from '../state/types';
import { consoleStatusFromConnectionState } from './connection';

// ----------------------------------------------------------------------------
// Structural view of feature 004's MatchClient (no runtime import)
// ----------------------------------------------------------------------------

/**
 * Minimal structural type of the feature 004 client this adapter
 * drives. Mirrors networking's exported `MatchClient` interface so a
 * real instance satisfies it structurally without a runtime import.
 */
interface MatchClientLike {
  connect(url: string): Promise<void>;
  disconnect(): void;
  joinMatch(req: {
    readonly matchId: MatchId;
    readonly role: 'player' | 'spectator';
    readonly reconnectToken?: SessionToken;
    readonly displayName: string;
  }): Promise<void>;
  sendOrder(order: Order): Promise<import('@europa/engine').CommandResult>;
  onMessage(handler: (envelope: ProtocolEnvelope<NetworkPayload>) => void): () => void;
  state(): {
    readonly connection: ConnectionState;
    readonly sessionToken: SessionToken | null;
    readonly matchId: MatchId | null;
    readonly playerId: PlayerId | null;
    readonly lastTick: number;
    readonly lastSeenServerSeq: number;
  };
}

/**
 * Structural guard for {@link MatchClientLike}. Fail-fast validation
 * of injected factories — no `any`, no blind casts.
 */
function isMatchClientLike(value: unknown): value is MatchClientLike {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<MatchClientLike>;
  return (
    typeof candidate.connect === 'function' &&
    typeof candidate.disconnect === 'function' &&
    typeof candidate.joinMatch === 'function' &&
    typeof candidate.sendOrder === 'function' &&
    typeof candidate.onMessage === 'function' &&
    typeof candidate.state === 'function'
  );
}

/**
 * Monotonic SequenceNumber source for outbound orders. The adapter
 * owns wire numbering (console ActionIds stay internal); acks are
 * correlated back through {@link ConsoleClientImpl.seqToActionId}.
 */
let nextWireSeq = 0;

/**
 * Construct the console's network adapter. Does NOT connect — call
 * `connect()` then `joinMatch()` first (contract lifecycle).
 *
 * @param config Client config (URL, display name, optional token/match).
 * @param deps Test seam. Production hosts MUST provide
 *             `matchClientFactory` until feature 004 ships its
 *             browser client; tests inject fakes here too.
 * @returns The adapter handle.
 */
export function createConsoleClient(
  config: ConsoleClientConfig,
  deps?: ConsoleClientDeps,
): ConsoleClient {
  if (deps?.matchClientFactory === undefined) {
    throw new Error(
      'createConsoleClient: no matchClientFactory provided. Feature 004 has not shipped a ' +
        'browser-side client runtime yet; inject one via deps.matchClientFactory ' +
        '(tests use a fake). See packages/console/src/net/client.ts header.',
    );
  }
  const produced: unknown = deps.matchClientFactory({
    autoReconnect: config.autoReconnect ?? true,
    verboseLogging: config.verboseLogging ?? false,
  });
  if (!isMatchClientLike(produced)) {
    throw new Error(
      'createConsoleClient: deps.matchClientFactory returned an object that does not ' +
        'implement the MatchClient surface (connect/disconnect/joinMatch/sendOrder/' +
        'onMessage/state).',
    );
  }
  return new ConsoleClientImpl(config, produced, deps.logger);
}

/**
 * Adapter implementation. Holds the underlying MatchClient plus the
 * seq→ActionId correlation map for order acks.
 */
class ConsoleClientImpl implements ConsoleClient {
  private readonly client: MatchClientLike;

  private readonly config: ConsoleClientConfig;

  private readonly logger: ConsoleLoggerLike | undefined;

  /** Wire seq → console ActionId correlation for order acks (T031 ctx). */
  readonly seqToActionId = new Map<SequenceNumber, ActionId>();

  constructor(config: ConsoleClientConfig, client: MatchClientLike, logger?: ConsoleLoggerLike) {
    this.config = config;
    this.client = client;
    this.logger = logger;
  }

  /** Open the WebSocket and complete the hello handshake. */
  connect(): Promise<void> {
    this.log('debug', 'connecting', { url: this.config.url });
    return this.client.connect(this.config.url);
  }

  /**
   * Join (or rejoin) the configured match. Requires `config.matchId`
   * (the contract: hosts that pick a match later must construct the
   * client with it or rebuild the adapter). Presents
   * `config.reconnectToken` when set, else claims a new seat.
   */
  joinMatch(): Promise<void> {
    if (this.config.matchId === undefined) {
      return Promise.reject(
        new Error(
          'ConsoleClient.joinMatch: no matchId configured; set ConsoleClientConfig.matchId.',
        ),
      );
    }
    // exactOptionalPropertyTypes: only present reconnectToken when set.
    const reconnectToken =
      this.config.reconnectToken === undefined
        ? {}
        : { reconnectToken: this.config.reconnectToken };
    return this.client.joinMatch({
      matchId: this.config.matchId,
      role: 'player',
      ...reconnectToken,
      displayName: this.config.displayName,
    });
  }

  /**
   * Submit an order stamped with the given console ActionId. Assigns
   * the next wire SequenceNumber and records the correlation so the
   * matching `orderAck` resolves back to `actionId`.
   */
  sendOrder(actionId: ActionId, order: Order): Promise<void> {
    nextWireSeq += 1;
    const seq = nextWireSeq as SequenceNumber;
    this.seqToActionId.set(seq, actionId);
    this.log('debug', 'sendOrder', { seq, actionId });
    return this.client.sendOrder(order).then(() => undefined);
  }

  /**
   * Subscribe to inbound envelopes (mirrors feature 004's onMessage).
   * Returns the unsubscribe function.
   */
  onEnvelope(handler: (envelope: ProtocolEnvelope<NetworkPayload>) => void): () => void {
    return this.client.onMessage(handler);
  }

  /** Current adapter state snapshot (drives ConsoleState.status). */
  state(): ConsoleClientState {
    const inner = this.client.state();
    return {
      connection: inner.connection,
      sessionToken: inner.sessionToken,
      matchId: inner.matchId,
      playerId: inner.playerId,
      lastTick: inner.lastTick,
      lastSeenServerSeq: inner.lastSeenServerSeq as SequenceNumber,
      consoleStatus: consoleStatusFromConnectionState(inner.connection),
    };
  }

  /** Session token after joinMatch; `null` before. Persist externally. */
  sessionToken(): SessionToken | null {
    return this.client.state().sessionToken;
  }

  /** Seated player id after joinMatch; `null` before / for spectators. */
  playerId(): PlayerId | null {
    return this.client.state().playerId;
  }

  /** Explicit close; no more envelopes afterwards. */
  close(): void {
    this.log('debug', 'close', {});
    this.seqToActionId.clear();
    this.client.disconnect();
  }

  /**
   * Logger shim — never calls `console.*` directly (house rule);
   * everything routes through the injected logger.
   */
  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    ctx: Record<string, unknown>,
  ): void {
    if (this.config.verboseLogging !== true || this.logger === undefined) {
      return;
    }
    this.logger[level](msg, ctx);
  }
}

/** Minimal structural logger mirror (avoids importing contracts/api). */
interface ConsoleLoggerLike {
  debug(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  info(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  warn(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
  error(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
}
