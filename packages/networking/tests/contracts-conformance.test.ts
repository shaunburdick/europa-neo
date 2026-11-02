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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { MatchResult, Order } from '@europa/engine';
import type { PlayerView } from '@europa/fog';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
    ErrorPayload,
    GuestIdentityClaim,
    GuestPlayerId,
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
    LobbySnapshot,
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
import { NETWORK_API_VERSION } from '../src/contracts/network-types';
import type {
    MatchResult as MatchResultReexport,
    Order as OrderReexport,
    PlayerView as PlayerViewReexport,
} from '../src/types';

// ---------------------------------------------------------------------------
// (b) Compile-time type conformance. `expectTypeOf` equality proves
// field-for-field and union-set equality: if any side drifts, the
// conformance tsc program fails.
// ---------------------------------------------------------------------------

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
        // Compile-time proof: mutual assignability, checked by the tsc program.
        expectTypeOf<OrderReexport>().toExtend<Order>();
        expectTypeOf<Order>().toExtend<OrderReexport>();
        expectTypeOf<MatchResultReexport>().toExtend<MatchResult>();
        expectTypeOf<MatchResult>().toExtend<MatchResultReexport>();
        expectTypeOf<PlayerViewReexport>().toExtend<PlayerView>();
        expectTypeOf<PlayerView>().toExtend<PlayerViewReexport>();
    });

    it('(c) the NetworkPayload union is exactly the twenty documented payloads', () => {
        // Compile-time proof: KindToPayload[MessageKind] ≡ NetworkPayload.
        expectTypeOf<KindToPayload[MessageKind]>().toExtend<NetworkPayload>();
        expectTypeOf<NetworkPayload>().toExtend<KindToPayload[MessageKind]>();

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
    // Issue #146 / feature 004 FR-026: owner-only restore proof on the
    // client→server claim. Optional so an id-only claim stays legal
    // (advisory input); absence is the whole security property.
    readonly resumeSecret?: string;
}

interface DocIdentityState {
    readonly handle: string | null;
    readonly hasIdentity: true;
    // Sanctioned FR-003 delivery channel (feature 010 Clarifications
    // v1.6): the opaque id rides ONLY on the directed identity event to
    // its owning connection; optional so recipients tolerate older
    // servers, and absent from every listing/snapshot/target (NFR-003).
    readonly guestPlayerId?: DocGuestPlayerId;
    // Issue #146 / feature 004 FR-026: owner-only credential delivered
    // ONLY on the directed establishment identity event; optional so
    // rename-path emissions and older servers omit it.
    readonly resumeSecret?: string;
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

/**
 * Exhaustiveness anchor for the doc transcription: adding a ninth lobby
 * payload kind to `DocLobbyWireShapes` leaves this record missing a key, so
 * the conformance program fails even though the per-key assertions cannot
 * see a new key.
 */
const LOBBY_PAYLOAD_KINDS: Record<keyof DocLobbyWireShapes, true> = {
    lobbyIdentity: true,
    lobbySetHandle: true,
    lobbySubscribe: true,
    lobbyCreate: true,
    lobbyJoin: true,
    lobbySpectate: true,
    lobbyLeave: true,
    lobbyEvent: true,
};

describe('feature 010 lobby wire conformance (T-002)', () => {
    it('the contract lobby payloads conform to the lobby-wire.md/lobby-types.md transcription', () => {
        // Compile-time proof: mutual assignability, checked by the tsc program.
        expectTypeOf<KindToPayload['lobbyIdentity']>().toExtend<DocLobbyWireShapes['lobbyIdentity']>();
        expectTypeOf<DocLobbyWireShapes['lobbyIdentity']>().toExtend<KindToPayload['lobbyIdentity']>();
        expectTypeOf<KindToPayload['lobbySetHandle']>().toExtend<DocLobbyWireShapes['lobbySetHandle']>();
        expectTypeOf<DocLobbyWireShapes['lobbySetHandle']>().toExtend<KindToPayload['lobbySetHandle']>();
        expectTypeOf<KindToPayload['lobbySubscribe']>().toExtend<DocLobbyWireShapes['lobbySubscribe']>();
        expectTypeOf<DocLobbyWireShapes['lobbySubscribe']>().toExtend<KindToPayload['lobbySubscribe']>();
        expectTypeOf<KindToPayload['lobbyCreate']>().toExtend<DocLobbyWireShapes['lobbyCreate']>();
        expectTypeOf<DocLobbyWireShapes['lobbyCreate']>().toExtend<KindToPayload['lobbyCreate']>();
        expectTypeOf<KindToPayload['lobbyJoin']>().toExtend<DocLobbyWireShapes['lobbyJoin']>();
        expectTypeOf<DocLobbyWireShapes['lobbyJoin']>().toExtend<KindToPayload['lobbyJoin']>();
        expectTypeOf<KindToPayload['lobbySpectate']>().toExtend<DocLobbyWireShapes['lobbySpectate']>();
        expectTypeOf<DocLobbyWireShapes['lobbySpectate']>().toExtend<KindToPayload['lobbySpectate']>();
        expectTypeOf<KindToPayload['lobbyLeave']>().toExtend<DocLobbyWireShapes['lobbyLeave']>();
        expectTypeOf<DocLobbyWireShapes['lobbyLeave']>().toExtend<KindToPayload['lobbyLeave']>();
        expectTypeOf<KindToPayload['lobbyEvent']>().toExtend<DocLobbyWireShapes['lobbyEvent']>();
        expectTypeOf<DocLobbyWireShapes['lobbyEvent']>().toExtend<KindToPayload['lobbyEvent']>();
        // Sharp-edge pins for the optional delivery fields: mutual
        // assignability fails if existence, optionality, or brand drifts.
        expectTypeOf<IdentityState['guestPlayerId']>().toExtend<DocIdentityState['guestPlayerId']>();
        expectTypeOf<DocIdentityState['guestPlayerId']>().toExtend<IdentityState['guestPlayerId']>();
        expectTypeOf<GuestIdentityClaim['resumeSecret']>().toExtend<DocGuestIdentityClaim['resumeSecret']>();
        expectTypeOf<DocGuestIdentityClaim['resumeSecret']>().toExtend<GuestIdentityClaim['resumeSecret']>();
        expectTypeOf<IdentityState['resumeSecret']>().toExtend<DocIdentityState['resumeSecret']>();
        expectTypeOf<DocIdentityState['resumeSecret']>().toExtend<IdentityState['resumeSecret']>();
        expectTypeOf<LobbySnapshot>().not.toHaveProperty('resumeSecret');
        expectTypeOf<typeof NETWORK_API_VERSION>().toExtend<'0.3.0'>();
        expectTypeOf<'0.3.0'>().toExtend<typeof NETWORK_API_VERSION>();
        // The anchor lists exactly the transcription's eight payload kinds.
        expect(Object.keys(LOBBY_PAYLOAD_KINDS)).toEqual([
            'lobbyIdentity',
            'lobbySetHandle',
            'lobbySubscribe',
            'lobbyCreate',
            'lobbyJoin',
            'lobbySpectate',
            'lobbyLeave',
            'lobbyEvent',
        ]);
    });

    it('keeps NETWORK_API_VERSION at the D4-pinned additive literal', () => {
        expect(NETWORK_API_VERSION).toBe('0.3.0');
    });

    it('declares resumeSecret on BOTH canonical identity surfaces (source-level pin)', () => {
        // The indexed-access witnesses above are compile-time; this is the
        // runtime half, because this package's dedicated tsc program does
        // not cover tests/ (repo-wide typechecking gap, AGENTS.md). A
        // dropped or retyped optional field fails HERE as well as in
        // matchmaking's `typecheck:conformance`.
        const source = readFileSync(
            fileURLToPath(new URL('../src/contracts/network-types.ts', import.meta.url)),
            'utf8',
        );
        const claimBody = /export interface GuestIdentityClaim \{[^}]*\}/s.exec(source)?.[0] ?? '';
        const stateBody = /export interface IdentityState \{[^}]*\}/s.exec(source)?.[0] ?? '';
        expect(claimBody).toMatch(/readonly resumeSecret\?: string;/);
        expect(stateBody).toMatch(/readonly resumeSecret\?: string;/);
    });

    it('round-trips the resume secret on both identity surfaces, tolerating absence', () => {
        // Absent-tolerance is the compatibility contract (D4): an older
        // peer omits the field entirely and both directions still parse.
        const bareClaim: GuestIdentityClaim = JSON.parse(
            JSON.stringify({
                guestPlayerId: 'Player000001' as GuestPlayerId,
                handle: 'Nova',
            } satisfies GuestIdentityClaim),
        ) as GuestIdentityClaim;
        expect(bareClaim).toEqual({ guestPlayerId: 'Player000001', handle: 'Nova' });
        expect(bareClaim.resumeSecret).toBeUndefined();

        const provenClaim: GuestIdentityClaim = JSON.parse(
            JSON.stringify({
                guestPlayerId: 'Player000001' as GuestPlayerId,
                handle: 'Nova',
                resumeSecret: '2f0c3a1e-6d0b-4f3f-9d2b-7a1c5e8b4d10',
            } satisfies GuestIdentityClaim),
        ) as GuestIdentityClaim;
        expect(provenClaim.resumeSecret).toBe('2f0c3a1e-6d0b-4f3f-9d2b-7a1c5e8b4d10');

        const bareState: IdentityState = JSON.parse(
            JSON.stringify({
                handle: 'Nova',
                hasIdentity: true,
                guestPlayerId: 'Player000001' as GuestPlayerId,
            } satisfies IdentityState),
        ) as IdentityState;
        expect(bareState.resumeSecret).toBeUndefined();

        const deliveredState: IdentityState = JSON.parse(
            JSON.stringify({
                handle: 'Nova',
                hasIdentity: true,
                guestPlayerId: 'Player000001' as GuestPlayerId,
                resumeSecret: '2f0c3a1e-6d0b-4f3f-9d2b-7a1c5e8b4d10',
            } satisfies IdentityState),
        ) as IdentityState;
        expect(deliveredState.resumeSecret).toBe('2f0c3a1e-6d0b-4f3f-9d2b-7a1c5e8b4d10');
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
        // IdentityState delivery channel. It is non-secret correlation data.
        // Since issue #146 (FR-026) the owner-only resume secret also lives
        // on exactly those TWO identity surfaces — client→server claim and
        // server→client directed delivery — and nowhere else: snapshots,
        // listings, rosters, and targets keep no bearer credential.
        const claimKeys: ReadonlyArray<string> = ['guestPlayerId', 'handle', 'resumeSecret'];
        const identityStateKeys: ReadonlyArray<string> = ['handle', 'hasIdentity', 'guestPlayerId', 'resumeSecret'];
        expect(claimKeys).toContain('guestPlayerId');
        expect(identityStateKeys).toContain('guestPlayerId');
        expect(claimKeys).toContain('resumeSecret');
        expect(identityStateKeys).toContain('resumeSecret');
    });
});

