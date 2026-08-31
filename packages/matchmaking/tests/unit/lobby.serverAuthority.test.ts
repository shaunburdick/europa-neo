/**
 * Server-authority adversarial suites — Feature 010 (T-009)
 *
 * Proves the spec's authority model (spec v1.1 amendment; edge case
 * "client-provided … claims are advisory input only"; FR-010/FR-021/
 * FR-022; NFR-002; SC-009) against the REAL facade + identity registry
 * driven exclusively through their public APIs:
 *
 *   - **Identity claims**: unknown/expired/forged `guestPlayerId`
 *     claims never restore another guest's state — they silently mint
 *     a FRESH unnamed identity whose advisory handle field is ignored;
 *     grace-window claims cannot free or steal the victim's handle.
 *   - **Handle authority**: simultaneous conflicting requests (≥10,
 *     NFR-002) yield exactly ONE winner (`handle_taken` for the rest);
 *     losers' `IdentityState` projections are untouched.
 *   - **Seat / final-seat authority**: seats exist ONLY as
 *     server-issued `SeatAssignment`s returned from delegated
 *     create/join calls — no input shape carries one — and ≥10
 *     concurrent final-seat requests resolve to exactly one occupant
 *     per seat (proven against the REAL feature-006 matchmaker).
 *   - **Action authority**: a 100-action interleaved storm in which
 *     every outcome correlates to its own server-resolved connection
 *     only, all failures are recoverable `Result` errors from the
 *     closed union, and unestablished/unnamed identities are rejected
 *     BEFORE anything is applied or delegated.
 *   - **Projection privacy under attack** (NFR-003/FR-024): hostile
 *     handle strings (JSON-injection text, zero-width format chars,
 *     ANSI escapes) never smuggle bearer credentials or seat authority
 *     into any event, snapshot, or target payload. Guest player IDs are
 *     non-secret correlation identifiers; directed delivery still pins
 *     the owner association and does not grant authority.
 *   - **Projection authority** (R-006 single projection path):
 *     out-of-band/duplicate lifecycle events never project under
 *     pressure, terminal rows drop exactly once, and revisions stay
 *     strictly monotonic under conflicting interleaved events.
 *
 * Threat-model boundary documented by these tests: the opaque
 * `GuestPlayerId` is a non-secret identity reference stored by the
 * legitimate browser for correlation (FR-003). Presenting a VALID id
 * restores THAT identity by design (US1 AC-3) and supersedes the
 * predecessor connection (data-model §2 "at most one lobby
 * connection"); the server-held handle always wins over the claim's
 * advisory handle field. What these tests pin is that FORGED,
 * UNKNOWN, STALE, and EXPIRED claims — the only shapes an attacker
 * can produce without stealing the victim's stored secret — carry
 * zero authority.
 *
 * Scoping note (orders vs lobby actions): SC-009's "100 orders" are
 * in-match engine orders attributed through networking's
 * session-token binding (feature 004 surface; exercised end-to-end by
 * T-011/T-013). The matchmaking-layer action surface is the lobby
 * action set, and its correlation key is the SERVER-owned
 * `ConnectionId`: this facade accepts NO client-supplied
 * `LobbyActionId` input anywhere (the client-generated tag is stamped
 * and echoed at the transport layer, T-010), so a forged or echoed
 * action id has no server-side field to land in. The storm below pins
 * exactly that invariant — effects track connections, never
 * client-declared data — which is the property T-010's echo
 * correlation will rely on.
 *
 * Determinism: injected manual clock + sequential id generators; the
 * facade/registry are synchronous, so "concurrent"
 * requests are issued back-to-back with no awaits — precisely the
 * event-loop serialization the concurrency model documents
 * (constitution Principle II; no fake timers).
 */

import type { ConnectionId, MatchId } from '@europa/networking';
import { beforeEach, describe, expect, it } from 'vitest';

import type { JoinPath, PlayerId, SeatIndex } from '../../contracts/match-types';
import type { LobbyService, Result } from '../../src/contracts/lobby-api';
import type {
    GuestIdentityClaim,
    GuestPlayerId,
    LobbyError,
    LobbyErrorCode,
    LobbyEvent,
    LobbySnapshot,
} from '../../src/contracts/lobby-types';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../../src/index';
import { createIdentityRegistry, type IdentityRegistry } from '../../src/internal/identityRegistry';
import { createLobbyService } from '../../src/internal/lobbyService';
import {
    FakeMatchmakerBridge,
    matchTerminalEvent,
    nextConnectionId,
    seatClaimedEvent,
    seatDisconnectedEvent,
    seatExpiredEvent,
    seatReconnectedEvent,
} from '../fixtures/fakeMatchmakerBridge';
import { FakeServer } from '../fixtures/fakeServer';
import { HANDLE_CONFLICT_GROUPS } from '../fixtures/lobbyIdentities';
import { buildSeatAssignment } from '../fixtures/lobbySnapshots';

// ----------------------------------------------------------------------------
// Deterministic harness (facade + registry)
// ----------------------------------------------------------------------------

/** Base epoch reading; every test advances from here. */
const BASE_MS = 1_000_000;

let clockMs = BASE_MS;
let idSeq = 0;

/** Advance the injected clock and return the new reading. */
function tickClock(ms = 1): number {
    clockMs += ms;
    return clockMs;
}

/**
 * Sequential opaque-id generator handed to the identity registry. The
 * high-entropy marker shape makes privacy scans exact: no user-
 * selectable handle can collide with an `opaque-NNNN-e7f3a9` value,
 * so "absent from the payload" provably means "not leaked".
 */
function fakeRandomId(): string {
    idSeq += 1;
    return opaqueIdAt(idSeq);
}

/** Reconstruct the n-th minted id without advancing the counter. */
function opaqueIdAt(n: number): string {
    return `opaque-${String(n).padStart(4, '0')}-e7f3a9`;
}

/** The n-th minted guest id (registry ids are `opaque-…` by construction). */
function guest(n: number): GuestPlayerId {
    return opaqueIdAt(n) as GuestPlayerId;
}

/** One recorded outbound delivery from the facade under test. */
interface Delivery {
    readonly connectionId: ConnectionId;
    readonly event: LobbyEvent;
}

interface Harness {
    readonly bridge: FakeMatchmakerBridge;
    readonly registry: IdentityRegistry;
    readonly service: LobbyService;
    readonly delivered: Delivery[];
}

/**
 * Fresh facade + fake matchmaker + delivery recorder. The facade self-
 * registers its lifecycle handlers with the fake's listener seam, so
 * `fireOn*` triggers reach it without extra wiring.
 */
function buildHarness(options: { graceMs?: number } = {}): Harness {
    const bridge = new FakeMatchmakerBridge();
    const delivered: Delivery[] = [];
    const registry = createIdentityRegistry({
        randomId: fakeRandomId,
        now: () => clockMs,
        ...(options.graceMs === undefined ? {} : { graceMs: options.graceMs }),
    });
    const service = createLobbyService({
        matchmaker: bridge,
        registry,
        now: () => clockMs,
        deliver: (connectionId, event) => {
            delivered.push({ connectionId, event });
        },
    });
    return { bridge, registry, service, delivered };
}

/** Establish a fresh unnamed identity; returns the connection and its minted guest id. */
function freshConnection(service: LobbyService): { connectionId: ConnectionId; guestId: GuestPlayerId } {
    const connectionId = nextConnectionId();
    service.establishIdentity(undefined, connectionId);
    return { connectionId, guestId: guest(idSeq) };
}

/** Establish AND name an identity in one step (the ready-to-act shape). */
function namedConnection(
    service: LobbyService,
    handle: string,
): { connectionId: ConnectionId; guestId: GuestPlayerId } {
    const established = freshConnection(service);
    const result = service.setHandle(established.connectionId, handle);
    if (!result.ok) {
        throw new Error(`fixture setup: handle "${handle}" rejected (${result.error.code})`);
    }
    return established;
}

