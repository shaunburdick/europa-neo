/**
 * Compile-time contract witnesses — Feature 010 (T-001 + T-003).
 *
 * Proves the exported surface of the feature-010 lobby contracts
 * (`src/contracts/lobby-types.ts` + `src/contracts/lobby-api.ts`)
 * against the design documents at
 * `specs/010-public-lobby-match-browser/contracts/`. Mirrors the
 * console package's conformance precedent
 * (`packages/console/tests/integration/contract-conformance.test.ts`):
 *
 *   - The type-level assertions below are enforced by a DEDICATED
 *     strict tsc program — `pnpm typecheck:conformance`
 *     (`tsconfig.conformance.json`) — because `tests/` is excluded
 *     from every package tsconfig BY DESIGN (documented repo-wide
 *     tradeoff; CI compensates with dedicated strict programs).
 *   - Vitest does not type-check; the runtime assertions exist only to
 *     keep the compile-time witnesses "used" and are deterministic.
 *
 * What is witnessed:
 *
 *   (a) Branded-ID integrity — the three lobby brands match the
 *       repository's `string & { readonly __brand }` /
 *       `number & { readonly __brand }` convention exactly and stay
 *       pairwise distinct from networking's brands.
 *   (b) Design-doc shape pins — field types of the identity,
 *       projection, snapshot, error, and event shapes equal the
 *       `lobby-types.md` block (literal unions, readonly arrays,
 *       nullable handle, literal-`true` flag included).
 *   (c) Closed-union exhaustiveness — the error-code union and the
 *       four-kind event union cannot gain/lose a member without
 *       failing this program.
 *   (d) API-surface conformance — every `LobbyService` method returns
 *       exactly the documented `Result<_, LobbyError>` shape, takes
 *       the documented parameters, and uses networking's canonical
 *       `MatchId`/`ConnectionId` brands (no local re-branding). The
 *       feature-010 wire settings mirrors (`LobbyMatchSettings` /
 *       `LobbyTerrainSettings`, networking-owned) are additionally
 *       pinned mutually assignable to their authoritative declarations
 *       — matchmaking's `MatchSettings` and terrain's
 *       `GenerationSettings` — so mirror drift fails here. R-007 adds
 *       the same pin for the three lobby-domain types matchmaking
 *       declares locally (`LobbyEvent`, `IdentityState`,
 *       `PublicLobbyEntry`) against networking's canonical wire
 *       declarations — the local copies exist only because the facade
 *       is type-only toward upstream at runtime; structurally they are
 *       mirrors and drift between them is a bug.
 *   (e) Privacy envelope — no public projection or spectator target
 *       can grow an opaque guest id, seat, or token field without
 *       failing this program (spec FR-003/FR-024/NFR-003).
 *   (f) Public barrel surface (T-003) — every feature-010 contract
 *       name is reachable from the BUILT package root
 *       (`dist/index.d.ts` — what consumers actually import as
 *       `@europa/matchmaking`) and each barrel export IS the src
 *       contract declaration (mutual assignability, not a lookalike).
 *       Like the console precedent this half reads the built emit, so
 *       `pnpm typecheck:conformance` requires `pnpm build` first; the
 *       dist import is type-only (erased at runtime), so vitest never
 *       touches `dist/`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
    ConnectionId,
    LobbyMatchSettings,
    LobbyTerrainSettings,
    MatchId,
    IdentityState as WireIdentityState,
    LobbyEvent as WireLobbyEvent,
    PublicLobbyEntry as WirePublicLobbyEntry,
} from '@europa/networking';
// Terrain's authoritative generation settings — the declaration the
// feature-010 wire mirror must stay identical to (see (d) below).
import type { GenerationSettings } from '@europa/terrain';
import { describe, expect, it } from 'vitest';
// Feature-006 canonical shapes the lobby contracts build on.
import type { MatchSettings, SeatAssignment } from '../contracts/match-types';
// Type-only namespace over the BUILT package root (erased at runtime;
// resolved against dist/index.d.ts by the tsc conformance program).
import type * as LobbyBarrel from '../dist/index';
// Type-only namespace imports (erased at runtime; checked by the tsc program).
import type * as LobbyApi from '../src/contracts/lobby-api';
import type * as LobbyTypes from '../src/contracts/lobby-types';

// ---------------------------------------------------------------------------
// Witness helpers (same conditional forms as the console precedent)
// ---------------------------------------------------------------------------

/**
 * Mutual-assignability witness: `true` exactly when A and B are
 * mutually assignable (set equality for unions, field-for-field
 * equality for objects). The nested conditional avoids the circular-
 * constraint error a two-parameter `extends` pair would raise.
 */
type AssertMutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/** Distinctness witness: `true` only when neither side assigns to the other. */
type AssertDistinct<A, B> = [A] extends [B] ? never : [B] extends [A] ? never : true;

/**
 * Absence witness: `true` only when key `K` is NOT a property of `T`.
 * Assigning `never` to a `true`-annotated const fails the program, so
 * adding a forbidden field flips this from `true` to an error.
 */
type AssertKeyAbsent<K extends string, T> = K extends keyof T ? never : true;

// ---------------------------------------------------------------------------
// (a) Branded-ID integrity
// ---------------------------------------------------------------------------

type GuestPlayerIdConforms = AssertMutuallyAssignable<
    LobbyTypes.GuestPlayerId,
    string & { readonly __brand: 'GuestPlayerId' }
>;
type LobbyRevisionConforms = AssertMutuallyAssignable<
    LobbyTypes.LobbyRevision,
    number & { readonly __brand: 'LobbyRevision' }
>;
type LobbyActionIdConforms = AssertMutuallyAssignable<
    LobbyTypes.LobbyActionId,
    number & { readonly __brand: 'LobbyActionId' }
>;

const GUEST_PLAYER_ID_CONFORMS: GuestPlayerIdConforms = true;
const LOBBY_REVISION_CONFORMS: LobbyRevisionConforms = true;
const LOBBY_ACTION_ID_CONFORMS: LobbyActionIdConforms = true;

// Pairwise distinctness: a guest id must never flow where a match id
// (or vice versa) is expected, despite both branding strings.
type GuestIdDistinctFromMatchId = AssertDistinct<LobbyTypes.GuestPlayerId, MatchId>;
const GUEST_ID_DISTINCT_FROM_MATCH_ID: GuestIdDistinctFromMatchId = true;

// ---------------------------------------------------------------------------
// (b) Design-doc shape pins (indexed access on the declared shapes)
// ---------------------------------------------------------------------------

type EntryCapacityIsLiteralUnion = AssertMutuallyAssignable<LobbyTypes.PublicLobbyEntry['capacity'], 2 | 3 | 4>;
type EntryStatusIsLobbyStatus = AssertMutuallyAssignable<LobbyTypes.PublicLobbyEntry['status'], LobbyTypes.LobbyStatus>;
type SnapshotEntriesAreReadonly = AssertMutuallyAssignable<
    LobbyTypes.LobbySnapshot['entries'],
    ReadonlyArray<LobbyTypes.PublicLobbyEntry>
>;
type SnapshotRevisionIsBranded = AssertMutuallyAssignable<
    LobbyTypes.LobbySnapshot['revision'],
    LobbyTypes.LobbyRevision
>;
type ActiveMatchIdIsNullable = AssertMutuallyAssignable<LobbyTypes.LobbySnapshot['activeMatchId'], MatchId | null>;
type HandleIsNullableString = AssertMutuallyAssignable<LobbyTypes.IdentityState['handle'], string | null>;
type HasIdentityIsLiteralTrue = AssertMutuallyAssignable<LobbyTypes.IdentityState['hasIdentity'], true>;

const ENTRY_CAPACITY_IS_LITERAL_UNION: EntryCapacityIsLiteralUnion = true;
const ENTRY_STATUS_IS_LOBBY_STATUS: EntryStatusIsLobbyStatus = true;
const SNAPSHOT_ENTRIES_ARE_READONLY: SnapshotEntriesAreReadonly = true;
const SNAPSHOT_REVISION_IS_BRANDED: SnapshotRevisionIsBranded = true;
const ACTIVE_MATCH_ID_IS_NULLABLE: ActiveMatchIdIsNullable = true;
const HANDLE_IS_NULLABLE_STRING: HandleIsNullableString = true;
const HAS_IDENTITY_IS_LITERAL_TRUE: HasIdentityIsLiteralTrue = true;

// Claim optionality: both fields must remain optional (exact optional,
// per `GuestIdentityClaim` in lobby-types.md).
type ClaimFieldsOptional = AssertMutuallyAssignable<
    LobbyTypes.GuestIdentityClaim,
    { readonly guestPlayerId?: LobbyTypes.GuestPlayerId; readonly handle?: string }
>;
const CLAIM_FIELDS_OPTIONAL: ClaimFieldsOptional = true;

// ---------------------------------------------------------------------------
// (c) Closed-union exhaustiveness
// ---------------------------------------------------------------------------