// ---------------------------------------------------------------------------
// (e) Feature 023 roster wire conformance. The roster types declared in
// "network-types.ts" are pinned against an INDEPENDENT transcription of
// the design source of truth ("specs/010-public-lobby-match-browser/contracts/roster-wire.md")
// by compile-time type assertions. Drift between the copies is caught
// here.
// ---------------------------------------------------------------------------

describe('feature 023 roster wire conformance', () => {
    it('roster types conform to the roster-wire.md transcription', () => {
        expectTypeOf<RosterStatus>().toExtend<DocRosterStatus>();
        expectTypeOf<DocRosterStatus>().toExtend<RosterStatus>();
        expectTypeOf<RosterEntry>().toExtend<DocRosterEntry>();
        expectTypeOf<DocRosterEntry>().toExtend<RosterEntry>();
        expectTypeOf<RosterRevision>().toExtend<DocRosterRevision>();
        expectTypeOf<DocRosterRevision>().toExtend<RosterRevision>();
        expectTypeOf<RosterSnapshot>().toExtend<DocRosterSnapshot>();
        expectTypeOf<DocRosterSnapshot>().toExtend<RosterSnapshot>();
        expectTypeOf<RosterChange>().toExtend<DocRosterChange>();
        expectTypeOf<DocRosterChange>().toExtend<RosterChange>();
        expectTypeOf<RosterDelta>().toExtend<DocRosterDelta>();
        expectTypeOf<DocRosterDelta>().toExtend<RosterDelta>();
    });

    it('roster entries contain exactly {handle, status} — no match identity', () => {
        expectTypeOf<RosterEntry>().not.toHaveProperty('matchId');
        expectTypeOf<RosterEntry>().not.toHaveProperty('sessionToken');
        expectTypeOf<RosterEntry>().not.toHaveProperty('playerId');
    });

    it('RosterChange and RosterEntry are structurally identical', () => {
        expectTypeOf<RosterChange>().toExtend<RosterEntry>();
        expectTypeOf<RosterEntry>().toExtend<RosterChange>();
    });
});
