/**
 * Preview page tests for the design system (FR-042, AC-041/042/043).
 *
 * Validates the dev page HTML entry point structure (AC-041) and shell.css
 * token compliance (AC-042). The token-helper contract those pages render
 * (`tests/dev-page.test.ts`) is asserted there instead, so this file stays
 * about the page shell.
 *
 * Run via: `vitest run tests/preview.test.ts` (node-mode, happy-dom).
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_DIR = path.resolve(__dirname, '..', 'dev');
const HTML_PATH = path.join(DEV_DIR, 'index.html');
const SHELL_CSS_PATH = path.join(DEV_DIR, 'styles', 'shell.css');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read the dev page HTML file contents.
 */
async function readDevHtml(): Promise<string> {
    return readFile(HTML_PATH, 'utf8');
}

/**
 * Read the shell CSS file contents.
 */
async function readShellCss(): Promise<string> {
    return readFile(SHELL_CSS_PATH, 'utf8');
}

/**
 * Check if a CSS value contains an rgb/rgba literal.
 */
function containsRgbLiteral(value: string): boolean {
    return /rgba?\s*\(/.test(value);
}

// ---------------------------------------------------------------------------
// HTML structure tests (AC-041) — migrated to dev page
// ---------------------------------------------------------------------------

describe('dev page HTML structure (AC-041)', () => {
    it('has a root div for React mounting', async () => {
        const content = await readDevHtml();
        expect(content).toContain('id="root"');
    });

    it('imports main.tsx as a module', async () => {
        const content = await readDevHtml();
        expect(content).toContain('src="./main.tsx"');
        expect(content).toContain('type="module"');
    });

    it('has the correct page title', async () => {
        const content = await readDevHtml();
        expect(content).toContain('<title>Europa Design System</title>');
    });

    it('declares lang attribute', async () => {
        const content = await readDevHtml();
        expect(content).toContain('lang="en"');
    });

    it('includes viewport meta tag', async () => {
        const content = await readDevHtml();
        expect(content).toContain('name="viewport"');
    });
});

// ---------------------------------------------------------------------------
// AC-042: shell.css token compliance (migrated from inline style block)
// ---------------------------------------------------------------------------

describe('shell.css token compliance (AC-042)', () => {
    it('contains no hex literals in property values outside theme block', async () => {
        const css = await readShellCss();
        const themeStart = css.indexOf(':root[data-theme="light"]');
        const mainCss = themeStart >= 0 ? css.slice(0, themeStart) : css;

        const hexInProperties = /:\s*#[0-9a-fA-F]{3,8}/g;
        const matches = mainCss.match(hexInProperties) || [];
        expect(matches).toEqual([]);
    });

    it('contains no rgb/rgba literals outside theme block', async () => {
        const css = await readShellCss();
        const themeStart = css.indexOf(':root[data-theme="light"]');
        const mainCss = themeStart >= 0 ? css.slice(0, themeStart) : css;

        const lines = mainCss.split('\n');
        const violations: string[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '' || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('//')) {
                continue;
            }

            const colonIndex = trimmed.indexOf(':');
            if (colonIndex > 0) {
                const value = trimmed
                    .slice(colonIndex + 1)
                    .replace(/;$/, '')
                    .trim();
                if (!value.startsWith('var(')) {
                    if (containsRgbLiteral(value)) {
                        violations.push(trimmed);
                    }
                }
            }
        }

        expect(violations, `Found rgb/rgba literals outside theme block:\n${violations.join('\n')}`).toHaveLength(0);
    });

    it('uses var(--europa-*) for background-color outside theme block', async () => {
        const css = await readShellCss();
        const themeStart = css.indexOf(':root[data-theme="light"]');
        const mainCss = themeStart >= 0 ? css.slice(0, themeStart) : css;

        const bgRegex = /background-color:\s*(?!var\(--europa)[^;]+;/g;
        const matches = mainCss.match(bgRegex) || [];
        expect(matches).toEqual([]);
    });
});
