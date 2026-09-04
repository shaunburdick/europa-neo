/**
 * Browser-safe axe-core DOM helper — extracted from setup.ts.
 *
 * Contains ONLY imports and functions safe for Vitest Browser Mode
 * (runs inside Chromium, not Node). The original setup.ts imported
 * @axe-core/playwright and @playwright/test — Node-only packages that
 * poison the browser bundle with unresolvable child_process/net/fs
 * deps. This file is the single source of truth for browser-mode a11y
 * checks; setup.ts re-exports from here so Node-mode tests continue
 * to work unchanged.
 *
 * Tag coverage: WCAG 2.0 A/AA, 2.1 A/AA, and 2.2 AA — matching the
 * constitution's Principle VI (accessibility-minded UI) and the
 * spec's "zero WCAG 2.2 A/AA violations" acceptance bar.
 */

import '@europa/design/dist/design.css';

import axe from 'axe-core';

/**
 * Axe rule tags enforced on every scan (WCAG 2.2 AA target).
 *
 * Exported so auxiliary suites scan with the identical rule set as
 * {@link expectNoDomA11yViolations}.
 */
export const AXE_TAGS: readonly string[] = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Run an axe scan inside Vitest Browser Mode against the live
 * document (or a subtree), enforcing the same WCAG tag set as the
 * Playwright helper in setup.ts. Used by `tests/component/**` and
 * `tests/a11y/**` suites where no Playwright Page exists.
 *
 * Shadow DOM: axe-core ≥ 4 traverses **open** shadow roots by
 * default. The React-converted `@europa/design` generic components
 * render standard HTML with `europa-*` CSS classes (no shadow DOM),
 * so axe scans them directly.
 *
 * @param context Root node to audit; defaults to the whole document.
 * @param excludeRules Optional rule IDs to exclude from this scan
 *        (e.g. for known source-level regressions under remediation).
 * @throws Error listing every violation (rule id, impact, affected
 *         node selectors) when the scan is not clean.
 */
export async function expectNoDomA11yViolations(
    context: ParentNode = document,
    excludeRules?: readonly string[],
): Promise<void> {
    const results = await axe.run(context, {
        runOnly: { type: 'tag', values: [...AXE_TAGS] },
    });
    const filtered = excludeRules
        ? results.violations.filter((v) => !excludeRules.includes(v.id))
        : results.violations;
    throwOnViolations(filtered);
}

/**
 * Format + throw on a non-empty violation list (shared reporting
 * format for both browser and Playwright helpers).
 */
function throwOnViolations(
    violations: ReadonlyArray<{
        readonly id: string;
        readonly impact: string | null | undefined;
        readonly help: string;
        readonly nodes: ReadonlyArray<{ readonly target: readonly unknown[] }>;
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