/** Unwrap-or-throw helper for expected-success results in happy-path tests. */
function expectOk<T>(result: Result<T, LobbyError>): T {
    if (!result.ok) {
        throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
    }
    return result.data;
}

/** Assert a result fails with exactly the given lobby error code. */
function expectErr(result: Result<unknown, LobbyError>, code: LobbyErrorCode): void {
    expect(result.ok).toBe(false);
    if (!result.ok) {
        expect(result.error.code).toBe(code);
    }
}

/** The closed ten-code union (lobby-types.ts) for recoverability assertions. */
const LOBBY_ERROR_CODES: readonly LobbyErrorCode[] = [
    'identity_invalid',
    'handle_invalid',
    'handle_taken',
    'match_not_found',
    'match_full',
    'match_not_joinable',
    'identity_in_match',
    'identity_expired',
    'server_restarted',
    'internal_error',
];

/**
 * Assert a failure is a RECOVERABLE error value (FR-018): a member of
 * the closed union, optionally pinned to one specific code.
 */
function expectRecoverable(result: Result<unknown, LobbyError>, code?: LobbyErrorCode): void {
    expect(result.ok).toBe(false);
    if (!result.ok) {
        expect(LOBBY_ERROR_CODES).toContain(result.error.code);
        if (code !== undefined) {
            expect(result.error.code).toBe(code);
        }
    }
}

/**
 * Privacy scan (spec Clarifications v1.6 envelope): serialize every
 * recorded delivery plus the given pull snapshots and assert none
 * carries fixture-shaped bearer credentials (`token-NNNN`), player-session
 * credentials (`psn-NNNN`), or one of the supplied hostile literal strings.
 *
 * Sanctioned exception (v1.6): the DIRECTED identity event legitimately
 * carries its recipient's OWN opaque id to the actor, so identity
 * deliveries are excluded from the blanket value scan and audited by
 * {@linkcode assertDirectedIdentitiesPrivate} instead — which this
 * function invokes so one call covers the whole envelope. Entries,
 * snapshots, action outcomes, and every other connection's traffic
 * remain scanned for bearer credentials and authority fields.
 */
function assertNothingPrivate(
    delivered: readonly Delivery[],
    snapshots: readonly LobbySnapshot[],
    hostileStrings: readonly string[] = [],
): void {
    const publicDeliveries = delivered.filter((d) => d.event.kind !== 'identity');
    const blobs = publicDeliveries.map((d) => JSON.stringify(d.event)).concat(snapshots.map((s) => JSON.stringify(s)));
    const scanned = blobs.join('\n');
    expect(scanned).not.toMatch(/token-\d{4}/);
    expect(scanned).not.toMatch(/psn-\d{4}/);
    for (const hostile of hostileStrings) {
        expect(scanned).not.toContain(hostile);
    }
    assertDirectedIdentitiesPrivate(delivered);
}

/** Every minted opaque-id VALUE serialized inside `blob` (order of minting). */
function mintedIdsIn(blob: string): string[] {
    const found: string[] = [];
    for (let n = 1; n <= idSeq; n++) {
        if (blob.includes(opaqueIdAt(n))) {
            found.push(opaqueIdAt(n));
        }
    }
    return found;
}

/**
 * Directed-delivery audit (spec Clarifications v1.6): every identity
 * event may carry AT MOST ONE minted opaque id — its own subject — and
 * that subject must be a real registry id (never forged input). This is
 * the structural half of the envelope; the ownership half (a second
 * connection never receives ANOTHER identity's id) is pinned exactly,
 * with full knowledge of who established what, by the dedicated tests
 * in the "directed identity delivery" suite below.
 */
function assertDirectedIdentitiesPrivate(delivered: readonly Delivery[]): void {
    for (const d of delivered) {
        if (d.event.kind !== 'identity') {
            continue;
        }
        const ids = mintedIdsIn(JSON.stringify(d.event));
        expect(ids, `identity event to ${d.connectionId} carries at most one opaque id`).toHaveLength(1);
    }
}

beforeEach(() => {
    clockMs = BASE_MS;
    idSeq = 0;
});

// ----------------------------------------------------------------------------
// Forged & stale identity claims cannot reassign authority
// ----------------------------------------------------------------------------

describe('forged and stale identity claims (spec v1.1 amendment; US1 AC-3)', () => {
    it('an unknown guest id mints a fresh unnamed identity and ignores every claim field', () => {
        const { service, delivered } = buildHarness();
        const forgedId = 'opaque-9999-deadbeef' as GuestPlayerId;

        const state = service.establishIdentity({ guestPlayerId: forgedId, handle: 'Mallory' }, nextConnectionId());

        // Establishment cannot fail (US1 AC-1); the forged claim is ignored
        // ENTIRELY — including its advisory handle (fresh identities are
        // unnamed; naming requires passing registry validation as oneself).
        expect(state).toEqual({ handle: null, hasIdentity: true });
        // The forged id value appears nowhere in the outbound projection.
        const identityEvent = delivered.find((delivery) => delivery.event.kind === 'identity');
        expect(
            identityEvent?.event.kind === 'identity' ? identityEvent.event.identity.guestPlayerId : undefined,
        ).not.toBe(forgedId);
    });

    it('a claim carrying a hostile handle field cannot overwrite the server-held handle', () => {
        const { service, bridge } = buildHarness();
        const victim = namedConnection(service, 'Nova');
        // Victim's seat drops: grace window starts, identity+handle reserved.
        bridge.fireOnSeatDisconnected(seatDisconnectedEvent({ connectionId: victim.connectionId }));

        // Claimant presents a valid bearer id but a FORGED handle: the
        // server record is the sole authority (data-model §2 — the copied
        // handle is a display snapshot only, never claim-overridable).
        const restored = service.establishIdentity(
            { guestPlayerId: victim.guestId, handle: 'Mallory' },
            nextConnectionId(),
        );
        expect(restored).toEqual({ handle: 'Nova', hasIdentity: true });

        // The registry projection still shows the server-held handle too.
        const again = service.establishIdentity({ guestPlayerId: victim.guestId }, nextConnectionId());
        expect(again.handle).toBe('Nova');
    });

    it('failed forged claims leave the victim identity and its handle reservation untouched', () => {
        const { service } = buildHarness();
        const victim = namedConnection(service, 'Nova');

        // A storm of forged claims on attacker connections must not
        // perturb the victim's record or free its handle.
        for (let attempt = 0; attempt < 10; attempt++) {
            const attacker = freshConnection(service);
            const forgedClaim: GuestIdentityClaim = {
                guestPlayerId: `opaque-forged-${attempt}` as GuestPlayerId,
                handle: 'nova',
            };
            expect(service.establishIdentity(forgedClaim, attacker.connectionId)).toEqual({
                handle: null,
                hasIdentity: true,
            });
            // Each attacker holds a FRESH identity: the victim's name is
            // still reserved, so their advisory handle buys them nothing.
            expectRecoverable(service.setHandle(attacker.connectionId, 'NOVA'), 'handle_taken');
        }

        // Victim unchanged and still actionable on its ORIGINAL connection
        // (failed claims never superseded anything).
        expectOk(service.setHandle(victim.connectionId, 'Nova II'));
    });

    it('an expired grace claim mints fresh and cannot recover the handle a successor now holds', () => {
        const { service, bridge } = buildHarness({ graceMs: 1_000 });
        const victim = namedConnection(service, 'Nova');
        bridge.fireOnSeatDisconnected(seatDisconnectedEvent({ connectionId: victim.connectionId }));

        tickClock(1_000); // grace boundary uses >= (networking convention)
        // A successor claims the freed handle during the stale window.
        const successor = freshConnection(service);
        expectOk(service.setHandle(successor.connectionId, 'nova'));

        // NOW the stale claimant returns with the formerly-valid claim.
        const late = service.establishIdentity({ guestPlayerId: victim.guestId }, nextConnectionId());
        expect(late).toEqual({ handle: null, hasIdentity: true }); // fresh identity…
        // …which is NOT the successor's either (no cross-wiring): a third
        // party names itself independently while the successor keeps 'nova'.
        const third = freshConnection(service);
        expectOk(service.setHandle(third.connectionId, 'Latecomer'));
        const successorStill = service.establishIdentity({ guestPlayerId: successor.guestId }, nextConnectionId());
        expect(successorStill.handle).toBe('nova');
    });

    it('grace-window claims cannot be used to free or steal the reserved handle', () => {
        const { service, bridge } = buildHarness({ graceMs: 5_000 });
        const victim = namedConnection(service, 'Nova');
        bridge.fireOnSeatDisconnected(seatDisconnectedEvent({ connectionId: victim.connectionId }));

        // Challengers presenting forged/unknown claims then requesting the
        // victim's handle ALL fail while grace reserves it (FR-005).
        for (let attempt = 0; attempt < 10; attempt++) {
            const challenger = freshConnection(service);
            service.establishIdentity(
                { guestPlayerId: `opaque-challenger-${attempt}` as GuestPlayerId },
                challenger.connectionId,
            );
            expectRecoverable(service.setHandle(challenger.connectionId, 'NOVA'), 'handle_taken');
        }

        // The legitimate owner reclaims within grace — the ONLY path that
        // recovers the identity (FR-022 same-claimant restoration).
        const reclaimed = service.establishIdentity({ guestPlayerId: victim.guestId }, nextConnectionId());
        expect(reclaimed).toEqual({ handle: 'Nova', hasIdentity: true });
    });

    it('a known guest-ID identity claim supersedes the predecessor connection without split brain', () => {
        const { service } = buildHarness();
        const victim = namedConnection(service, 'Nova');

        // Presenting the stored opaque guest ID is an advisory identity-restore
        // claim (FR-003 browser storage), not a bearer credential. A matching
        // claim restores the identity and supersedes the old connection
        // (data-model §2) — exactly one live binding remains.
        const resumeConnection = nextConnectionId();
        const resuming = service.establishIdentity({ guestPlayerId: victim.guestId }, resumeConnection);
        expect(resuming).toEqual({ handle: 'Nova', hasIdentity: true });

        // The evicted predecessor can no longer act on the identity…
        expectErr(service.setHandle(victim.connectionId, 'NewName'), 'identity_invalid');
        // …and the surviving binding fully controls it (rename works).
        expectOk(service.setHandle(resumeConnection, 'Renamed-Owner'));
    });
});

