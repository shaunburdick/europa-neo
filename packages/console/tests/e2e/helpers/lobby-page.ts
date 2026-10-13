/**
 * Shared E2E helper — reads the lobby runtime's `window.__europaLobby`
 * handle (spec-side view for internal-state assertions that the DOM
 * alone cannot convey) and polls it.
 *
 * Extracted from `lobby.spec.ts` so every suite that mounts the lobby
 * runtime asserts against one view shape. The DOM alone cannot show
 * `connection` / `identityStatus` / the raw snapshot entries, so these
 * readers go through the test handle the runtime installs when a suite
 * opts in via `optInLobbyTestHandle`.
 */

import { expect, type Page } from '@playwright/test';

/** Default poll timeout for observable state (CI-safe upper bound). */
export const WAIT_TIMEOUT = 15_000;

/**
 * Minimal mirror of the lobby runtime's `window.__europaLobby` handle
 * (spec-side view for internal-state assertions).
 */
export interface LobbyHandleView {
    readonly store: {
        getState(): {
            readonly viewMode: string;
            readonly handle: string | null;
            readonly activeMatchId: string | null;
            readonly identityStatus: string;
            readonly connection: string;
            readonly snapshot: {
                readonly entries: ReadonlyArray<{
                    readonly matchId: string;
                    readonly status: string;
                    readonly seatsFilled: number;
                    readonly capacity: number;
                }>;
            } | null;
        };
    };
}

/** The projection {@link readLobby} returns; `null` when the handle is absent. */
export interface LobbyStateView {
    viewMode: string;
    handle: string | null;
    activeMatchId: string | null;
    identityStatus: string;
    connection: string;
    entries: ReadonlyArray<{
        matchId: string;
        status: string;
        seatsFilled: number;
        capacity: number;
    }>;
}

/**
 * Read the lobby handle's essential state from a page.
 *
 * @param page Playwright page with a mounted lobby runtime.
 * @returns The lobby state snapshot, or null if the handle is missing.
 */
export async function readLobby(page: Page): Promise<LobbyStateView | null> {
    return page.evaluate(() => {
        const handle = (window as unknown as { __europaLobby?: LobbyHandleView }).__europaLobby;
        if (handle === undefined || handle.store === undefined) {
            return null;
        }
        const state = handle.store.getState();
        return {
            viewMode: state.viewMode,
            handle: state.handle,
            activeMatchId: state.activeMatchId,
            identityStatus: state.identityStatus,
            connection: state.connection,
            entries: (state.snapshot?.entries ?? []).map((entry) => ({
                matchId: entry.matchId,
                status: entry.status,
                seatsFilled: entry.seatsFilled,
                capacity: entry.capacity,
            })),
        };
    });
}

/**
 * Read the lobby handle's state, failing with a clear message when
 * the runtime never mounted.
 */
export async function readLobbyOrThrow(page: Page): Promise<LobbyStateView> {
    const lobby = await readLobby(page);
    if (lobby === null) {
        throw new Error('lobby runtime handle missing — page did not mount lobby runtime');
    }
    return lobby;
}

/**
 * Poll a page until `when` holds on the lobby state. Fails with a
 * clear message on timeout (never hangs silently).
 */
export async function waitUntilLobby(
    page: Page,
    when: (lobby: LobbyStateView) => boolean,
    description: string,
): Promise<void> {
    await expect
        .poll(
            async () => {
                const lobby = await readLobby(page);
                if (lobby === null) {
                    return false;
                }
                return when(lobby);
            },
            { timeout: WAIT_TIMEOUT, intervals: [50, 100, 250] },
        )
        .toBe(true, description);
}

/**
 * Verify the lobby page renders a handle in the identity card.
 * Checks for either a `<bdi>` element (hostile-but-valid user content
 * isolation, WCAG bidi) or the `.europa-lobby__identity-name` span
 * used by the redesigned lobby layout.
 */
export async function assertHandleInBdi(page: Page, handle: string): Promise<void> {
    const bdiCount = await page.locator('bdi').filter({ hasText: handle }).count();
    const identityNameCount = await page.locator('.europa-lobby__identity-name').filter({ hasText: handle }).count();
    expect(
        bdiCount + identityNameCount,
        `handle "${handle}" not found in a <bdi> or .europa-lobby__identity-name element`,
    ).toBeGreaterThan(0);
}
