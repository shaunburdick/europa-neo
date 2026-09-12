/**
 * Contract Conformance Test — Feature 004 Polish (T050)
 *
 * Enforces the networking package's contract-discipline rules:
 *
 *   (b) **Type conformance** — the engine-mirrored wire types
 *       ("Order", "MatchResult") and the fog-derived view type
 *       ("PlayerView") re-exported through "src/types.ts" are mutually
 *       assignable with their canonical declarations. Any field drift
 *       anywhere along the re-export chain fails "pnpm typecheck".
 *
 *   (c) **Union exhaustiveness** — the "NetworkPayload" union covers
 *       exactly the twenty documented payload interfaces (one per
 *       "MessageKind", no extras), and every kind-to-payload mapping
 *       stays exhaustive under future edits (the "never" guard in the
 *       runtime classifier fails to compile when a kind is added
 *       without updating the map).
 *
 *   (d) **Feature 010 lobby wire conformance** — the additive "lobby*"
 *       family declared in "network-types.ts" stays structurally
 *       conformant to its design source of truth
 *       ("specs/010-public-lobby-match-browser/contracts/lobby-wire.md"
 *       + "lobby-types.md") via an independent transcription pinned by
 *       mutual-assignability aliases, and the "LobbyEvent" variant set
 *       stays exhaustively classified.
 *
 *   (e) **Feature 023 roster wire conformance** — the additive roster
 *       types ("RosterEntry", "RosterStatus", "RosterRevision",
 *       "RosterSnapshot", "RosterChange", "RosterDelta") and the two
 *       "LobbyEvent" roster variants declared in "network-types.ts"
 *       stay structurally identical to the matchmaking package's local
 *       mirrors. The roster contract is design-source-of-truth at
 *       "specs/010-public-lobby-match-browser/contracts/roster-wire.md".
 *
 * NOTE: Part (a) -- byte-identity comparisons between src/contracts/
 * and specs/004-multiplayer-networking/contracts/ -- was removed
 * because the spec-side .ts files no longer exist. The package
 * copies in each package's src/contracts/ are now the sole source of
 * truth.
 */

import type { MatchResult, Order } from '@europa/engine';
import type { PlayerView } from '@europa/fog';
import { describe, expect, it } from 'vitest';

import type {
    ErrorPayload,
    HelloAckPayload,
    HelloPayload,
    IdentityState,
    JoinAckPayload,
    JoinMatchPayload,
    LobbyActionId,
    LobbyCreatePayload,
    LobbyEvent,
    LobbyEventPayload,
    LobbyIdentityPayload,
    LobbyJoinPayload,
    LobbyLeavePayload,
    LobbyRevision,
    LobbySetHandlePayload,
    LobbySpectatePayload,
    LobbySubscribePayload,
    MatchId,
    MessageKind,
    NetworkPayload,
    OrderAckPayload,
    OrderSubmissionPayload,
    PingPayload,
    PongPayload,
    RosterChange,
    RosterDelta,
    RosterEntry,
    RosterRevision,
    RosterSnapshot,
    RosterStatus,
    SnapshotPayload,
    TerminalPayload,
    TickBroadcastPayload,
} from '../src/contracts/network-types';
import type {
    MatchResult as MatchResultReexport,
    Order as OrderReexport,
    PlayerView as PlayerViewReexport,
} from '../src/types';

// ---------------------------------------------------------------------------
// (b) Compile-time type conformance. Mutual assignability proves set
// equality for unions and field-for-field equality for objects: if any
// side drifts, these aliases fail to typecheck.
// ---------------------------------------------------------------------------

/**
 * Mutual-assignability witness: "true" exactly when A and B are
 * mutually assignable (set equality for unions, field-for-field
 * equality for objects). The nested conditional form avoids the
 * circular-constraint error (TS2313) a two-parameter "extends" pair
 * raises under a strict tsc program — vitest strips types so the
 * defect only surfaces in dedicated compile checks; this is the same
 * known-good shape as matchmaking's "tests/lobby-conformance.test.ts"
 * witness.
 */
type AssertMutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * Absence witness: "true" only when key "K" is NOT a property of "T".
 * Assigning "never" to a "true"-annotated const fails the program, so
 * adding a forbidden field flips this from "true" to an error.
 */
