/**
 * Cross-package conformance — Feature 006 (T061).
 *
 * Asserts the matchmaker uses feature 004's networking surface and the
 * engine's order/world types exactly as declared, so upstream drift
 * fails CI here before it fails a real match. Per `plan.md`
 * §"Constitution Check" Principle III + `quickstart.md` §4.
 *
 * **Deviation from the task prose (dispatch ruling, Wave 7E)**: T061's
 * text asks for `engine.createMatchSession` / `MatchInitRequest` from
 * an `engine-to-matchmaking.ts` contract — NEITHER exists in the
 * shipped engine (its public surface is the primitive lifecycle:
 * `createWorld` / `applyCommand` / `tick` / `isTerminal`; see
 * `src/engineSession.ts` for the documented wrapping deviation). The
 * drift-catching INTENT is preserved against reality:
 *
 *   (a) the auto-start-constructed engine session satisfies
 *       networking's canonical `EngineSession` interface and drives
 *       the REAL engine primitives (compile-time assignability +
 *       behavioral probe);
 *   (b) forfeit submits `{ kind: 'surrender', player }` — captured at
 *       the `submit` boundary and proven to eliminate in the world;
 *   (c) `registerMatch` receives networking's `RegisterMatchRequest`;
 *   (d) `attachPlayer` fires per seat with `AttachPlayerRequest`;
 *   (e) `detachPlayer` receives networking's real `DetachRequest` —
 *       which carries NO `reason` field (the `'forfeit_timeout'`
 *       reason lives only in the planning contract
 *       `matchmaking-to-networking.ts::MatchmakingDetach`, never
 *       shipped on `Server.detachPlayer`); detachment is asserted by
 *       `(matchId, sessionToken, playerId)` per Q-M04 precedent;
 *   (f) the matchmaker's bridge wiring is checked against feature
 *       004's `MatchmakerBridge` exactly (captured through a server
 *       whose `bindMatchmaker` parameter type IS the canonical
 *       interface — non-conforming handlers fail `pnpm typecheck`).
 */

import type { Order, PlayerId } from '@europa/engine';
import type { EngineSession, MatchmakerBridge } from '@europa/networking';
import { describe, expect, it } from 'vitest';

import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../src/index';
import { FakeServer } from './fixtures/fakeServer';

/**
 * A FakeServer that captures the bridge under the CANONICAL
 * `MatchmakerBridge` parameter type: if the matchmaker ever passes an
 * object that no longer satisfies feature 004's interface, this file
 * stops compiling — the drift catch clause (f) demands.
 */
class BridgeCapturingServer extends FakeServer {
    /** The handlers the matchmaker registered at construction time. */
    capturedBridge: MatchmakerBridge | null = null;

    override bindMatchmaker(bridge: MatchmakerBridge): void {
        super.bindMatchmaker(bridge);
        this.capturedBridge = bridge;
    }
}

/** Drive one public 2-player match to `running`; return its handles. */
function startTwoPlayerMatch(server: FakeServer) {
    const matchmaker = createMatchmaker(MATCHMAKING_CONSTANTS, { server });
    const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Alice' });
    if (!created.ok) {
        throw new Error('fixture create failed');
    }
    const joined = matchmaker.joinMatch({ matchId: created.data.matchId, displayName: 'Bob' });
    if (!joined.ok) {
        throw new Error('fixture join failed');
    }
    return {
        matchmaker,
        matchId: created.data.matchId,
        aliceToken: created.data.seatAssignment.sessionToken,
        bobToken: joined.data.seatAssignment.sessionToken,
    };
}

