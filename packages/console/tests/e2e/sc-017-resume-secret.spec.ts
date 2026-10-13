/**
 * SC-017 scripted trials as E2E scenarios — feature 010 SC-017, issue #146
 * (security-sweep W4 / T033).
 *
 * SC-017 names three trials. The component suite already pins them against
 * a scripted server (`lobby-persistence.test.tsx`) and the matchmaking
 * suites pin the registry/facade rules unit-wise; THIS suite drives all
 * three through the real production stack (Chromium ⇄ WsLobbyClient ⇄
 * lobby facade ⇄ identity registry ⇄ matchmaking), where the wire, the
 * storage contract, and the routing all have to agree at once:
 *
 *   (a) stored id + stored secret restores the same identity and handle
 *       after reload within grace — driven as RENAME → RELOAD → RESTORE,
 *       because the rename emission carries no secret (plan AD-11): a
 *       client that let it wipe the stored credential mints fresh on the
 *       reload, which is the regression AD-9/Q1a exists to catch.
 *   (b) a valid id with NO secret never restores/renames/leaves/displaces
 *       — the claim is presented by ANOTHER connection (a second browser
 *       context seeded with the incumbent's id only). The approved D10
 *       carve-out excepts the SAME-connection idempotent refresh, pinned
 *       separately by `lobby.facade.test.ts`; this is the other-connection
 *       arm of FR-041/FR-027.
 *   (c) the secret value appears in no lobby projection, roster frame, log
 *       line, URL, or manual page — the run's actual secret is compared
 *       against every surface the trial names.
 *
 * Pre-fix posture (honest record): (b) fails against the pre-sweep
 * implementation — a bare id from a second connection restored and
 * displaced the incumbent, which is the defect #146 exists to close
 * (the unit/facade equivalents failed pre-fix and were flipped by T023);
 * (a) fails against a secret-wiping adoption (T029's target); (c) fails
 * the moment any projection or log carries the field. All three are
 * green on this branch because W3 landed the behavior — they are the
 * regression rails, not the discovery mechanism.
 *
 * Constraints: TypeScript strict, zero suppressions, zero `any`;
 * Biome 4-space / 120-col; E2E is excluded from the package tsconfig BY
 * DESIGN (Playwright transpiles per file).
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { Matchmaker } from '@europa/matchmaking';
import type { Server } from '@europa/networking';
import { type Browser, expect, type Page, test } from '@playwright/test';

import { LOBBY_STORAGE_KEY } from '../../src/net/lobby-storage';
import { optInLobbyTestHandle, preserveWsQueryInHistory } from './helpers/history-patch';
import { readLobbyOrThrow, WAIT_TIMEOUT, waitUntilLobby } from './helpers/lobby-page';
import { buildLobbyStack } from './helpers/lobby-stack';
import { renameHandleViaProfile, setHandleViaProfile } from './helpers/profile';

// ---------------------------------------------------------------------------
// Storage / wire readers
// ---------------------------------------------------------------------------

/** The stored claim as this suite reads it back out of the browser. */
interface StoredClaimView {
    readonly guestPlayerId: string | null;
    readonly resumeSecret: string | null;
    readonly handle: string | null;
}

/**
 * Read the production storage record (`europa:lobby:identity:v1`) from a
 * page. `null` when nothing is stored yet.
 */
async function readStoredClaim(page: Page): Promise<StoredClaimView | null> {
    const raw = await page.evaluate((key) => window.localStorage.getItem(key), LOBBY_STORAGE_KEY);
    if (raw === null) {
        return null;
    }
    return JSON.parse(raw) as StoredClaimView;
}

/** One captured WebSocket frame, raw. */
interface CapturedFrame {
    readonly direction: 'sent' | 'received';
    readonly data: string;
}

/** Envelope fields this suite reads out of captured frames. */
interface FrameEnvelope {
    readonly type?: unknown;
    readonly payload?: {
        readonly claim?: unknown;
        readonly event?: { readonly kind?: unknown };
    };
}

function parseEnvelope(raw: string): FrameEnvelope | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null) {
        return null;
    }
    return parsed as FrameEnvelope;
}

/** `event.kind` of a captured `lobbyEvent` frame, or `null`. */
function lobbyEventKind(frame: CapturedFrame): string | null {
    const kind = parseEnvelope(frame.data)?.payload?.event?.kind;
    return typeof kind === 'string' ? kind : null;
}

/** The presented claim of a captured outbound `lobbyIdentity` frame. */
interface PresentedClaim {
    readonly guestPlayerId?: string;
    readonly handle?: string;
    readonly resumeSecret?: string;
}

