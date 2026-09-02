/**
 * Vitest / Playwright shared setup — Feature 005 (T036).
 *
 * Configures axe-core for the console's accessibility acceptance
 * tests (quickstart.md Q-A01..Q-A03) and exports TWO assertion
 * helpers covering the dual a11y layers (tasks.md decision note #2):
 *
 *   - {@link expectNoA11yViolations} — Playwright specs; scans a full
 *     page through `@axe-core/playwright`'s AxeBuilder.
 *   - {@link expectNoDomA11yViolations} — Vitest Browser Mode
 *     component/a11y suites; runs the axe-core engine directly on the
 *     live document (no Playwright Page object exists inside browser-
 *     mode tests). Re-exported from {@link ./setup-a11y-dom.ts}.
 *
 * Both enforce the identical tag set, so per-component scans and
 * full-page scans catch the same rule classes.
 *
 * Tag coverage: WCAG 2.0 A/AA, 2.1 A/AA, and 2.2 AA — matching the
 * constitution's Principle VI (accessibility-minded UI) and the
 * spec's "zero WCAG 2.2 A/AA violations" acceptance bar.
 *
 * IMPORTANT: Browser-mode tests should NOT use this file as a setup
 * entry point — it imports @axe-core/playwright (Node-only) which
 * poisons the browser bundle. Use setup-web-components.ts instead
 * (see vitest.config.browser.ts setupFiles).
 */

import '@europa/design/dist/design.css';

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

// Re-export browser-safe utilities so Node-mode tests that import
// from setup.ts continue to work unchanged.
export { expectNoDomA11yViolations } from './setup-a11y-dom.js';

/**
 * Run an axe scan against `page` with the console's WCAG tag set and
 * fail with a human-readable violation report when anything trips.
 *
 * Shadow DOM: axe-core ≥ 4 traverses open shadow roots by default,
 * keeping this helper in parity with {@link expectNoDomA11yViolations}
 * — the shadow-internal DOM of converted `@europa/design` generic
 * components is audited here too. The parity guarantee is pinned by
 * `tests/a11y/shadow-traversal.test.ts`.
 *
 * @param page The Playwright page to audit (current DOM state).
 * @throws Error listing every violation (rule id, impact, affected
 *         node selectors) when the scan is not clean.
 */
export async function expectNoA11yViolations(page: Page): Promise<void> {
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
    if (results.violations.length === 0) {
        return;
    }
    const report = results.violations
        .map((violation) => {
            const nodes = violation.nodes.map((node) => node.target.map(String).join(' ')).join('; ');
            return `[${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help} — ${nodes}`;
        })
        .join('\n');
    throw new Error(`axe-core found ${results.violations.length} WCAG violation(s):\n${report}`);
}
