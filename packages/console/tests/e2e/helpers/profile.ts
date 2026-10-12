/**
 * Shared E2E helper — identity setup via the `/profile` route
 * (Feature 015). Used by the lobby and routing E2E suites.
 *
 * Handles two entry paths:
 *   1. **Already on /profile** — the US1 identity gate (lobby-runtime)
 *      redirected unnamed visitors from /lobby to /profile before this
 *      helper was called. Fill the form directly.
 *   2. **Still on /lobby** — named visitor or gate hasn't fired yet.
 *      Click the "Choose a name" link (pushState, keeps WS alive).
 *
 * When the visitor arrived via a deep link (e.g. `/match/<matchId>`),
 * the identity gate redirects to `/profile?returnTo=/match/<matchId>`.
 * After handle submission, the auto-redirect goes to the returnTo path
 * instead of `/lobby`. Pass `returnToPath` to wait for the correct URL.
 */

import { expect, type Page } from '@playwright/test';

/** Timeout for waits that depend on server-side identity resolution. */
const WAIT_TIMEOUT = 15_000;

/**
 * Set a display handle via the `/profile` route (Feature 015).
 *
 * Detects whether the page is already on /profile (identity gate
 * redirect) or still on /lobby ("Choose a name" link), fills the
 * "Display name" input, submits, and waits for the auto-redirect.
 *
 * @param page         The Playwright page showing the lobby or profile.
 * @param handle       The display name to submit.
 * @param returnToPath The path to wait for after submission. Defaults to
 *                     `/lobby` (the standard lobby flow). For deep-link
 *                     tests, pass the match path (e.g. `/match/<id>`).
 */
export async function setHandleViaProfile(page: Page, handle: string, returnToPath: string = '/lobby'): Promise<void> {
    // The US1 identity gate may have already redirected to /profile.
    // Detect which path we're on and act accordingly.
    const alreadyOnProfile = await page.evaluate(() => window.location.pathname === '/profile');

    if (!alreadyOnProfile) {
        // Still on /lobby — click the "Choose a name" link (pushState,
        // preserves the live WebSocket connection). The link only renders
        // once identityStatus transitions from 'restoring' to 'unnamed',
        // so wait for it to appear before clicking.
        const chooseNameLink = page.getByRole('link', { name: /choose a name/i });
        await chooseNameLink.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
        await chooseNameLink.click();
    }

    // Wait for the ProfileView form to render (identity must resolve as
    // unnamed first — restoring → unnamed transition).
    await page.getByRole('textbox', { name: /display name/i }).waitFor({ state: 'visible' });
    await page.getByRole('textbox', { name: /display name/i }).fill(handle);
    await page.locator('[data-europa-submit-handle="true"]').click();
    // FR-010: ProfileView auto-navigates to the returnTo path after
    // successful submission. history.pushState does not trigger a load
    // event, so poll the URL directly.
    await page.waitForFunction((expected) => window.location.pathname === expected, returnToPath);
}

/**
 * Rename the handle of an ALREADY-NAMED identity through the
 * `/profile` route (feature 015), keeping the live socket.
 *
 * Distinct from {@link setHandleViaProfile} on purpose: `ProfileView`
 * auto-navigates only on the unnamed → named transition, so a rename
 * lands on the welcome card instead. This helper walks that path
 * (Manage profile → Change name → submit → Continue to lobby) and
 * treats the welcome card showing the NEW handle as the settle signal —
 * the rename resolves on the directed identity event, not on the click.
 *
 * That event carries no resume secret (plan AD-11 / spec 006 FR-018
 * rename path), which is exactly what the SC-017(a) reload below stakes
 * its stored credential on.
 *
 * @param page   A live lobby page whose identity is `named`.
 * @param next   The replacement display handle.
 */
export async function renameHandleViaProfile(page: Page, next: string): Promise<void> {
    const manageLink = page.getByRole('link', { name: /manage profile/i });
    await manageLink.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    await manageLink.click();
    await page.waitForFunction(() => window.location.pathname === '/profile');

    const changeName = page.getByRole('button', { name: /change name/i });
    await changeName.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    await changeName.click();

    const field = page.getByRole('textbox', { name: /display name/i });
    await field.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    await field.fill(next);
    await page.locator('[data-europa-submit-handle="true"]').click();

    // Editing mode exits only when `handle` actually changes, so the
    // welcome card carrying `next` proves the server accepted the rename.
    await expect(page.locator('p[data-europa-identity-status="named"]')).toContainText(next, {
        timeout: WAIT_TIMEOUT,
    });

    await page.getByRole('button', { name: /continue to lobby/i }).click();
    await page.waitForFunction(() => window.location.pathname === '/lobby');
}