function presentedClaim(frame: CapturedFrame): PresentedClaim | null {
    const envelope = parseEnvelope(frame.data);
    if (envelope === null || envelope.type !== 'lobbyIdentity') {
        return null;
    }
    const claim = envelope.payload?.claim;
    if (typeof claim !== 'object' || claim === null) {
        return null;
    }
    return claim as PresentedClaim;
}

// ---------------------------------------------------------------------------
// Player-manual source scan (SC-017(c) names "manual page" as a surface)
// ---------------------------------------------------------------------------

/** Text extensions under `docs/manual/src` that carry player-facing prose. */
const MANUAL_TEXT_EXTENSIONS = new Set(['.mdx', '.md', '.astro', '.ts', '.tsx', '.css', '.json', '.js']);

/** Every player-manual source file, resolved from the repo root. */
function manualSourceFiles(): string[] {
    let dir = process.cwd();
    let manualSrc: string | null = null;
    for (let hop = 0; hop < 8; hop += 1) {
        const candidate = path.join(dir, 'docs', 'manual', 'src');
        try {
            readdirSync(candidate);
            manualSrc = candidate;
            break;
        } catch {
            const parent = path.dirname(dir);
            if (parent === dir) {
                break;
            }
            dir = parent;
        }
    }
    if (manualSrc === null) {
        throw new Error('docs/manual/src not found walking up from the working directory');
    }

    const files: string[] = [];
    const walk = (current: string): void => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (MANUAL_TEXT_EXTENSIONS.has(path.extname(entry.name))) {
                files.push(full);
            }
        }
    };
    walk(manualSrc);
    return files;
}

// ---------------------------------------------------------------------------
// The proofs
// ---------------------------------------------------------------------------