/**
 * Every documented error code MUST appear here exactly once (the
 * `satisfies` clause rejects unknown keys; the mutual-assignability
 * witness below rejects missing keys), so adding or removing a code
 * without updating this table fails `pnpm typecheck:conformance`.
 */
const LOBBY_ERROR_CODE_SUMMARIES = {
    identity_invalid: 'identity claim could not be restored',
    handle_invalid: 'handle failed validation rules',
    handle_taken: 'handle conflicts with an active session',
    match_not_found: 'match is unknown or no longer listed',
    match_full: 'last open seat was claimed first',
    match_not_joinable: 'match state does not allow the action',
    identity_in_match: 'identity already committed to a match',
    identity_expired: 'identity claim expired past grace window',
    server_restarted: 'in-memory lobby state was lost',
    internal_error: 'unexpected server failure',
} as const satisfies Record<LobbyTypes.LobbyErrorCode, string>;

type CodeTableCoversUnionExactly = AssertMutuallyAssignable<
    keyof typeof LOBBY_ERROR_CODE_SUMMARIES,
    LobbyTypes.LobbyErrorCode
>;
const CODE_TABLE_COVERS_UNION_EXACTLY: CodeTableCoversUnionExactly = true;

/**
 * Exhaustive witness for the `LobbyEvent` union: each of the four
 * documented kinds must be handled, so adding or removing a variant
 * without updating this switch fails the program (the `never` guard
 * collapses).
 */
function lobbyEventWitness(event: LobbyTypes.LobbyEvent): string {
    switch (event.kind) {
        case 'identity':
            return `identity:${event.identity.hasIdentity}:${event.identity.handle ?? 'unnamed'}`;
        case 'snapshot':
            return `snapshot:${event.snapshot.revision}:${event.snapshot.entries.length}`;
        case 'actionAccepted':
            return `accepted:${event.actionId}:${event.transition}`;
        case 'error':
            return `error:${event.code}${event.actionId === undefined ? '' : `:${event.actionId}`}`;
        default: {
            const unreachable: never = event;
            return unreachable;
        }
    }
}

// ---------------------------------------------------------------------------
// (d) API-surface conformance
// ---------------------------------------------------------------------------

type EstablishIdentityReturn = AssertMutuallyAssignable<
    ReturnType<LobbyApi.LobbyService['establishIdentity']>,
    LobbyTypes.IdentityState
>;
type SetHandleReturn = AssertMutuallyAssignable<
    ReturnType<LobbyApi.LobbyService['setHandle']>,
    LobbyApi.Result<LobbyTypes.IdentityState, LobbyTypes.LobbyError>
>;
type SubscribeReturn = AssertMutuallyAssignable<
    ReturnType<LobbyApi.LobbyService['subscribe']>,
    LobbyApi.Result<LobbyTypes.LobbySnapshot, LobbyTypes.LobbyError>
>;
type CreateReturn = AssertMutuallyAssignable<
    ReturnType<LobbyApi.LobbyService['create']>,
    LobbyApi.Result<LobbyApi.MatchJoinTarget, LobbyTypes.LobbyError>
>;
type JoinReturn = AssertMutuallyAssignable<
    ReturnType<LobbyApi.LobbyService['join']>,
    LobbyApi.Result<LobbyApi.MatchJoinTarget, LobbyTypes.LobbyError>
>;
type SpectateReturn = AssertMutuallyAssignable<
    ReturnType<LobbyApi.LobbyService['spectate']>,
    LobbyApi.Result<LobbyApi.SpectatorTarget, LobbyTypes.LobbyError>
>;
type LeaveReturn = AssertMutuallyAssignable<
    ReturnType<LobbyApi.LobbyService['leave']>,
    LobbyApi.Result<void, LobbyTypes.LobbyError>
>;
type CloseReturn = AssertMutuallyAssignable<ReturnType<LobbyApi.LobbyService['close']>, Promise<void>>;

const ESTABLISH_IDENTITY_RETURN: EstablishIdentityReturn = true;
const SET_HANDLE_RETURN: SetHandleReturn = true;
const SUBSCRIBE_RETURN: SubscribeReturn = true;
const CREATE_RETURN: CreateReturn = true;
const JOIN_RETURN: JoinReturn = true;
const SPECTATE_RETURN: SpectateReturn = true;
const LEAVE_RETURN: LeaveReturn = true;
const CLOSE_RETURN: CloseReturn = true;

// Parameter pins: claim is `GuestIdentityClaim | undefined`; create
// settings are `Partial<MatchSettings> | undefined`.
type EstablishClaimParam = AssertMutuallyAssignable<
    Parameters<LobbyApi.LobbyService['establishIdentity']>[0],
    LobbyTypes.GuestIdentityClaim | undefined
