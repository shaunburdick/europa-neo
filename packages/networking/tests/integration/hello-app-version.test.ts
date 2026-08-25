/**
 * Hello-ACK App-Version Integration Test — Feature 009 (T-003)
 *
 * FR-003 / FR-004 / SC-003 end-to-end through the real server dispatch
 * path (`ScriptedClient` → `Connection.handleInbound` → `handleEnvelope`
 * → `envelopeOf('helloAck', …)`):
 *
 *   - (a) A scripted WebSocket handshake acknowledgment carries
 *     `appVersion === APP_VERSION` (SC-003 first half).
 *   - (b) `appVersion` and `protocolVersion` are both present and are
 *     independent surfaces — release identity vs compatibility
 *     contract, each projecting its own separately-declared constant
 *     (SC-003 second half). The VALUES may legitimately coincide (they
 *     do at v0.1.0), so independence is proven structurally, not by
 *     string inequality.
 *   - (c) An old client — a raw peer that hand-builds its frames and
 *     reads only the three pre-feature-009 fields — completes the full
 *     handshake and claims a seat (additive compatibility, spec Edge
 *     Case "new server talks to an old client"). The reverse direction
 *     (old server → new client) is pinned by `validate.test.ts`, whose
 *     minimal valid `helloAck` fixture omits `appVersion`.
 *   - (d) The ack envelope is otherwise byte-stable: exactly the
 *     documented contract keys (plus the one additive field), contract
 *     insertion order, and a decode→encode round trip reproducing the
 *     identical wire bytes.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { APP_VERSION } from '@europa/version';
import { describe, expect, it } from 'vitest';

import { NETWORK_API_VERSION } from '../../src/constants';
import { decodeFrame, encodeFrame } from '../../src/frame';
import { createMatchServer } from '../../src/server';
import type { HelloAckPayload } from '../../src/types';
import { MockWebSocket } from '../fixtures/conn';
import { attachPlayersForMatch, scriptedMatch } from '../fixtures/match';
import { connectMockClient, injectSocket, realDeps, testServerConfig } from './harness';

// Narrow shapes for the raw-client test: an old peer knows nothing
// about feature 009, so its view of the ack payload lists only the
// three legacy fields (typed `unknown` — presence/type checked, never
// assumed).
interface RawLegacyAckPayload {
    readonly protocolVersion?: unknown;
    readonly connectionId?: unknown;
    readonly heartbeatIntervalMs?: unknown;
}

interface RawEnvelope {
    readonly type?: unknown;
    readonly version?: unknown;
    readonly seq?: unknown;
    readonly payload?: RawLegacyAckPayload & Record<string, unknown>;
}

/** Small sleep helper for polling loops (mirrors `ScriptedClient`). */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Poll the mock's raw outbound log until at least `count` frames have
 * been emitted, then return the first `count` in send order. Raw-text
 * level on purpose: the old-client scenario must observe exactly what
 * hits the wire, before any repo-side decoding.
 */
async function awaitRawFrames(socket: MockWebSocket, count: number, timeoutMs = 1000): Promise<readonly string[]> {
    const deadline = Date.now() + timeoutMs;
    while (socket.sentRaw.length < count) {
        if (Date.now() >= deadline) {
            throw new Error(
                `awaitRawFrames: timed out after ${String(timeoutMs)}ms waiting for ${String(count)} frame(s); saw ${String(socket.sentRaw.length)}`,
            );
        }
        await sleep(5);
    }
    return socket.sentRaw.slice(0, count);
}

