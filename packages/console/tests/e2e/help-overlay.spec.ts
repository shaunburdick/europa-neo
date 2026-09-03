/**
 * E2E — help overlay (Feature 018, FR-001–FR-016).
 *
 * Tests the help overlay open/close behavior via the ? key and the
 * help button, plus tooltip visibility on hover. Uses the Vite dev
 * server served by the Playwright config's webServer block.
 *
 * The overlay is available on any match view (the App component
 * renders the help button and keyboard listener in interactive mode).
 * This spec navigates to the lobby first (to get a named identity),
 * then joins a match to reach the game view.
 *
 * Determinism: all waits poll observable DOM conditions.
 */

import { expect, test } from '@playwright/test';

test.describe('help overlay', () => {
    test('pressing ? opens the help overlay', async ({ page }) => {
        await page.goto('/lobby');
        // Wait for the lobby to render (identity gate or named state).
        await page.waitForSelector('.europa-hud', { timeout: 10_000 });

        // Press ? to open the help overlay.
        await page.keyboard.press('?');

        // The europa-modal should have the open attribute.
        const modal = page.locator('europa-modal');
        await expect(modal).toHaveAttribute('open', '');
    });

    test('pressing ? again closes the help overlay', async ({ page }) => {
        await page.goto('/lobby');
        await page.waitForSelector('.europa-hud', { timeout: 10_000 });

        // Open the overlay.
        await page.keyboard.press('?');
        const modal = page.locator('europa-modal');
        await expect(modal).toHaveAttribute('open', '');

        // Close the overlay with ? again.
        await page.keyboard.press('?');
        await expect(modal).not.toHaveAttribute('open', '');
    });

    test('pressing Escape closes the help overlay', async ({ page }) => {
        await page.goto('/lobby');
        await page.waitForSelector('.europa-hud', { timeout: 10_000 });

        // Open the overlay.
        await page.keyboard.press('?');
        const modal = page.locator('europa-modal');
        await expect(modal).toHaveAttribute('open', '');

        // Escape should close it (enforced by europa-modal).
        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveAttribute('open', '');
    });

    test('the help button in the HUD opens the overlay', async ({ page }) => {
        await page.goto('/lobby');
        await page.waitForSelector('.europa-hud', { timeout: 10_000 });

        // Click the ? help button.
        const helpButton = page.locator('.europa-help-button');
        await helpButton.click();

        // The europa-modal should have the open attribute.
        const modal = page.locator('europa-modal');
        await expect(modal).toHaveAttribute('open', '');
    });

    test('the help button toggles the overlay closed', async ({ page }) => {
        await page.goto('/lobby');
        await page.waitForSelector('.europa-hud', { timeout: 10_000 });

        const helpButton = page.locator('.europa-help-button');
        const modal = page.locator('europa-modal');

        // Open via button.
        await helpButton.click();
        await expect(modal).toHaveAttribute('open', '');

        // Close via button again.
        await helpButton.click();
        await expect(modal).not.toHaveAttribute('open', '');
    });

    test('the help button is visible in the HUD', async ({ page }) => {
        await page.goto('/lobby');
        await page.waitForSelector('.europa-hud', { timeout: 10_000 });

        const helpButton = page.locator('.europa-help-button');
        await expect(helpButton).toBeVisible();
        await expect(helpButton).toHaveText('?');
    });

    test('the overlay contains all expected sections', async ({ page }) => {
        await page.goto('/lobby');
        await page.waitForSelector('.europa-hud', { timeout: 10_000 });

        // Open the overlay.
        await page.keyboard.press('?');

        // Check all section headings are present.
        const content = page.locator('.europa-help-overlay__content');
        await expect(content).toContainText('Symbol Legend');
        await expect(content).toContainText('Keyboard Shortcuts');
        await expect(content).toContainText('Game Status');
        await expect(content).toContainText('Learn More');
    });

    test('the overlay contains the player manual link', async ({ page }) => {
        await page.goto('/lobby');
        await page.waitForSelector('.europa-hud', { timeout: 10_000 });

        await page.keyboard.press('?');

        const link = page.locator('a[href*="shaunburdick.github.io/europa-neo/manual"]');
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    test('tooltip appears on hover over the help button', async ({ page }) => {
        await page.goto('/lobby');
        await page.waitForSelector('.europa-hud', { timeout: 10_000 });

        // Hover over the help button wrapper.
        const helpWrapper = page.locator('.europa-help-button').locator('..');
        await helpWrapper.hover();

        // The tooltip should become visible (no --hidden class).
        const tooltip = page.locator('[role="tooltip"]');
        await expect(tooltip).not.toHaveClass(/europa-tooltip--hidden/);
    });
});
