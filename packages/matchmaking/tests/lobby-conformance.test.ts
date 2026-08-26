/**
 * Compile-time contract witnesses — Feature 010 (T-001).
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
 *       `MatchId`/`ConnectionId` brands (no local re-branding).
 *   (e) Privacy envelope — no public projection or spectator target
 *       can grow an opaque guest id, seat, or token field without
 *       failing this program (spec FR-003/FR-024/NFR-003).
 */

import type { ConnectionId, MatchId } from '@europa/networking';
import { describe, expect, it } from 'vitest';
// Feature-006 canonical shapes the lobby contracts build on.
import type { MatchSettings, SeatAssignment } from '../contracts/match-types';
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
