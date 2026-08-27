/**
 * Lobby Snapshot Revision Ordering Tests — Feature 010 (T-011)
 *
 * Pins the DISPATCHER half of the revision-ordering contract
 * (lobby-wire.md: "Clients apply only snapshots with a newer
 * revision"). Division of responsibility, stated honestly:
 *
 *   - The strictly-monotonic revision COUNTER is the facade's
 *     guarantee (one ledger, one projection path) and is pinned by
 *     matchmaking's own suites — this file cannot re-prove it without
 *     importing matchmaking, which the dependency arrow forbids;
 *   - What the DISPATCHER must guarantee for the client-side gate to
 *     be sound end-to-end is pinned HERE: snapshot publications reach
 *     each connection VERBATIM, IN SEND ORDER, COMPLETE (no drops,
 *     no reordering, no coalescing, no caching), broadcasts reach
 *     ONLY subscribers, and a re-subscribe frames a FRESH baseline
 *     rather than replaying a stale one.
 *
 * The recording facade scripts increasing revisions; the assertions
 * below prove the server delivers exactly what was published, to
 * exactly the right connections, in exactly the published order.
 */

import { describe, expect, it } from 'vitest';

import type { LobbyRevision, MatchId } from '../../src/types';
import { FakeLobbyService } from '../fixtures/fakeLobbyService';
import {
    connectClient,
    lobbyEvents,
    required,
    sendLobby,
    snapshotRevisions,
    wiredLobbyServer,
} from '../fixtures/lobbyHarness';
import {
    buildIdentityState,
    buildLobbyEntry,
    buildLobbySnapshot,
    lobbyIdentityPayload,
    lobbySubscribePayload,
} from '../fixtures/lobbyWire';

/** Branded revision literal (readability in expectations). */
function rev(n: number): LobbyRevision {
    return n as LobbyRevision;
}

/** A stable branded match id for the published row (content pinning). */
const LIVE_ROW_ID: MatchId = 'match-live-row' as MatchId;

// ---------------------------------------------------------------------------
// Ordered verbatim delivery
// ---------------------------------------------------------------------------

