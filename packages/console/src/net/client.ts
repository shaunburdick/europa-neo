/**
 * Console network adapter — Feature 005 (T029).
 *
 * Wraps feature 004's `MatchClient` behind the console-owned
 * `ConsoleClient` surface (contracts/console-to-networking.ts): the
 * console never touches WebSocket frames directly.
 *
 * Integration-wave update: feature 005 now ships a real browser
 * client — {@link createWsMatchClient} (`src/net/ws-match-client.ts`),
 * which speaks networking's wire codec over the native WebSocket API.
 * It is the DEFAULT `matchClientFactory`:
 *
 *   - omitting `deps.matchClientFactory` constructs a live WebSocket
 *     client wired to `config.url` (the contract's documented default:
 *     "Defaults to createMatchClient from @europa/networking");
 *   - hosts and tests may still inject a factory — injected factories
 *     are validated structurally at construction (fail-fast, no `any`)
 *     via {@link isMatchClientLike}.
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
import { createWsMatchClient } from './ws-match-client';

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
    /**
     * Integration-wave addition (optional so test doubles from before
     * the browser client existed keep working): the wire seq the client
     * assigned to its most recent `sendOrder`. The wire counter covers
     * EVERY outbound frame — hello, joinMatch, orders — so a real
     * client's first order is seq 3+, NOT 1. Adapters that assume
     * order-only numbering mis-correlate every `orderAck` (found by the
     * full-stack E2E). When absent, the adapter falls back to its own
     * order-only counter, which stays self-consistent for fakes that
     * also echo that counter's values.
     */
    lastOrderSeq?(): SequenceNumber | null;
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
 * Monotonic SequenceNumber source for outbound orders — the FALLBACK
 * for inner clients without `lastOrderSeq()` (test doubles). The real
 * browser client reports its true wire seq, which also counts hello /
 * joinMatch frames. Acks are correlated back through
 * {@link ConsoleClientImpl.seqToActionId}.
 */
let nextWireSeq = 0;

/**
 * Join-role selection for lobby-initiated legs (feature 010 T-016).
 *
 * Structural EXTENSION of the contract config — the contract mirror
 * itself is untouched (byte-identity conformance): `role` is optional,
 * defaults to `'player'`, and every plain `ConsoleClientConfig` remains
 * a valid argument (widening an implementation's accepted input set is
 * assignability-safe). Spectator legs join through feature 004's
 * existing wire semantics (`joinMatch.role: 'spectator'` — full-board
 * fog views, no seat, server-side `spectator_readonly` order gate);
 * this adapter additionally refuses outbound orders locally so a
 * spectator leg has no working order path at any layer.
 *
 * @see ConsoleClientImpl.joinMatch
 * @see ConsoleClientImpl.sendOrder
 */
export interface ConsoleClientConfigWithRole extends ConsoleClientConfig {
    /** Wire join role. Default `'player'`. */
    readonly role?: 'player' | 'spectator';
}

/**
 * Construct the console's network adapter. Does NOT connect — call
 * `connect()` then `joinMatch()` first (contract lifecycle).
 *
 * @param config Client config (URL, display name, optional token/match,
 *               optional join role — see {@link ConsoleClientConfigWithRole}).
 * @param deps Optional test seam. When `matchClientFactory` is
 *             omitted, the adapter defaults to the shipped browser
 *             WebSocket client ({@link createWsMatchClient}); tests
 *             inject fakes here instead.
 * @returns The adapter handle.
 */
export function createConsoleClient(config: ConsoleClientConfigWithRole, deps?: ConsoleClientDeps): ConsoleClient {
    const factory =
        deps?.matchClientFactory ??
        ((opts: { readonly autoReconnect?: boolean; readonly verboseLogging?: boolean }) => createWsMatchClient(opts));
    const produced: unknown = factory({
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
    return new ConsoleClientImpl(config, produced, deps?.logger);
}

/**
 * Adapter implementation. Holds the underlying MatchClient plus the
 * seq→ActionId correlation map for order acks.
 */
class ConsoleClientImpl implements ConsoleClient {
    private readonly client: MatchClientLike;

    private readonly config: ConsoleClientConfigWithRole;

    private readonly logger: ConsoleLoggerLike | undefined;

    /**
     * Resolved join role (feature 010 T-016): `'player'` unless the
     * config explicitly requested `'spectator'`. Gates BOTH the wire
     * join role and local order submission.
     */
    private readonly role: 'player' | 'spectator';

    /** Wire seq → console ActionId correlation for order acks (T031 ctx). */
    readonly seqToActionId = new Map<SequenceNumber, ActionId>();

    constructor(config: ConsoleClientConfigWithRole, client: MatchClientLike, logger?: ConsoleLoggerLike) {
        this.config = config;
        this.client = client;
        this.logger = logger;
        this.role = config.role ?? 'player';
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
                new Error('ConsoleClient.joinMatch: no matchId configured; set ConsoleClientConfig.matchId.'),
            );
        }
        // exactOptionalPropertyTypes: only present reconnectToken when set.
        const reconnectToken =
            this.config.reconnectToken === undefined ? {} : { reconnectToken: this.config.reconnectToken };
        return this.client.joinMatch({
            matchId: this.config.matchId,
            role: this.role,
            ...reconnectToken,
            displayName: this.config.displayName,
        });
    }

    /**
     * Submit an order stamped with the given console ActionId. Records
     * the correlation so the matching `orderAck` resolves back to
     * `actionId`: the key is the inner client's TRUE wire seq when it
     * reports one ({@link MatchClientLike.lastOrderSeq}), else the
     * adapter's own fallback counter.
     *
     * Spectator legs (feature 010 T-016) reject BEFORE any wire I/O:
     * read-only is enforced at every layer, so even a miswired host
     * cannot push an order through a spectator connection (SC-005).
     */
    sendOrder(actionId: ActionId, order: Order): Promise<void> {
        if (this.role === 'spectator') {
            return Promise.reject(
                new Error('ConsoleClient.sendOrder: spectator connections are read-only; orders are not accepted.'),
            );
        }
        const sent = this.client.sendOrder(order);
        const reported = this.client.lastOrderSeq?.() ?? null;
        if (reported !== null) {
            this.seqToActionId.set(reported, actionId);
            this.log('debug', 'sendOrder', { seq: reported, actionId });
        } else {
            nextWireSeq += 1;
            const seq = nextWireSeq as SequenceNumber;
            this.seqToActionId.set(seq, actionId);
            this.log('debug', 'sendOrder', { seq, actionId });
        }
        return sent.then(() => undefined);
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
    private log(level: 'debug' | 'info' | 'warn' | 'error', msg: string, ctx: Record<string, unknown>): void {
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