>;
type CreateSettingsParam = AssertMutuallyAssignable<
    Parameters<LobbyApi.LobbyService['create']>[1],
    Partial<MatchSettings> | undefined
>;
const ESTABLISH_CLAIM_PARAM: EstablishClaimParam = true;
const CREATE_SETTINGS_PARAM: CreateSettingsParam = true;

// Upstream brand conformance: the API uses networking's canonical
// MatchId/ConnectionId brands, not locally re-declared ones.
type JoinMatchIdParamIsNetworkingBrand = AssertMutuallyAssignable<
    Parameters<LobbyApi.LobbyService['join']>[1],
    MatchId
>;
type ConnectionParamsAreNetworkingBrand = AssertMutuallyAssignable<
    Parameters<LobbyApi.LobbyService['subscribe']>[0],
    ConnectionId
>;
const JOIN_MATCH_ID_PARAM_IS_NETWORKING_BRAND: JoinMatchIdParamIsNetworkingBrand = true;
const CONNECTION_PARAMS_ARE_NETWORKING_BRAND: ConnectionParamsAreNetworkingBrand = true;

// Target shapes: the join target carries matchmaking's canonical
// server-issued SeatAssignment verbatim.
type JoinTargetSeatIsCanonical = AssertMutuallyAssignable<LobbyApi.MatchJoinTarget['seatAssignment'], SeatAssignment>;
const JOIN_TARGET_SEAT_IS_CANONICAL: JoinTargetSeatIsCanonical = true;

// Settings-mirror conformance: networking's feature-010 wire mirrors
// must stay field-for-field identical to the authoritative declarations
// they mirror — matchmaking's own `MatchSettings` and terrain's
// `GenerationSettings`. All fields are required on both sides, so drift
// in EITHER direction (a field added, removed, or retyped on either
// side) fails this program. `MatchSettings.terrainSettings` is itself a
// `GenerationSettings`, so the terrain witness below is what makes the
// match-settings witness exact rather than merely compatible.
type LobbyTerrainMirrorConforms = AssertMutuallyAssignable<LobbyTerrainSettings, GenerationSettings>;
type LobbyMatchSettingsMirrorConforms = AssertMutuallyAssignable<LobbyMatchSettings, MatchSettings>;
const LOBBY_TERRAIN_MIRROR_CONFORMS: LobbyTerrainMirrorConforms = true;
const LOBBY_MATCH_SETTINGS_MIRROR_CONFORMS: LobbyMatchSettingsMirrorConforms = true;

// Cross-package lobby-mirror conformance (R-007): matchmaking declares
// the lobby-domain types locally (`src/contracts/lobby-types.ts`) so
// the facade stays type-only toward upstream at runtime, but
// structurally they are MIRRORS of networking's canonical wire
// declarations (spec Clarifications v1.3 made the wire copy canonical;
// v1.5 pins this conformance). All fields are optional-or-required
// identically on both sides, so drift in EITHER direction — a field
// added, removed, or retyped on either side (e.g. the `error`
// variant's optional `detail` record that v1.3 added to the wire and
// R-007 mirrored locally) — fails this program. Imports resolve
// against networking's BUILT barrel (`dist/index.d.ts`), exactly like
// the settings-mirror pins above.
type WireLobbyEventMirrorConforms = AssertMutuallyAssignable<LobbyTypes.LobbyEvent, WireLobbyEvent>;
type WireIdentityStateMirrorConforms = AssertMutuallyAssignable<LobbyTypes.IdentityState, WireIdentityState>;
type WirePublicLobbyEntryMirrorConforms = AssertMutuallyAssignable<LobbyTypes.PublicLobbyEntry, WirePublicLobbyEntry>;
const WIRE_LOBBY_EVENT_MIRROR_CONFORMS: WireLobbyEventMirrorConforms = true;
const WIRE_IDENTITY_STATE_MIRROR_CONFORMS: WireIdentityStateMirrorConforms = true;
const WIRE_PUBLIC_LOBBY_ENTRY_MIRROR_CONFORMS: WirePublicLobbyEntryMirrorConforms = true;

// Sharp edge (R-007): plain mutual assignability CANNOT see a missing
// OPTIONAL field — `{code; message}` assigns cleanly to
// `{code; message; detail?}` in both directions — which is exactly how
// the v1.3 wire `detail` record went missing from the local mirror
// unnoticed. This indexed-access witness fails the program
// (TS2339) while either side lacks or retypes the field.
type WireErrorVariant = Extract<WireLobbyEvent, { kind: 'error' }>;
type LocalErrorVariant = Extract<LobbyTypes.LobbyEvent, { kind: 'error' }>;
type ErrorVariantDetailMirrors = AssertMutuallyAssignable<LocalErrorVariant['detail'], WireErrorVariant['detail']>;
const ERROR_VARIANT_DETAIL_MIRRORS: ErrorVariantDetailMirrors = true;

