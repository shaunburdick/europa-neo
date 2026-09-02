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
 */

import type { Page } from '@playwright/test';

/**
 * Set a display handle via the `/profile` route (Feature 015).
 *
 * Detects whether the page is already on /profile (identity gate
 * redirect) or still on /lobby ("Choose a name" link), fills the
 * "Display name" input, submits, and waits for the auto-redirect
 * back to /lobby (FR-010).
 *
 * @param page   The Playwright page showing the lobby or profile.
 * @param handle The display name to submit.
 */
export async function setHandleViaProfile(page: Page, handle: string): Promise<void> {
    // The US1 identity gate may have already redirected to /profile.
    // Detect which path we're on and act accordingly.
    const alreadyOnProfile = await page.evaluate(() => window.location.pathname === '/profile');

    if (!alreadyOnProfile) {
        // Still on /lobby — click the "Choose a name" link (pushState,
        // preserves the live WebSocket connection).
        await page.getByRole('link', { name: /choose a name/i }).click();
    }

    // Wait for the ProfileView form to render (identity must resolve as
    // unnamed first — restoring → unnamed transition).
    await page.getByRole('textbox', { name: /display name/i }).waitFor({ state: 'visible' });
    await page.getByRole('textbox', { name: /display name/i }).fill(handle);
    await page.locator('[data-europa-submit-handle="true"]').click();
    // FR-010: ProfileView auto-navigates to /lobby after successful submission.
    // history.pushState does not trigger a load event, so poll the URL directly.
    await page.waitForFunction(() => window.location.pathname === '/lobby');
}
