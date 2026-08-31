/**
 * Browser WebSocket lobby client — feature 010 (T-012).
 *
 * The transport half of the public lobby: a browser client speaking the
 * additive `lobby*` message family (feature 010 wire contract,
 * `specs/010-public-lobby-match-browser/contracts/lobby-wire.md`) over
 * the native `WebSocket` API, using the SAME frame codec as the server
 * (`@europa/networking/browser`). Structural sibling of
 * `ws-match-client.ts` (feature 004's match client): same attach/
 * dispatch skeleton, same defensive style — gameplay traffic is
 * untouched and continues through that other client.
 *
 * Protocol lifecycle (one "establish cycle"):
 *
 *   1. `connect(url)`  — open socket, send `hello`, validate `helloAck`.
 *   2. `lobbyIdentity` — present the persisted resume claim (advisory;
 *      the server honors it only while its registry holds the identity).
 *      The directed `identity` lobby event completes setup.
 *   3. `lobbySubscribe` — request updates; the next `snapshot` lobby
 *      event is the full baseline. Cycle done → state `'ready'`.
 *
 * Responsibilities owned here (per task T-012):
 *
 *   - **Claim/handle persistence** — the guest player ID correlation value +
 *     last accepted handle live in local storage (`lobby-storage.ts`)
 *     and are presented on every establish cycle. The LOCAL mint is
 *     first-frame bootstrap only: the server's directed `identity`
 *     event carries the AUTHORITATIVE id (feature 010 Clarifications
 *     v1.6 — the FR-003 delivery channel), and this client adopts it,
 *     replacing any locally minted value, so a reload restores the
 *     ACTIVE identity within the reconnect grace window. Storage
 *     failures degrade to an in-memory-only session.
 *     `forgetIdentity()` is the explicit leave; `lobbyLeave`
 *     deliberately does NOT clear the claim (the wire semantic is
 *     "return to the lobby", which still needs the identity).
 *   - **Snapshot revisions** — snapshots apply only when strictly
 *     newer than the last applied one (FR-013). The baseline resets
 *     every establish cycle, so a restarted server's low revisions are
 *     adopted instead of being starved forever.
 *   - **Action correlation** — every mutating request carries a
 *     client-generated monotonic `LobbyActionId`; its promise settles
 *     on the `actionAccepted`/`error` event echoing that exact id —
 *     EXCEPT `setHandle`, which settles on the directed `identity`
 *     event ALONE (the wire sends no success frame for data-only
 *     updates; the event is addressed solely to the owning connection
 *     and carries the resulting handle, making it a sufficient,
 *     authoritative confirmation). Impostor/stale echoes are ignored;
 *     unanswered actions time out.
 *   - **Disconnect/retry** — transport loss flushes pending actions,
 *     emits a state transition, and (by default) enters an exponential
 *     backoff re-establish loop that re-presents the persisted claim
 *     (server restores within the reconnect grace window). Retry
 *     exhaustion and fatal protocol errors land in `'failed'` —
 *     distinctly from the transient `'reconnecting'`/`'disconnected'`
 *     states. Exactly ONE `lobbyIdentity` frame is sent per attempt
 *     (never a flood — the dispatcher rate-limits identity requests).
 *   - **Identity and credential handling** — the guest player ID is
 *     non-secret correlation data used to identify the server-resolved
 *     identity. It is kept out of URLs, logs, and errors here because those
 *     surfaces do not need it, not because the ID itself is a bearer secret.
 *     The persisted guest-ID resume claim is non-secret, advisory
 *     correlation data, not a bearer credential. It is distinct from the
 *     protected `sessionToken`/`reconnectToken` credentials; redaction
 *     continues to cover claim values and any server-authored text that
 *     echoes them.
 *
 * Determinism discipline: pure state machine over socket callbacks;
 * timers are transport infrastructure (heartbeat, action timeouts,
 * backoff) driven by an injected {@link LobbyScheduler} — the same
 * sanctioned wall-clock boundary the match client uses — and never
 * touch simulation state.
 */

import type {
    GuestIdentityClaim,
    GuestPlayerId,
    IdentityState,
    LobbyActionId,
    LobbyErrorCode,
    LobbyEvent,
    LobbyRevision,
    LobbySnapshot,
    MatchId,
} from '@europa/matchmaking';
import type { LobbyMatchSettings, NetworkPayload, ProtocolEnvelope, SequenceNumber } from '@europa/networking';
import { encodeFrame, NETWORK_API_VERSION, tryDecodeFrame, validateVersion } from '@europa/networking/browser';
import {
    clearStoredClaim,
    type LobbyStorage,
    loadStoredClaim,
    mintGuestClaimId,
    REDACTION_MARKER,
    resolveLobbyStorage,
    type StoredLobbyClaim,
    saveStoredClaim,
} from './lobby-storage';

// ----------------------------------------------------------------------------
// Tunables (single location — constitution Principle V / AGENTS.md rule 3)
// ----------------------------------------------------------------------------

/** Floor for the heartbeat period so a misconfigured server cannot busy-loop the socket. */
const HEARTBEAT_FLOOR_MS = 1_000;
/** Pings go out at this fraction of the server-advertised interval (match-client parity). */
const HEARTBEAT_INTERVAL_DIVISOR = 2;
/** Default per-action correlation timeout (ms). */
const DEFAULT_ACTION_TIMEOUT_MS = 10_000;
/** Default base delay for the reconnect backoff (ms). */
const DEFAULT_RECONNECT_BASE_DELAY_MS = 500;
/** Default ceiling for the reconnect backoff (ms). */
const DEFAULT_RECONNECT_MAX_DELAY_MS = 8_000;
/** Default retry budget before the client gives up into `'failed'`. */
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 6;
/** Normal WebSocket close (explicit client disconnect / attempt reset). */
const SOCKET_CLOSE_NORMAL = 1000;
/** Protocol-error WebSocket close (version mismatch). */
const SOCKET_CLOSE_PROTOCOL_ERROR = 1008;
/** Backoff growth factor (classic exponential doubling). */
const BACKOFF_MULTIPLIER = 2;

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