// ---------------------------------------------------------------------------
// (e) Privacy envelope (no opaque ids / seats / tokens in projections)
// ---------------------------------------------------------------------------

type EntryHasNoGuestId = AssertKeyAbsent<'guestPlayerId', LobbyTypes.PublicLobbyEntry>;
type SnapshotHasNoGuestId = AssertKeyAbsent<'guestPlayerId', LobbyTypes.LobbySnapshot>;
type IdentityStateHasNoGuestId = AssertKeyAbsent<'guestPlayerId', LobbyTypes.IdentityState>;
type SpectatorTargetHasNoToken = AssertKeyAbsent<'sessionToken', LobbyApi.SpectatorTarget>;
type SpectatorTargetHasNoSeat = AssertKeyAbsent<'seatIndex', LobbyApi.SpectatorTarget>;
type SpectatorTargetHasNoPlayerId = AssertKeyAbsent<'playerId', LobbyApi.SpectatorTarget>;

const ENTRY_HAS_NO_GUEST_ID: EntryHasNoGuestId = true;
const SNAPSHOT_HAS_NO_GUEST_ID: SnapshotHasNoGuestId = true;
const IDENTITY_STATE_HAS_NO_GUEST_ID: IdentityStateHasNoGuestId = true;
const SPECTATOR_TARGET_HAS_NO_TOKEN: SpectatorTargetHasNoToken = true;
const SPECTATOR_TARGET_HAS_NO_SEAT: SpectatorTargetHasNoSeat = true;
const SPECTATOR_TARGET_HAS_NO_PLAYER_ID: SpectatorTargetHasNoPlayerId = true;

// ---------------------------------------------------------------------------
// (f) Public barrel surface (T-003) — what consumers actually import
// ---------------------------------------------------------------------------

/**
 * Compile-time witness table over the BUILT package root
 * (`dist/index.d.ts`, i.e. the `@europa/matchmaking` entry point).
 * Property access on the namespace type fails
 * `pnpm typecheck:conformance` when a name is missing or misspelled
 * from the barrel (bracket-indexed access cannot see re-export
 * members; property access can). Same pattern as the console
 * precedent's `DIST_TYPE_WITNESS`. Requires `pnpm build` first.
 *
 * The KEYS are cross-checked against the contract modules at runtime
 * below, so the table can neither lag the contracts nor invent names.
 * Value exports need no witnessing — and feature 010's artifacts are
 * type-only by design (the barrel re-exports no contract values).
 *
 * `Result` is witnessed instantiated with its documented identity/error
 * parameters (a bare generic alias reference cannot be used as a
 * type), which additionally proves the generic is concretely usable
 * through the barrel.
 */
const BARREL_TYPE_WITNESS = {
    GuestIdentityClaim: null as unknown as LobbyBarrel.GuestIdentityClaim,
    GuestPlayerId: null as unknown as LobbyBarrel.GuestPlayerId,
    IdentityState: null as unknown as LobbyBarrel.IdentityState,
    LobbyActionId: null as unknown as LobbyBarrel.LobbyActionId,
    LobbyError: null as unknown as LobbyBarrel.LobbyError,
    LobbyErrorCode: null as unknown as LobbyBarrel.LobbyErrorCode,
    LobbyEvent: null as unknown as LobbyBarrel.LobbyEvent,
    LobbyRevision: null as unknown as LobbyBarrel.LobbyRevision,
    LobbySnapshot: null as unknown as LobbyBarrel.LobbySnapshot,
    LobbyService: null as unknown as LobbyBarrel.LobbyService,
    LobbyStatus: null as unknown as LobbyBarrel.LobbyStatus,
    MatchJoinTarget: null as unknown as LobbyBarrel.MatchJoinTarget,
    PublicLobbyEntry: null as unknown as LobbyBarrel.PublicLobbyEntry,
    Result: null as unknown as LobbyBarrel.Result<LobbyTypes.IdentityState, LobbyTypes.LobbyError>,
    SpectatorTarget: null as unknown as LobbyBarrel.SpectatorTarget,
};

/**
 * Barrel-vs-src identity witnesses: each entry proves the barrel name
 * is MUTUALLY ASSIGNABLE with the src contract declaration — i.e. the
 * barrel wires the actual contract types through to consumers, not
 * structurally-drifted lookalikes (`typeof` reads the exact type the
 * table pinned above).
 */