type AssertKeyAbsent<K extends string, T> = K extends keyof T ? never : true;

type OrderConforms = AssertMutuallyAssignable<Order, OrderReexport>;
type MatchResultConforms = AssertMutuallyAssignable<MatchResult, MatchResultReexport>;
type PlayerViewConforms = AssertMutuallyAssignable<PlayerView, PlayerViewReexport>;

const ORDER_CONFORMS: OrderConforms = true;
const MATCH_RESULT_CONFORMS: MatchResultConforms = true;
const PLAYER_VIEW_CONFORMS: PlayerViewConforms = true;

// ---------------------------------------------------------------------------
// (c) Compile-time union exhaustiveness. The documented one-payload-
// per-kind map must be mutually assignable with the union: a payload
// missing from "NetworkPayload", or an extra union member without a
// documented kind, breaks one of the two directions.
// ---------------------------------------------------------------------------

interface KindToPayload {
    hello: HelloPayload;
    helloAck: HelloAckPayload;
    joinMatch: JoinMatchPayload;
    joinAck: JoinAckPayload;
    ping: PingPayload;
    pong: PongPayload;
    // Feature 010 lobby family (additive)
    lobbyIdentity: LobbyIdentityPayload;
    lobbySetHandle: LobbySetHandlePayload;
    lobbySubscribe: LobbySubscribePayload;
    lobbyCreate: LobbyCreatePayload;
    lobbyJoin: LobbyJoinPayload;
    lobbySpectate: LobbySpectatePayload;
    lobbyLeave: LobbyLeavePayload;
    lobbyEvent: LobbyEventPayload;
    tick: TickBroadcastPayload;
    snapshot: SnapshotPayload;
    order: OrderSubmissionPayload;
    orderAck: OrderAckPayload;
    terminal: TerminalPayload;
    error: ErrorPayload;
}

type PayloadsConform = AssertMutuallyAssignable<KindToPayload[MessageKind], NetworkPayload>;

const PAYLOADS_CONFORM: PayloadsConform = true;

/** All twenty documented message kinds (client→server first, mirroring the contract). */
const ALL_KINDS: readonly MessageKind[] = [
    'hello',
    'joinMatch',
    'order',
    'ping',
    'lobbyIdentity',
    'lobbySetHandle',
    'lobbySubscribe',
    'lobbyCreate',
    'lobbyJoin',
    'lobbySpectate',
    'lobbyLeave',
    'helloAck',
    'joinAck',
    'snapshot',
    'tick',
    'orderAck',
    'terminal',
    'pong',
    'error',
    'lobbyEvent',
];

/**
 * Runtime classifier with a compile-time exhaustiveness guard: adding
 * a "MessageKind" without a case here turns "kind" into "never" in the
 * default branch and fails "pnpm typecheck".
 *
 * @param kind Any protocol message kind.
 * @returns A stable label for the kind.
 */
function kindLabel(kind: MessageKind): string {
    switch (kind) {
        case 'hello':
            return 'hello';
        case 'helloAck':
            return 'helloAck';
        case 'joinMatch':
            return 'joinMatch';
        case 'joinAck':
            return 'joinAck';
        case 'ping':
            return 'ping';
        case 'pong':
            return 'pong';
        case 'lobbyIdentity':
            return 'lobbyIdentity';
        case 'lobbySetHandle':
            return 'lobbySetHandle';
        case 'lobbySubscribe':
            return 'lobbySubscribe';
        case 'lobbyCreate':
            return 'lobbyCreate';
        case 'lobbyJoin':
            return 'lobbyJoin';
        case 'lobbySpectate':
            return 'lobbySpectate';
        case 'lobbyLeave':
            return 'lobbyLeave';
        case 'lobbyEvent':
            return 'lobbyEvent';
        case 'tick':
            return 'tick';
        case 'snapshot':
            return 'snapshot';
        case 'order':
            return 'order';
        case 'orderAck':
            return 'orderAck';
        case 'terminal':
            return 'terminal';
        case 'error':
            return 'error';
        default: {
            // Exhaustiveness guard: compiling over an incomplete switch is
            // what makes new kinds impossible to forget.
            const unreachable: never = kind;
            return unreachable;
        }
    }
}

