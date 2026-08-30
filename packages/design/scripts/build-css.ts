/**
 * Deterministic CSS emitter for the shareable design system (spec 012, T-006).
 *
 * Walks {@link TOKENS} in sorted key order, emits a single
 * `:root { --europa-*: value; }` block (LF, UTF-8, no BOM, no timestamp,
 * lexicographic order) and writes `dist/design.css`. Imported by the
 * package `build` script as `tsup && tsx scripts/build-css.ts` so
 * repeated builds are byte-identical for the same token table.
 *
 * No runtime dependencies — node:* builtins plus this package's own
 * source, executed by the workspace-catalog `tsx` runner (mirrors
 * `packages/version/scripts/check-version-drift.ts`).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TOKENS } from '../src/tokens.js';

/**
 * Convert a camelCase/ Pascal identifier to kebab-case.
 *
 * @param value - Identifier segment (e.g. `pageBg`, `surfaceRaised`).
 * @returns Kebab-case form (`page-bg`, `surface-raised`).
 */
function toKebabCase(value: string): string {
    return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Collect every token leaf as a CSS variable entry.
 *
 * Groups and keys are walked in sorted order; the returned array is
 * sorted lexicographically by CSS variable name so final output is
 * deterministic regardless of object insertion order.
 *
 * @returns Sorted list of variable entries.
 */
function collectEntries(): ReadonlyArray<{ cssVar: string; value: string }> {
    const entries: Array<{ cssVar: string; value: string }> = [];
    const groups = Object.keys(TOKENS).sort();

    for (const group of groups) {
        const groupValue = TOKENS[group as keyof typeof TOKENS] as Record<string, string | number>;
        const leafKeys = Object.keys(groupValue).sort();
        const groupKebab = toKebabCase(group);

        for (const leafKey of leafKeys) {
            const rawValue = groupValue[leafKey];
            if (rawValue === undefined) {
                continue;
            }
            const leafKebab = toKebabCase(leafKey);
            const cssVar = `--europa-${groupKebab}-${leafKebab}`;
            const cssValue = typeof rawValue === 'number' ? String(rawValue) : rawValue;
            entries.push({ cssVar, value: cssValue });
        }
    }

    entries.sort((left, right) => left.cssVar.localeCompare(right.cssVar));
    return entries;
}

/**
 * Build the deterministic CSS text for the current {@link TOKENS}.
 *
 * Output shape:
 * ```
 * :root {
 *   --europa-*: value;
 *   ...
 * }
 * ```
 * LF line endings, UTF-8, no BOM, no timestamp, single `:root` block.
 *
 * @returns The complete CSS file contents (trailing LF included).
 */
export function buildCssText(): string {
    const entries = collectEntries();
    const lines: string[] = [':root {'];
    for (const entry of entries) {
        lines.push(`  ${entry.cssVar}: ${entry.value};`);
    }
    lines.push('}');
    return `${lines.join('\n')}\n`;
}

/**
 * Resolve the package root from this file's own location — never from the
 * process cwd, so the check behaves identically no matter where it is
 * invoked from (mirrors `packages/version/scripts/check-version-drift.ts`).
 *
 * `packages/design/scripts/` sits two levels below the package root.
 *
 * @returns Absolute path to `packages/design`.
 */
function resolveDesignRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, '..');
}

/**
 * Write `dist/design.css` deterministically.
 *
 * @param designRoot - Absolute path to `packages/design` (defaults to resolved package root).
 * @returns Absolute path to the written file.
 */
export async function writeDesignCss(designRoot: string = resolveDesignRoot()): Promise<string> {
    const css = buildCssText();
    const outPath = path.join(designRoot, 'dist', 'design.css');
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, css, 'utf8');
    return outPath;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    await writeDesignCss();
}