type BarrelGuestIdentityClaimIsSrc = AssertMutuallyAssignable<
    LobbyTypes.GuestIdentityClaim,
    typeof BARREL_TYPE_WITNESS.GuestIdentityClaim
>;
type BarrelGuestPlayerIdIsSrc = AssertMutuallyAssignable<
    LobbyTypes.GuestPlayerId,
    typeof BARREL_TYPE_WITNESS.GuestPlayerId
>;
type BarrelIdentityStateIsSrc = AssertMutuallyAssignable<
    LobbyTypes.IdentityState,
    typeof BARREL_TYPE_WITNESS.IdentityState
>;
type BarrelLobbyActionIdIsSrc = AssertMutuallyAssignable<
    LobbyTypes.LobbyActionId,
    typeof BARREL_TYPE_WITNESS.LobbyActionId
>;
type BarrelLobbyErrorIsSrc = AssertMutuallyAssignable<LobbyTypes.LobbyError, typeof BARREL_TYPE_WITNESS.LobbyError>;
type BarrelLobbyErrorCodeIsSrc = AssertMutuallyAssignable<
    LobbyTypes.LobbyErrorCode,
    typeof BARREL_TYPE_WITNESS.LobbyErrorCode
>;
type BarrelLobbyEventIsSrc = AssertMutuallyAssignable<LobbyTypes.LobbyEvent, typeof BARREL_TYPE_WITNESS.LobbyEvent>;
type BarrelLobbyRevisionIsSrc = AssertMutuallyAssignable<
    LobbyTypes.LobbyRevision,
    typeof BARREL_TYPE_WITNESS.LobbyRevision
>;
type BarrelLobbySnapshotIsSrc = AssertMutuallyAssignable<
    LobbyTypes.LobbySnapshot,
    typeof BARREL_TYPE_WITNESS.LobbySnapshot
>;
type BarrelLobbyServiceIsSrc = AssertMutuallyAssignable<LobbyApi.LobbyService, typeof BARREL_TYPE_WITNESS.LobbyService>;
type BarrelLobbyStatusIsSrc = AssertMutuallyAssignable<LobbyTypes.LobbyStatus, typeof BARREL_TYPE_WITNESS.LobbyStatus>;
type BarrelMatchJoinTargetIsSrc = AssertMutuallyAssignable<
    LobbyApi.MatchJoinTarget,
    typeof BARREL_TYPE_WITNESS.MatchJoinTarget
>;
type BarrelPublicLobbyEntryIsSrc = AssertMutuallyAssignable<
    LobbyTypes.PublicLobbyEntry,
    typeof BARREL_TYPE_WITNESS.PublicLobbyEntry
>;
type BarrelResultIsSrc = AssertMutuallyAssignable<
    LobbyApi.Result<LobbyTypes.IdentityState, LobbyTypes.LobbyError>,
    typeof BARREL_TYPE_WITNESS.Result
>;
type BarrelSpectatorTargetIsSrc = AssertMutuallyAssignable<
    LobbyApi.SpectatorTarget,
    typeof BARREL_TYPE_WITNESS.SpectatorTarget
>;

const BARREL_GUEST_IDENTITY_CLAIM_IS_SRC: BarrelGuestIdentityClaimIsSrc = true;
const BARREL_GUEST_PLAYER_ID_IS_SRC: BarrelGuestPlayerIdIsSrc = true;
const BARREL_IDENTITY_STATE_IS_SRC: BarrelIdentityStateIsSrc = true;
const BARREL_LOBBY_ACTION_ID_IS_SRC: BarrelLobbyActionIdIsSrc = true;
const BARREL_LOBBY_ERROR_IS_SRC: BarrelLobbyErrorIsSrc = true;
const BARREL_LOBBY_ERROR_CODE_IS_SRC: BarrelLobbyErrorCodeIsSrc = true;
const BARREL_LOBBY_EVENT_IS_SRC: BarrelLobbyEventIsSrc = true;
const BARREL_LOBBY_REVISION_IS_SRC: BarrelLobbyRevisionIsSrc = true;
const BARREL_LOBBY_SNAPSHOT_IS_SRC: BarrelLobbySnapshotIsSrc = true;
const BARREL_LOBBY_SERVICE_IS_SRC: BarrelLobbyServiceIsSrc = true;
const BARREL_LOBBY_STATUS_IS_SRC: BarrelLobbyStatusIsSrc = true;
const BARREL_MATCH_JOIN_TARGET_IS_SRC: BarrelMatchJoinTargetIsSrc = true;
const BARREL_PUBLIC_LOBBY_ENTRY_IS_SRC: BarrelPublicLobbyEntryIsSrc = true;
const BARREL_RESULT_IS_SRC: BarrelResultIsSrc = true;
const BARREL_SPECTATOR_TARGET_IS_SRC: BarrelSpectatorTargetIsSrc = true;

