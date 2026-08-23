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
 *     mode tests).
 *
 * Both enforce the identical tag set, so per-component scans and
 * full-page scans catch the same rule classes.
 *
 * Tag coverage: WCAG 2.0 A/AA, 2.1 A/AA, and 2.2 AA — matching the
 * constitution's Principle VI (accessibility-minded UI) and the
 * spec's "zero WCAG 2.2 A/AA violations" acceptance bar.
 */

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import axe from 'axe-core';

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
  throwOnViolations(results.violations);
}

/**
 * Run an axe scan inside Vitest Browser Mode against the live
 * document (or a subtree), enforcing the same WCAG tag set as the
 * Playwright helper above. Used by `tests/component/**` and
 * `tests/a11y/**` suites where no Playwright Page exists.
 *
 * @param context Root node to audit; defaults to the whole document.
 * @throws Error listing every violation (rule id, impact, affected
 *         node selectors) when the scan is not clean.
 */
export async function expectNoDomA11yViolations(context: ParentNode = document): Promise<void> {
  const results = await axe.run(context, {
    runOnly: { type: 'tag', values: [...AXE_TAGS] },
  });
  throwOnViolations(results.violations);
}

/**
 * Format + throw on a non-empty violation list (shared reporting
 * format for both helpers).
 */
function throwOnViolations(
  violations: ReadonlyArray<{
    readonly id: string;
    readonly impact: string | null | undefined;
    readonly help: string;
    readonly nodes: ReadonlyArray<{ readonly target: ReadonlyArray<unknown> }>;
  }>,
): void {
  if (violations.length === 0) {
    return;
  }
  const report = violations
    .map((violation) => {
      const nodes = violation.nodes.map((node) => node.target.map(String).join(' ')).join('; ');
      return `[${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help} — ${nodes}`;
    })
    .join('\n');
  throw new Error(`axe-core found ${violations.length} WCAG violation(s):\n${report}`);
}
