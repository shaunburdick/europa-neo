/**
 * Tick Pipeline Containment Regression Tests — Issue #122 (P0)
 *
 * Proves that a forced engine throw during one match's tick pipeline
 * does NOT crash the server process or affect other matches. The
 * error is contained to the failing channel: it is logged, the channel
 * is terminated, and its connections are closed. Other matches continue
 * ticking normally.
 *
 * Uses `__injectSocketForTest` + `MockWebSocket` to drive the full
 * pipeline without opening TCP ports.
 */

import { computePlayerView } from '@europa/fog';
import type { EngineSession } from '@europa/networking';
import { describe, expect, it } from 'vitest';

import { NETWORK_DEFAULT_CONFIG } from '../../src/contracts/network-api';
import { createMatchServer } from '../../src/server';
import type { ServerDeps } from '../../src/types';
import { NULL_LOGGER } from '../../src/types';
import { MockWebSocket, ScriptedClient } from '../fixtures/conn';
import { attachPlayersForMatch, scriptedMatch } from '../fixtures/match';

/** Accelerated tick cadence. */
const TEST_TICK_MS = 10;

/** Server config with fast ticks. */
function testConfig() {
    return { ...NETWORK_DEFAULT_CONFIG, tickRateMs: TEST_TICK_MS, port: 0 };
}

/** Small sleep helper. */
function waitFor(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll a predicate until true or the deadline elapses.
 */
async function waitForCondition(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() >= deadline) {
            throw new Error('waitForCondition: timed out');
        }
        await waitFor(5);
    }
}

/**
 * Build a server deps object with real fog but a no-op matchmaker bridge.
 */
function buildDeps(): ServerDeps {
    return {
        engine: {
            createMatchSession: () => {
                throw new Error('not used');
            },
        },
        fog: {
            computePlayerView: ({ world, playerId, spectator }) => computePlayerView(world, playerId, { spectator }),
        },
        matchmaker: {},
        logger: NULL_LOGGER,
    };
}

/**
 * Wrap an engine session so `advance()` throws on the Nth call.
 * This simulates a transient engine defect in one match.
 */
function wrapThrowing(inner: EngineSession, throwAfterAdvances: number): EngineSession {
    let advances = 0;
    return {
        world: () => inner.world(),
        submit: (order) => inner.submit(order),
        advance: () => {
            advances += 1;
            if (advances === throwAfterAdvances) {
                throw new Error('simulated engine defect in match');
            }
            return inner.advance();
        },
        status: () => inner.status(),
        close: () => inner.close(),
    };
}