// ----------------------------------------------------------------------------
// Handle authority under concurrent conflict (NFR-002 ≥10 requests)
// ----------------------------------------------------------------------------

describe('handle authority under concurrent conflict (NFR-002)', () => {
    it('exactly one of 12 simultaneous conflicting requests wins the handle', () => {
        const { service, registry } = buildHarness();
        const contenders = Array.from({ length: 12 }, () => freshConnection(service));
        const variants = HANDLE_CONFLICT_GROUPS[0]?.variants ?? ['Nova'];

        const outcomes = contenders.map((contender, index) => ({
            contender,
            result: service.setHandle(contender.connectionId, variants[index % variants.length] ?? 'Nova'),
        }));

        const winners = outcomes.filter((o) => o.result.ok);
        expect(winners).toHaveLength(1); // atomic recheck: exactly one winner
        const winner = winners[0];
        if (winner === undefined || !winner.result.ok) {
            throw new Error('unreachable: winner asserted above');
        }
        // Display casing preserved verbatim for the winner (FR-005).
        expect(winner.result.data).toEqual({ handle: 'Nova', hasIdentity: true });

        // Every loser received the recoverable duplicate-handle error.
        for (const loser of outcomes.filter((o) => !o.result.ok)) {
            expectRecoverable(loser.result, 'handle_taken');
        }
        // Exactly one reserved key for the contested name (registry truth).
        expect(registry.stats().reservedHandles).toBe(1);
    });

    it('losing challengers keep their prior IdentityState untouched and can still name themselves', () => {
        const { service } = buildHarness();
        const contenders = Array.from({ length: 10 }, () => freshConnection(service));

        const results = contenders.map((c) => service.setHandle(c.connectionId, '  NOVA '));
        expect(results.some((r) => r.ok)).toBe(true); // someone won…

        // …and every loser's projection is EXACTLY its pre-race state.
        // (Restoring by claim supersedes the loser's original connection,
        // so the follow-up correction acts on the RESTORED connection.)
        contenders.forEach((contender, index) => {
            const outcome = results[index];
            if (outcome === undefined || outcome.ok) {
                return;
            }
            const restoredConnection = nextConnectionId();
            const restored = service.establishIdentity({ guestPlayerId: contender.guestId }, restoredConnection);
            expect(restored).toEqual({ handle: null, hasIdentity: true });
            // Recoverable UX (FR-018): the loser corrects and succeeds.
            expectOk(service.setHandle(restoredConnection, `Loser-${index}`));
        });
    });

    it('a rename race against an incumbent rejects all challengers and preserves displayed casing', () => {
        const { service } = buildHarness();
        const incumbent = namedConnection(service, 'Nova');

        for (let attempt = 0; attempt < 10; attempt++) {
            const challenger = freshConnection(service);
            const variant = attempt % 2 === 0 ? 'nova' : ' NOVA ';
            expectRecoverable(service.setHandle(challenger.connectionId, variant), 'handle_taken');
        }

        // Incumbent's accepted casing survives the race untouched…
        const incumbentNewConnection = nextConnectionId();
        const projection = service.establishIdentity({ guestPlayerId: incumbent.guestId }, incumbentNewConnection);
        expect(projection).toEqual({ handle: 'Nova', hasIdentity: true });
        // …and the incumbent can still perform a rename (owner exempt) —
        // on its superseding connection, per the one-binding rule.
        expectOk(service.setHandle(incumbentNewConnection, 'Nova-Prime'));
    });

    it('ten challengers cannot take a handle reserved by a grace-window owner until expiry', () => {
        const { service, bridge } = buildHarness({ graceMs: 500 });
        const owner = namedConnection(service, 'Nova');
        bridge.fireOnSeatDisconnected(seatDisconnectedEvent({ connectionId: owner.connectionId }));

        const challengers = Array.from({ length: 10 }, () => freshConnection(service));
        challengers.forEach((challenger, index) => {
            const variant = index % 2 === 0 ? 'Nova' : ' nova ';
            expectRecoverable(service.setHandle(challenger.connectionId, variant), 'handle_taken');
        });

        // Grace expires → lazy sweep frees the key on the next mutation →
        // a latecomer finally succeeds (edge case: handle availability
        // only after normal cleanup or grace expiry).
        tickClock(500);
        const latecomer = freshConnection(service);
        expectOk(service.setHandle(latecomer.connectionId, 'NOVA'));
        // The former owner's claim is dead post-expiry: fresh identity.
        const staleOwner = service.establishIdentity({ guestPlayerId: owner.guestId }, nextConnectionId());
        expect(staleOwner).toEqual({ handle: null, hasIdentity: true });
    });
});

// ----------------------------------------------------------------------------
// Seat & final-seat authority (FR-010; US4 AC-3; NFR-002)
// ----------------------------------------------------------------------------

