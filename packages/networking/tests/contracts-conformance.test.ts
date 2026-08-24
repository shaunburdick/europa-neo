/**
 * Contract Conformance Test — Feature 004 Polish (T050)
 *
 * Enforces the networking package's three contract-discipline rules:
 *
 *   (a) **Byte-identity** — every local contract copy under
 *       `src/contracts/` is BYTE-identical to its source-of-truth at
 *       `.specify/features/004-multiplayer-networking/contracts/`
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
 *       exactly the twelve documented payload interfaces (one per
 *       `MessageKind`, no extras), and every kind-to-payload mapping
 *       stays exhaustive under future edits (the `never` guard in the
 *       runtime classifier fails to compile when a kind is added
 *       without updating the map).
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
    tick: TickBroadcastPayload;
    snapshot: SnapshotPayload;
    order: OrderSubmissionPayload;
    orderAck: OrderAckPayload;
    terminal: TerminalPayload;
    error: ErrorPayload;
}

type PayloadsConform = AssertMutuallyAssignable<KindToPayload[MessageKind], NetworkPayload>;

const PAYLOADS_CONFORM: PayloadsConform = true;

/** All twelve documented message kinds (client→server first, mirroring the contract). */
const ALL_KINDS: readonly MessageKind[] = [
    'hello',
    'joinMatch',
    'order',
    'ping',
    'helloAck',
    'joinAck',
    'snapshot',
    'tick',
    'orderAck',
    'terminal',
    'pong',
    'error',
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
                    readFile(repoPath(`.specify/features/004-multiplayer-networking/contracts/${file}`), 'utf-8'),
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

    it('(c) the NetworkPayload union is exactly the twelve documented payloads', () => {
        // Compile-time proof: KindToPayload[MessageKind] ≡ NetworkPayload.
        expect(PAYLOADS_CONFORM).toBe(true);

        // Runtime corroboration: every documented kind classifies, the
        // classifier's switch stays exhaustive (a missing case would fail
        // typecheck via the `never` guard), and the labels are unique —
        // one payload body per kind, no aliases.
        const labels = ALL_KINDS.map((kind) => kindLabel(kind));
        expect(labels).toHaveLength(12);
        expect(new Set(labels).size).toBe(12);
    });
});
