/**
 * Lobby Rate-Limit Recovery Tests — Feature 010 (T-011)
 *
 * Extends T-010's flood-trip pin with the recovery and isolation
 * halves of the dedicated lobby token bucket
 * (`NETWORK_CONSTANTS.defaultLobbyMessagesPerSecond` = 20 msg/s ×
 * `defaultRateLimitBurstFactor` 2.0 = capacity 40):
 *
 *   - RECOVERY: after the flood trips the bucket, the refill window
 *     restores service WITHOUT any reconnect (1.6 s ≥ 32 tokens —
 *     comfortably above the ten-message verification burst);
 *   - MINT-ON-MISS BOUND: every routed `lobbyIdentity` in the flood
 *     carried a DISTINCT unknown claim (each would mint a registry
 *     identity server-side), so the bucket provably bounds the
 *     registry-minting DoS surface to ≈ capacity;
 *   - ISOLATION: a connection whose LOBBY bucket is exhausted can
 *     still join, submit orders (the independent order bucket), and
 *     ping — a lobby flood never starves gameplay.
 *
 * The one timed wait is generous by construction: real elapsed time
 * only ever INCREASES the refill, so the post-sleep assertions hold
 * under arbitrary CI slowness.
 */

import { describe, expect, it } from 'vitest';

import { NETWORK_CONSTANTS } from '../../src/constants';
import { FakeLobbyService } from '../fixtures/fakeLobbyService';
import {
    connectClient,
    framesOfType,
    plainEnvelope,
    required,
    sendLobby,
    sendRaw,
    transportErrors,
    wiredLobbyServer,
} from '../fixtures/lobbyHarness';
import { buildIdentityClaim, lobbyIdentityPayload } from '../fixtures/lobbyWire';
import { attachPlayersForMatch, scriptedMatch } from '../fixtures/match';

/** Bucket arithmetic from the shipped constants (documented values). */
const LOBBY_CAPACITY = Math.floor(
    NETWORK_CONSTANTS.defaultLobbyMessagesPerSecond * NETWORK_CONSTANTS.defaultRateLimitBurstFactor,
);

/** Flood size guaranteed to trip the bucket under any scheduling. */
const FLOOD_SIZE = LOBBY_CAPACITY + 20;

/** Post-flood wait: 1.6 s × 20 tokens/s = 32 refilled tokens. */
const REFILL_WAIT_MS = 1600;

/** Small sleep helper for the refill window. */
function waitFor(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

// ---------------------------------------------------------------------------
// Recovery + bound
// ---------------------------------------------------------------------------

describe('lobby token bucket recovery (T-011)', () => {
    it('recovers after the refill window without a reconnect', async () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const { socket } = connectClient(server);

        // Flood with DISTINCT unknown claims: each routed frame mints a
        // fresh registry identity server-side (the DoS being bounded).
        for (let i = 0; i < FLOOD_SIZE; i++) {
            sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload({ claim: buildIdentityClaim() }));
        }
        const limited = transportErrors(socket).filter((error) => error.code === 'rate_limited');
        expect(limited.length).toBeGreaterThanOrEqual(FLOOD_SIZE - LOBBY_CAPACITY);
        // Every frame is accounted for: routed or rejected, none lost.
        expect(fake.identityCalls.length + limited.length).toBe(FLOOD_SIZE);
        // Rate limiting keeps the connection open (FR-010 policy).
        expect(socket.isOpen).toBe(true);

        // Refill window elapses…
        await waitFor(REFILL_WAIT_MS);

        // …and service resumes: ten more messages, zero rejections.
        const routedBefore = fake.identityCalls.length;
        for (let i = 0; i < 10; i++) {
            sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload({ claim: buildIdentityClaim() }));
        }
        const newLimited = transportErrors(socket).filter((error) => error.code === 'rate_limited');
        expect(newLimited).toHaveLength(limited.length); // nothing new was rejected
        expect(fake.identityCalls.length).toBe(routedBefore + 10);
    });

    it('bounds the mint-on-miss surface: routed claims stay near capacity and pairwise distinct', async () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const { socket } = connectClient(server);

        for (let i = 0; i < FLOOD_SIZE; i++) {
            sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload({ claim: buildIdentityClaim() }));
        }

        // Routed claims are exactly the facade's calls, all distinct…
        const routedClaims = fake.identityCalls.map((call) => call.claim?.guestPlayerId);
        expect(new Set(routedClaims).size).toBe(routedClaims.length);
        // …and their count stayed at the bucket ceiling (+ small slack
        // for timer granularity during the synchronous loop).
        expect(routedClaims.length).toBeLessThanOrEqual(LOBBY_CAPACITY + 5);
        expect(transportErrors(socket).some((error) => error.code === 'rate_limited')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Gameplay-bucket independence
// ---------------------------------------------------------------------------

describe('lobby flood leaves the gameplay path untouched', () => {
    it('an exhausted lobby bucket still admits join, orders, and pings', async () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const match = scriptedMatch({ boardSize: 8, tickRateMs: 10 });
        server.registerMatch({
            matchId: match.matchId,
            engineSession: match.engineSession,
            matchConfig: match.matchConfig,
        });
        attachPlayersForMatch(server, match);

        const player = connectClient(server);

        // Exhaust the LOBBY bucket first.
        for (let i = 0; i < FLOOD_SIZE; i++) {
            sendLobby(player.socket, 'lobbyIdentity', lobbyIdentityPayload());
        }
        expect(transportErrors(player.socket).some((error) => error.code === 'rate_limited')).toBe(true);

        // Gameplay seat claim: NOT rate-limited (separate bucket), fully
        // acknowledged with the claimed seat.
        sendRaw(
            player.socket,
            plainEnvelope('joinMatch', { matchId: match.matchId, role: 'player', displayName: 'Flooded' }),
        );
        const ack = required(framesOfType(player.socket, 'joinAck')[0], 'joinAck');
        expect((ack.payload as { readonly playerId: number | null }).playerId).toBe(1);

        // Order accepted into the pipeline despite the empty lobby bucket.
        const before = server.stats().totalOrdersAccepted;
        sendRaw(player.socket, plainEnvelope('order', { order: { kind: 'surrender', player: 1 } }));
        expect(server.stats().totalOrdersAccepted).toBe(before + 1);

        // Heartbeat still answered.
        sendRaw(player.socket, plainEnvelope('ping', { clientTimeMs: 77 }));
        const pong = required(framesOfType(player.socket, 'pong')[0], 'pong');
        expect((pong.payload as { readonly clientTimeMs: number }).clientTimeMs).toBe(77);

        // And the only rejections on this wire are the lobby flood's.
        for (const error of transportErrors(player.socket)) {
            expect(error.code).toBe('rate_limited');
        }

        await server.close();
    });
});