/**
 * Coarse connection lifecycle exposed to runtimes/UI:
 *
 *   - `idle` — created, `connect()` not yet called.
 *   - `connecting` — first establish cycle in flight.
 *   - `ready` — identity established, subscribed, baseline applied.
 *   - `disconnected` — transport lost with auto-retry DISABLED
 *     (transient; the caller decides what happens next).
 *   - `reconnecting` — transport lost with auto-retry ENABLED
 *     (transient; the backoff loop owns recovery).
 *   - `failed` — TERMINAL: retry budget exhausted or fatal protocol
 *     error (version skew). Distinct from the transient states above;
 *     recovery requires an explicit new `connect()`.
 *   - `closed` — explicit {@link WsLobbyClient.disconnect}.
 */
export type LobbyConnectionState =
    | 'idle'
    | 'connecting'
    | 'ready'
    | 'disconnected'
    | 'reconnecting'
    | 'failed'
    | 'closed';

/** Immutable state snapshot returned by {@link WsLobbyClient.state}. */
export interface WsLobbyClientState {
    readonly connection: LobbyConnectionState;
    /** Server-confirmed handle (`null` until the identity picked a valid one). */
    readonly handle: string | null;
    /** Whether a resume claim exists (in memory or persisted). Never the claim itself. */
    readonly hasClaim: boolean;
    /** Latest APPLIED lobby snapshot (revision-gated), or `null` before the first baseline. */
    readonly snapshot: LobbySnapshot | null;
    /** Revision of the last applied snapshot, or `null` before one. */
    readonly lastAppliedRevision: LobbyRevision | null;
    /** Current retry attempt index (0 while connected). */
    readonly reconnectAttempt: number;
}

/**
 * An actionable lobby error surfaced through
 * {@link WsLobbyClient.onError}. Only UNCORRELATED errors arrive here
 * (errors carrying an `actionId` settle that action's promise
 * instead). `message` is sanitized (see the module privacy note).
 */
export interface LobbyErrorReport {
    readonly code: LobbyErrorCode;
    readonly message: string;
    /** Machine-readable specifics when the server supplied them (US3 AC-4); else `null`. */
    readonly detail: Readonly<Record<string, string | number | boolean>> | null;
    /** Echoed correlation id when present, else `null`. */
    readonly actionId: LobbyActionId | null;
}

