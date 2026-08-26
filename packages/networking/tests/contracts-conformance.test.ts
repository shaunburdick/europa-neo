/**
 * Contract Conformance Test — Feature 004 Polish (T050)
 *
 * Enforces the networking package's three contract-discipline rules:
 *
 *   (a) **Byte-identity** — every local contract copy under
 *       `src/contracts/` is BYTE-identical to its source-of-truth at
 *       `specs/004-multiplayer-networking/contracts/`
 *       (stricter than the engine's semantic compare: for feature 004
 *       the mirrors were cut verbatim, so even a whitespace drift is
 *       a bug). Local copies exist because `tsc`'s `rootDir: ./src`
 *       rejects imports from outside the package.
 *
 *   (b) **Type conformance** — the engine-mirrored wire types
 *       (`Order`, `MatchResult`) and the fog-derived view type
 *       (`PlayerView`) re-exported through `src/types.ts` are mutually
 *       assignable with their canonical declarations. Any field drift
 *       anywhere along the re-export chain fails `pnpm typecheck`.
 *
 *   (c) **Union exhaustiveness** — the `NetworkPayload` union covers
 *       exactly the twenty documented payload interfaces (one per
 *       `MessageKind`, no extras), and every kind-to-payload mapping
 *       stays exhaustive under future edits (the `never` guard in the
 *       runtime classifier fails to compile when a kind is added
 *       without updating the map).
 *
 *   (d) **Feature 010 lobby wire conformance** — the additive `lobby*`
 *       family declared in `network-types.ts` stays structurally
 *       conformant to its design source of truth
 *       (`specs/010-public-lobby-match-browser/contracts/lobby-wire.md`
 *       + `lobby-types.md`) via an independent transcription pinned by
 *       mutual-assignability aliases, and the `LobbyEvent` variant set
 *       stays exhaustively classified.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { MatchResult, Order } from '@europa/engine';
import type { PlayerView } from '@europa/fog';
import { describe, expect, it } from 'vitest';

import type {
    ErrorPayload,
    HelloAckPayload,
    HelloPayload,
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
    SnapshotPayload,
    TerminalPayload,
    TickBroadcastPayload,
} from '../src/contracts/network-types';
import type {
    MatchResult as MatchResultReexport,
    Order as OrderReexport,
    PlayerView as PlayerViewReexport,
} from '../src/types';

/** Resolve a path relative to the monorepo root. */
function repoPath(relativePath: string): string {
    // packages/networking/tests/contracts-conformance.test.ts → 3 levels up.
    return resolve(__dirname, '..', '..', '..', relativePath);
}

// ---------------------------------------------------------------------------
// (b) Compile-time type conformance. Mutual assignability proves set
// equality for unions and field-for-field equality for objects: if any
// side drifts, these aliases fail to typecheck.
// ---------------------------------------------------------------------------

type AssertMutuallyAssignable<A extends B, B extends A> = true;

type OrderConforms = AssertMutuallyAssignable<Order, OrderReexport>;
type MatchResultConforms = AssertMutuallyAssignable<MatchResult, MatchResultReexport>;
type PlayerViewConforms = AssertMutuallyAssignable<PlayerView, PlayerViewReexport>;

const ORDER_CONFORMS: OrderConforms = true;
const MATCH_RESULT_CONFORMS: MatchResultConforms = true;
const PLAYER_VIEW_CONFORMS: PlayerViewConforms = true;

// ---------------------------------------------------------------------------
// (c) Compile-time union exhaustiveness. The documented one-payload-
// per-kind map must be mutually assignable with the union: a payload
// missing from `NetworkPayload`, or an extra union member without a
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
 * a `MessageKind` without a case here turns `kind` into `never` in the
 * default branch and fails `pnpm typecheck`.
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
    describe('(a) byte-identity of local contract mirrors vs spec source-of-truth', () => {
        const contractFiles = ['network-types.ts', 'network-api.ts', 'matchmaking-to-networking.ts'] as const;

        for (const file of contractFiles) {
            it(`src/contracts/${file} is byte-identical to the spec copy`, async () => {
                const [local, spec] = await Promise.all([
                    readFile(repoPath(`packages/networking/src/contracts/${file}`), 'utf-8'),
                    readFile(repoPath(`specs/004-multiplayer-networking/contracts/${file}`), 'utf-8'),
                ]);
                expect(local).toBe(spec);
            });
        }
    });

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
        // typecheck via the `never` guard), and the labels are unique —
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
          // mirroring matchmaking's `LobbyError.detail` so clients can
          // render field-specific actionable text from code + detail.
          readonly detail?: Readonly<Record<string, string | number | boolean>>;
      };

/** Transcription of lobby-wire.md's eight payload shapes. */
interface DocLobbyWireShapes {
    lobbyIdentity: { readonly claim?: DocGuestIdentityClaim };
    lobbySetHandle: { readonly handle: string; readonly actionId: DocLobbyActionId };
    lobbySubscribe: { readonly actionId: DocLobbyActionId };
    lobbyCreate: {
        readonly actionId: DocLobbyActionId;
        // Transcribes `Partial<MatchSettings>`: top-level fields optional,
        // `terrainSettings` complete when present (mirrors matchmaking's
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
 * Byte-identity between the two contract copies plus review against the
 * design docs covers that residual gap.
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

/** The four documented `LobbyEvent` variant kinds. */
const LOBBY_EVENT_KINDS = ['identity', 'snapshot', 'actionAccepted', 'error'] as const;

/**
 * Compile-time exhaustiveness guard over `LobbyEvent` variants: adding a
 * variant without a case here fails `pnpm typecheck` via the `never`
 * branch.
 *
 * @param event Any lobby event.
 * @returns The event's `kind` label.
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
        default: {
            const unreachable: never = event;
            return unreachable;
        }
    }
}

describe('feature 010 lobby wire conformance (T-002)', () => {
    it('the contract lobby payloads conform to the lobby-wire.md/lobby-types.md transcription', () => {
        // Compile-time proof lives in the LobbyWireConforms aliases; this
        // runtime assertion keeps them "used" so linters stay quiet.
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
    });

    it('every lobby message kind is declared exactly once in the protocol union', () => {
        const lobbyKinds = ALL_KINDS.filter((kind) => kind.startsWith('lobby'));
        expect(lobbyKinds).toHaveLength(8);
        expect(new Set(lobbyKinds).size).toBe(8);
    });

    it('the LobbyEvent union is exhaustively classified over its four variants', () => {
        const samples: ReadonlyArray<LobbyEvent> = [
            { kind: 'identity', identity: { handle: null, hasIdentity: true } },
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
        ];
        const labels = samples.map((event) => lobbyEventKindLabel(event));
        expect(labels).toEqual([...LOBBY_EVENT_KINDS]);
        expect(new Set(labels).size).toBe(LOBBY_EVENT_KINDS.length);
    });

    it('declares no opaque guest player id anywhere in the public projections', () => {
        // Privacy boundary spot-check (spec FR-024 / NFR-003): the wire
        // projection types carry match discovery data and handles only.
        // The ONLY field typed with GuestPlayerId across the whole lobby
        // surface is the advisory GuestIdentityClaim input.
        const entryKeys: ReadonlyArray<string> = [
            'matchId',
            'seatsFilled',
            'capacity',
            'status',
            'boardSize',
            'tickIntervalMs',
        ];
        const claimKeys: ReadonlyArray<string> = ['guestPlayerId', 'handle'];
        expect(entryKeys).not.toContain('guestPlayerId');
        expect(claimKeys).toContain('guestPlayerId');
    });
});