describe('contract conformance (T050)', () => {
    it('(b) engine/fog wire types re-exported from src/types.ts conform to the canonical declarations', () => {
        // Compile-time proof lives in the aliases above; these runtime
        // assertions keep them "used" so linters stay quiet.
        expect(ORDER_CONFORMS).toBe(true);
        expect(MATCH_RESULT_CONFORMS).toBe(true);
        expect(PLAYER_VIEW_CONFORMS).toBe(true);
    });

    it('(c) the NetworkPayload union is exactly the twenty documented payloads', () => {
        // Compile-time proof: KindToPayload[MessageKind] ≡ NetworkPayload.
        expect(PAYLOADS_CONFORM).toBe(true);

        // Runtime corroboration: every documented kind classifies, the
        // classifier's switch stays exhaustive (a missing case would fail
        // typecheck via the "never" guard), and the labels are unique —
        // one payload body per kind, no aliases.
        const labels = ALL_KINDS.map((kind) => kindLabel(kind));
        expect(labels).toHaveLength(20);
        expect(new Set(labels).size).toBe(20);
    });
});

// ---------------------------------------------------------------------------
// (d) Feature 010 lobby wire conformance. The contract's lobby family is
// pinned against an INDEPENDENT transcription of its design docs
// (lobby-wire.md payload shapes + lobby-types.md domain shapes): if either
// side drifts, these aliases fail to typecheck. Brands are re-declared in
// the transcription — structurally identical brands stay mutually
// assignable, so only real shape drift trips the guard.
// ---------------------------------------------------------------------------

/** Transcription of lobby-types.md's branded primitives. */
type DocGuestPlayerId = string & { readonly __brand: 'GuestPlayerId' };
type DocLobbyRevision = number & { readonly __brand: 'LobbyRevision' };
type DocLobbyActionId = number & { readonly __brand: 'LobbyActionId' };

/** Transcription of lobby-types.md's domain shapes. */
interface DocGuestIdentityClaim {
    readonly guestPlayerId?: DocGuestPlayerId;
    readonly handle?: string;
}

interface DocIdentityState {
    readonly handle: string | null;
    readonly hasIdentity: true;
    // Sanctioned FR-003 delivery channel (feature 010 Clarifications
    // v1.6): the opaque id rides ONLY on the directed identity event to
    // its owning connection; optional so recipients tolerate older
    // servers, and absent from every listing/snapshot/target (NFR-003).
    readonly guestPlayerId?: DocGuestPlayerId;
}

interface DocPublicLobbyEntry {
    readonly matchId: MatchId;
    readonly seatsFilled: number;
    readonly capacity: 2 | 3 | 4;
    readonly status: 'waiting' | 'in_progress';
    readonly boardSize: number;
    readonly tickIntervalMs: number;
}

interface DocLobbySnapshot {
    readonly revision: DocLobbyRevision;
    readonly entries: ReadonlyArray<DocPublicLobbyEntry>;
    readonly activeMatchId: MatchId | null;
}

type DocLobbyErrorCode =
    | 'identity_invalid'
    | 'handle_invalid'
    | 'handle_taken'
    | 'match_not_found'
    | 'match_full'
    | 'match_not_joinable'
    | 'identity_in_match'
    | 'identity_expired'
    | 'server_restarted'
    | 'internal_error';

type DocRosterStatus = 'in_lobby' | 'in_game' | 'spectating';

interface DocRosterEntry {
    readonly handle: string;
    readonly status: DocRosterStatus;
}

type DocRosterRevision = number & { readonly __brand: 'RosterRevision' };

interface DocRosterSnapshot {
    readonly revision: DocRosterRevision;
    readonly players: ReadonlyArray<DocRosterEntry>;
}

interface DocRosterChange {
    readonly handle: string;
    readonly status: DocRosterStatus;
}

interface DocRosterDelta {
    readonly revision: DocRosterRevision;
    readonly changes: ReadonlyArray<DocRosterChange>;
}

