/**
 * Lobby Wire Fixtures — Feature 010 test fixture (T-004)
 *
 * Deterministic builders for feature-010's additive lobby messages
 * (`src/contracts/network-types.ts`, mirrored through `src/types.ts`),
 * for Wave-3 suites: dispatcher/validation tests (T-010/T-011) feed
 * these inbound, transport integration tests (T-013) assert on them
 * outbound, and browser-client tests (T-012) decode them.
 *
 *   - Branded-id minters ({@link nextGuestPlayerId},
 *     {@link nextLobbyRevision}, {@link nextLobbyActionId}).
 *   - {@link buildLobbyEntry} / {@link buildLobbySnapshot} /
 *     {@link buildIdentityState} — the wire projection shapes.
 *   - One builder per client→server lobby payload (all eight kinds) plus
 *     {@link lobbyEventPayload} for the server→client push frame.
 *   - {@link buildLobbyEnvelope} — a version-stamped envelope assembler
 *     whose `type` ↔ payload pairing is enforced at compile time via
 *     {@link LobbyPayloadMap}, so a kind can never ride the wrong body.
 *
 * Event/payload SHAPES are imported from the real contract — this file
 * declares only the kind→payload association map, which doubles as a
 * drift detector (an unknown or renamed kind stops compiling).
 *
 * Pure module: no clock reads, no randomness (constitution Principle II).
 */

import { NETWORK_API_VERSION } from '../../src/constants';
import type {
    GuestIdentityClaim,
    GuestPlayerId,
    IdentityState,
    LobbyActionId,
    LobbyCreatePayload,
    LobbyEvent,
    LobbyEventPayload,
    LobbyIdentityPayload,
    LobbyJoinPayload,
    LobbyLeavePayload,
    LobbyMatchSettings,
    LobbyRevision,
    LobbySetHandlePayload,
    LobbySnapshot,
    LobbySpectatePayload,
    LobbyStatus,
    LobbySubscribePayload,
    LobbyTerrainSettings,
    MatchId,
    MessageKind,
    NetworkPayload,
    ProtocolEnvelope,
    PublicLobbyEntry,
} from '../../src/types';

// ----------------------------------------------------------------------------
// Branded id minting
// ----------------------------------------------------------------------------

/** Monotonic counters behind the minters below (per module load). */
let guestPlayerIdCounter = 0;
let revisionCounter = 0;
let actionIdCounter = 0;
let matchIdCounter = 0;

/**
 * Mint a fresh opaque wire `GuestPlayerId` (`guest-0001`, …).
 * Deterministic within a process; non-semantic by construction.
 */
export function nextGuestPlayerId(): GuestPlayerId {
    guestPlayerIdCounter += 1;
    return `guest-${String(guestPlayerIdCounter).padStart(4, '0')}` as GuestPlayerId;
}

/** Mint a fresh wire `MatchId` for lobby entries (`match-wire-0001`, …). */
export function nextLobbyMatchId(): MatchId {
    matchIdCounter += 1;
    return `match-wire-${String(matchIdCounter).padStart(4, '0')}` as MatchId;
}

/** Mint the next monotonic wire `LobbyRevision` (starts at 1). */
export function nextLobbyRevision(): LobbyRevision {
    revisionCounter += 1;
    return revisionCounter as LobbyRevision;
}

/** Mint the next client-side `LobbyActionId` correlation id. */
export function nextLobbyActionId(): LobbyActionId {
    actionIdCounter += 1;
    return actionIdCounter as LobbyActionId;
}

// ----------------------------------------------------------------------------
// Wire projection builders
// ----------------------------------------------------------------------------

/** Overrides for {@link buildIdentityClaim}; omitted fields keep defaults. */
export type WireIdentityClaimOverrides = Partial<GuestIdentityClaim>;

/**
 * Build a wire `GuestIdentityClaim` (advisory resume INPUT). Default
 * carries both fields. For first-visit shapes, OMIT keys via rest
 * destructuring instead of `undefined` overrides
 * (`exactOptionalPropertyTypes` rejects the latter):
 *
 *   const { guestPlayerId: _strippedId, ...firstVisit } =
 *       buildIdentityClaim();
 *
 * `_strippedId` captures the removed field; `firstVisit` holds only the
 * remaining keys and stays assignable to `GuestIdentityClaim`.
 */
export function buildIdentityClaim(overrides: WireIdentityClaimOverrides = {}): GuestIdentityClaim {
    return Object.freeze({
        guestPlayerId: nextGuestPlayerId(),
        handle: 'Nova',
        ...overrides,
    });
}

/** Overrides for {@link buildIdentityState}; omitted fields keep defaults. */
export type WireIdentityStateOverrides = Partial<IdentityState>;

