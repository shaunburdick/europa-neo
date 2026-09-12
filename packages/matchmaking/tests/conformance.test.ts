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

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Order, PlayerId } from '@europa/engine';
import { ENGINE_API_VERSION } from '@europa/engine';
import type { EngineSession, MatchmakerBridge } from '@europa/networking';
import { NETWORK_API_VERSION } from '@europa/networking';
import { describe, expect, it } from 'vitest';

import { BOARD_SIZE_DEFAULTS as mirrorBoardSizeDefaults } from '../../../specs/006-match-lifecycle-matchmaking/contracts/board-size-defaults';
import { MATCHMAKING_API_VERSION } from '../contracts/match-types';
import { BOARD_SIZE_DEFAULTS as shippedBoardSizeDefaults } from '../src/constants';
import { createMatchmaker, MATCHMAKING_CONSTANTS } from '../src/index';
import { FakeServer } from './fixtures/fakeServer';

function repoPath(relativePath: string): string {
    return resolve(__dirname, '..', '..', '..', relativePath);
}

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
        alicePlayerId: created.data.seatAssignment.playerId,
        bobPlayerId: joined.data.seatAssignment.playerId,
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

        // The config snapshot travels alongside (version checks + telemetry);
        // player count is now expressed by the explicit universal id list.
        const config = registration?.matchConfig;
        expect(config?.playerIds).toHaveLength(2);
        expect(config?.visibilityRadius).toBeDefined();

        matchmaker.close();
    });

    it('(b) forfeit submits OrderSurrender { kind: "surrender", player } via engineSession.submit', () => {
        const server = new FakeServer();
        const { matchmaker, matchId, aliceToken, alicePlayerId } = startTwoPlayerMatch(server);

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
            // Advisory only: the forfeit policy uses the seat's universal id.
            playerId: alicePlayerId satisfies PlayerId,
        });

        // The surrendered id is the SEAT's universal id (not seatIndex + 1).
        expect(submitted).toEqual([{ kind: 'surrender', player: alicePlayerId }]);
        // Behavioral cross-check: the engine (FR-016 single source of
        // truth for elimination) marked the surrendered player eliminated.
        const eliminated = session.world().players.find((player) => player.id === alicePlayerId);
        expect(eliminated?.status).toBe('eliminated');

        matchmaker.close();
    });

    it('(c)+(d) registerMatch/attachPlayer carry the canonical request shapes per seat', () => {
        const server = new FakeServer();
        const { matchmaker, matchId, aliceToken, bobToken, alicePlayerId, bobPlayerId } = startTwoPlayerMatch(server);

        // (c) exactly one registration with the documented fields. The
        // array element type IS networking's canonical RegisterMatchRequest
        // (FakeServer pins it), so this binding is the compile-time check.
        // Feature 010 R-013 adds the per-seat displayNames snapshot; for
        // this legacy (handle-less) fixture the values are the cosmetic
        // names in seat order.
        expect(server.registerMatchCalls).toHaveLength(1);
        const [registration] = server.registerMatchCalls;
        if (registration === undefined) {
            throw new Error('fixture: no registerMatch call recorded');
        }
        expect(Object.keys(registration).sort()).toEqual(['displayNames', 'engineSession', 'matchConfig', 'matchId']);
        expect(registration.displayNames).toEqual(['Alice', 'Bob']);
        expect(registration.matchId).toBe(matchId);

        // (d) one attach per seat, in seat order, carrying each seat's
        // universal id (never seatIndex + 1).
        expect(server.attachPlayerCalls).toHaveLength(2);
        const [firstAttach, secondAttach] = server.attachPlayerCalls;
        if (firstAttach === undefined || secondAttach === undefined) {
            throw new Error('fixture: missing attachPlayer calls');
        }
        expect(firstAttach.playerId).toBe(alicePlayerId);
        expect(secondAttach.playerId).toBe(bobPlayerId);
        expect(firstAttach.sessionToken).toBe(aliceToken);
        expect(secondAttach.sessionToken).toBe(bobToken);
        expect(new Set(server.attachPlayerCalls.map((call) => call.matchId))).toEqual(new Set([matchId]));

        matchmaker.close();
    });

    it("(e) detachPlayer carries networking's real DetachRequest shape (no reason field)", () => {
        const server = new FakeServer();
        const { matchmaker, matchId, aliceToken, alicePlayerId } = startTwoPlayerMatch(server);

        server.fireOnSeatExpired({ matchId, sessionToken: aliceToken, playerId: alicePlayerId });

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
        expect(detach.playerId).toBe(alicePlayerId);
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
            result: { kind: 'win', winner: joined.data.seatAssignment.playerId, tick: 7, reason: 'last_standing' },
            tick: 7,
        });
        expect(matchmaker.stats().finishedMatches).toBe(1);

        matchmaker.close();
    });
});