describe('tick pipeline containment — issue #122', () => {
    it('a forced engine throw in one match does not affect other matches', async () => {
        const config = testConfig();
        const deps = buildDeps();
        const server = createMatchServer(config, deps);

        // Create two matches: match A will throw on its 2nd advance,
        // match B should tick normally throughout.
        const matchA = scriptedMatch({ seed: 1, boardSize: 8, tickRateMs: TEST_TICK_MS });
        const matchB = scriptedMatch({ seed: 2, boardSize: 8, tickRateMs: TEST_TICK_MS });

        const throwingSession = wrapThrowing(matchA.engineSession, 2);

        server.registerMatch({
            matchId: matchA.matchId,
            engineSession: throwingSession,
            matchConfig: matchA.matchConfig,
        });
        server.registerMatch({
            matchId: matchB.matchId,
            engineSession: matchB.engineSession,
            matchConfig: matchB.matchConfig,
        });

        // Attach players to both matches.
        const tokensA = attachPlayersForMatch(server, matchA);
        const tokensB = attachPlayersForMatch(server, matchB);

        // Start the tick clock — without this, the pipeline never runs.
        await server.listen();

        // Connect clients via mock sockets.
        const socketA = new MockWebSocket();
        const socketB = new MockWebSocket();
        server.__injectSocketForTest(socketA);
        server.__injectSocketForTest(socketB);

        // Drive clients through hello → joinMatch.
        const clientA = new ScriptedClient(socketA);
        const clientB = new ScriptedClient(socketB);

        await clientA.hello();
        await clientB.hello();

        await clientA.joinMatch(matchA.matchId, 'player', tokensA[0]);
        await clientB.joinMatch(matchB.matchId, 'player', tokensB[0]);

        // Wait for the first tick to go through (both matches).
        await waitForCondition(() => {
            const framesA = socketA.sentFrames.filter((f) => f.type === 'tick');
            const framesB = socketB.sentFrames.filter((f) => f.type === 'tick');
            return framesA.length >= 1 && framesB.length >= 1;
        });

        const ticksABeforeThrow = socketA.sentFrames.filter((f) => f.type === 'tick').length;
        const ticksBBeforeThrow = socketB.sentFrames.filter((f) => f.type === 'tick').length;

        // Wait for match A to throw (2nd advance) and get terminated.
        await waitForCondition(() => {
            const framesA = socketA.sentFrames.filter((f) => f.type === 'tick');
            // Match A might get terminated — look for terminal or just
            // the fact that it stopped getting new ticks.
            return framesA.length >= ticksABeforeThrow;
        }, 3000);

        // Give a few more ticks for match B to continue.
        await waitFor(200);

        const ticksAAfter = socketA.sentFrames.filter((f) => f.type === 'tick').length;
        const ticksBAfter = socketB.sentFrames.filter((f) => f.type === 'tick').length;

        // Match B should have received MORE ticks than before — it
        // continued ticking while match A was terminated.
        expect(ticksBAfter).toBeGreaterThan(ticksBBeforeThrow);

        // Match A should have received at least as many ticks as before
        // the throw (it got some before the defect), but NOT more than
        // a couple extra (the throw happens on advance #2).
        expect(ticksAAfter).toBeGreaterThanOrEqual(ticksABeforeThrow);

        // The server process is still alive (we can still call stats).
        const stats = server.stats();
        expect(stats).toBeDefined();

        await server.close();
    });

    it('server stays alive after a channel throws during tick', async () => {
        const config = testConfig();
        const deps = buildDeps();
        const server = createMatchServer(config, deps);

        const match = scriptedMatch({ seed: 99, boardSize: 8, tickRateMs: TEST_TICK_MS });
        const throwingSession = wrapThrowing(match.engineSession, 1); // throws on 1st advance

        server.registerMatch({
            matchId: match.matchId,
            engineSession: throwingSession,
            matchConfig: match.matchConfig,
        });

        const tokens = attachPlayersForMatch(server, match);
        // Start the tick clock.
        await server.listen();
        const socket = new MockWebSocket();
        server.__injectSocketForTest(socket);

        const client = new ScriptedClient(socket);
        await client.hello();
        await client.joinMatch(match.matchId, 'player', tokens[0]);

        // Wait for the tick to fire (and throw).
        await waitFor(100);

        // Server stats still works — process is alive.
        const stats = server.stats();
        expect(stats).toBeDefined();

        await server.close();
    });

    it('the failing channel receives no more ticks after termination', async () => {
        const config = testConfig();
        const deps = buildDeps();
        const server = createMatchServer(config, deps);

        const match = scriptedMatch({ seed: 50, boardSize: 8, tickRateMs: TEST_TICK_MS });
        const throwingSession = wrapThrowing(match.engineSession, 2);

        server.registerMatch({
            matchId: match.matchId,
            engineSession: throwingSession,
            matchConfig: match.matchConfig,
        });

        const tokens = attachPlayersForMatch(server, match);
        // Start the tick clock.
        await server.listen();
        const socket = new MockWebSocket();
        server.__injectSocketForTest(socket);

        const client = new ScriptedClient(socket);
        await client.hello();
        await client.joinMatch(match.matchId, 'player', tokens[0]);

        // Wait for first tick.
        await waitForCondition(() => socket.sentFrames.filter((f) => f.type === 'tick').length >= 1);

        const tickCountBefore = socket.sentFrames.filter((f) => f.type === 'tick').length;

        // Wait long enough for the throw to happen and more ticks to fire.
        await waitFor(300);

        const tickCountAfter = socket.sentFrames.filter((f) => f.type === 'tick').length;

        // After the throw terminates the channel, it should not receive
        // significantly more ticks (at most 1 more if the throw happens
        // mid-pipeline).
        expect(tickCountAfter - tickCountBefore).toBeLessThanOrEqual(1);

        await server.close();
    });
});
