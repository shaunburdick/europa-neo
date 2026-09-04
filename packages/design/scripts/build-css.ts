/**
 * Deterministic CSS emitter for the shareable design system (spec 012,
 * T-006 / T-007).
 *
 * Walks {@link TOKENS} in sorted key order, emits a single
 * `:root { --europa-*: value; }` block (LF, UTF-8, no BOM, no timestamp,
 * lexicographic order) and concatenates the authored catalog segment
 * (`src/styles/catalog.css`) deterministically, then writes
 * `dist/design.css`. Imported by the package `build` script so repeated
 * builds are byte-identical for the same token table and catalog source.
 *
 * Catalog stylesheet (T-007): the file `src/styles/catalog.css` is tracked
 * source that defines every `europa-*` class family from FR-006. Each
 * declaration composes only `var(--europa-*)` (no hex/rgb literals outside
 * `:root`). The emitter keeps the catalog authored but deterministic — one
 * LF-joined concatenation after the `:root` block.
 *
 * The former Shadow DOM catalog module (`src/styles/catalog-styles.ts`)
 * and its `--emit-module` build path were removed in the React component
 * conversion (spec 014 Clarifications v1.2, issue #65) — no shadow roots
 * remain to adopt it. `dist/design.css` remains the single styling source
 * for the console + manual.
 *
 * Token JSON (FR-006): the `--emit-json` flag writes `dist/tokens.json`
 * — a machine-readable JSON array of every CSS variable with `group`,
 * `name`, `cssVar`, and `value` fields, sorted lexicographically by
 * `cssVar`.
 *
 * No runtime dependencies — node:* builtins plus this package's own
 * source, executed by the workspace-catalog `tsx` runner (mirrors
 * `packages/version/scripts/check-version-drift.ts`).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
 * Inline CSS comments emitted before specific token declarations (FR-046).
 *
 * Maps a CSS variable name to the comment text that should appear on the
 * line immediately before its declaration in the `:root` block. Only the
 * two background tokens receive comments — the distinction between
 * `void-bg` (board/canvas recessed background) and `page-bg` (outermost
 * page background) is a common source of confusion.
 */
const TOKEN_COMMENTS: Record<string, string> = {
    '--europa-color-page-bg': '/* page-bg: the outermost page background (lobby, manual pages) */',
    '--europa-color-void-bg': '/* void-bg: the board/canvas recessed background (distinct from page-bg) */',
};

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
 * Inline comments are added before the two background tokens (FR-046) to
 * document the `void-bg` vs `page-bg` distinction.
 *
 * @returns The complete CSS file contents (trailing LF included).
 */
export function buildCssText(): string {
    const entries = collectEntries();
    const lines: string[] = [':root {'];
    for (const entry of entries) {
        const comment = TOKEN_COMMENTS[entry.cssVar] ?? '';
        if (comment.length > 0) {
            lines.push(`  ${comment}`);
        }
        lines.push(`  ${entry.cssVar}: ${entry.value};`);
    }
    lines.push('}');
    return `${lines.join('\n')}\n`;
}

/**
 * Build a machine-readable JSON representation of the token table (FR-006).
 *
 * Each entry contains the token group, camelCase name, CSS variable name,
 * and string value. Sorted lexicographically by `cssVar` for deterministic
 * output consumed by tooling, documentation generators, and the design
 * system preview page.
 *
 * @returns Sorted list of token entries.
 */
export function buildTokensJson(): ReadonlyArray<{
    group: string;
    name: string;
    cssVar: string;
    value: string;
}> {
    const entries: Array<{ group: string; name: string; cssVar: string; value: string }> = [];
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
            entries.push({ group, name: leafKey, cssVar, value: cssValue });
        }
    }

    entries.sort((left, right) => left.cssVar.localeCompare(right.cssVar));
    return entries;
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
 * Read the authored catalog stylesheet (`src/styles/catalog.css`) if present.
 *
 * The catalog file is tracked source; concatenation is deterministic — the
 * emitted `:root` block is always first, followed by exactly one LF-joined
 * catalog segment. No transformation is applied to the catalog source beyond
 * normalizing its trailing newline, so the author controls ordering and
 * comments deterministically.
 *
 * @param designRoot - Absolute path to `packages/design`.
 * @returns Catalog CSS text (with trailing LF) or empty string if absent.
 */
async function readCatalogCss(designRoot: string): Promise<string> {
    const catalogPath = path.join(designRoot, 'src', 'styles', 'catalog.css');
    try {
        const raw = await readFile(catalogPath, 'utf8');
        // Normalize: ensure exactly one trailing LF, CRLF → LF, no BOM.
        const normalized = raw.replace(/\r\n/g, '\n');
        return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
    } catch {
        return '';
    }
}

/**
 * Write `dist/design.css` deterministically.
 *
 * Output is the `:root` block (from {@link buildCssText}) concatenated
 * deterministically with the authored catalog segment
 * (`src/styles/catalog.css`) when present — one LF separator between them,
 * no timestamp, no BOM. Repeated builds from the same token table and
 * catalog source are byte-identical.
 *
 * @param designRoot - Absolute path to `packages/design` (defaults to resolved package root).
 * @returns Absolute path to the written file.
 */
export async function writeDesignCss(designRoot: string = resolveDesignRoot()): Promise<string> {
    const rootBlock = buildCssText();
    const catalog = await readCatalogCss(designRoot);
    const css = catalog.length > 0 ? `${rootBlock}\n${catalog}` : rootBlock;
    const outPath = path.join(designRoot, 'dist', 'design.css');
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, css, 'utf8');

    return outPath;
}

/**
 * CLI flag selecting JSON-only emission — writes only
 * `dist/tokens.json` (no `dist/design.css`). A
 * machine-readable representation of the complete token table (FR-006).
 */
const EMIT_JSON_FLAG = '--emit-json';

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    if (process.argv.includes(EMIT_JSON_FLAG)) {
        const entries = buildTokensJson();
        const designRoot = resolveDesignRoot();
        const outPath = path.join(designRoot, 'dist', 'tokens.json');
        await mkdir(path.dirname(outPath), { recursive: true });
        await writeFile(outPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
        console.log(`Wrote ${entries.length} entries to ${outPath}`);
    } else {
        await writeDesignCss();
    }
}
