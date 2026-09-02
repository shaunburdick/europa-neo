/**
 * No-literals guard for the shareable design system (spec 012, T-014 / G-04).
 *
 * Scans consumer styling code for hardcoded hex / rgb(a) color literals
 * outside `@europa/design` imports. The only tolerated exception is a single
 * line-scoped canvas-fallback marker (`design-exception: canvas fallback`)
 * used by Canvas paint calls that cannot read a CSS variable synchronously
 * (FR-009 edge case). Any other literal fails with `file:line`.
 *
 * Scopes:
 *   - `packages/console/src/**` (all files)
 *   - `docs/manual/**` EXCLUDING the vendored stylesheet
 *     (`docs/manual/public/design.css` — `@europa/design`'s own emitted CSS,
 *     the canonical literal source, so scanning it is self-referential) and
 *     EXCLUDING documentation content (any `docs/manual/**` file ending in
 *     `.md` or `.mdx` — documentation pages such as the player-color reference
 *     table in `numbers.mdx`; the manual's styling is exclusively the vendored
 *     catalog CSS + catalog classes, so documentation pages never carry a
 *     styling literal to tokenize).
 *
 * Exposed as `pnpm --filter @europa/design check:no-literals`.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Forbidden hex color literal (3/4/6/8 digit). Non-global: stateless `.test()`. */
export const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/;
/** Forbidden rgb()/rgba() literal. Non-global: stateless `.test()`. */
export const RGBA_LITERAL = /rgba?\(/;
/** Line-scoped allow-list marker for the single canvas fallback. */
export const ALLOW_MARKER = /design-exception: canvas fallback/;

/** A detected literal violation. */
export interface LiteralViolation {
    /** Repository-relative file path. */
    readonly file: string;
    /** 1-based line number. */
    readonly line: number;
    /** Trimmed offending line text. */
    readonly text: string;
}

/** True when the line carries the canvas-fallback allow-list marker. */
export function isAllowListed(line: string): boolean {
    return ALLOW_MARKER.test(line);
}

/**
 * Scan file content line by line.
 *
 * A line is a violation when it contains a forbidden literal AND neither it
 * nor the immediately preceding line carries the allow-list marker, and it is
 * not an `@europa/design` import line.
 *
 * @param content - File text to scan.
 * @param relPath - Repository-relative path, used only for the violation report.
 * @returns Violations found in `content`.
 */
export function scanContent(content: string, relPath: string): ReadonlyArray<LiteralViolation> {
    const lines = content.split(/\r\n|\n/);
    const violations: LiteralViolation[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        if (line.includes("from '@europa/design'") || line.includes('@europa/design/dist/design.css')) {
            continue;
        }
        const hasHex = HEX_LITERAL.test(line);
        const hasRgba = RGBA_LITERAL.test(line);
        if (!hasHex && !hasRgba) {
            continue;
        }
        const prevLine = i > 0 ? (lines[i - 1] ?? '') : '';
        if (isAllowListed(line) || isAllowListed(prevLine)) {
            continue;
        }
        violations.push({ file: relPath, line: i + 1, text: line.trim() });
    }
    return violations;
}

/**
 * Whether a repository-relative path should be excluded from the scan.
 *
 * @param relPath - Repository-relative file path.
 */
export function shouldSkipFile(relPath: string): boolean {
    // Vendored design-token CSS — the canonical literal source
    if (relPath.endsWith('docs/manual/public/design.css')) {
        return true;
    }
    // Documentation content (Markdown or MDX) — hex colors in tables are
    // reference data, not styling literals
    if ((relPath.endsWith('.md') || relPath.endsWith('.mdx')) && relPath.includes('docs/manual/')) {
        return true;
    }
    return false;
}

/** Recursively collect files under `dir`, skipping build/output trees. */
async function walk(dir: string, base: string, out: string[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') {
                continue;
            }
            await walk(abs, base, out);
        } else if (entry.isFile()) {
            out.push(abs);
        }
    }
}

/** Resolve the repository root from this script's location. */
function resolveRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, '..', '..', '..');
}

/** Result of the no-literals scan. */
export interface NoLiteralsResult {
    readonly ok: boolean;
    readonly violations: ReadonlyArray<LiteralViolation>;
}

/**
 * Run the no-literals scan over `packages/console/src` and `docs/manual`.
 *
 * @param repoRoot - Repository root (defaults to resolved root).
 * @returns Violations found (empty when clean).
 */
export async function runNoLiteralsCheck(repoRoot: string = resolveRepoRoot()): Promise<NoLiteralsResult> {
    const targets = [path.join(repoRoot, 'packages', 'console', 'src'), path.join(repoRoot, 'docs', 'manual')];
    const files: string[] = [];
    for (const target of targets) {
        await walk(target, repoRoot, files);
    }
    const violations: LiteralViolation[] = [];
    for (const abs of files) {
        const rel = path.relative(repoRoot, abs);
        if (shouldSkipFile(rel)) {
            continue;
        }
        const content = await readFile(abs, 'utf8');
        violations.push(...scanContent(content, rel));
    }
    return { ok: violations.length === 0, violations };
}

/**
 * CLI entry point: print every violation and exit non-zero when any literal
 * is found. Extracted so the failure path is unit-testable (constitution III).
 *
 * @param check - Check to run (defaults to {@link runNoLiteralsCheck}).
 */
export async function runMain(check: () => Promise<NoLiteralsResult> = runNoLiteralsCheck): Promise<void> {
    const result = await check();
    if (!result.ok) {
        for (const violation of result.violations) {
            console.error(`${violation.file}:${violation.line} — use var(--europa-*) — ${violation.text}`);
        }
        process.exit(1);
    }
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    await runMain();
}