describe('conformance: matchmaker uses upstream types at documented call sites', () => {
    it("(a) auto-start registers an EngineSession satisfying networking's canonical interface", () => {
        const server = new FakeServer();
        const { matchmaker, matchId } = startTwoPlayerMatch(server);

        // Compile-time: the recorded request IS networking's canonical
        // RegisterMatchRequest (FakeServer already types the array; the
        // annotation documents the contract being pinned).
        const registration: RegisterMatchRequest | undefined = server.registerMatchCalls[0];
        expect(registration).toBeDefined();
        expect(registration?.matchId).toBe(matchId);

        // Compile-time + runtime: the handed-over session is usable as
        // networking's EngineSession and wraps the REAL engine primitives.
        const session: EngineSession | undefined = registration?.engineSession;
        expect(session).toBeDefined();
        const world = session?.world();
        expect(world?.players).toHaveLength(2);

        // The config snapshot travels alongside (version checks + telemetry).
        const config = registration?.matchConfig;
        expect(config?.playerCount).toBe(2);
        expect(config?.visibilityRadius).toBeDefined();

        matchmaker.close();
    });

    it('(b) forfeit submits OrderSurrender { kind: "surrender", player } via engineSession.submit', () => {
        const server = new FakeServer();
        const { matchmaker, matchId, aliceToken } = startTwoPlayerMatch(server);

        const session = server.lastEngineSession;
        if (session === undefined) {
            throw new Error('fixture: no engine session recorded');
        }

        // Capture at the submit boundary (the exact drift-catch point:
        // if the engine renames the order kind or reshapes PlayerId, the
        // recorded payload below stops matching).
        const submitted: Order[] = [];
        const realSubmit = session.submit.bind(session);
        session.submit = (order: Order) => {
            submitted.push(order);
            return realSubmit(order);
        };

        server.fireOnSeatExpired({
            matchId,
            sessionToken: aliceToken,
            playerId: 1 satisfies PlayerId,
        });

        expect(submitted).toEqual([{ kind: 'surrender', player: 1 }]);
        // Behavioral cross-check: the engine (FR-016 single source of
        // truth for elimination) marked the surrendered player eliminated.
        expect(session?.world().players[0]?.status).toBe('eliminated');

        matchmaker.close();
    });

    it('(c)+(d) registerMatch/attachPlayer carry the canonical request shapes per seat', () => {
        const server = new FakeServer();
        const { matchmaker, matchId, aliceToken, bobToken } = startTwoPlayerMatch(server);

        // (c) exactly one registration with the documented fields. The
        // array element type IS networking's canonical RegisterMatchRequest
        // (FakeServer pins it), so this binding is the compile-time check.
        expect(server.registerMatchCalls).toHaveLength(1);
        const [registration] = server.registerMatchCalls;
        if (registration === undefined) {
            throw new Error('fixture: no registerMatch call recorded');
        }
        expect(Object.keys(registration).sort()).toEqual(['engineSession', 'matchConfig', 'matchId']);
        expect(registration.matchId).toBe(matchId);

        // (d) one attach per seat, in seat order, playerId = seatIndex + 1.
        expect(server.attachPlayerCalls).toHaveLength(2);
        const [firstAttach, secondAttach] = server.attachPlayerCalls;
        if (firstAttach === undefined || secondAttach === undefined) {
            throw new Error('fixture: missing attachPlayer calls');
        }
        expect(firstAttach.playerId).toBe(1);
        expect(secondAttach.playerId).toBe(2);
        expect(firstAttach.sessionToken).toBe(aliceToken);
        expect(secondAttach.sessionToken).toBe(bobToken);
        expect(new Set(server.attachPlayerCalls.map((call) => call.matchId))).toEqual(new Set([matchId]));

        matchmaker.close();
    });

    it("(e) detachPlayer carries networking's real DetachRequest shape (no reason field)", () => {
        const server = new FakeServer();
        const { matchmaker, matchId, aliceToken } = startTwoPlayerMatch(server);

        server.fireOnSeatExpired({ matchId, sessionToken: aliceToken, playerId: 1 });

        expect(server.detachPlayerCalls).toHaveLength(1);
        // Compile-time pin to the SHIPPED shape: DetachRequest is
        // { matchId, playerId?, sessionToken }. The task prose expected a
        // `reason: 'forfeit_timeout'` field that networking never shipped
        // (see the module doc, clause e).
        const [detach] = server.detachPlayerCalls;
        if (detach === undefined) {
            throw new Error('fixture: no detachPlayer call recorded');
        }
        expect(detach.matchId).toBe(matchId);
        expect(detach.sessionToken).toBe(aliceToken);
        expect(detach.playerId).toBe(1);
        expect('reason' in detach).toBe(false);

        matchmaker.close();
    });

    it('(f) the matchmaker wires every MatchmakerBridge handler through bindMatchmaker', () => {
        const server = new BridgeCapturingServer();
        const { matchmaker } = startTwoPlayerMatch(server);

        // The capture parameter is typed `MatchmakerBridge` — reaching this
        // line at all proves compile-time conformance of the handler set.
        const bridge = server.capturedBridge;
        expect(bridge).not.toBeNull();

        // All five feature-004 callbacks are present and callable.
        const expectedHandlers = [
            'onSeatClaimed',
            'onSeatDisconnected',
            'onSeatReconnected',
            'onSeatExpired',
            'onMatchTerminal',
        ] as const;
        for (const name of expectedHandlers) {
            expect(typeof bridge?.[name]).toBe('function');
        }

        // Functional spot-checks through the CAPTURED bridge: expiry
        // surrenders + detaches; terminal transitions running → finished.
        const created = matchmaker.createMatch({ visibility: 'public', displayName: 'Cara' });
        if (!created.ok) {
            throw new Error('fixture create failed');
        }
        const joined = matchmaker.joinMatch({
            matchId: created.data.matchId,
            displayName: 'Dave',
        });
        if (!joined.ok) {
            throw new Error('fixture join failed');
        }

        bridge?.onSeatExpired?.({
            matchId: created.data.matchId,
            sessionToken: created.data.seatAssignment.sessionToken,
            playerId: created.data.seatAssignment.playerId,
        });
        expect(server.detachPlayerCalls.at(-1)?.sessionToken).toBe(created.data.seatAssignment.sessionToken);

        bridge?.onMatchTerminal?.({
            matchId: created.data.matchId,
            result: { kind: 'win', winner: 2, tick: 7, reason: 'last_standing' },
            tick: 7,
        });
        expect(matchmaker.stats().finishedMatches).toBe(1);

        matchmaker.close();
    });
});