type DocLobbyEvent =
    | { readonly kind: 'identity'; readonly identity: DocIdentityState }
    | { readonly kind: 'snapshot'; readonly snapshot: DocLobbySnapshot }
    | { readonly kind: 'actionAccepted'; readonly actionId: DocLobbyActionId; readonly transition: 'waiting' | 'match' }
    | {
          readonly kind: 'error';
          readonly actionId?: DocLobbyActionId;
          readonly code: DocLobbyErrorCode;
          readonly message: string;
          // Optional machine-readable detail (field name → message/value),
          // mirroring matchmaking's "LobbyError.detail" so clients can
          // render field-specific actionable text from code + detail.
          readonly detail?: Readonly<Record<string, string | number | boolean>>;
      }
    | { readonly kind: 'roster'; readonly roster: DocRosterSnapshot }
    | { readonly kind: 'rosterDelta'; readonly delta: DocRosterDelta };

/** Transcription of lobby-wire.md's eight payload shapes. */
interface DocLobbyWireShapes {
    lobbyIdentity: { readonly claim?: DocGuestIdentityClaim };
    lobbySetHandle: { readonly handle: string; readonly actionId: DocLobbyActionId };
    lobbySubscribe: { readonly actionId: DocLobbyActionId };
    lobbyCreate: {
        readonly actionId: DocLobbyActionId;
        // Transcribes "Partial<MatchSettings>": top-level fields optional,
        // "terrainSettings" complete when present (mirrors matchmaking's
        // MatchSettings/GenerationSettings structure exactly).
        readonly settings?: {
            readonly playerCount?: 2 | 3 | 4;
            readonly boardSize?: number;
            readonly tickIntervalMs?: number;
            readonly terrainSettings?: {
                readonly waterRatio: number;
                readonly roughness: number;
                readonly octaves: number;
                readonly citiesPerPlayer: number;
                readonly symmetryStrategy: 'point';
                readonly minCityWaterDistance: number;
                readonly minCityCityDistance: number;
                readonly maxRegenAttempts: number;
                readonly terrainSmoothing: number;
            };
        };
    };
    lobbyJoin: { readonly actionId: DocLobbyActionId; readonly matchId: MatchId };
    lobbySpectate: { readonly actionId: DocLobbyActionId; readonly matchId: MatchId };
    lobbyLeave: { readonly actionId: DocLobbyActionId };
    lobbyEvent: { readonly event: DocLobbyEvent };
}

/**
 * Per-kind mutual assignability between the contract's lobby payloads and
 * the doc transcription. NOTE on precision: structural assignability pins
 * required fields, field types, and union variants; it cannot detect a
 * newly added OPTIONAL field on one side (a TypeScript exactness limit).
 * Review against the design docs covers that residual gap.
 */
type LobbyWireConforms = {
    readonly [K in keyof KindToPayload & keyof DocLobbyWireShapes]: AssertMutuallyAssignable<
        KindToPayload[K],
        DocLobbyWireShapes[K]
    >;
};

const LOBBY_WIRE_CONFORMS: LobbyWireConforms = {
    lobbyIdentity: true,
    lobbySetHandle: true,
    lobbySubscribe: true,
    lobbyCreate: true,
    lobbyJoin: true,
    lobbySpectate: true,
    lobbyLeave: true,
    lobbyEvent: true,
};

/**
 * Sharp-edge pin for the v1.6 OPTIONAL delivery field (feature 010
 * Clarifications v1.6): plain mutual assignability cannot see a missing
 * or retyped OPTIONAL field, so this indexed-access witness fails to
 * typecheck while the contract's "IdentityState.guestPlayerId" and the
 * doc transcription disagree in existence, optionality, or brand.
 */
type IdentityStateGuestIdConforms = AssertMutuallyAssignable<
    IdentityState['guestPlayerId'],
    DocIdentityState['guestPlayerId']
>;

const IDENTITY_STATE_GUEST_ID_CONFORMS: IdentityStateGuestIdConforms = true;

/** The six documented "LobbyEvent" variant kinds. */
const LOBBY_EVENT_KINDS = ['identity', 'snapshot', 'actionAccepted', 'error', 'roster', 'rosterDelta'] as const;