test.describe('SC-017 scripted trials — resume secret end-to-end (feature 010, issue #146)', () => {
    let server: Server;
    let matchmaker: Matchmaker;
    let wsUrl: string;

    test.beforeEach(async () => {
        const stack = buildLobbyStack();
        server = stack.server;
        matchmaker = stack.matchmaker;
        await server.listen();
        wsUrl = `ws://127.0.0.1:${String(server.__boundPortForTest() ?? 0)}`;
    });

    test.afterEach(async () => {
        await server.close();
        await matchmaker.close();
    });

    /** Open a fresh browser context on the lobby over the stack's socket. */
    async function openLobby(browser: Browser, errors: string[]): Promise<Page> {
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await context.addInitScript(preserveWsQueryInHistory);
        await context.addInitScript(optInLobbyTestHandle);
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);
        return page;
    }

    // -----------------------------------------------------------------------
    // Trial (a): rename → reload → restore
    // -----------------------------------------------------------------------

    test('SC-017(a): rename → reload → restore keeps the identity, the handle, and its credential', async ({
        browser,
    }) => {
        test.setTimeout(90_000);
        const errors: string[] = [];
        const page = await openLobby(browser, errors);

        try {
            await waitUntilLobby(page, (l) => l.connection === 'ready', 'connected');
            await setHandleViaProfile(page, 'Renamer');
            await waitUntilLobby(page, (l) => l.handle === 'Renamer', 'handle accepted');

            const beforeRename = await readStoredClaim(page);
            const originalId = beforeRename?.guestPlayerId ?? '';
            const originalSecret = beforeRename?.resumeSecret ?? '';
            expect(originalId, 'establishment delivered a guest id to storage').not.toBe('');
            expect(originalSecret, 'establishment delivered a resume secret to storage').not.toBe('');

            // Rename through the real profile route (pushState keeps the socket).
            await renameHandleViaProfile(page, 'Renamer Prime');
            await waitUntilLobby(page, (l) => l.handle === 'Renamer Prime', 'rename settled');

            // The rename emission carries NO secret, so it must not wipe the
            // credential the reload below needs (plan AD-9/Q1a).
            const afterRename = await readStoredClaim(page);
            expect(afterRename?.guestPlayerId).toBe(originalId);
            expect(afterRename?.resumeSecret).toBe(originalSecret);
            expect(afterRename?.handle).toBe('Renamer Prime');

            // Reload within grace: the stored pair is presented, restore lands.
            await page.reload({ waitUntil: 'domcontentloaded' });
            await waitUntilLobby(page, (l) => l.connection === 'ready', 'reconnected after reload');
            await waitUntilLobby(page, (l) => l.handle === 'Renamer Prime', 'handle restored after reload');
            await waitUntilLobby(page, (l) => l.identityStatus === 'named', 'identity confirmed after reload');

            const afterReload = await readStoredClaim(page);
            expect(afterReload?.guestPlayerId, 'restore resumed the SAME id (mint-fresh would differ)').toBe(
                originalId,
            );
            expect(afterReload?.handle).toBe('Renamer Prime');
            // D3 single-epoch: a successful restore ROTATES the secret, so the
            // successor in storage proves the secret-bearing restore path ran.
            expect(afterReload?.resumeSecret, 'restore rotated the secret (single-epoch)').not.toBe(originalSecret);

            expect(errors).toEqual([]);
        } finally {
            await page.context().close();
        }
    });

    // -----------------------------------------------------------------------
    // Trial (b): a valid id with no secret, from ANOTHER connection
    // -----------------------------------------------------------------------

    test('SC-017(b): an id-only claim from another connection never restores/renames/leaves/displaces', async ({
        browser,
    }) => {
        test.setTimeout(90_000);
        const errors: string[] = [];

        // -- The incumbent (connection 1): active, named, credentialed ------
        const incumbent = await openLobby(browser, errors);
        try {
            await waitUntilLobby(incumbent, (l) => l.connection === 'ready', 'incumbent connected');
            await setHandleViaProfile(incumbent, 'Keeper');
            await waitUntilLobby(incumbent, (l) => l.handle === 'Keeper', 'incumbent named');

            const incumbentClaim = await readStoredClaim(incumbent);
            const keeperId = incumbentClaim?.guestPlayerId ?? '';
            expect(keeperId, 'incumbent holds a server-issued id').not.toBe('');
            expect(incumbentClaim?.resumeSecret, 'incumbent holds its resume secret').toBeTruthy();

            // -- The claimant (connection 2): the SAME id, NO secret ---------
            const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
            const seededRecord: StoredClaimView = {
                guestPlayerId: keeperId,
                resumeSecret: null,
                handle: 'Keeper',
            };
            await context.addInitScript(
                ({ key, record }) => {
                    window.localStorage.setItem(key, JSON.stringify(record));
                },
                { key: LOBBY_STORAGE_KEY, record: seededRecord },
            );
            await context.addInitScript(preserveWsQueryInHistory);
            await context.addInitScript(optInLobbyTestHandle);
            const claimant = await context.newPage();
            const sent: CapturedFrame[] = [];
            claimant.on('websocket', (socket) => {
                socket.on('framesent', (frame) => sent.push({ direction: 'sent', data: String(frame.payload) }));
            });
            claimant.on('pageerror', (error) => errors.push(String(error)));

            try {
                await claimant.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);
                await waitUntilLobby(claimant, (l) => l.connection === 'ready', 'claimant connected');

                // Premise: the id-only claim really was presented (so a broken
                // seed can never make this trial pass vacuously).
                const claims = sent.map(presentedClaim).filter((claim): claim is PresentedClaim => claim !== null);
                expect(claims.length, 'claimant presented an identity claim').toBeGreaterThan(0);
                expect(claims[0]?.guestPlayerId).toBe(keeperId);
                expect(claims[0]?.resumeSecret, 'the claim carried no resume secret').toBeUndefined();

                // No RESTORE: the claimant mints a fresh identity instead.
                const claimantStored = await readStoredClaim(claimant);
                expect(claimantStored?.guestPlayerId, 'id-only claim minted fresh').toBeTruthy();
                expect(claimantStored?.guestPlayerId).not.toBe(keeperId);
                expect((await readLobbyOrThrow(claimant)).handle, 'claimant adopts no stolen handle').toBeNull();

                // No RENAME / no DISPLACE: the incumbent is untouched.
                await waitUntilLobby(incumbent, (l) => l.handle === 'Keeper', 'incumbent handle untouched');
                await waitUntilLobby(incumbent, (l) => l.connection === 'ready', 'incumbent still connected');
                const incumbentAfter = await readStoredClaim(incumbent);
                expect(incumbentAfter?.guestPlayerId).toBe(keeperId);

                // No LEAVE/release: the incumbent's own binding still authorizes
                // its actions, which is what a displaced/released session loses.
                await renameHandleViaProfile(incumbent, 'Keeper II');
                await waitUntilLobby(
                    incumbent,
                    (l) => l.handle === 'Keeper II',
                    'incumbent still credentialed after the id-only claim',
                );

                expect(errors).toEqual([]);
            } finally {
                await context.close();
            }
        } finally {
            await incumbent.context().close();
        }
    });

    // -----------------------------------------------------------------------
    // Trial (c): the secret value on every surface SC-017 names
    // -----------------------------------------------------------------------

    test('SC-017(c): the secret value appears in no projection, roster frame, log line, URL, or manual page', async ({
        browser,
    }) => {
        test.setTimeout(90_000);
        const errors: string[] = [];
        const consoleLines: string[] = [];
        const requestUrls: string[] = [];
        const frames: CapturedFrame[] = [];

        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        await context.addInitScript(preserveWsQueryInHistory);
        await context.addInitScript(optInLobbyTestHandle);
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(String(error)));
        page.on('console', (message) => consoleLines.push(message.text()));
        page.on('request', (request) => requestUrls.push(request.url()));
        page.on('websocket', (socket) => {
            socket.on('framereceived', (frame) => frames.push({ direction: 'received', data: String(frame.payload) }));
            socket.on('framesent', (frame) => frames.push({ direction: 'sent', data: String(frame.payload) }));
        });

        try {
            await page.goto(`/lobby?ws=${encodeURIComponent(wsUrl)}`);
            await waitUntilLobby(page, (l) => l.connection === 'ready', 'connected');
            await setHandleViaProfile(page, 'Cipher');
            await waitUntilLobby(page, (l) => l.handle === 'Cipher', 'handle accepted');

            const stored = await readStoredClaim(page);
            const secret = stored?.resumeSecret ?? '';
            expect(secret, 'the owner was delivered its resume secret').not.toBe('');

            // Make the projection and roster surfaces actually observed — a
            // "no leak" assertion over zero frames would prove nothing.
            await expect
                .poll(() => frames.filter((frame) => lobbyEventKind(frame) === 'snapshot').length, {
                    timeout: WAIT_TIMEOUT,
                })
                .toBeGreaterThan(0);
            await expect
                .poll(
                    () =>
                        frames.filter((frame) => {
                            const kind = lobbyEventKind(frame);
                            return kind === 'roster' || kind === 'rosterDelta';
                        }).length,
                    { timeout: WAIT_TIMEOUT },
                )
                .toBeGreaterThan(0);

            // The owner channel DID carry this run's secret — otherwise
            // "absent everywhere else" would be true for the wrong reason.
            const identityCarriers = frames.filter(
                (frame) =>
                    frame.direction === 'received' &&
                    lobbyEventKind(frame) === 'identity' &&
                    frame.data.includes(secret),
            );
            expect(
                identityCarriers.length,
                'the directed identity event delivered the secret to its owner',
            ).toBeGreaterThan(0);

            // Received: the ONLY admissible carrier is the owner's directed
            // identity event (FR-040's owner-only channel). Every other frame
            // — snapshot, roster, presence, match rows — must be secret-free.
            const leakingReceived = frames.filter((frame) => {
                if (frame.direction !== 'received' || !frame.data.includes(secret)) {
                    return false;
                }
                return lobbyEventKind(frame) !== 'identity';
            });
            expect(leakingReceived.map((frame) => lobbyEventKind(frame))).toEqual([]);

            // Sent: the client may present its own claim, nothing else.
            const leakingSent = frames.filter((frame) => {
                if (frame.direction !== 'sent' || !frame.data.includes(secret)) {
                    return false;
                }
                return presentedClaim(frame) === null;
            });
            expect(leakingSent.map((frame) => parseEnvelope(frame.data)?.type ?? 'unparsed')).toEqual([]);

            // Log lines: no page console output carries the value.
            expect(consoleLines.filter((line) => line.includes(secret))).toEqual([]);

            // URLs: neither the current page URL nor any request URL carries it.
            expect(page.url()).not.toContain(secret);
            expect(requestUrls.filter((url) => url.includes(secret))).toEqual([]);

            // App-printed output: the rendered DOM never shows it.
            const rendered = await page.evaluate(() => document.body.innerText);
            expect(rendered).not.toContain(secret);

            // Manual pages: the run's value, plus the credential name the
            // player manual must never teach. The durable class-level check
            // (credential-shaped examples on every approved surface) is
            // `check-documentation-privacy.mjs`, run by verify and CI.
            const manualHits = manualSourceFiles().filter((file) => {
                const text = readFileSync(file, 'utf8');
                return text.includes(secret) || /resumeSecret|resume\s+secret/i.test(text);
            });
            expect(manualHits).toEqual([]);

            expect(errors).toEqual([]);
        } finally {
            await context.close();
        }
    });
});