/** Build a wire `IdentityState` (safe server projection; no opaque id). */
export function buildIdentityState(overrides: WireIdentityStateOverrides = {}): IdentityState {
    return Object.freeze({
        handle: 'Nova',
        hasIdentity: true,
        ...overrides,
    });
}

/** Overrides for {@link buildLobbyEntry}; omitted fields keep defaults. */
export interface WireLobbyEntryOverrides {
    readonly matchId?: MatchId;
    readonly seatsFilled?: number;
    readonly capacity?: 2 | 3 | 4;
    readonly status?: LobbyStatus;
    readonly boardSize?: number;
    readonly tickIntervalMs?: number;
}

/**
 * Build one wire `PublicLobbyEntry`. Defaults mirror the shipped v1
 * create flow: creator seated (1 of 2), waiting, 32-board, 250 ms
 * ticks. Frozen.
 */
export function buildLobbyEntry(overrides: WireLobbyEntryOverrides = {}): PublicLobbyEntry {
    return Object.freeze({
        matchId: overrides.matchId ?? nextLobbyMatchId(),
        seatsFilled: overrides.seatsFilled ?? 1,
        capacity: overrides.capacity ?? 2,
        status: overrides.status ?? 'waiting',
        boardSize: overrides.boardSize ?? 32,
        tickIntervalMs: overrides.tickIntervalMs ?? 250,
    });
}

/** Overrides for {@link buildLobbySnapshot}; omitted fields keep defaults. */
export interface WireLobbySnapshotOverrides {
    readonly revision?: LobbyRevision;
    readonly entries?: readonly PublicLobbyEntry[];
    readonly activeMatchId?: MatchId | null;
}

/**
 * Build a complete wire `LobbySnapshot`. Defaults: next monotonic
 * revision, empty list, no active match. Frozen.
 */
export function buildLobbySnapshot(overrides: WireLobbySnapshotOverrides = {}): LobbySnapshot {
    return Object.freeze({
        revision: overrides.revision ?? nextLobbyRevision(),
        entries: overrides.entries ?? [],
        activeMatchId: overrides.activeMatchId ?? null,
    });
}

/** Overrides for {@link buildLobbyTerrainSettings}; omitted fields keep defaults. */
export interface WireTerrainSettingsOverrides {
    readonly waterRatio?: number;
    readonly roughness?: number;
    readonly octaves?: number;
    readonly citiesPerPlayer?: number;
    readonly symmetryStrategy?: 'point';
    readonly minCityWaterDistance?: number;
    readonly minCityCityDistance?: number;
    readonly maxRegenAttempts?: number;
}

/**
 * Build wire `LobbyTerrainSettings` at the documented defaults
 * (water 0.10, roughness 0.5, 4 octaves, 1 city/player, point
 * symmetry, distances 3/5, 5 regen attempts). Frozen.
 */
export function buildLobbyTerrainSettings(overrides: WireTerrainSettingsOverrides = {}): LobbyTerrainSettings {
    return Object.freeze({
        waterRatio: overrides.waterRatio ?? 0.1,
        roughness: overrides.roughness ?? 0.5,
        octaves: overrides.octaves ?? 4,
        citiesPerPlayer: overrides.citiesPerPlayer ?? 1,
        symmetryStrategy: overrides.symmetryStrategy ?? 'point',
        minCityWaterDistance: overrides.minCityWaterDistance ?? 3,
        minCityCityDistance: overrides.minCityCityDistance ?? 5,
        maxRegenAttempts: overrides.maxRegenAttempts ?? 5,
    });
}

/** Overrides for {@link buildLobbyMatchSettings}; omitted fields keep defaults. */
export interface WireMatchSettingsOverrides {
    readonly playerCount?: 2 | 3 | 4;
    readonly boardSize?: number;
    readonly tickIntervalMs?: number;
    readonly terrainSettings?: LobbyTerrainSettings;
}

/** Build wire `LobbyMatchSettings` at shipped v1 defaults. Frozen. */
export function buildLobbyMatchSettings(overrides: WireMatchSettingsOverrides = {}): LobbyMatchSettings {
    return Object.freeze({
        playerCount: overrides.playerCount ?? 2,
        boardSize: overrides.boardSize ?? 32,
        tickIntervalMs: overrides.tickIntervalMs ?? 250,
        terrainSettings: overrides.terrainSettings ?? buildLobbyTerrainSettings(),
    });
}

// ----------------------------------------------------------------------------
// Client → Server payload builders (one per lobby request kind)
// ----------------------------------------------------------------------------

/** Args for {@link lobbyIdentityPayload}. */
export interface LobbyIdentityArgs {
    /** Advisory resume claim; omit for a first visit. */
    readonly claim?: GuestIdentityClaim;
}