describe('conformance: feature 012 board-size defaults mirror + no wire version bump (T006)', () => {
    it('BOARD_SIZE_DEFAULTS mirror at specs/006-match-lifecycle-matchmaking/contracts/board-size-defaults.ts is byte-identical to shipped constant', async () => {
        // Runtime value byte-identity: JSON serialization proves key order and
        // literal values are identical across the informational spec mirror
        // and the shipped single source. Prevents drift between docs and
        // product (spec Out of Scope: no wire bump — map is internal only).
        const expectedJson = JSON.stringify({ 2: 32, 3: 48, 4: 48 });
        expect(JSON.stringify(shippedBoardSizeDefaults)).toBe(expectedJson);
        expect(JSON.stringify(mirrorBoardSizeDefaults)).toBe(expectedJson);
        expect(JSON.stringify(mirrorBoardSizeDefaults)).toBe(JSON.stringify(shippedBoardSizeDefaults));

        // Deep equality corroboration.
        expect(mirrorBoardSizeDefaults).toEqual(shippedBoardSizeDefaults);

        // File-level byte-identity guard: the exported map literal must appear
        // verbatim in both the spec mirror and the shipped source (catches
        // whitespace/order/comment drift that deepEqual would miss).
        const shippedLiteral =
            'export const BOARD_SIZE_DEFAULTS: BoardSizeDefault = {\n    2: 32,\n    3: 48,\n    4: 48,\n} as const;';
        const [mirrorSource, shippedSource] = await Promise.all([
            readFile(repoPath('specs/006-match-lifecycle-matchmaking/contracts/board-size-defaults.ts'), 'utf-8'),
            readFile(repoPath('packages/matchmaking/src/constants.ts'), 'utf-8'),
        ]);
        expect(mirrorSource).toContain(shippedLiteral);
        expect(shippedSource).toContain(shippedLiteral);

        // Contract copy in packages/matchmaking/contracts/match-types.ts must
        // carry the same literal (the single-source discipline: both contract
        // and constant declare the map; drift between them is a bug).
        const contractSource = await readFile(repoPath('packages/matchmaking/contracts/match-types.ts'), 'utf-8');
        expect(contractSource).toContain(shippedLiteral);
    });

    it('API version pin — MATCHMAKING_API_VERSION + ENGINE_API_VERSION 0.2.0, NETWORK_API_VERSION 0.3.0 (independent pre-1.0 boundaries)', () => {
        // Issue #74 breaks the matchmaking/engine identity surface (T027):
        // `SeatAssignment.playerId` (and every engine identity field) becomes
        // a canonical 12-character string, so matchmaking and engine bump
        // their shared pre-1.0 minor to 0.2.0. Networking owns a SEPARATE
        // wire-protocol version whose own breaking bump landed in Wave 6
        // (T030): 0.2.0 → 0.3.0. The two versions track independent
        // compatibility boundaries and are NOT required to be equal — each
        // package's line breaks only for its own consumers.
        expect(MATCHMAKING_API_VERSION).toBe('0.2.0');
        expect(NETWORK_API_VERSION).toBe('0.3.0');
        expect(ENGINE_API_VERSION).toBe('0.2.0');
    });
});