/** Structural logger mirror (avoids importing any server-side contract). */
export interface LobbyClientLogger {
    debug(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
    info(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
    warn(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
    error(msg: string, ctx?: Readonly<Record<string, unknown>>): void;
}

/**
 * Timer seam for timeouts, backoff, and the heartbeat. Injected in
 * tests (manual clock); production binds the platform timers. Handles
 * are opaque — callers only ever round-trip them back to
 * {@link clearTimeout}.
 */
export interface LobbyScheduler {
    /** Schedule `fn` after `ms`; returns a handle for {@link clearTimeout}. */
    setTimeout(fn: () => void, ms: number): unknown;
    /** Cancel a pending timer (no-op on unknown handles). */
    clearTimeout(handle: unknown): void;
}

/** Client→server lobby message kinds this client sends. */
type LobbyRequestKind =
    | 'lobbySetHandle'
    | 'lobbySubscribe'
    | 'lobbyCreate'
    | 'lobbyJoin'
    | 'lobbySpectate'
    | 'lobbyLeave';

/** Options for {@link createWsLobbyClient}; every field optional. */
export interface WsLobbyClientOptions {
    /** When true, protocol transitions are reported to {@link logger}. */
    readonly verboseLogging?: boolean;
    /** Injected logger (never `console.*` directly — house rule). */
    readonly logger?: LobbyClientLogger;
    /**
     * Test seam: constructs the underlying WebSocket for a URL.
     * Defaults to the platform `WebSocket`.
     */
    readonly webSocketFactory?: (url: string) => WebSocket;
    /**
     * Storage backing for the claim. Defaults to probing
     * `localStorage` (`null` in private mode → in-memory-only session).
     */
    readonly storage?: LobbyStorage | null;
    /** Timer seam; defaults to platform timers. */
    readonly scheduler?: LobbyScheduler;
    /** Per-action correlation timeout (ms). Default {@link DEFAULT_ACTION_TIMEOUT_MS}. */
    readonly actionTimeoutMs?: number;
    /** Reconnect backoff base (ms). Default {@link DEFAULT_RECONNECT_BASE_DELAY_MS}. */
    readonly reconnectBaseDelayMs?: number;
    /** Reconnect backoff ceiling (ms). Default {@link DEFAULT_RECONNECT_MAX_DELAY_MS}. */
    readonly reconnectMaxDelayMs?: number;
    /** Retry budget before `'failed'`. Default {@link DEFAULT_MAX_RECONNECT_ATTEMPTS}. */
    readonly maxReconnectAttempts?: number;
    /** Automatic re-establish loop on transport loss. Default `true`. */
    readonly autoReconnect?: boolean;
    /** Test seam: claim-id minting. Defaults to Web Crypto (see lobby-storage). */
    readonly claimIdFactory?: () => GuestPlayerId;
}

/**
 * The concrete client handle. Actions return promises that settle only
 * on the server echo of their exact `LobbyActionId`; rejections carry
 * typed lobby errors. The client does not expose its internal resume claim
 * through an accessor; the guest ID is non-secret advisory correlation data.
 * The protected `sessionToken`/`reconnectToken` bearer credentials remain
 * inaccessible (see the module note).
 */
export interface WsLobbyClient {
    /** Open the socket and run the full establish cycle (identity + subscribe). */
    connect(url: string): Promise<void>;
    /** Close explicitly (cancels retry loops; the persisted claim survives for reload-resume). */
    disconnect(): void;
    /** Forget the persisted claim + handle (explicit identity leave); next connect mints fresh. */
    forgetIdentity(): void;
    /** Claim or rename the identity's public handle (FR-004/FR-005). */
    setHandle(handle: string): Promise<IdentityState>;
    /** Create a public match; the creator's seat is reserved (FR-008/FR-009). */
    createMatch(settings?: Partial<LobbyMatchSettings>): Promise<'waiting' | 'match'>;
    /** Join a listed waiting match by id (atomic, FR-010). */
    joinMatch(matchId: MatchId): Promise<'waiting' | 'match'>;
    /** Attach read-only to a running public match (FR-012). */
    spectateMatch(matchId: MatchId): Promise<'waiting' | 'match'>;
    /** Release this identity's match association and return to the lobby. */
    leaveMatch(): Promise<void>;
    /** Immutable state snapshot. */
    state(): WsLobbyClientState;
    /** Subscribe to connection-state transitions; returns the unsubscribe function. */
    onStateChange(handler: (state: LobbyConnectionState) => void): () => void;
    /** Subscribe to server-confirmed identity updates; returns the unsubscribe function. */
    onIdentity(handler: (identity: IdentityState) => void): () => void;
    /** Subscribe to APPLIED (revision-gated) snapshots; returns the unsubscribe function. */
    onSnapshot(handler: (snapshot: LobbySnapshot) => void): () => void;
    /** Subscribe to uncorrelated actionable errors; returns the unsubscribe function. */
    onError(handler: (report: LobbyErrorReport) => void): () => void;
}

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

/** A lobby action was rejected by the server (correlated by actionId). */
export class LobbyActionRejectedError extends Error {
    /** Lobby-scoped error code (see the wire contract's `LobbyErrorCode`). */
    readonly code: LobbyErrorCode;
    /** Field-specific detail when the server supplied it, else `null`. */
    readonly detail: Readonly<Record<string, string | number | boolean>> | null;

    constructor(
        code: LobbyErrorCode,
        message: string,
        detail: Readonly<Record<string, string | number | boolean>> | null = null,
    ) {
        super(message);
        this.name = 'LobbyActionRejectedError';
        this.code = code;
        this.detail = detail;
    }
}

/** An action (or the establish cycle) exceeded its correlation timeout. */
export class LobbyTimeoutError extends Error {
    /** What timed out: a named action or the whole establish cycle. */
    readonly target: string;

    constructor(target: string) {
        super(`ws-lobby-client: ${target} timed out`);
        this.name = 'LobbyTimeoutError';
        this.target = target;
    }
}

/** Transport-level failure (socket loss, malformed handshake). */
export class LobbyTransportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LobbyTransportError';
    }
}

// ----------------------------------------------------------------------------
// Implementation
// ----------------------------------------------------------------------------

/**
 * Platform timer binding (production default for {@link LobbyScheduler}).
 * Routed through a structural view of `globalThis` so the handle stays
 * opaque across DOM (`number`) and Node (`Timeout`) typings alike.
 */
const platformTimers = globalThis as {
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
};

/** Platform timer binding (production default for {@link LobbyScheduler}). */
const globalScheduler: LobbyScheduler = {
    setTimeout(fn: () => void, ms: number): unknown {
        return platformTimers.setTimeout(fn, ms);
    },
    clearTimeout(handle: unknown): void {
        platformTimers.clearTimeout(handle);
    },
};

/** Outcome envelope used to settle pending actions exactly once. */
type ActionOutcome = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: Error };

/** One in-flight correlated action awaiting its echoed actionId. */
interface PendingAction {
    readonly description: string;
    readonly timerHandle: unknown;
    /**
     * Handle renames settle on the DIRECTED `identity` event alone
     * (PM ruling, 2026-08-26): the event is addressed solely to the
     * owning connection and carries the resulting handle, making it a
     * sufficient, authoritative confirmation — the wire sends no
     * `actionAccepted` for data-only updates. All other actions settle
     * on their echoed actionId.
     */
    settlesOnIdentity: boolean;
    settle(outcome: ActionOutcome): void;
}

/** Fine-grained position inside one establish cycle. */
type EstablishPhase = 'identity' | 'subscribe';

/** Lobby error codes that mean "your claim is dead; start fresh". */
const IDENTITY_INVALIDATED_CODES: ReadonlySet<LobbyErrorCode> = new Set(['identity_expired', 'server_restarted']);

/**
 * Build a browser lobby transport client. Does NOT connect — call
 * {@link WsLobbyClient.connect} first.
 *
 * @param options See {@link WsLobbyClientOptions}.
 */