describe('seat and final-seat authority (FR-010)', () => {
    it('returns exactly the server-issued assignment to each caller, never a swapped bundle', () => {
        const { service, bridge } = buildHarness();
        const hostA = namedConnection(service, 'Alpha');
        const hostB = namedConnection(service, 'Bravo');
        const createdA = expectOk(service.create(hostA.connectionId, undefined));
        const createdB = expectOk(service.create(hostB.connectionId, undefined));

        // Script DISTINCT server-issued credential bundles; FIFO order =
        // call order (Charlie joins match A first, Dora match B second).
        const forCharlie = buildSeatAssignment({
            seatIndex: 1 as SeatIndex,
            playerId: 2 as PlayerId,
            displayName: 'Charlie',
        });
        const forDora = buildSeatAssignment({
            seatIndex: 1 as SeatIndex,
            playerId: 2 as PlayerId,
            displayName: 'Dora',
        });
        const charlie = namedConnection(service, 'Charlie');
        const dora = namedConnection(service, 'Dora');
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: createdA.matchId,
                joinPath: `/join/${createdA.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: forCharlie,
            },
        });
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: createdB.matchId,
                joinPath: `/join/${createdB.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: forDora,
            },
        });

        const targetC = expectOk(service.join(charlie.connectionId, createdA.matchId));
        const targetD = expectOk(service.join(dora.connectionId, createdB.matchId));

        // Each caller received EXACTLY its own scripted bundle — deep-equal,
        // never swapped, never merged (server routing by connection).
        expect(targetC.seatAssignment).toEqual(forCharlie);
        expect(targetD.seatAssignment).toEqual(forDora);
        expect(targetC.seatAssignment.sessionToken).not.toBe(targetD.seatAssignment.sessionToken);
    });

    it('no input shape can seat an identity without a delegated matchmaker assignment', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const created = expectOk(service.create(host.connectionId, undefined));
        const joinsBefore = bridge.joinCalls.length;

        // Forged claims plus bogus joins produce ZERO delegations and ZERO
        // presence for their presenters. Attackers NAME themselves first so
        // the bogus joins reach the LEDGER check (a named identity with no
        // presence) — which is authoritative pre-delegation: match ids this
        // facade never issued are refused without touching the matchmaker.
        for (let attempt = 0; attempt < 5; attempt++) {
            const attacker = freshConnection(service);
            service.establishIdentity(
                { guestPlayerId: `opaque-attacker-${attempt}` as GuestPlayerId, handle: 'Nova' },
                attacker.connectionId,
            );
            expectOk(service.setHandle(attacker.connectionId, `Attacker-${attempt}`));
            expectRecoverable(service.join(attacker.connectionId, 'match-bogus' as MatchId), 'match_not_found');
            expect(expectOk(service.subscribe(attacker.connectionId)).activeMatchId).toBeNull(); // never seated
        }
        expect(bridge.joinCalls).toHaveLength(joinsBefore);

        // Only a delegated join yields presence — with the ISSUED seat.
        const joiner = namedConnection(service, 'Rowan');
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: created.matchId,
                joinPath: `/join/${created.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex, playerId: 2 as PlayerId }),
            },
        });
        const target = expectOk(service.join(joiner.connectionId, created.matchId));
        expect(target.seatAssignment.seatIndex).toBe(1 as SeatIndex);
        expect(expectOk(service.subscribe(joiner.connectionId)).activeMatchId).toBe(created.matchId);
    });

    it('final-seat race: exactly one of 12 concurrent joiners occupies the last seat (real matchmaker)', async () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });
        const service = createLobbyService({
            matchmaker,
            registry: createIdentityRegistry({ randomId: fakeRandomId, now: () => clockMs }),
            now: () => clockMs,
        });
        try {
            const host = namedConnection(service, 'Host');
            const created = expectOk(service.create(host.connectionId, undefined));

            // Twelve joiners arrive back-to-back — event-loop serialization
            // IS the documented concurrency model (plan.md §2). One open seat.
            const joiners = Array.from({ length: 12 }, (_, index) => namedConnection(service, `Joiner-${index}`));
            const outcomes = joiners.map((joiner) => service.join(joiner.connectionId, created.matchId));

            const winners = outcomes.filter((o) => o.ok);
            expect(winners).toHaveLength(1); // FR-010: at most one seat per request
            for (const outcome of outcomes.filter((o) => !o.ok)) {
                // Recoverable error VALUES, never thrown (FR-018)…
                expectRecoverable(outcome, 'match_not_joinable'); // …from facade fill detection
            }

            // The single occupant holds the server-issued second seat.
            const winner = winners[0];
            if (winner === undefined || !winner.ok) {
                throw new Error('unreachable: winner asserted above');
            }
            expect(winner.data.seatAssignment.seatIndex).toBe(1 as SeatIndex);
            expect(winner.data.seatAssignment.playerId).toBe(2 as PlayerId);

            // Authoritative end-state: started, full, exactly ONE association.
            const snapshot = expectOk(service.subscribe(host.connectionId));
            expect(snapshot.entries[0]).toMatchObject({
                matchId: created.matchId,
                seatsFilled: 2,
                capacity: 2,
                status: 'in_progress',
            });
            const seated = joiners.filter(
                (j) => expectOk(service.subscribe(j.connectionId)).activeMatchId === created.matchId,
            );
            expect(seated).toHaveLength(1);
            expect(matchmaker.stats().runningMatches).toBe(1);

            // Recoverability (FR-018): a race loser immediately acts elsewhere.
            const loser = joiners.find((j) => expectOk(service.subscribe(j.connectionId)).activeMatchId === null);
            expect(loser).toBeDefined();
            if (loser !== undefined) {
                expectOk(service.create(loser.connectionId, undefined));
            }
        } finally {
            await service.close(); // also closes the delegated matchmaker
        }
    });

    it('full-capacity race: one occupant per seat with no doubling (real matchmaker, 4p)', async () => {
        const server = new FakeServer();
        const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });
        const service = createLobbyService({
            matchmaker,
            registry: createIdentityRegistry({ randomId: fakeRandomId, now: () => clockMs }),
            now: () => clockMs,
        });
        try {
            const host = namedConnection(service, 'Host');
            const created = expectOk(service.create(host.connectionId, { playerCount: 4 }));

            // Ten joiners race for three open seats (NFR-002 ≥10 conflicting).
            const joiners = Array.from({ length: 10 }, (_, index) => namedConnection(service, `Racer-${index}`));
            const outcomes = joiners.map((joiner) => service.join(joiner.connectionId, created.matchId));

            const winners = outcomes.filter((o) => o.ok);
            expect(winners).toHaveLength(3); // exactly the three open seats

            // Exactly one occupant PER SEAT: seat indexes and player ids are
            // disjoint across ALL assignments (host included), never doubled.
            const seatIndexes = winners.map((w) => (w.ok ? w.data.seatAssignment.seatIndex : -1)).sort();
            expect(seatIndexes).toEqual([1 as SeatIndex, 2 as SeatIndex, 3 as SeatIndex]);
            const playerIds = winners.map((w) => (w.ok ? w.data.seatAssignment.playerId : -1)).sort();
            expect(playerIds).toEqual([2 as PlayerId, 3 as PlayerId, 4 as PlayerId]);

            for (const outcome of outcomes.filter((o) => !o.ok)) {
                expectRecoverable(outcome, 'match_not_joinable');
            }

            // Capacity is authoritative: full, started, no overbooking.
            const snapshot = expectOk(service.subscribe(host.connectionId));
            expect(snapshot.entries[0]).toMatchObject({
                matchId: created.matchId,
                seatsFilled: 4,
                capacity: 4,
                status: 'in_progress',
            });
            expect(matchmaker.stats().runningMatches).toBe(1);
        } finally {
            await service.close();
        }
    });

    it('forged lifecycle events cannot clear or reassign another player presence', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const filler = namedConnection(service, 'Rowan');
        const created = expectOk(service.create(host.connectionId, undefined));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: created.matchId,
                joinPath: `/join/${created.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex, playerId: 2 as PlayerId }),
            },
        });
        const fillerTarget = expectOk(service.join(filler.connectionId, created.matchId));

        // FORGED-token expiry (a token belonging to nobody): NEITHER
        // participant is cleared — authority requires the exact issued
        // credential, not merely a matching match id.
        bridge.fireOnSeatExpired(
            seatExpiredEvent({ matchId: created.matchId, sessionToken: 'token-forged' as SessionToken }),
        );
        expect(expectOk(service.subscribe(host.connectionId)).activeMatchId).toBe(created.matchId);
        expect(expectOk(service.subscribe(filler.connectionId)).activeMatchId).toBe(created.matchId);

        // Unknown-connection disconnect/reconnect events touch nobody.
        bridge.fireOnSeatDisconnected(seatDisconnectedEvent({ connectionId: 'conn-unknown' as ConnectionId }));
        bridge.fireOnSeatReconnected(seatReconnectedEvent({ connectionId: 'conn-unknown' as ConnectionId }));
        expect(expectOk(service.subscribe(filler.connectionId)).activeMatchId).toBe(created.matchId);
        expect(expectOk(service.subscribe(host.connectionId)).activeMatchId).toBe(created.matchId);

        // Terminal report for an UNKNOWN match id: no drops, no bumps.
        const entriesBefore = expectOk(service.subscribe(filler.connectionId)).entries;
        bridge.fireOnMatchTerminal(matchTerminalEvent({ matchId: 'match-unknown' as MatchId }));
        expect(expectOk(service.subscribe(filler.connectionId)).entries).toEqual(entriesBefore);
        expect(fillerTarget.seatAssignment.seatIndex).toBe(1 as SeatIndex);
    });

    it('seat expiry clears presence only for the exact match+token credential', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const filler = namedConnection(service, 'Rowan');
        const created = expectOk(service.create(host.connectionId, undefined));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: created.matchId,
                joinPath: `/join/${created.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex, playerId: 2 as PlayerId }),
            },
        });
        const fillerTarget = expectOk(service.join(filler.connectionId, created.matchId));

        // Expiry naming the HOST's token clears ONLY the host (and unbinds
        // its connection); the filler keeps both binding and presence.
        bridge.fireOnSeatExpired(
            seatExpiredEvent({ matchId: created.matchId, sessionToken: created.seatAssignment.sessionToken }),
        );
        expect(expectOk(service.subscribe(filler.connectionId)).activeMatchId).toBe(created.matchId);
        // Host-side proof of release: its registry-held identity (handle
        // still in grace) can commit to a NEW match — presence was freed.
        const hostBackConnection = nextConnectionId();
        const hostBack = service.establishIdentity({ guestPlayerId: host.guestId }, hostBackConnection);
        expect(hostBack).toEqual({ handle: 'Nova', hasIdentity: true });
        expectOk(service.create(hostBackConnection, undefined));

        // …expiry naming the FILLER's own token clears exactly the filler
        // (and unbinds its connection, per the expiry handler contract).
        bridge.fireOnSeatExpired(
            seatExpiredEvent({ matchId: created.matchId, sessionToken: fillerTarget.seatAssignment.sessionToken }),
        );
        // Presence is gone: the filler's identity can commit to a NEW match.
        const fillerBackConnection = nextConnectionId();
        const fillerBack = service.establishIdentity({ guestPlayerId: filler.guestId }, fillerBackConnection);
        expect(fillerBack).toEqual({ handle: 'Rowan', hasIdentity: true });
        expectOk(service.create(fillerBackConnection, undefined));

        // …and expiry for an unknown match id is a total no-op (the two
        // new matches above still project; nothing was dropped).
        const entriesBefore = expectOk(service.subscribe(fillerBackConnection)).entries;
        bridge.fireOnSeatExpired(seatExpiredEvent({ matchId: 'match-unknown' as MatchId }));
        expect(expectOk(service.subscribe(fillerBackConnection)).entries).toEqual(entriesBefore);
    });
});

// ----------------------------------------------------------------------------
// Action authority — the 100-action storm (SC-009 lobby-action analog)
// ----------------------------------------------------------------------------

/**
 * Client-side correlation tag bookkeeping (see module header): tags are
 * recorded per action to prove outcomes NEVER depend on them — the
 * facade has no action-id input, so duplicated/forged tags cannot
 * cross-request effects onto other connections.
 */
interface StormAction {
    readonly actor: ConnectionId;
    readonly actorIndex: number;
    readonly tag: number;
    readonly kind: number;
    readonly ok: boolean;
}

describe('action authority — 100 rapid lobby actions (SC-009 analog; FR-021 guards)', () => {
    it('correlates every one of 100 interleaved actions to its own connection only', () => {
        const { service, bridge, delivered } = buildHarness();
        const alpha = namedConnection(service, 'Alpha');
        const bravo = namedConnection(service, 'Bravo');
        const charlie = namedConnection(service, 'Charlie');
        const dora = freshConnection(service); // established but unnamed
        const actors = [alpha.connectionId, bravo.connectionId, charlie.connectionId, dora.connectionId];

        // Fixed starting world: M1 filled+started by Alpha/Bravo; M2 waiting.
        const deliveriesBeforeStorm = delivered.length;
        const m1 = expectOk(service.create(alpha.connectionId, undefined));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: m1.matchId,
                joinPath: `/join/${m1.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex, playerId: 2 as PlayerId }),
            },
        });
        expectOk(service.join(bravo.connectionId, m1.matchId));
        const m2 = expectOk(service.create(charlie.connectionId, undefined));

        const actions: StormAction[] = [];
        let alphaFlips = 0;

        for (let i = 0; i < 100; i++) {
            const actorIndex = i % 4;
            const actor = actors[actorIndex];
            if (actor === undefined) {
                throw new Error('unreachable: actor index is i % 4');
            }
            const kind = i % 5;
            const tag = i % 7; // deliberately colliding client-side tags
            let ok: boolean;

            switch (kind) {
                case 0: {
                    // Handle claims: Alpha case-flips its OWN name; everyone
                    // else's claim on that name loses atomically.
                    const desired = actorIndex === 0 ? (alphaFlips % 2 === 0 ? 'ALPHA' : 'Alpha') : 'ALPHA';
                    const result = service.setHandle(actor, desired);
                    ok = result.ok;
                    if (actorIndex === 0) {
                        expectOk(result);
                        alphaFlips += 1;
                    } else {
                        expectRecoverable(result, 'handle_taken');
                    }
                    break;
                }
                case 1: {
                    // Bogus match id: present identities report their own
                    // commitment first; the unnamed identity reports setup.
                    const result = service.join(actor, 'match-bogus' as MatchId);
                    ok = result.ok;
                    expectRecoverable(result, actorIndex === 3 ? 'identity_invalid' : 'identity_in_match');
                    break;
                }
                case 2: {
                    // Joining the STARTED match: committed → in_match;
                    // unnamed → identity_invalid. Nobody slips into a seat.
                    const result = service.join(actor, m1.matchId);
                    ok = result.ok;
                    expectRecoverable(result, actorIndex === 3 ? 'identity_invalid' : 'identity_in_match');
                    break;
                }
                case 3: {
                    // Spectating a BOGUS match id: committed identities hit
                    // their presence guard first; the unnamed identity gets
                    // the ledger miss. (Spectating a REAL in-progress match
                    // deliberately requires NO handle — pinned in the
                    // unnamed-identity suite below — so a bogus id keeps
                    // this storm's expectations static.)
                    const result = service.spectate(actor, 'match-bogus' as MatchId);
                    ok = result.ok;
                    expectRecoverable(result, actorIndex === 3 ? 'match_not_found' : 'identity_in_match');
                    break;
                }
                default: {
                    // Subscribe: idempotent and always recoverable-safe.
                    const result = service.subscribe(actor);
                    ok = result.ok;
                    expectOk(result);
                    break;
                }
            }
            actions.push({ actor, actorIndex, tag, kind, ok });
        }

        // Tag-collision demonstration: many actions shared tag values across
        // DIFFERENT connections, yet every outcome above matched its own
        // connection's state — no tag ever transferred an effect.
        for (let tag = 0; tag < 7; tag++) {
            const sharers = new Set(actions.filter((a) => a.tag === tag).map((a) => a.actorIndex));
            expect(sharers.size).toBe(4); // every tag was used by all four actors
        }

        // Final authoritative state matches ONLY each actor's own history:
        // kind 0 meets Alpha when i % 20 === 0 → exactly 5 self-renames
        // (odd count → display casing ends flipped to 'ALPHA').
        expect(alphaFlips).toBe(5);
        expectOk(service.setHandle(alpha.connectionId, 'Alpha')); // owner rename still fine
        const pullAlpha = expectOk(service.subscribe(alpha.connectionId));
        const pullBravo = expectOk(service.subscribe(bravo.connectionId));
        const pullCharlie = expectOk(service.subscribe(charlie.connectionId));
        const pullDora = expectOk(service.subscribe(dora.connectionId));
        expect(pullAlpha.activeMatchId).toBe(m1.matchId);
        expect(pullBravo.activeMatchId).toBe(m1.matchId);
        expect(pullCharlie.activeMatchId).toBe(m2.matchId);
        expect(pullDora.activeMatchId).toBeNull(); // never seated despite 15 join/spectate attempts
        expect(pullAlpha.entries.map((e) => [e.matchId, e.status])).toEqual([
            [m1.matchId, 'in_progress'],
            [m2.matchId, 'waiting'],
        ]);

        // Identity pushes during the storm went ONLY to the renaming actor.
        const stormDeliveries = delivered.slice(deliveriesBeforeStorm);
        const identityTargets = new Set(
            stormDeliveries.filter((d) => d.event.kind === 'identity').map((d) => d.connectionId),
        );
        expect(identityTargets).toEqual(new Set([alpha.connectionId]));

        // Zero delegations happened during the storm (all joins/spectates
        // were rejected pre-delegation; renames never touch the matchmaker).
        expect(bridge.joinCalls).toHaveLength(1); // only Bravo's setup fill
        expect(bridge.createCalls).toHaveLength(2); // only the two setup creates

        // Privacy holds across the entire storm's outbound traffic.
        assertNothingPrivate(stormDeliveries, [pullAlpha, pullBravo, pullCharlie, pullDora]);
    });

    it('duplicate client tags across connections produce independent per-connection effects', () => {
        const { service } = buildHarness();
        const first = freshConnection(service);
        const second = freshConnection(service);

        // Both connections conceptually tag their requests with the SAME
        // id (777) — but the API surface takes no tag input, so outcomes
        // derive purely from server-resolved per-connection state: the
        // first reservation wins; the second is a clean, independent loser.
        const firstResult = service.setHandle(first.connectionId, 'Zed');
        const secondResult = service.setHandle(second.connectionId, 'zed');

        expect(firstResult.ok).toBe(true);
        expectRecoverable(secondResult, 'handle_taken');
        // Winner keeps exactly its accepted casing; loser stays unnamed.
        if (!firstResult.ok) {
            throw new Error('unreachable: first reservation asserted above');
        }
        expect(firstResult.data.handle).toBe('Zed');
        const restored = service.establishIdentity({ guestPlayerId: second.guestId }, nextConnectionId());
        expect(restored).toEqual({ handle: null, hasIdentity: true });
    });
});