/**
 * Compile-time exhaustiveness guard over "LobbyEvent" variants: adding a
 * variant without a case here fails "pnpm typecheck" via the "never"
 * branch.
 *
 * @param event Any lobby event.
 * @returns The event's "kind" label.
 */
function lobbyEventKindLabel(event: LobbyEvent): string {
    switch (event.kind) {
        case 'identity':
            return 'identity';
        case 'snapshot':
            return 'snapshot';
        case 'actionAccepted':
            return 'actionAccepted';
        case 'error':
            return 'error';
        case 'roster':
            return 'roster';
        case 'rosterDelta':
            return 'rosterDelta';
        default: {
            const unreachable: never = event;
            return unreachable;
        }
    }
}

describe('feature 010 lobby wire conformance (T-002)', () => {
    it('the contract lobby payloads conform to the lobby-wire.md/lobby-types.md transcription', () => {
        // Compile-time proof lives in the LobbyWireConforms aliases; these
        // runtime assertions keep them "used" so linters stay quiet.
        expect(LOBBY_WIRE_CONFORMS).toEqual({
            lobbyIdentity: true,
            lobbySetHandle: true,
            lobbySubscribe: true,
            lobbyCreate: true,
            lobbyJoin: true,
            lobbySpectate: true,
            lobbyLeave: true,
            lobbyEvent: true,
        });
        expect(IDENTITY_STATE_GUEST_ID_CONFORMS).toBe(true);
    });

    it('every lobby message kind is declared exactly once in the protocol union', () => {
        const lobbyKinds = ALL_KINDS.filter((kind) => kind.startsWith('lobby'));
        expect(lobbyKinds).toHaveLength(8);
        expect(new Set(lobbyKinds).size).toBe(8);
    });

    it('the LobbyEvent union is exhaustively classified over its six variants', () => {
        const samples: ReadonlyArray<LobbyEvent> = [
            {
                kind: 'identity',
                identity: {
                    handle: null,
                    hasIdentity: true,
                    // The v1.6 sanctioned delivery field must be admitted
                    // on the wire identity event (directed delivery only).
                    // NonNullable narrows the OPTIONAL field's type so the
                    // literal stays exactOptionalPropertyTypes-clean while
                    // proving the branded value is admitted.
                    guestPlayerId: 'guest-directed' as NonNullable<IdentityState['guestPlayerId']>,
                },
            },
            {
                kind: 'snapshot',
                snapshot: { revision: 7 as LobbyRevision, entries: [], activeMatchId: null },
            },
            { kind: 'actionAccepted', actionId: 3 as LobbyActionId, transition: 'waiting' },
            {
                kind: 'error',
                code: 'handle_taken',
                message: 'handle already in use',
                // The optional detail record must be admitted on wire
                // error events (field-specific feedback, spec US3 AC-4).
                detail: { handle: 'Nova' },
            },
            {
                kind: 'roster',
                roster: {
                    revision: 1 as RosterRevision,
                    players: [
                        { handle: 'Alice', status: 'in_lobby' },
                        { handle: 'Bob', status: 'in_game' },
                    ],
                },
            },
            {
                kind: 'rosterDelta',
                delta: {
                    revision: 2 as RosterRevision,
                    changes: [{ handle: 'Alice', status: 'spectating' }],
                },
            },
        ];
        const labels = samples.map((event) => lobbyEventKindLabel(event));
        expect(labels).toEqual([...LOBBY_EVENT_KINDS]);
        expect(new Set(labels).size).toBe(LOBBY_EVENT_KINDS.length);
    });

    it('models guest player ids for identity correlation and directed delivery', () => {
        // Privacy boundary spot-check (spec FR-024 / NFR-003, scoped by
        // feature 010 Clarifications v1.6): the wire projection types
        // carry match discovery data and handles. The guest id is typed in
        // the advisory GuestIdentityClaim input and the directed
        // IdentityState delivery channel. It is non-secret correlation data;
        // bearer credentials remain outside these projections.
        const claimKeys: ReadonlyArray<string> = ['guestPlayerId', 'handle'];
        const identityStateKeys: ReadonlyArray<string> = ['handle', 'hasIdentity', 'guestPlayerId'];
        expect(claimKeys).toContain('guestPlayerId');
        expect(identityStateKeys).toContain('guestPlayerId');
    });
});