/** Build a `lobbyIdentity` payload (establish/restore identity). */
export function lobbyIdentityPayload(args: LobbyIdentityArgs = {}): LobbyIdentityPayload {
    return Object.freeze(args.claim === undefined ? {} : { claim: args.claim });
}

/** Build a `lobbySetHandle` payload; mints the next action id by default. */
export function lobbySetHandlePayload(
    handle: string,
    actionId: LobbyActionId = nextLobbyActionId(),
): LobbySetHandlePayload {
    return Object.freeze({ handle, actionId });
}

/** Build a `lobbySubscribe` payload; mints the next action id by default. */
export function lobbySubscribePayload(actionId: LobbyActionId = nextLobbyActionId()): LobbySubscribePayload {
    return Object.freeze({ actionId });
}

/** Args for {@link lobbyCreatePayload}. */
export interface LobbyCreateArgs {
    /** Optional settings presets merged/validated matchmaking-side. */
    readonly settings?: Partial<LobbyMatchSettings>;
    /** Correlation id; mints the next one by default. */
    readonly actionId?: LobbyActionId;
}

/** Build a `lobbyCreate` payload (create public match, reserve seat). */
export function lobbyCreatePayload(args: LobbyCreateArgs = {}): LobbyCreatePayload {
    const base: { readonly actionId: LobbyActionId } = { actionId: args.actionId ?? nextLobbyActionId() };
    return Object.freeze(args.settings === undefined ? base : { ...base, settings: args.settings });
}

/** Build a `lobbyJoin` payload; mints the next action id by default. */
export function lobbyJoinPayload(matchId: MatchId, actionId: LobbyActionId = nextLobbyActionId()): LobbyJoinPayload {
    return Object.freeze({ matchId, actionId });
}

/** Build a `lobbySpectate` payload; mints the next action id by default. */
export function lobbySpectatePayload(
    matchId: MatchId,
    actionId: LobbyActionId = nextLobbyActionId(),
): LobbySpectatePayload {
    return Object.freeze({ matchId, actionId });
}

/** Build a `lobbyLeave` payload; mints the next action id by default. */
export function lobbyLeavePayload(actionId: LobbyActionId = nextLobbyActionId()): LobbyLeavePayload {
    return Object.freeze({ actionId });
}

// ----------------------------------------------------------------------------
// Server → Client event payload builder
// ----------------------------------------------------------------------------

/**
 * Build a `lobbyEvent` push payload wrapping any of the four
 * {@link LobbyEvent} variants (identity / snapshot / actionAccepted /
 * error). Compose events from literal objects typed against the real
 * union — e.g. `{ kind: 'error', code: 'match_full' satisfies
 * LobbyErrorCode, message: '…' }`.
 */
export function lobbyEventPayload(event: LobbyEvent): LobbyEventPayload {
    return Object.freeze({ event });
}

// ----------------------------------------------------------------------------
// Envelope assembly (compile-time kind ↔ payload correlation)
// ----------------------------------------------------------------------------

/**
 * Association of each lobby {@link MessageKind} to its exact payload
 * shape. Referenced by {@link buildLobbyEnvelope}; the `& MessageKind`
 * intersection in `LobbyMessageKind` makes any drift between this map
 * and the wire contract a compile error instead of a silent test bug.
 */
export interface LobbyPayloadMap {
    lobbyIdentity: LobbyIdentityPayload;
    lobbySetHandle: LobbySetHandlePayload;
    lobbySubscribe: LobbySubscribePayload;
    lobbyCreate: LobbyCreatePayload;
    lobbyJoin: LobbyJoinPayload;
    lobbySpectate: LobbySpectatePayload;
    lobbyLeave: LobbyLeavePayload;
    lobbyEvent: LobbyEventPayload;
}

/** The lobby subset of {@link MessageKind}, proven against the union. */
export type LobbyMessageKind = keyof LobbyPayloadMap & MessageKind;

/** Monotonic counter behind envelope sequence numbers (per module load). */
let envelopeSeqCounter = 0;

/**
 * Assemble a version-stamped `ProtocolEnvelope` for one lobby frame
 * with the next monotonic sequence number. The `type` argument must
 * be a lobby kind AND the payload must be that kind's exact shape —
 * mismatches fail compilation, not CI.
 *
 * @param type    The lobby message kind.
 * @param payload The kind's payload (build one via the helpers above).
 */
export function buildLobbyEnvelope<K extends LobbyMessageKind>(
    type: K,
    payload: LobbyPayloadMap[K],
): ProtocolEnvelope<NetworkPayload> {
    envelopeSeqCounter += 1;
    return Object.freeze({
        type,
        version: NETWORK_API_VERSION,
        seq: envelopeSeqCounter as ProtocolEnvelope<NetworkPayload>['seq'],
        payload,
    });
}