describe('unestablished and unnamed identities are rejected before anything applies', () => {
    it('rejects every action from a connection with no established identity', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const created = expectOk(service.create(host.connectionId, undefined));
        const ghost = nextConnectionId();

        expectErr(service.setHandle(ghost, 'Ghost'), 'identity_invalid');
        expectErr(service.subscribe(ghost), 'identity_invalid');
        expectErr(service.create(ghost, undefined), 'identity_invalid');
        expectErr(service.join(ghost, created.matchId), 'identity_invalid');
        expectErr(service.spectate(ghost, created.matchId), 'identity_invalid');
        expectErr(service.leave(ghost), 'identity_invalid');

        // Nothing was applied or delegated for the ghost connection.
        expect(bridge.createCalls).toHaveLength(1);
        expect(bridge.joinCalls).toHaveLength(0);
        expect(bridge.leaveCalls).toHaveLength(0);
        const snapshot = expectOk(service.subscribe(host.connectionId));
        expect(snapshot.entries.map((e) => e.matchId)).toEqual([created.matchId]); // ledger untouched
    });

    it('rejects create/join from an unnamed identity WITHOUT delegating, recovers after naming', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Host');
        const created = expectOk(service.create(host.connectionId, undefined));
        const unnamed = freshConnection(service);

        expectErr(service.create(unnamed.connectionId, undefined), 'identity_invalid');
        expectErr(service.join(unnamed.connectionId, created.matchId), 'identity_invalid');
        expect(bridge.createCalls).toHaveLength(1); // host's only
        expect(bridge.joinCalls).toHaveLength(0); // nothing delegated

        // Documented contract shape: spectators need NO handle (guardGuest
        // only), so spectating a started match is allowed while unnamed.
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: created.matchId,
                joinPath: `/join/${created.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex, playerId: 2 as PlayerId }),
            },
        });
        const filler = namedConnection(service, 'Filler');
        expectOk(service.join(filler.connectionId, created.matchId)); // starts it
        expectOk(service.spectate(unnamed.connectionId, created.matchId));

        // Recoverable path (FR-018): naming unblocks create/join immediately.
        expectOk(service.setHandle(unnamed.connectionId, 'LateBloomer'));
        expectOk(service.leave(unnamed.connectionId)); // detach spectator presence
        expectOk(service.create(unnamed.connectionId, undefined));
    });
});

// ----------------------------------------------------------------------------
// Directed identity delivery — the FR-003 channel (spec Clarifications v1.6)
// ----------------------------------------------------------------------------

/** The single minted opaque id carried by one identity event (its subject). */
function subjectOf(event: LobbyEvent): string {
    expect(event.kind).toBe('identity');
    const ids = mintedIdsIn(JSON.stringify(event));
    expect(ids).toHaveLength(1);
    return ids[0] ?? 'unreachable: length asserted above';
}

describe('directed identity delivery — the FR-003 channel (spec Clarifications v1.6)', () => {
    it('establishIdentity delivers the fresh identity’s OWN opaque id to its connection', () => {
        const { service, delivered } = buildHarness();
        const connectionId = nextConnectionId();

        service.establishIdentity(undefined, connectionId);

        const identityDeliveries = delivered.filter((d) => d.connectionId === connectionId);
        expect(identityDeliveries).toHaveLength(1);
        const event = identityDeliveries[0]?.event;
        if (event === undefined || event.kind !== 'identity') {
            throw new Error('unreachable: one identity delivery asserted above');
        }
        // The full sanctioned envelope: safe state PLUS the owner's id,
        // minted by THIS establishment (opaque-0001 is the first mint).
        expect(event.identity).toEqual({ handle: null, hasIdentity: true, guestPlayerId: guest(1) });
        expect(subjectOf(event)).toBe(opaqueIdAt(1));
    });

    it('setHandle delivers the owner’s opaque id on the confirming identity event', () => {
        const { service, delivered } = buildHarness();
        const conn = freshConnection(service);
        delivered.length = 0;

        expectOk(service.setHandle(conn.connectionId, 'Nova'));

        const event = delivered[0]?.event;
        if (event === undefined || event.kind !== 'identity') {
            throw new Error('unreachable: rename must confirm via one identity event');
        }
        expect(event.identity.handle).toBe('Nova');
        expect(subjectOf(event)).toBe(conn.guestId);
    });

    it('a restored claim delivers the SAME identity’s id to the restoring connection', () => {
        const { service, delivered } = buildHarness();
        const original = namedConnection(service, 'Nova');
        const restoreConnection = nextConnectionId();
        delivered.length = 0;

        const state = service.establishIdentity({ guestPlayerId: original.guestId }, restoreConnection);

        // Return value stays the safe projection — the event
        // is THE delivery channel.
        expect(state).toEqual({ handle: 'Nova', hasIdentity: true });
        const event = delivered[0]?.event;
        if (event === undefined || event.kind !== 'identity') {
            throw new Error('unreachable: restore must confirm via one identity event');
        }
        expect(event.identity).toEqual({ handle: 'Nova', hasIdentity: true, guestPlayerId: original.guestId });
    });

    it('a second connection NEVER receives another identity’s guestPlayerId', () => {
        const { service, delivered } = buildHarness();
        const alpha = namedConnection(service, 'Alpha');
        const bravo = namedConnection(service, 'Bravo');

        const streamOf = (connectionId: ConnectionId): string =>
            JSON.stringify(delivered.filter((d) => d.connectionId === connectionId).map((d) => d.event));

        // Each connection's COMPLETE traffic names only its own identity.
        expect(mintedIdsIn(streamOf(alpha.connectionId))).toEqual([alpha.guestId]);
        expect(mintedIdsIn(streamOf(bravo.connectionId))).toEqual([bravo.guestId]);

        // Alpha is restored onto a THIRD connection (legitimate successor):
        // the successor learns Alpha's id; Bravo STILL never does.
        const alphaSuccessor = nextConnectionId();
        service.establishIdentity({ guestPlayerId: alpha.guestId }, alphaSuccessor);
        expect(mintedIdsIn(streamOf(alphaSuccessor))).toEqual([alpha.guestId]);
        expect(streamOf(bravo.connectionId)).not.toContain(alpha.guestId);
    });

    it('snapshots and entries stay free of bearer credentials while identity events carry ids', () => {
        const { service, bridge, delivered } = buildHarness();
        const host = namedConnection(service, 'Host');
        const created = expectOk(service.create(host.connectionId, undefined));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: created.matchId,
                joinPath: `/join/${created.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex, playerId: 2 as PlayerId }),
            },
        });
        const filler = namedConnection(service, 'Filler');
        expectOk(service.join(filler.connectionId, created.matchId));

        // Every snapshot ever PUSHED plus pulled ones: zero opaque ids.
        const pulls = [host.connectionId, filler.connectionId].map((connectionId) =>
            expectOk(service.subscribe(connectionId)),
        );
        assertNothingPrivate(delivered, pulls);
    });
});

