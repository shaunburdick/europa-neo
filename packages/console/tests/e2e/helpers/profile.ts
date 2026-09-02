/**
 * Shared E2E helper — identity setup via the `/profile` route
 * (Feature 015). Used by the lobby and routing E2E suites.
 */

import type { Page } from '@playwright/test';

/**
 * Set a display handle via the `/profile` route (Feature 015).
 *
 * Clicks the lobby landing's "Choose a name" link (which uses
 * `history.pushState`, preserving the live WebSocket connection),
 * fills the "Display name" input, submits, and waits for the
 * auto-redirect back to `/lobby` (FR-010).
 *
 * Using the link (pushState) rather than `page.goto` (full navigation)
 * keeps the lobby WebSocket connection alive — a full reload tears it
 * down and leaves the client stuck in "Reconnecting to lobby…".
 *
 * @param page   The Playwright page showing the lobby landing.
 * @param handle The display name to submit.
 */
export async function setHandleViaProfile(page: Page, handle: string): Promise<void> {
    // The lobby landing shows a "Choose a name" link when unnamed.
    await page.getByRole('link', { name: /choose a name/i }).click();
    // Wait for the ProfileView form to render — identity must resolve
    // as unnamed first (restoring → unnamed transition).
    await page.getByRole('textbox', { name: /display name/i }).waitFor({ state: 'visible' });
    await page.getByRole('textbox', { name: /display name/i }).fill(handle);
    await page.locator('[data-europa-submit-handle="true"]').click();
    // FR-010: ProfileView auto-navigates to /lobby after successful submission.
    // history.pushState does not trigger a load event, so poll the URL directly.
    await page.waitForFunction(() => window.location.pathname === '/lobby');
}