describe('snapshot publication ordering (dispatcher guarantees)', () => {
    it('delivers the subscribe baseline then every published snapshot verbatim, in order', () => {
        const fake = new FakeLobbyService();
        const row = buildLobbyEntry({ matchId: LIVE_ROW_ID, status: 'waiting' });
        fake.subscribeOutcome = { ok: true, data: buildLobbySnapshot({ revision: rev(3), entries: [row] }) };
        const server = wiredLobbyServer(fake);
        const { socket, connectionId } = connectClient(server);

        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(socket, 'lobbySubscribe', lobbySubscribePayload());

        // Three successive mutations publish revisions 4, 5, 6 — the
        // middle one carrying a distinctive row that must survive the
        // pipe byte-for-byte.
        fake.push(connectionId, { kind: 'snapshot', snapshot: buildLobbySnapshot({ revision: rev(4) }) });
        fake.push(connectionId, {
            kind: 'snapshot',
            snapshot: buildLobbySnapshot({ revision: rev(5), entries: [row] }),
        });
        fake.push(connectionId, { kind: 'snapshot', snapshot: buildLobbySnapshot({ revision: rev(6) }) });

        expect(snapshotRevisions(socket)).toEqual([3, 4, 5, 6]);
        // Verbatim content: revision 5's row arrived intact.
        const fifth = required(
            lobbyEvents(socket).filter((event) => event.kind === 'snapshot')[2],
            'third published snapshot',
        ).snapshot as { readonly entries: ReadonlyArray<unknown> };
        expect(fifth.entries).toEqual([row]);
    });

    it('frames snapshot broadcasts only to subscribed connections', () => {
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const subscriber = connectClient(server);
        const bystander = connectClient(server);

        sendLobby(subscriber.socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(subscriber.socket, 'lobbySubscribe', lobbySubscribePayload());
        // The bystander establishes identity but NEVER subscribes.
        sendLobby(bystander.socket, 'lobbyIdentity', lobbyIdentityPayload());

        fake.push(subscriber.connectionId, {
            kind: 'snapshot',
            snapshot: buildLobbySnapshot({ revision: rev(9) }),
        });

        expect(snapshotRevisions(subscriber.socket)).toEqual([7, 9]); // baseline + broadcast
        // The bystander's stream carries its directed identity event and
        // NOT the broadcast.
        expect(snapshotRevisions(bystander.socket)).toEqual([]);
        expect(lobbyEvents(bystander.socket).map((event) => event.kind)).toEqual(['identity']);
    });

    it('gives each subscriber its own fresh baseline without caching or coalescing', () => {
        const fake = new FakeLobbyService();
        fake.subscribeOutcome = { ok: true, data: buildLobbySnapshot({ revision: rev(10) }) };
        const server = wiredLobbyServer(fake);
        const first = connectClient(server);
        const second = connectClient(server);

        sendLobby(first.socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(first.socket, 'lobbySubscribe', lobbySubscribePayload());

        // The list moved on before the second subscriber arrives.
        fake.subscribeOutcome = { ok: true, data: buildLobbySnapshot({ revision: rev(11) }) };
        sendLobby(second.socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(second.socket, 'lobbySubscribe', lobbySubscribePayload());

        // One shared mutation publishes to BOTH subscribers.
        fake.push(first.connectionId, {
            kind: 'snapshot',
            snapshot: buildLobbySnapshot({ revision: rev(12) }),
        });
        fake.push(second.connectionId, {
            kind: 'snapshot',
            snapshot: buildLobbySnapshot({ revision: rev(12) }),
        });

        expect(snapshotRevisions(first.socket)).toEqual([10, 12]);
        expect(snapshotRevisions(second.socket)).toEqual([11, 12]);
    });
});

// ---------------------------------------------------------------------------
// Stale-revision scenario
// ---------------------------------------------------------------------------

describe('stale-revision recovery via re-subscribe', () => {
    it('a re-subscribing client receives a strictly newer baseline than everything it observed', () => {
        const fake = new FakeLobbyService();
        fake.subscribeOutcome = { ok: true, data: buildLobbySnapshot({ revision: rev(3) }) };
        const server = wiredLobbyServer(fake);
        const { socket, connectionId } = connectClient(server);

        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        sendLobby(socket, 'lobbySubscribe', lobbySubscribePayload());
        expect(snapshotRevisions(socket)).toEqual([3]);

        // The client observes mutations 4 and 5…
        fake.push(connectionId, { kind: 'snapshot', snapshot: buildLobbySnapshot({ revision: rev(4) }) });
        fake.push(connectionId, { kind: 'snapshot', snapshot: buildLobbySnapshot({ revision: rev(5) }) });
        expect(snapshotRevisions(socket)).toEqual([3, 4, 5]);

        // …its subscription lapses (transport blip), state moves on to 6,
        // and it subscribes AGAIN. The dispatcher must frame the facade's
        // CURRENT baseline — not cache or replay the stale one.
        fake.subscribeOutcome = { ok: true, data: buildLobbySnapshot({ revision: rev(6) }) };
        sendLobby(socket, 'lobbySubscribe', lobbySubscribePayload());

        const stream = snapshotRevisions(socket);
        expect(stream).toEqual([3, 4, 5, 6]);
        // Strict monotonicity across the whole observed history.
        for (let i = 1; i < stream.length; i++) {
            expect(stream[i]).toBeGreaterThan(stream[i - 1] ?? 0);
        }
        // And the newest baseline is genuinely new content: the facade's
        // current activeMatchId rides along (verbatim forwarding).
        const latest = required(
            lobbyEvents(socket)
                .filter((event) => event.kind === 'snapshot')
                .at(-1),
            'latest snapshot event',
        ).snapshot as { readonly revision: number; readonly activeMatchId: unknown };
        expect(latest.revision).toBe(6);
        expect(latest.activeMatchId).toBeNull();
    });

    it('keeps directed identity events out of the snapshot revision stream', () => {
        // Guard for the observer helper itself: identity confirmations
        // interleaved between publications must never be miscounted as
        // snapshots by a client tracking revisions.
        const fake = new FakeLobbyService();
        const server = wiredLobbyServer(fake);
        const { socket, connectionId } = connectClient(server);

        sendLobby(socket, 'lobbyIdentity', lobbyIdentityPayload());
        fake.push(connectionId, { kind: 'snapshot', snapshot: buildLobbySnapshot({ revision: rev(2) }) });
        fake.push(connectionId, { kind: 'identity', identity: buildIdentityState() });
        fake.push(connectionId, { kind: 'snapshot', snapshot: buildLobbySnapshot({ revision: rev(3) }) });

        expect(snapshotRevisions(socket)).toEqual([2, 3]); // no subscribe: publications only
        expect(lobbyEvents(socket).map((event) => event.kind)).toEqual([
            'identity',
            'snapshot',
            'identity',
            'snapshot',
        ]);
    });
});