// ----------------------------------------------------------------------------
// Projection privacy under attack (NFR-003 / FR-024)
// ----------------------------------------------------------------------------

/**
 * Keys that must NEVER appear outside the sanctioned directed-identity
 * envelope (spec Clarifications v1.6): entries, snapshots, targets, and
 * every non-identity event are scanned against this list verbatim.
 * Identity events get their own structural pin (see
 * {@linkcode assertIdentityEventEnvelope}) because their ONE sanctioned
 * correlation field is the recipient's own `guestPlayerId`.
 */
const FORBIDDEN_PAYLOAD_KEYS: readonly string[] = ['sessionToken', 'playerSessionId', 'seatIndex', 'displayName'];

/** Recursively assert no object in the payload carries a private key. */
function assertNoPrivateKeys(value: unknown): void {
    if (Array.isArray(value)) {
        for (const item of value) {
            assertNoPrivateKeys(item);
        }
        return;
    }
    if (value !== null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
            expect(FORBIDDEN_PAYLOAD_KEYS).not.toContain(key);
            assertNoPrivateKeys(child);
        }
    }
}

/**
 * Structural pin on a DIRECTED identity event (spec Clarifications
 * v1.6): exactly the contracted keys, with `guestPlayerId` present as
 * the one sanctioned field — and nothing else private anywhere inside.
 */
