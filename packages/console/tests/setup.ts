/**
 * Vitest / Playwright shared setup — Feature 005 (T036).
 *
 * Configures axe-core for the console's accessibility acceptance
 * tests (quickstart.md Q-A01..Q-A03) and exports the assertion helper
 * component/a11y suites use. Loaded by `vitest.config.browser.ts`
 * (`setupFiles`) and importable from Playwright specs.
 *
 * Tag coverage: WCAG 2.0 A/AA, 2.1 A/AA, and 2.2 AA — matching the
 * constitution's Principle VI (accessibility-minded UI) and the
 * spec's "zero WCAG 2.2 A/AA violations" acceptance bar.
 */

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/** Axe rule tags enforced on every scan (WCAG 2.2 AA target). */
const AXE_TAGS: ReadonlyArray<string> = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Run an axe scan against `page` with the console's WCAG tag set and
 * fail with a human-readable violation report when anything trips.
 *
 * @param page The Playwright page to audit (current DOM state).
 * @throws Error listing every violation (rule id, impact, affected
 *         node selectors) when the scan is not clean.
 */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();

  if (results.violations.length === 0) {
    return;
  }

  const report = results.violations
    .map((violation) => {
      const nodes = violation.nodes.map((node) => node.target.join(' ')).join('; ');
      return `[${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help} — ${nodes}`;
    })
    .join('\n');

  throw new Error(`axe-core found ${results.violations.length} WCAG violation(s):\n${report}`);
}