describe('hello-ack appVersion (feature 009 T-003, FR-003/FR-004, SC-003)', () => {
    it('(a) a scripted handshake ack carries appVersion equal to the server constant', async () => {
        const server = createMatchServer(testServerConfig(), realDeps());
        await server.listen();
        try {
            const client = connectMockClient(server);
            client.hello();

            const ack = await client.nextMessage('helloAck');
            const payload = ack.payload as HelloAckPayload;
            expect(payload.appVersion).toBe(APP_VERSION);
        } finally {
            await server.close();
        }
    });

    it('(b) appVersion and protocolVersion are both present, each projecting its own constant', async () => {
        const server = createMatchServer(testServerConfig(), realDeps());
        await server.listen();
        try {
            const client = connectMockClient(server);
            client.hello();

            const ack = await client.nextMessage('helloAck');
            const payload = ack.payload as HelloAckPayload;

            // Both surfaces present on every ack of this generation, and
            // each wire field projects its OWN canonical constant.
            expect(typeof payload.protocolVersion).toBe('string');
            expect(typeof payload.appVersion).toBe('string');
            expect(payload.appVersion).toBe(APP_VERSION);
            expect(payload.protocolVersion).toBe(NETWORK_API_VERSION);

            // Independence (SC-003 second half), re-proven structurally
            // per FR-004's operative clause ("no code path may derive one
            // from the other"): each constant is grounded as a
            // self-contained string literal in its own module — neither
            // declaration references the other symbol. The v0.0.1-era
            // value-inequality tripwire could only fire while the two
            // lifecycles happened to hold different strings; at v0.1.0
            // they legitimately coincide (release identity and wire
            // contract both read '0.1.0'), which FR-004 permits: distinct
            // semantics, equal values.
            const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));
            const appVersionSource = await readFile(path.join(repoRoot, 'packages/version/src/app-version.ts'), 'utf8');
            const networkApiSource = await readFile(
                path.join(repoRoot, 'packages/networking/src/contracts/network-types.ts'),
                'utf8',
            );
            expect(/export const APP_VERSION = '([^']+)';/.exec(appVersionSource)?.[1]).toBe(APP_VERSION);
            expect(/export const NETWORK_API_VERSION = '([^']+)' as const;/.exec(networkApiSource)?.[1]).toBe(
                NETWORK_API_VERSION,
            );
        } finally {
            await server.close();
        }
    });

    it('(c) an old raw client ignoring unknown fields completes the handshake and claims a seat', async () => {
        const server = createMatchServer(testServerConfig(), realDeps());
        await server.listen();
        try {
            const match = scriptedMatch({ boardSize: 8, tickRateMs: 10 });
            server.registerMatch({
                matchId: match.matchId,
                engineSession: match.engineSession,
                matchConfig: match.matchConfig,
            });
            attachPlayersForMatch(server, match);

            const socket = new MockWebSocket();
            injectSocket(server, socket);

            // Pre-feature-009 client: hand-built JSON on the wire, no
            // encoder, no knowledge of `appVersion` anywhere.
            socket.receiveInbound(
                JSON.stringify({
                    type: 'hello',
                    version: NETWORK_API_VERSION,
                    seq: 1,
                    payload: { protocolVersion: NETWORK_API_VERSION },
                }),
            );

            const [rawAck] = await awaitRawFrames(socket, 1);
            const ackEnvelope = JSON.parse(rawAck ?? '') as RawEnvelope;

            // The old client reads ONLY the legacy fields; the additive
            // `appVersion` key is ignored (its presence is asserted in
            // (d) — here we prove tolerating it costs nothing).
            expect(ackEnvelope.type).toBe('helloAck');
            expect(ackEnvelope.payload?.protocolVersion).toBe(NETWORK_API_VERSION);
            expect(typeof ackEnvelope.payload?.connectionId).toBe('string');
            expect(typeof ackEnvelope.payload?.heartbeatIntervalMs).toBe('number');

            // The tolerated handshake remains fully functional: the same
            // raw peer claims seat 1 and receives its joinAck.
            socket.receiveInbound(
                JSON.stringify({
                    type: 'joinMatch',
                    version: NETWORK_API_VERSION,
                    seq: 2,
                    payload: {
                        matchId: match.matchId,
                        role: 'player',
                        displayName: 'OldClient',
                        requestedSeat: 1,
                    },
                }),
            );

            const [, rawJoinAck] = await awaitRawFrames(socket, 2);
            const joinAck = JSON.parse(rawJoinAck ?? '') as {
                readonly type?: unknown;
                readonly payload?: { readonly playerId?: unknown; readonly sessionToken?: unknown };
            };
            expect(joinAck.type).toBe('joinAck');
            expect(joinAck.payload?.playerId).toBe(1);
            expect(typeof joinAck.payload?.sessionToken).toBe('string');
            expect(socket.closes).toEqual([]);
        } finally {
            await server.close();
        }
    });

    it('(d) the ack envelope shape is otherwise byte-stable: contract keys only, round-trip identical', async () => {
        const server = createMatchServer(testServerConfig(), realDeps());
        await server.listen();
        try {
            const client = connectMockClient(server);
            client.hello();
            await client.nextMessage('helloAck');

            const raw = client.socket.sentRaw[0] ?? '';
            const parsed = JSON.parse(raw) as RawEnvelope;

            // Envelope keys: exactly the documented four, in contract
            // field order (byte-stable wire layout).
            expect(Object.keys(parsed)).toEqual(['type', 'version', 'seq', 'payload']);

            // Payload keys: the three pre-existing contract fields plus
            // EXACTLY ONE additive key — nothing else appeared, moved,
            // or vanished versus the pre-change fixtures.
            expect(Object.keys(parsed.payload ?? {})).toEqual([
                'protocolVersion',
                'connectionId',
                'heartbeatIntervalMs',
                'appVersion',
            ]);

            // Every value except the per-connection id is a fixed
            // contract constant.
            expect(parsed.type).toBe('helloAck');
            expect(parsed.version).toBe(NETWORK_API_VERSION);
            expect(parsed.seq).toBe(1);
            expect(parsed.payload?.protocolVersion).toBe(NETWORK_API_VERSION);
            expect(parsed.payload?.appVersion).toBe(APP_VERSION);
            expect(typeof parsed.payload?.connectionId).toBe('string');
            expect(typeof parsed.payload?.heartbeatIntervalMs).toBe('number');

            // Codec byte-stability: decode → encode reproduces the
            // exact wire bytes (deterministic serializer, no Sets in
            // this payload).
            expect(encodeFrame(decodeFrame(raw))).toBe(raw);
        } finally {
            await server.close();
        }
    });
});