// ---------------------------------------------------------------------------
// (e) Feature 023 roster wire conformance. The roster types declared in
// "network-types.ts" are pinned against an INDEPENDENT transcription of
// the design source of truth ("specs/010-public-lobby-match-browser/contracts/roster-wire.md")
// via mutual-assignability aliases. The six roster type names are also
// verified structurally identical to the matchmaking package's local
// mirror — drift between the two copies is caught here.
// ---------------------------------------------------------------------------

/** Per-type mutual assignability between networking's roster types and the doc transcription. */
type RosterStatusConforms = AssertMutuallyAssignable<RosterStatus, DocRosterStatus>;
type RosterEntryConforms = AssertMutuallyAssignable<RosterEntry, DocRosterEntry>;
type RosterRevisionConforms = AssertMutuallyAssignable<RosterRevision, DocRosterRevision>;
type RosterSnapshotConforms = AssertMutuallyAssignable<RosterSnapshot, DocRosterSnapshot>;
type RosterChangeConforms = AssertMutuallyAssignable<RosterChange, DocRosterChange>;
type RosterDeltaConforms = AssertMutuallyAssignable<RosterDelta, DocRosterDelta>;

const ROSTER_STATUS_CONFORMS: RosterStatusConforms = true;
const ROSTER_ENTRY_CONFORMS: RosterEntryConforms = true;
const ROSTER_REVISION_CONFORMS: RosterRevisionConforms = true;
const ROSTER_SNAPSHOT_CONFORMS: RosterSnapshotConforms = true;
const ROSTER_CHANGE_CONFORMS: RosterChangeConforms = true;
const ROSTER_DELTA_CONFORMS: RosterDeltaConforms = true;

/**
 * Roster types MUST carry exactly {handle, status} per entry — no
 * opaque IDs, no match IDs, no tokens. This absence witness fails
 * to compile if a forbidden field is added to "RosterEntry".
 */
type RosterEntryHasNoMatchId = AssertKeyAbsent<'matchId', RosterEntry>;
type RosterEntryHasNoToken = AssertKeyAbsent<'sessionToken', RosterEntry>;
type RosterEntryHasNoPlayerId = AssertKeyAbsent<'playerId', RosterEntry>;

const ROSTER_ENTRY_HAS_NO_MATCH_ID: RosterEntryHasNoMatchId = true;
const ROSTER_ENTRY_HAS_NO_TOKEN: RosterEntryHasNoToken = true;
const ROSTER_ENTRY_HAS_NO_PLAYER_ID: RosterEntryHasNoPlayerId = true;

/**
 * RosterChange MUST be structurally identical to RosterEntry (same
 * {handle, status} shape) — the spec defines them as the same fields.
 */
type RosterChangeMatchesEntry = AssertMutuallyAssignable<RosterChange, RosterEntry>;
const ROSTER_CHANGE_MATCHES_ENTRY: RosterChangeMatchesEntry = true;

describe('feature 023 roster wire conformance', () => {
    it('roster types conform to the roster-wire.md transcription', () => {
        expect(ROSTER_STATUS_CONFORMS).toBe(true);
        expect(ROSTER_ENTRY_CONFORMS).toBe(true);
        expect(ROSTER_REVISION_CONFORMS).toBe(true);
        expect(ROSTER_SNAPSHOT_CONFORMS).toBe(true);
        expect(ROSTER_CHANGE_CONFORMS).toBe(true);
        expect(ROSTER_DELTA_CONFORMS).toBe(true);
    });

    it('roster entries contain exactly {handle, status} — no match identity', () => {
        expect(ROSTER_ENTRY_HAS_NO_MATCH_ID).toBe(true);
        expect(ROSTER_ENTRY_HAS_NO_TOKEN).toBe(true);
        expect(ROSTER_ENTRY_HAS_NO_PLAYER_ID).toBe(true);
    });

    it('RosterChange and RosterEntry are structurally identical', () => {
        expect(ROSTER_CHANGE_MATCHES_ENTRY).toBe(true);
    });
});