/**
 * The two feature-010 contract modules backing the barrel exports.
 * Every public name they declare must be reachable from the package
 * root (runtime cross-check against `BARREL_TYPE_WITNESS` below).
 */
const LOBBY_CONTRACT_FILES = ['lobby-types.ts', 'lobby-api.ts'] as const;

/** Resolve a path relative to the matchmaking package root. */
function packagePath(relativePath: string): string {
    return resolve(__dirname, '..', relativePath);
}

/**
 * Extract every top-level TYPE / INTERFACE / CONST / ENUM name declared
 * in a contract module, plus every name in any `export { … }`
 * re-export block (same mechanical transcription as the console
 * precedent's `extractPublicNames`; neither lobby module currently
 * uses export blocks, but the witness must survive one being added).
 */
function extractPublicNames(source: string): Set<string> {
    const names = new Set<string>();
    const declaration = /^export\s+(?:declare\s+)?(?:type|interface|const|enum)\s+([A-Za-z0-9_]+)/gm;
    for (const match of source.matchAll(declaration)) {
        const [, name] = match;
        if (name !== undefined) {
            names.add(name);
        }
    }
    const block = /export\s+(?:type\s+)?\{([^}]*)\}/g;
    for (const match of source.matchAll(block)) {
        const [, body] = match;
        if (body === undefined) {
            continue;
        }
        for (const raw of body.split(',')) {
            const name = raw
                .trim()
                .replace(/^type\s+/, '')
                .split(/\s+as\s+/)
                .pop()
                ?.trim();
            if (name !== undefined && name.length > 0) {
                names.add(name);
            }
        }
    }
    return names;
}

/** Every public name across both feature-010 contract modules. */
function expectedLobbyContractNames(): Set<string> {
    const all = new Set<string>();
    for (const file of LOBBY_CONTRACT_FILES) {
        for (const name of extractPublicNames(readFileSync(packagePath(`src/contracts/${file}`), 'utf-8'))) {
            all.add(name);
        }
    }
    return all;
}

// ---------------------------------------------------------------------------
// Runtime assertions (keep the witnesses "used"; deterministic)
// ---------------------------------------------------------------------------

/** One sample event per documented kind, for the exhaustive-switch probe. */
const SAMPLE_EVENTS: ReadonlyArray<LobbyTypes.LobbyEvent> = [
    { kind: 'identity', identity: { handle: null, hasIdentity: true } },
    {
        kind: 'snapshot',
        snapshot: {
            revision: 1 as LobbyTypes.LobbyRevision,
            entries: [],
            activeMatchId: null,
        },
    },
    {
        kind: 'actionAccepted',
        actionId: 1 as LobbyTypes.LobbyActionId,
        transition: 'waiting',
    },
    { kind: 'error', code: 'match_full', message: 'the last open seat was claimed' },
];

