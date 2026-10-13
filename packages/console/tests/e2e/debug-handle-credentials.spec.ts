/**
 * Debug-handle credential sweep (005 FR-037, 015 FR-019) — PR #189
 * review remediation.
 *
 * The test-only window handles publish CREDENTIAL-FREE projections
 * (`src/internal/debug-views.ts`), never the raw store/adapter. These
 * proofs run the POPULATED case the review demanded — a REAL seat
 * grant through the real stack — then sweep every published surface
 * for bearer values:
 *
 *   - `window.__europaLobby` after a lobby-driven match creation. The
 *     reducer action that pins `activeMatchId` is the same
 *     `lobbyEnteredMatch` dispatch that records the matchmaking-issued
 *     seat session token, so `activeMatchId !== null` proves the
 *     credential was really in the raw store.
 *   - `window.__europaLive` after a direct-match join bound to a real
 *     matchmaking seat (the console state records the joinAck session
 *     token, and the raw adapter answers `sessionToken()`).
 *   - the direct-match seam `window.__europaTestMatch` itself: it is
 *     consume-once, so the reconnect bearer it carried must not linger
 *     on `window` after boot — and the probe sweeps EVERY
 *     `window.__europa*` global for the real seat token, pinning that
 *     no global carries it at all.
 *   - the import-failure path: aborting the live-runtime chunk
 *     request makes the entry's dynamic import FAIL for real; the
 *     credential must still be gone from `window` (captured and
 *     scrubbed synchronously before the import) and the failure must
 *     be reported through the console error channel rather than left
 *     as an unhandled rejection.
 *
 * Pre-fix each probe fails: the raw handles carried the populated
 * tokens one `getState()`/`sessionToken()` away, and the seam
 * survived both the dynamic-import window and a failed import.
 */

import { expect, test } from '@playwright/test';

import { optInLobbyTestHandle, preserveWsQueryInHistory } from './helpers/history-patch';
import { waitUntilLobby } from './helpers/lobby-page';
import { buildLobbyStack, TICK_MS } from './helpers/lobby-stack';
import { setHandleViaProfile } from './helpers/profile';

/** Production-default board edge (terrain placement constraints tuned for it). */
const BOARD_SIZE = 32;