export function createWsLobbyClient(options: WsLobbyClientOptions = {}): WsLobbyClient {
    const { logger } = options;
    const scheduler = options.scheduler ?? globalScheduler;
    const actionTimeoutMs = options.actionTimeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS;
    const reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS;
    const reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
    const maxReconnectAttempts = options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    const autoReconnect = options.autoReconnect ?? true;
    const newSocket =
        options.webSocketFactory ??
        ((url: string) => {
            // Platform default; the indirection exists purely for tests.
            return new WebSocket(url);
        });
    const mintClaimId = options.claimIdFactory ?? (() => mintGuestClaimId());

    // -- Mutable protocol state -------------------------------------------------
    let connection: LobbyConnectionState = 'idle';
    /** Fine-grained phase inside the active establish cycle (`null` when none). */
    let phase: EstablishPhase | null = null;
    let socket: WebSocket | null = null;
    /** True when the close was locally requested (→ 'closed', never retried). */
    let closedByUs = false;
    /** True between helloAck and teardown (pings are protocol-legal). */
    let greeted = false;
    /**
     * Generation counter guarding socket callbacks: every attempt and
     * every teardown bumps it, so a late `onclose` from a discarded
     * socket can never double-run the retry state machine.
     */
    let attemptEpoch = 0;
    let heartbeatPeriodMs = 0;
    let heartbeatTimer: unknown;
    let establishTimer: unknown;
    let reconnectTimer: unknown;
    let reconnectAttempt = 0;
    let activeUrl: string | null = null;
    let clientSeq = 0;
    let actionCounter = 0;

    /** In-memory claim (source of truth; storage is the write-through). */
    let currentClaim: StoredLobbyClaim | null = null;
    let confirmedHandle: string | null = null;
    let snapshotState: LobbySnapshot | null = null;
    let lastAppliedRevision: LobbyRevision | null = null;

    const pendingActions = new Map<LobbyActionId, PendingAction>();
    let connectResolve: (() => void) | null = null;
    let connectReject: ((error: Error) => void) | null = null;

    const stateHandlers = new Set<(state: LobbyConnectionState) => void>();
    const identityHandlers = new Set<(identity: IdentityState) => void>();
    const snapshotHandlers = new Set<(snapshot: LobbySnapshot) => void>();
    const errorHandlers = new Set<(report: LobbyErrorReport) => void>();

    // -- Logging + privacy choke point ------------------------------------------

    /**
     * Every opaque claim id this session has held: bootstrap mints,
     * values restored from storage, and server-delivered replacements
     * (feature 010 Clarifications v1.6). At the adoption moment two
     * live values exist — the stale local mint and the server-issued
     * successor — and log lines or server text from either era must
     * come out clean, so {@link redact} scrubs them ALL.
     */
    const knownSecrets = new Set<string>();

    /**
     * Scrub every occurrence of ANY known secret value out of `text`.
     * Defense-in-depth: our own messages never contain a secret, and
     * this catches server-authored text echoing one back.
     */
    function redact(text: string): string {
        let safe = text;
        for (const secret of knownSecrets) {
            if (secret.length > 0) {
                safe = safe.split(secret).join(REDACTION_MARKER);
            }
        }
        return safe;
    }

    /** Shallow-scrub string values in a log context (call sites stay flat). */
    function redactContext(ctx: Readonly<Record<string, unknown>>): Record<string, unknown> {
        const safe: Record<string, unknown> = {};
        for (const key of Object.keys(ctx)) {
            const value = ctx[key];
            safe[key] = typeof value === 'string' ? redact(value) : value;
        }
        return safe;
    }

    /**
     * Redact every STRING value of an error `detail` record — same
     * choke point rigor as log contexts, so a hostile server cannot
     * smuggle an echoed secret through field-specific feedback data.
     */
    function redactDetail(
        detail: Readonly<Record<string, string | number | boolean>>,
    ): Record<string, string | number | boolean> {
        const safe: Record<string, string | number | boolean> = {};
        for (const [key, value] of Object.entries(detail)) {
            safe[key] = typeof value === 'string' ? redact(value) : value;
        }
        return safe;
    }

    function log(
        level: 'debug' | 'info' | 'warn' | 'error',
        msg: string,
        ctx: Readonly<Record<string, unknown>> = {},
    ): void {
        if (options.verboseLogging !== true || logger === undefined) {
            return;
        }
        logger[level](redact(msg), redactContext(ctx));
    }

    // -- Claim persistence --------------------------------------------------------

    /** Storage backing, resolved once (private mode → `null`). */
    const storage: LobbyStorage | null = options.storage !== undefined ? options.storage : resolveLobbyStorage();

    /**
     * Guarantee an in-memory claim, restoring from storage or minting
     * fresh as needed. Called at the top of every establish cycle so a
     * forgotten/expired claim self-heals before the next presentation.
     * Every value that passes through is registered with
     * {@link knownSecrets} for the redaction choke point.
     */
    function ensureClaim(): StoredLobbyClaim {
        if (currentClaim !== null) {
            return currentClaim;
        }
        const restored = loadStoredClaim(storage);
        if (restored !== null) {
            knownSecrets.add(restored.guestPlayerId);
            currentClaim = restored;
            confirmedHandle = restored.handle;
            return restored;
        }
        const fresh: StoredLobbyClaim = { guestPlayerId: mintClaimId(), handle: null };
        knownSecrets.add(fresh.guestPlayerId);
        if (!saveStoredClaim(fresh, storage) && storage !== null) {
            log('warn', 'claim persistence failed (storage unavailable or full)', {});
        }
        currentClaim = fresh;
        confirmedHandle = null;
        return fresh;
    }

    /** Write the claim through to storage (best-effort; failures logged, never thrown). */
    function persistClaim(): void {
        if (currentClaim === null) {
            return;
        }
        const written = saveStoredClaim(currentClaim, storage);
        if (!written && storage !== null) {
            log('warn', 'claim persistence failed (storage unavailable or full)', {});
        }
    }

    /**
     * Drop the claim everywhere (storage + memory + handle) after the
     * server signals it is dead (`identity_expired`/`server_restarted`)
     * or the visitor explicitly forgets. The NEXT establish cycle mints
     * a fresh claim automatically.
     */
    function invalidateClaim(reason: string): void {
        clearStoredClaim(storage);
        currentClaim = null;
        confirmedHandle = null;
        log('info', 'lobby claim invalidated', { reason });
    }

    /**
     * Adopt a server-issued opaque id (feature 010 Clarifications
     * v1.6): the directed `identity` event is THE FR-003 delivery
     * channel, so the id the SERVER resolved always wins over the
     * local bootstrap mint. When it differs, our presented claim was
     * unknown server-side (expired, forged, or post-restart) and the
     * delivered value is the living successor — adopting and
     * persisting it (instead of wiping it) is what makes reload-
     * restore work end-to-end. Also self-heals a claim-less client
     * (e.g., storage was cleared mid-session) from the delivered id.
     *
     * @returns `true` when the claim's id CHANGED because of this
     *   delivery (the presented claim did not match the server's).
     */
    function adoptServerGuestId(delivered: GuestPlayerId | undefined): boolean {
        if (delivered === undefined) {
            return false;
        }
        knownSecrets.add(delivered);
        if (currentClaim === null) {
            const adopted: StoredLobbyClaim = { guestPlayerId: delivered, handle: confirmedHandle };
            currentClaim = adopted;
            persistClaim();
            return true;
        }
        if (currentClaim.guestPlayerId === delivered) {
            return false;
        }
        const successor: StoredLobbyClaim = { guestPlayerId: delivered, handle: currentClaim.handle };
        currentClaim = successor;
        persistClaim();
        return true;
    }

    /** Build the advisory wire claim (exactOptionalPropertyTypes: omit null handle). */
    function wireClaim(claim: StoredLobbyClaim): GuestIdentityClaim {
        return claim.handle === null
            ? { guestPlayerId: claim.guestPlayerId }
            : { guestPlayerId: claim.guestPlayerId, handle: claim.handle };
    }

    // -- State + listener plumbing --------------------------------------------------

    function setState(next: LobbyConnectionState): void {
        if (connection === next) {
            return;
        }
        connection = next;
        log('debug', 'connection state', { state: next });
        for (const handler of stateHandlers) {
            handler(next);
        }
    }

    /** Reject every outstanding action + the connect promise (attempt death). */
    function flushPendings(error: Error): void {
        for (const pending of pendingActions.values()) {
            scheduler.clearTimeout(pending.timerHandle);
            pending.settle({ ok: false, error });
        }
        pendingActions.clear();
        if (connectReject !== null) {
            const reject = connectReject;
            connectResolve = null;
            connectReject = null;
            reject(error);
        }
    }

    // -- Timers ---------------------------------------------------------------------

    function stopHeartbeat(): void {
        if (heartbeatTimer !== undefined) {
            scheduler.clearTimeout(heartbeatTimer);
            heartbeatTimer = undefined;
        }
    }

    /** Schedule the next ping at half the advertised interval (chained timeout). */
    function schedulePing(): void {
        stopHeartbeat();
        if (!greeted || heartbeatPeriodMs <= 0) {
            return;
        }
        const periodMs = Math.max(HEARTBEAT_FLOOR_MS, Math.floor(heartbeatPeriodMs / HEARTBEAT_INTERVAL_DIVISOR));
        heartbeatTimer = scheduler.setTimeout(() => {
            if (socket === null || !greeted) {
                return;
            }
            try {
                // Wall-clock here is the sanctioned transport boundary
                // (informational `clientTimeMs`; never simulation state).
                sendEnvelope({ clientTimeMs: Date.now() }, 'ping');
            } catch {
                // Socket mid-close; the close handler owns teardown.
            }
            schedulePing();
        }, periodMs);
    }

    function stopEstablishTimer(): void {
        if (establishTimer !== undefined) {
            scheduler.clearTimeout(establishTimer);
            establishTimer = undefined;
        }
    }

    function stopReconnectTimer(): void {
        if (reconnectTimer !== undefined) {
            scheduler.clearTimeout(reconnectTimer);
            reconnectTimer = undefined;
        }
    }

    /** Exponential backoff: `base * 2^(attempt-1)`, capped. Deterministic (no jitter). */
    function backoffDelayMs(attempt: number): number {
        const raw = reconnectBaseDelayMs * BACKOFF_MULTIPLIER ** (attempt - 1);
        return Math.min(raw, reconnectMaxDelayMs);
    }

    // -- Outbound -------------------------------------------------------------------

    /** Send one client→server envelope stamped with the next per-connection seq. */
    function sendEnvelope(payload: NetworkPayload, type: ProtocolEnvelope<NetworkPayload>['type']): void {
        if (socket === null) {
            throw new LobbyTransportError(`ws-lobby-client: cannot send ${type} without an open socket`);
        }
        clientSeq += 1;
        const envelope: ProtocolEnvelope<NetworkPayload> = {
            type,
            version: NETWORK_API_VERSION,
            seq: clientSeq as SequenceNumber,
            payload,
        };
        socket.send(encodeFrame(envelope));
    }

    function nextActionId(): LobbyActionId {
        actionCounter += 1;
        return actionCounter as LobbyActionId;
    }

    /**
     * Register a correlated action: stamp a fresh actionId, send the
     * payload, arm the timeout, and return the promise that settles
     * ONLY on the echo of that exact id (or timeout/transport death).
     * By default requires an established, ready connection;
     * {@link beginSubscription} opts out because it runs MID-cycle.
     */
    function sendCorrelatedAction<T>(
        kind: LobbyRequestKind,
        buildPayload: (actionId: LobbyActionId) => NetworkPayload,
        description: string,
        opts: { readonly requireReady?: boolean; readonly settlesOnIdentity?: boolean } = {},
    ): Promise<T> {
        if ((opts.requireReady ?? true) && connection !== 'ready') {
            return Promise.reject(
                new LobbyTransportError(
                    `ws-lobby-client: ${description} requires a ready lobby connection (got ${connection})`,
                ),
            );
        }
        const actionId = nextActionId();
        let resolveFn!: (value: T) => void;
        let rejectFn!: (error: Error) => void;
        const promise = new Promise<T>((resolve, reject) => {
            resolveFn = resolve;
            rejectFn = reject;
        });
        const timerHandle = scheduler.setTimeout(() => {
            if (pendingActions.delete(actionId)) {
                rejectFn(new LobbyTimeoutError(description));
            }
        }, actionTimeoutMs);
        pendingActions.set(actionId, {
            description,
            timerHandle,
            settlesOnIdentity: opts.settlesOnIdentity ?? false,
            settle: (outcome) => {
                scheduler.clearTimeout(timerHandle);
                if (outcome.ok) {
                    // Sound by construction: only this call's resolver is
                    // registered under this actionId.
                    resolveFn(outcome.value as T);
                } else {
                    rejectFn(outcome.error);
                }
            },
        });
        try {
            sendEnvelope(buildPayload(actionId), kind);
        } catch (error) {
            pendingActions.delete(actionId);
            scheduler.clearTimeout(timerHandle);
            rejectFn(error instanceof Error ? error : new LobbyTransportError('ws-lobby-client: send failed'));
        }
        return promise;
    }

    // -- Establish cycle ------------------------------------------------------------

    /**
     * Start one establish attempt against {@link activeUrl}: open the
     * socket; hello flows on open; identity + subscribe follow their
     * server events. Arms the cycle-wide establish timeout.
     */
    function startAttempt(): void {
        if (activeUrl === null) {
            return;
        }
        attemptEpoch += 1;
        const epoch = attemptEpoch;
        phase = 'identity';
        greeted = false;
        const created = newSocket(activeUrl);
        socket = created;
        attach(created, epoch);
        stopEstablishTimer();
        establishTimer = scheduler.setTimeout(() => {
            if (epoch !== attemptEpoch) {
                return;
            }
            failAttempt(new LobbyTimeoutError('establish cycle'));
        }, actionTimeoutMs);
    }

    /** Attach the protocol handlers to a freshly created socket (epoch-guarded). */
    function attach(socketToAttach: WebSocket, epoch: number): void {
        socketToAttach.onopen = () => {
            if (epoch !== attemptEpoch) {
                return;
            }
            log('debug', 'socket open', {});
            // FR-003 (networking): hello is the first frame on every fresh connection.
            sendEnvelope({ protocolVersion: NETWORK_API_VERSION }, 'hello');
        };
        socketToAttach.onmessage = (event: MessageEvent<string>) => {
            if (epoch !== attemptEpoch) {
                return;
            }
            const decoded = tryDecodeFrame(event.data);
            if (!decoded.ok) {
                // Malformed inbound frames are dropped; the server owns
                // protocol enforcement and a bad frame never advances our state.
                log('warn', 'inbound frame failed validation', { detail: decoded.error.message });
                return;
            }
            handleEnvelope(decoded.envelope);
        };
        socketToAttach.onclose = (event: CloseEvent) => {
            if (epoch !== attemptEpoch) {
                return;
            }
            handleTransportClose(event.code);
        };
        socketToAttach.onerror = () => {
            if (epoch !== attemptEpoch) {
                return;
            }
            log('warn', 'socket transport error', {});
        };
    }

    /**
     * One attempt died (transport close, establish timeout). Flushes
     * everything pending and either schedules the next backoff attempt
     * or lands in a terminal state. Bumps the attempt epoch so late
     * callbacks from the discarded socket no-op.
     */
    function failAttempt(error: Error): void {
        attemptEpoch += 1;
        stopEstablishTimer();
        stopHeartbeat();
        greeted = false;
        phase = null;
        flushPendings(error);
        socket?.close(SOCKET_CLOSE_NORMAL, 'client resetting');
        socket = null;
        if (closedByUs) {
            setState('closed');
            return;
        }
        if (!autoReconnect) {
            setState('disconnected');
            return;
        }
        reconnectAttempt += 1;
        if (reconnectAttempt > maxReconnectAttempts) {
            log('error', 'lobby re-establish failed; retry budget exhausted', { attempts: reconnectAttempt - 1 });
            setState('failed');
            return;
        }
        setState('reconnecting');
        const delayMs = backoffDelayMs(reconnectAttempt);
        log('info', 'scheduling lobby re-establish attempt', { attempt: reconnectAttempt, delayMs });
        reconnectTimer = scheduler.setTimeout(() => {
            reconnectTimer = undefined;
            startAttempt();
        }, delayMs);
    }

    /** Finish the establish cycle: baseline received → ready. */
    function finishEstablish(): void {
        stopEstablishTimer();
        phase = null;
        reconnectAttempt = 0;
        setState('ready');
        if (connectResolve !== null) {
            const resolve = connectResolve;
            connectResolve = null;
            connectReject = null;
            resolve();
        }
    }

    /** Fatal, non-retryable protocol condition (version skew). */
    function protocolFatal(message: string): void {
        attemptEpoch += 1;
        log('error', message, {});
        flushPendings(new LobbyTransportError(`ws-lobby-client: ${message}`));
        socket?.close(SOCKET_CLOSE_PROTOCOL_ERROR, 'version mismatch');
        socket = null;
        phase = null;
        stopEstablishTimer();
        stopHeartbeat();
        greeted = false;
        setState('failed');
    }

    function handleTransportClose(code: number): void {
        attemptEpoch += 1;
        socket = null;
        log('warn', 'lobby socket closed by transport', { code });
        failAttempt(new LobbyTransportError(`ws-lobby-client: socket closed (${String(code)}) mid-cycle`));
    }

    // -- Inbound handling -------------------------------------------------------------

    /** Narrow + route one decoded inbound envelope (documented-cast pattern). */
    function handleEnvelope(envelope: ProtocolEnvelope<NetworkPayload>): void {
        switch (envelope.type) {
            case 'helloAck': {
                const payload = envelope.payload as Extract<
                    NetworkPayload,
                    { protocolVersion: string; connectionId: string; heartbeatIntervalMs: number }
                >;
                const version = validateVersion(payload.protocolVersion);
                if (!version.ok) {
                    protocolFatal(`helloAck version mismatch (${version.error.message})`);
                    return;
                }
                greeted = true;
                heartbeatPeriodMs = payload.heartbeatIntervalMs;
                schedulePing();
                // Present the (guaranteed) resume claim; the directed
                // `identity` event completes establishment.
                const claim = ensureClaim();
                sendEnvelope({ claim: wireClaim(claim) }, 'lobbyIdentity');
                return;
            }
            case 'lobbyEvent': {
                const payload = envelope.payload as Extract<NetworkPayload, { event: unknown }>;
                handleLobbyEvent(payload.event);
                return;
            }
            case 'pong':
                return;
            case 'error': {
                const payload = envelope.payload as Extract<NetworkPayload, { code: string; message: string }>;
                if (payload.code === 'version_mismatch') {
                    protocolFatal(`transport error: ${payload.code}`);
                    return;
                }
                log('warn', 'transport-level error envelope', { code: payload.code, message: payload.message });
                return;
            }
            default:
                // Unknown additive kinds are ignored (wire tolerance rule).
                return;
        }
    }

    /** Route one decoded lobby event: identity/snapshot bookkeeping + correlation. */
    function handleLobbyEvent(event: LobbyEvent): void {
        switch (event.kind) {
            case 'identity':
                applyIdentity(event.identity);
                return;
            case 'snapshot':
                applySnapshot(event.snapshot);
                return;
            case 'actionAccepted':
                settleByActionId(event.actionId, { ok: true, value: event.transition });
                return;
            case 'error':
                handleLobbyError(event);
                return;
            default:
                // Unrecognized additive variant: ignored (tolerance rule).
                return;
        }
    }

    /**
     * Record a server-confirmed identity. While ESTABLISHING, this is
     * the handshake gate (advance to subscribe). A server-delivered
     * `guestPlayerId` (feature 010 Clarifications v1.6) is adopted as
     * the resume claim FIRST — the server's id always wins over the
     * local bootstrap mint. A handle dropping to `null` after having
     * been set means the server forgot us: the stale claim is
     * invalidated so the next cycle presents a fresh one ("landing
     * page starts a fresh session" — spec edge case) — UNLESS the
     * delivery itself just handed us a successor id, which IS the
     * fresh session and must survive for reload-restore.
     */
    function applyIdentity(identity: IdentityState): void {
        const hadHandle = confirmedHandle !== null;
        confirmedHandle = identity.handle;
        // Ownership is judged BEFORE adoption runs: a directed identity
        // event naming a DIFFERENT guest id is another visitor's
        // projection (directed routing makes this unlikely; defend
        // anyway) and must never settle OUR pending rename — even
        // though the R-009 adoption below still records the delivered
        // id. An id-less event (older-server shape) cannot prove
        // foreignness and is tolerated, matching the adoption rules.
        const deliveredOwnsOurPendingRenames =
            identity.guestPlayerId === undefined ||
            currentClaim === null ||
            identity.guestPlayerId === currentClaim.guestPlayerId;
        // FR-003 delivery channel: server-delivered id replaces the
        // local mint and is persisted immediately.
        const superseded = adoptServerGuestId(identity.guestPlayerId);
        if (currentClaim !== null && currentClaim.handle !== identity.handle) {
            currentClaim = { guestPlayerId: currentClaim.guestPlayerId, handle: identity.handle };
            persistClaim();
        }
        if (hadHandle && identity.handle === null && !superseded) {
            invalidateClaim('server identity no longer knows our handle');
        }
        log('debug', 'identity updated', { hasHandle: identity.handle !== null });
        for (const handler of identityHandlers) {
            handler(identity);
        }
        // Release pending renames: the directed identity event ALONE is
        // the authoritative confirmation (see PendingAction). Resolve
        // with the just-applied confirmed handle; a rare double-issued
        // rename resolves every pending entry with that same value.
        if (deliveredOwnsOurPendingRenames) {
            for (const [actionId, pending] of pendingActions) {
                if (pending.settlesOnIdentity) {
                    pendingActions.delete(actionId);
                    pending.settle({ ok: true, value: { handle: confirmedHandle, hasIdentity: true } });
                }
            }
        }
        if (phase === 'identity') {
            beginSubscription();
        }
    }

    /** Reset the revision baseline and request the snapshot stream. */
    function beginSubscription(): void {
        phase = 'subscribe';
        // Baseline reset (deliberate): each establish cycle adopts the
        // server's current snapshot whatever its revision — this is
        // what makes a RESTARTED server's low revisions applicable.
        lastAppliedRevision = null;
        void sendCorrelatedAction<void>('lobbySubscribe', (actionId) => ({ actionId }), 'subscribe', {
            requireReady: false,
        })
            .then(() => {
                // Resolved by the baseline snapshot or the accepted
                // echo; either way the cycle is complete.
                if (phase === 'subscribe') {
                    finishEstablish();
                }
            })
            .catch((error: unknown) => {
                log('warn', 'lobby subscription failed', { detail: error instanceof Error ? error.message : '' });
            });
    }

    /**
     * Apply a snapshot iff strictly newer than the last applied one
     * (FR-013). Stale/equal revisions are discarded silently — the
     * baseline reset in {@link beginSubscription} guarantees the fresh
     * subscribe's snapshot always applies.
     */
    function applySnapshot(snapshot: LobbySnapshot): void {
        if (lastAppliedRevision !== null && snapshot.revision <= lastAppliedRevision) {
            log('debug', 'stale snapshot discarded', {
                received: snapshot.revision,
                applied: lastAppliedRevision,
            });
            return;
        }
        lastAppliedRevision = snapshot.revision;
        snapshotState = snapshot;
        log('debug', 'snapshot applied', { revision: snapshot.revision, entries: snapshot.entries.length });
        for (const handler of snapshotHandlers) {
            handler(snapshot);
        }
        // The first snapshot after subscribe IS the subscribe answer
        // (the wire snapshot carries no actionId of its own).
        settleFirstPending('subscribe', { ok: true, value: undefined });
    }

    /**
     * Correlated rejection path: settle the matching pending action
     * with a typed error; additionally honor identity-death codes
     * whether or not the error was correlated.
     */
    function handleLobbyError(event: Extract<LobbyEvent, { kind: 'error' }>): void {
        const sanitizedMessage = redact(event.message);
        // Detail values get the same scrub (defense-in-depth against a
        // hostile server echoing a secret through field-specific data).
        const detail = event.detail === undefined ? null : redactDetail(event.detail);
        if (event.actionId !== undefined) {
            const pending = pendingActions.get(event.actionId);
            if (pending !== undefined) {
                pendingActions.delete(event.actionId);
                pending.settle({
                    ok: false,
                    error: new LobbyActionRejectedError(event.code, sanitizedMessage, detail),
                });
            } else {
                // Impostor/stale echo: no matching in-flight action → ignored.
                log('debug', 'ignoring error echo without matching action', { code: event.code });
            }
        }
        if (IDENTITY_INVALIDATED_CODES.has(event.code)) {
            invalidateClaim(event.code);
            log('warn', 'lobby identity invalidated by server', { code: event.code, message: sanitizedMessage });
            reportError({ code: event.code, message: sanitizedMessage, detail, actionId: event.actionId ?? null });
        } else if (event.actionId === undefined) {
            log('warn', 'uncorrelated lobby error', { code: event.code, message: sanitizedMessage });
            reportError({ code: event.code, message: sanitizedMessage, detail, actionId: null });
        }
    }

    /** Fan an uncorrelated error report out to subscribers (sanitized upstream). */
    function reportError(report: LobbyErrorReport): void {
        for (const handler of errorHandlers) {
            handler(report);
        }
    }

    /** Settle the pending action with the given actionId, if any (impostor echoes no-op). */
    function settleByActionId(actionId: LobbyActionId, outcome: ActionOutcome): void {
        const pending = pendingActions.get(actionId);
        if (pending === undefined) {
            log('debug', 'ignoring echo without matching action', { actionId });
            return;
        }
        if (outcome.ok && pending.settlesOnIdentity) {
            // Rename flow: an accepted echo plays no role in settlement
            // (the wire sends none for data-only updates anyway); the
            // action stays pending for its directed identity event.
            log('debug', 'ignoring accepted echo for an identity-settled action', { actionId });
            return;
        }
        pendingActions.delete(actionId);
        pending.settle(outcome);
    }

    /** Settle the first pending action matching a description (subscribe-by-shape fallback). */
    function settleFirstPending(description: string, outcome: ActionOutcome): void {
        for (const [actionId, pending] of pendingActions) {
            if (pending.description === description) {
                pendingActions.delete(actionId);
                pending.settle(outcome);
                return;
            }
        }
    }

    // -- Client assembly -----------------------------------------------------------

    const client: WsLobbyClient = {
        connect(url: string): Promise<void> {
            if (
                socket !== null ||
                connection === 'connecting' ||
                connection === 'reconnecting' ||
                connection === 'ready'
            ) {
                return Promise.reject(
                    new LobbyTransportError(`ws-lobby-client: connect() called on an active client (${connection})`),
                );
            }
            closedByUs = false;
            reconnectAttempt = 0;
            activeUrl = url;
            ensureClaim();
            setState('connecting');
            return new Promise<void>((resolve, reject) => {
                connectResolve = resolve;
                connectReject = reject;
                startAttempt();
            });
        },

        disconnect(): void {
            closedByUs = true;
            attemptEpoch += 1;
            stopReconnectTimer();
            stopEstablishTimer();
            stopHeartbeat();
            greeted = false;
            phase = null;
            flushPendings(new LobbyTransportError('ws-lobby-client: disconnected locally'));
            socket?.close(SOCKET_CLOSE_NORMAL, 'client closing');
            socket = null;
            setState('closed');
        },

        forgetIdentity(): void {
            invalidateClaim('forgotten by visitor');
        },

        setHandle(handle: string): Promise<IdentityState> {
            // Settles on the directed `identity` event ALONE (see
            // PendingAction.settlesOnIdentity): the wire sends no
            // success frame for data-only updates. A correlated `error`
            // event still rejects, and the timeout remains the safety
            // net for a lost confirmation.
            return sendCorrelatedAction<IdentityState>(
                'lobbySetHandle',
                (actionId) => ({ handle, actionId }),
                'setHandle',
                { settlesOnIdentity: true },
            );
        },

        createMatch(settings?: Partial<LobbyMatchSettings>): Promise<'waiting' | 'match'> {
            return sendCorrelatedAction<'waiting' | 'match'>(
                'lobbyCreate',
                (actionId) => (settings === undefined ? { actionId } : { actionId, settings }),
                'createMatch',
            );
        },

        joinMatch(matchId: MatchId): Promise<'waiting' | 'match'> {
            return sendCorrelatedAction<'waiting' | 'match'>(
                'lobbyJoin',
                (actionId) => ({ actionId, matchId }),
                'joinMatch',
            );
        },

        spectateMatch(matchId: MatchId): Promise<'waiting' | 'match'> {
            return sendCorrelatedAction<'waiting' | 'match'>(
                'lobbySpectate',
                (actionId) => ({ actionId, matchId }),
                'spectateMatch',
            );
        },

        leaveMatch(): Promise<void> {
            // Deliberately does NOT clear the claim: the wire semantic is
            // "release the match association and RETURN TO THE LOBBY",
            // which still requires the identity. Explicit identity
            // abandonment is `forgetIdentity()`.
            return sendCorrelatedAction<void>('lobbyLeave', (actionId) => ({ actionId }), 'leaveMatch');
        },

        state(): WsLobbyClientState {
            return {
                connection,
                handle: confirmedHandle,
                hasClaim: currentClaim !== null,
                snapshot: snapshotState,
                lastAppliedRevision,
                reconnectAttempt,
            };
        },

        onStateChange(handler: (state: LobbyConnectionState) => void): () => void {
            stateHandlers.add(handler);
            return () => {
                stateHandlers.delete(handler);
            };
        },

        onIdentity(handler: (identity: IdentityState) => void): () => void {
            identityHandlers.add(handler);
            return () => {
                identityHandlers.delete(handler);
            };
        },

        onSnapshot(handler: (snapshot: LobbySnapshot) => void): () => void {
            snapshotHandlers.add(handler);
            return () => {
                snapshotHandlers.delete(handler);
            };
        },

        onError(handler: (report: LobbyErrorReport) => void): () => void {
            errorHandlers.add(handler);
            return () => {
                errorHandlers.delete(handler);
            };
        },
    };

    return client;
}