describe('feature 010 lobby contract witnesses (T-001)', () => {
    it('all compile-time witnesses hold', () => {
        expect(GUEST_PLAYER_ID_CONFORMS).toBe(true);
        expect(LOBBY_REVISION_CONFORMS).toBe(true);
        expect(LOBBY_ACTION_ID_CONFORMS).toBe(true);
        expect(GUEST_ID_DISTINCT_FROM_MATCH_ID).toBe(true);
        expect(ENTRY_CAPACITY_IS_LITERAL_UNION).toBe(true);
        expect(ENTRY_STATUS_IS_LOBBY_STATUS).toBe(true);
        expect(SNAPSHOT_ENTRIES_ARE_READONLY).toBe(true);
        expect(SNAPSHOT_REVISION_IS_BRANDED).toBe(true);
        expect(ACTIVE_MATCH_ID_IS_NULLABLE).toBe(true);
        expect(HANDLE_IS_NULLABLE_STRING).toBe(true);
        expect(HAS_IDENTITY_IS_LITERAL_TRUE).toBe(true);
        expect(CLAIM_FIELDS_OPTIONAL).toBe(true);
        expect(CODE_TABLE_COVERS_UNION_EXACTLY).toBe(true);
        expect(ESTABLISH_IDENTITY_RETURN).toBe(true);
        expect(SET_HANDLE_RETURN).toBe(true);
        expect(SUBSCRIBE_RETURN).toBe(true);
        expect(CREATE_RETURN).toBe(true);
        expect(JOIN_RETURN).toBe(true);
        expect(SPECTATE_RETURN).toBe(true);
        expect(LEAVE_RETURN).toBe(true);
        expect(CLOSE_RETURN).toBe(true);
        expect(ESTABLISH_CLAIM_PARAM).toBe(true);
        expect(CREATE_SETTINGS_PARAM).toBe(true);
        expect(JOIN_MATCH_ID_PARAM_IS_NETWORKING_BRAND).toBe(true);
        expect(CONNECTION_PARAMS_ARE_NETWORKING_BRAND).toBe(true);
        expect(JOIN_TARGET_SEAT_IS_CANONICAL).toBe(true);
        expect(LOBBY_TERRAIN_MIRROR_CONFORMS).toBe(true);
        expect(LOBBY_MATCH_SETTINGS_MIRROR_CONFORMS).toBe(true);
        expect(WIRE_LOBBY_EVENT_MIRROR_CONFORMS).toBe(true);
        expect(WIRE_IDENTITY_STATE_MIRROR_CONFORMS).toBe(true);
        expect(WIRE_PUBLIC_LOBBY_ENTRY_MIRROR_CONFORMS).toBe(true);
        expect(ERROR_VARIANT_DETAIL_MIRRORS).toBe(true);
        expect(ENTRY_HAS_NO_GUEST_ID).toBe(true);
        expect(SNAPSHOT_HAS_NO_GUEST_ID).toBe(true);
        expect(IDENTITY_STATE_HAS_NO_GUEST_ID).toBe(true);
        expect(SPECTATOR_TARGET_HAS_NO_TOKEN).toBe(true);
        expect(SPECTATOR_TARGET_HAS_NO_SEAT).toBe(true);
        expect(SPECTATOR_TARGET_HAS_NO_PLAYER_ID).toBe(true);
    });

    it('the error-code table covers exactly the ten documented codes', () => {
        expect(Object.keys(LOBBY_ERROR_CODE_SUMMARIES)).toHaveLength(10);
    });

    it('the event switch handles every documented kind', () => {
        expect(SAMPLE_EVENTS.map(lobbyEventWitness)).toEqual([
            'identity:true:unnamed',
            'snapshot:1:0',
            'accepted:1:waiting',
            'error:match_full',
        ]);
    });
});

describe('feature 010 public barrel surface witnesses (T-003)', () => {
    it('all compile-time barrel witnesses hold', () => {
        expect(BARREL_GUEST_IDENTITY_CLAIM_IS_SRC).toBe(true);
        expect(BARREL_GUEST_PLAYER_ID_IS_SRC).toBe(true);
        expect(BARREL_IDENTITY_STATE_IS_SRC).toBe(true);
        expect(BARREL_LOBBY_ACTION_ID_IS_SRC).toBe(true);
        expect(BARREL_LOBBY_ERROR_IS_SRC).toBe(true);
        expect(BARREL_LOBBY_ERROR_CODE_IS_SRC).toBe(true);
        expect(BARREL_LOBBY_EVENT_IS_SRC).toBe(true);
        expect(BARREL_LOBBY_REVISION_IS_SRC).toBe(true);
        expect(BARREL_LOBBY_SNAPSHOT_IS_SRC).toBe(true);
        expect(BARREL_LOBBY_SERVICE_IS_SRC).toBe(true);
        expect(BARREL_LOBBY_STATUS_IS_SRC).toBe(true);
        expect(BARREL_MATCH_JOIN_TARGET_IS_SRC).toBe(true);
        expect(BARREL_PUBLIC_LOBBY_ENTRY_IS_SRC).toBe(true);
        expect(BARREL_RESULT_IS_SRC).toBe(true);
        expect(BARREL_SPECTATOR_TARGET_IS_SRC).toBe(true);
    });

    it('every feature-010 contract name is exported from the package root', () => {
        const expected = expectedLobbyContractNames();
        const witnessed = new Set<string>(Object.keys(BARREL_TYPE_WITNESS));
        const missing = [...expected].filter((name) => !witnessed.has(name));
        expect(missing, 'feature-010 contract names missing from the barrel witness table').toEqual([]);
    });

    it('the barrel witness table contains no invented names', () => {
        const expected = expectedLobbyContractNames();
        const invented = Object.keys(BARREL_TYPE_WITNESS).filter((name) => !expected.has(name));
        expect(invented, 'witness names not declared by either feature-010 contract module').toEqual([]);
    });
});