function assertIdentityEventEnvelope(event: Extract<LobbyEvent, { kind: 'identity' }>): void {
    expect(Object.keys(event.identity)).toEqual(['handle', 'hasIdentity', 'guestPlayerId']);
}

describe('projection privacy under attack (NFR-003/FR-024)', () => {
    /** Hostile-but-valid handles attempting injection through display data. */
    const HOSTILE_HANDLES: readonly string[] = [
        '"g":"INJ","x":1', // JSON-injection text (valid content, ≤24 chars)
        'Zero\u200BWidth\u200BName', // Cf zero-width format characters
        '\u00A0NBSP\u00A0King', // interior NBSP (neither trimmed nor control)
        '🚀Ångström玩家一号', // astral + Latin + CJK mix
    ];

    it('accepted hostile handles never smuggle private fields into any payload shape', () => {
        const { service, bridge, delivered } = buildHarness();

        // Every hostile handle is ACCEPTED display data (FR-004 corpora):
        // injection attempts ride in as ordinary user content. The first
        // two are claimed here; the lifecycle below reuses the other two.
        HOSTILE_HANDLES.slice(0, 2).forEach((handle) => {
            const conn = freshConnection(service);
            const accepted = expectOk(service.setHandle(conn.connectionId, handle));
            expect(accepted.handle).toBe(handle); // stored verbatim, nothing rewritten

            // The identity event carries EXACTLY the contracted keys —
            // including its OWN sanctioned guestPlayerId (v1.6)…
            const identityDelivery = delivered.at(-1);
            expect(identityDelivery?.event.kind).toBe('identity');
            if (identityDelivery?.event.kind === 'identity') {
                assertIdentityEventEnvelope(identityDelivery.event);
            }
        });

        // …and a full create/join/spectate lifecycle over hostile names
        // keeps every outbound shape inside its privacy envelope.
        const host = namedConnection(service, HOSTILE_HANDLES[2] ?? 'Fallback-Host');
        const target = expectOk(service.create(host.connectionId, undefined));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: target.matchId,
                joinPath: `/join/${target.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({
                    seatIndex: 1 as SeatIndex,
                    playerId: 2 as PlayerId,
                    displayName: HOSTILE_HANDLES[0] ?? 'Fallback-Joiner',
                }),
            },
        });
        const joiner = namedConnection(service, HOSTILE_HANDLES[3] ?? 'Fallback-Joiner');
        expectOk(service.join(joiner.connectionId, target.matchId));
        const watcher = namedConnection(service, 'Watcher-Ω');

        const pulls = [host.connectionId, joiner.connectionId, watcher.connectionId].map((connectionId) =>
            expectOk(service.subscribe(connectionId)),
        );

        // Structural envelope pins on EVERY observable shape:
        for (const delivery of delivered) {
            if (delivery.event.kind === 'identity') {
                // Sanctioned v1.6 envelope: own id present, key set exact.
                assertIdentityEventEnvelope(delivery.event);
                continue;
            }
            assertNoPrivateKeys(delivery.event);
            if (delivery.event.kind === 'snapshot') {
                expect(Object.keys(delivery.event.snapshot)).toEqual(['revision', 'entries', 'activeMatchId']);
                delivery.event.snapshot.entries.forEach((entry) => {
                    expect(Object.keys(entry)).toEqual([
                        'matchId',
                        'seatsFilled',
                        'capacity',
                        'status',
                        'boardSize',
                        'tickIntervalMs',
                    ]);
                });
            }
        }
        expect(Object.keys(target)).toEqual(['matchId', 'seatAssignment']);
        // Value-level scan: no bearer credentials or player-session credentials.
        assertNothingPrivate(delivered, pulls);
    });

    it('control-character injection handles are rejected before reaching any projection', () => {
        const { service, delivered } = buildHarness();
        const conn = freshConnection(service);
        const deliveriesBefore = delivered.length;

        expectRecoverable(service.setHandle(conn.connectionId, '\u001B[31mRed'), 'handle_invalid'); // ANSI escape
        expectRecoverable(service.setHandle(conn.connectionId, 'bad\u0000name'), 'handle_invalid'); // NUL
        expectRecoverable(service.setHandle(conn.connectionId, 'bad\nname'), 'handle_invalid'); // newline

        // Rejections deliver NOTHING (no identity event, no snapshot).
        expect(delivered).toHaveLength(deliveriesBefore);
        const restored = service.establishIdentity({ guestPlayerId: conn.guestId }, nextConnectionId());
        expect(restored).toEqual({ handle: null, hasIdentity: true }); // still unnamed
    });

    it('spectator targets expose only the match id — no seat, token, or role fields', () => {
        const { service, bridge } = buildHarness();
        const host = namedConnection(service, 'Host');
        const filler = namedConnection(service, 'Filler');
        const watcher = namedConnection(service, 'Watcher');
        const created = expectOk(service.create(host.connectionId, undefined));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: created.matchId,
                joinPath: `/join/${created.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex, playerId: 2 as PlayerId }),
            },
        });
        expectOk(service.join(filler.connectionId, created.matchId));

        const spectatorTarget = expectOk(service.spectate(watcher.connectionId, created.matchId));
        expect(Object.keys(spectatorTarget)).toEqual(['matchId']);
        assertNoPrivateKeys(spectatorTarget);
    });
});