test.describe('debug handles carry no bearer credential (FR-037 / FR-019)', () => {
    test('window.__europaLobby stays credential-free after a real lobby seat grant', async ({ browser }) => {
        test.setTimeout(90_000);

        const { server, matchmaker } = buildLobbyStack();
        await server.listen();
        const wsPort = server.__boundPortForTest() ?? 0;

        try {
            const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
            await context.addInitScript(preserveWsQueryInHistory);
            await context.addInitScript(optInLobbyTestHandle);
            const page = await context.newPage();
            await page.goto(`/lobby?ws=${encodeURIComponent(`ws://127.0.0.1:${String(wsPort)}`)}`);

            await waitUntilLobby(page, (l) => l.connection === 'ready', 'lobby connected');
            await setHandleViaProfile(page, 'SweepAlice');
            await waitUntilLobby(page, (l) => l.handle === 'SweepAlice', 'handle accepted');

            // Real seat grant: create a match through the lobby.
            await page.getByRole('button', { name: 'Create match' }).click();
            await waitUntilLobby(page, (l) => l.viewMode === 'match', 'creator enters match view');

            const probe = await page.evaluate(() => {
                const handle = (window as unknown as { __europaLobby?: { store: { getState(): unknown } } })
                    .__europaLobby;
                if (handle === undefined) {
                    return null;
                }
                const state = handle.store.getState() as Record<string, unknown>;
                return {
                    keys: Object.keys(state).sort(),
                    json: JSON.stringify(state),
                    seatToken: state['seatSessionToken'],
                    activeMatchId: state['activeMatchId'] ?? null,
                };
            });

            expect(probe).not.toBeNull();
            // Populated: the seat-grant path really ran (same dispatch
            // that records the seat session token).
            expect(probe?.activeMatchId).not.toBeNull();
            // Credential-free: the seat bearer is not on the surface —
            // not as a value, not as a key, not anywhere in the state.
            expect(probe?.seatToken).toBeUndefined();
            expect(probe?.keys).not.toContain('seatSessionToken');
            expect(probe?.json).not.toMatch(/seatSessionToken|sessionToken|reconnectToken|resumeSecret/);
        } finally {
            await server.close();
            await matchmaker.close();
        }
    });

    test('window.__europaLive and the direct-match seam stay credential-free after a real seat grant', async ({
        browser,
    }) => {
        test.setTimeout(90_000);

        const { server, matchmaker } = buildLobbyStack();
        await server.listen();
        const wsPort = server.__boundPortForTest() ?? 0;

        try {
            // The matchmaker creates + fills a PUBLIC match; auto-start
            // binds the engine session into the live server (the same
            // recipe the full-stack suite drives).
            const created = matchmaker.createMatch({
                visibility: 'public',
                displayName: 'SweepAlice',
                settings: { playerCount: 2, boardSize: BOARD_SIZE, tickIntervalMs: TICK_MS },
            });
            expect(created.ok).toBe(true);
            if (!created.ok) {
                return;
            }
            const { matchId } = created.data;
            const seatToken = created.data.seatAssignment.sessionToken;
            const filled = matchmaker.joinMatch({ matchId, displayName: 'SweepBob' });
            expect(filled.ok).toBe(true);

            // Bind the console to Alice's REAL seat via its matchmaking
            // session token — the direct-match seam is the input channel.
            const context = await browser.newContext();
            await context.addInitScript(
                ({ wsUrl, id, displayName, reconnectToken }) => {
                    (window as unknown as { __europaTestMatch: object }).__europaTestMatch = {
                        wsUrl,
                        matchId: id,
                        displayName,
                        reconnectToken,
                    };
                },
                {
                    wsUrl: `ws://127.0.0.1:${String(wsPort)}`,
                    id: matchId,
                    displayName: 'SweepAlice',
                    reconnectToken: seatToken,
                },
            );
            const page = await context.newPage();
            await page.goto(`/match/${encodeURIComponent(matchId)}/join`);

            const statusOf = async (): Promise<string | null> =>
                page.evaluate(() => {
                    const handle = (
                        window as unknown as {
                            __europaLive?: {
                                readonly store?: { getState(): unknown };
                                readonly bootError?: string | null;
                            };
                        }
                    ).__europaLive;
                    if (handle === undefined || handle.store === undefined) {
                        return null;
                    }
                    if (handle.bootError !== null && handle.bootError !== undefined) {
                        throw new Error(`live runtime boot failed: ${handle.bootError}`);
                    }
                    return (handle.store.getState() as { status?: string }).status ?? null;
                });
            await expect.poll(statusOf, { timeout: 15_000 }).toBe('live');

            const probe = await page.evaluate((seatToken: string) => {
                const w = window as unknown as Record<string, unknown>;
                const handle = (
                    window as unknown as {
                        __europaLive?: {
                            store: { getState(): unknown };
                            client: { state(): unknown; sessionToken?: () => unknown };
                        };
                    }
                ).__europaLive;
                if (handle === undefined) {
                    return null;
                }
                // Sweep EVERY `__europa*` global for the real bearer:
                // the token must not be reachable through any of them.
                const europaGlobals = Object.getOwnPropertyNames(window).filter((key) => key.startsWith('__europa'));
                const globalJson = europaGlobals
                    .map((key) => {
                        try {
                            return JSON.stringify(w[key] ?? null) ?? 'null';
                        } catch {
                            return 'UNSTRINGIFIABLE';
                        }
                    })
                    .join('\n');
                const state = handle.store.getState();
                return {
                    json: JSON.stringify({ state, clientState: handle.client.state() }),
                    playerId: (state as { session?: { playerId?: unknown } }).session?.playerId ?? null,
                    clientSessionToken:
                        typeof handle.client.sessionToken === 'function' ? handle.client.sessionToken() : null,
                    seamLingers: Object.hasOwn(window, '__europaTestMatch'),
                    europaGlobals,
                    tokenReachable: globalJson.includes(seatToken),
                };
            }, seatToken);

            expect(probe).not.toBeNull();
            // Populated: the real seat grant seated this console.
            expect(probe?.playerId).not.toBeNull();
            // Credential-free: the adapter's bearer accessor is not
            // forwarded (pre-fix it answered with the seat token)...
            expect(probe?.clientSessionToken).toBeNull();
            // ...and the REAL matchmaking token is nowhere in the
            // published state or connection snapshot.
            expect(probe?.json).not.toContain(seatToken);
            expect(probe?.json).not.toMatch(/"sessionToken"|reconnectToken|resumeSecret/);
            // The seam is consume-once: its reconnect bearer does not
            // linger on window after boot — and the full `__europa*`
            // sweep confirms no debug global carries the real token.
            expect(probe?.seamLingers).toBe(false);
            expect(probe?.europaGlobals).not.toContain('__europaTestMatch');
            expect(probe?.tokenReachable).toBe(false);
        } finally {
            await server.close();
            await matchmaker.close();
        }
    });

    test('a failed live-runtime chunk load reports the failure and leaves no credential on window', async ({
        browser,
    }) => {
        test.setTimeout(30_000);

        // No match stack needed: the import fails before any
        // connection is attempted. The seam still carries a
        // bearer-shaped reconnect token — the credential under sweep.
        const RECONNECT_BEARER = 'sweep-reconnect-bearer';
        const context = await browser.newContext();
        await context.addInitScript(
            ({ wsUrl, id, displayName, reconnectToken }) => {
                (window as unknown as { __europaTestMatch: object }).__europaTestMatch = {
                    wsUrl,
                    matchId: id,
                    displayName,
                    reconnectToken,
                };
            },
            {
                wsUrl: 'ws://127.0.0.1:1',
                id: 'seam-import-failure',
                displayName: 'SweepFailing',
                reconnectToken: RECONNECT_BEARER,
            },
        );
        const page = await context.newPage();
        const consoleErrors: string[] = [];
        page.on('console', (message) => {
            if (message.type() === 'error') {
                consoleErrors.push(message.text());
            }
        });
        // A REAL import failure: the dev server never serves the chunk.
        await page.route('**/src/internal/live-runtime.tsx', (route) => route.abort());
        await page.goto('/match/seam-import-failure/join');

        // The credential was captured and scrubbed SYNCHRONOUSLY,
        // before the import started — the failed chunk load cannot
        // leave it reachable through any `__europa*` global. Pre-fix
        // the seam lingered for the page's lifetime here.
        const probe = await page.evaluate(() => {
            const w = window as unknown as Record<string, unknown>;
            const europaGlobals = Object.getOwnPropertyNames(window).filter((key) => key.startsWith('__europa'));
            const globalJson = europaGlobals.map((key) => JSON.stringify(w[key] ?? null) ?? 'null').join('\n');
            return {
                europaGlobals,
                seamLingers: Object.hasOwn(window, '__europaTestMatch'),
                globalJson,
            };
        });
        expect(probe.seamLingers).toBe(false);
        expect(probe.europaGlobals).not.toContain('__europaTestMatch');
        expect(probe.globalJson).not.toContain(RECONNECT_BEARER);
        expect(probe.globalJson).not.toMatch(/reconnectToken/);

        // The failure is REPORTED through the console error channel —
        // pre-fix the rejection was unhandled and nothing was logged.
        await expect
            .poll(() => consoleErrors.filter((text) => text.includes('direct-match')).length, { timeout: 15_000 })
            .toBeGreaterThan(0);
    });
});