// ----------------------------------------------------------------------------
// Projection authority under adversarial pressure (R-006 single path)
// ----------------------------------------------------------------------------

describe('projection authority under adversarial pressure (R-006 single path)', () => {
    it('out-of-band events for unknown matches never project, whatever the pressure', () => {
        const { service, bridge, delivered } = buildHarness();
        const viewer = namedConnection(service, 'Nova');
        expectOk(service.subscribe(viewer.connectionId));

        // A ghost match id nobody issued: every bridge trigger fires at the
        // facade repeatedly — claims, disconnects, reconnects, expiries,
        // terminals — and none of it may fabricate a row, deliver a
        // snapshot, or move the revision.
        for (let attempt = 0; attempt < 10; attempt++) {
            bridge.fireOnSeatClaimed(seatClaimedEvent({ matchId: 'match-ghost' as MatchId, playerId: null }));
            bridge.fireOnSeatDisconnected(seatDisconnectedEvent({ matchId: 'match-ghost' as MatchId }));
            bridge.fireOnSeatReconnected(seatReconnectedEvent({ matchId: 'match-ghost' as MatchId }));
            bridge.fireOnSeatExpired(seatExpiredEvent({ matchId: 'match-ghost' as MatchId }));
            bridge.fireOnMatchTerminal(matchTerminalEvent({ matchId: 'match-ghost' as MatchId }));
        }

        // Zero publications: the only snapshot ever seen is the subscribe
        // baseline (returned, not pushed), empty, at the initial revision.
        const baseline = expectOk(service.subscribe(viewer.connectionId));
        expect(baseline.revision).toBe(1);
        expect(baseline.entries).toEqual([]);
        expect(delivered.filter((d) => d.event.kind === 'snapshot')).toHaveLength(0);
        assertNothingPrivate(delivered, [baseline]);
    });

    it('terminal transitions drop rows exactly once and revisions stay strictly monotonic', () => {
        const { service, bridge, delivered } = buildHarness();
        const host = namedConnection(service, 'Nova');
        const filler = namedConnection(service, 'Rowan');
        const joiner = namedConnection(service, 'Joiner');
        expectOk(service.subscribe(host.connectionId));

        // Two issued matches; R1 filled to in_progress through the
        // delegated seat assignment.
        const r1 = expectOk(service.create(host.connectionId, undefined));
        const r2 = expectOk(service.create(filler.connectionId, undefined));
        bridge.queueJoinResult({
            ok: true,
            data: {
                matchId: r1.matchId,
                joinPath: `/join/${r1.matchId}` as JoinPath,
                joinUrl: null,
                seatAssignment: buildSeatAssignment({ seatIndex: 1 as SeatIndex, playerId: 2 as PlayerId }),
            },
        });
        expectOk(service.join(joiner.connectionId, r1.matchId));

        // No-op pressure interleaved: duplicate claims/disconnects/reconnects
        // and expiry reports must NOT bump revisions (exactly-once discipline
        // of the diff-gated single pass).
        const revisionAfterFills = expectOk(service.subscribe(host.connectionId)).revision;
        for (let round = 0; round < 5; round++) {
            bridge.fireOnSeatClaimed(seatClaimedEvent({ matchId: r1.matchId, playerId: null }));
            bridge.fireOnSeatDisconnected(seatDisconnectedEvent({ matchId: r1.matchId }));
            bridge.fireOnSeatReconnected(seatReconnectedEvent({ matchId: r1.matchId }));
            bridge.fireOnSeatExpired(seatExpiredEvent({ matchId: r1.matchId }));
        }
        expect(expectOk(service.subscribe(host.connectionId)).revision).toBe(revisionAfterFills);

        // Finish R2 → drops; finish R1 → drops; DUPLICATE terminal reports
        // for already-dropped rows are absorbed without another bump.
        bridge.fireOnMatchTerminal(matchTerminalEvent({ matchId: r2.matchId }));
        bridge.fireOnMatchTerminal(matchTerminalEvent({ matchId: r1.matchId }));
        const revisionAfterDrops = expectOk(service.subscribe(host.connectionId)).revision;
        expect(revisionAfterDrops).toBe(revisionAfterFills + 2);
        bridge.fireOnMatchTerminal(matchTerminalEvent({ matchId: r1.matchId }));
        bridge.fireOnMatchTerminal(matchTerminalEvent({ matchId: r2.matchId }));
        expect(expectOk(service.subscribe(host.connectionId)).revision).toBe(revisionAfterDrops);

        // Monotonicity across everything ever published (one subscriber ⇒
        // one delivery per visible change, strictly increasing revisions).
        const revisions = delivered
            .filter((d) => d.event.kind === 'snapshot')
            .map((d) => (d.event.kind === 'snapshot' ? d.event.snapshot.revision : -1));
        expect(revisions.length).toBeGreaterThanOrEqual(4);
        for (let i = 1; i < revisions.length; i++) {
            const previous = revisions[i - 1];
            const current = revisions[i];
            expect(current).toBeGreaterThan(previous ?? 0);
        }
        // Truth at the end: nothing projects; finished matches leave no history.
        const final = expectOk(service.subscribe(host.connectionId));
        expect(final.entries).toEqual([]);
        assertNothingPrivate(delivered, [final]);
    });

    it('the six-field entry envelope holds against hostile identity strings', () => {
        const { service, delivered } = buildHarness();
        // Hostile-but-VALID handles (the only participant-controlled string
        // this surface accepts — there is no separate display-name input):
        // markup, quote/JSON-injection text, zero-width format characters.
        const hostileHandles = ['<script>', 'g-"leak"', 'zero\u200Bwidth'];
        const primaryHostile = hostileHandles[0];
        if (primaryHostile === undefined) {
            throw new Error('unreachable: fixture list is non-empty');
        }
        const actor = namedConnection(service, primaryHostile);
        expectOk(service.subscribe(actor.connectionId));
        expectOk(service.create(actor.connectionId, { tickIntervalMs: 200 }));

        const snapshot = expectOk(service.subscribe(actor.connectionId));
        const entry = snapshot.entries[0];
        expect(entry).toBeDefined();
        if (entry === undefined) {
            throw new Error('unreachable: entry asserted above');
        }
        // Exactly the six discovery fields — no participant data escapes.
        expect(Object.keys(entry)).toEqual([
            'matchId',
            'seatsFilled',
            'capacity',
            'status',
            'boardSize',
            'tickIntervalMs',
        ]);
        // The PROJECTION carries none of the hostile strings. (The identity
        // event legitimately echoes a connection its OWN accepted handle —
        // FR-020 display data — so the scan targets entries, not deliveries.)
        const serializedEntries = JSON.stringify(snapshot.entries);
        for (const hostile of hostileHandles) {
            expect(serializedEntries).not.toContain(hostile);
        }
        assertNoPrivateKeys(snapshot);
        // No delivery ever carries bearer tokens or player-session credentials.
        assertNothingPrivate(delivered, [snapshot]);
    });
});
