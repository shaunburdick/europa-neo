/**
 * Deterministic CSS emitter for the shareable design system (spec 012,
 * T-006 / T-007) and Shadow DOM catalog stylesheet (T-001).
 *
 * Walks {@link TOKENS} in sorted key order, emits a single
 * `:root { --europa-*: value; }` block (LF, UTF-8, no BOM, no timestamp,
 * lexicographic order) and concatenates the authored catalog segment
 * (`src/styles/catalog.css`) deterministically, then writes
 * `dist/design.css`. Imported by the package `build` script as
 * `tsup && tsx scripts/build-css.ts` so repeated builds are byte-identical
 * for the same token table and catalog source.
 *
 * Catalog stylesheet (T-007): the file `src/styles/catalog.css` is tracked
 * source that defines every `europa-*` class family from FR-006. Each
 * declaration composes only `var(--europa-*)` (no hex/rgb literals outside
 * `:root`). The emitter keeps the catalog authored but deterministic — one
 * LF-joined concatenation after the `:root` block.
 *
 * Shadow DOM stylesheet (T-001): also emits `src/styles/catalog-styles.ts`
 * — a TypeScript module exporting the catalog CSS as a string literal
 * (without the `:root` token block). Custom properties inherit through
 * shadow boundaries so the `:root` block is unnecessary inside shadow
 * roots.
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
 * Remove the `:root { ... }` block from a CSS string.
 *
 * The block starts with `:root {` and ends at the matching closing `}`.
 * Only the first `:root` block is removed. If no `:root` block is found,
 * the input is returned unchanged.
 *
 * @param css - Raw CSS text.
 * @returns CSS text with the `:root` block stripped.
 */
function stripRootBlock(css: string): string {
    const rootStart = css.indexOf(':root {');
    if (rootStart === -1) {
        return css;
    }

    // Find the matching closing brace by counting nesting depth.
    const searchFrom = rootStart + ':root {'.length;
    let depth = 1;
    let end = searchFrom;

    while (end < css.length && depth > 0) {
        const ch = css.charAt(end);
        if (ch === '{') {
            depth++;
        } else if (ch === '}') {
            depth--;
        }
        end++;
    }

    // `end` now points past the closing `}`. Skip any trailing whitespace.
    while (end < css.length && (css[end] === '\n' || css[end] === '\r' || css[end] === ' ')) {
        end++;
    }

    return css.slice(0, rootStart) + css.slice(end);
}

/**
 * Emit `src/styles/catalog-styles.ts` — a TypeScript module exporting the
 * catalog CSS (without the `:root` block) as a string literal.
 *
 * Custom properties inherit through shadow boundaries, so the `:root` token
 * block is unnecessary inside shadow roots. The emitted module is consumed
 * by {@link EuropaElement.ensureShadowRoot} to construct a shared
 * `CSSStyleSheet` via `adoptedStyleSheets`.
 *
 * @param designRoot - Absolute path to `packages/design`.
 * @param catalogCss - Normalized catalog CSS text (from {@link readCatalogCss}).
 * @returns Absolute path to the written file.
 */
async function writeCatalogStylesModule(designRoot: string, catalogCss: string): Promise<string> {
    const stripped = stripRootBlock(catalogCss);
    const module = [
        '/**',
        ' * Catalog CSS rules for Shadow DOM adoption (T-001).',
        ' *',
        ' * Generated by `scripts/build-css.ts` — do not edit manually.',
        ' * The `:root` token block is excluded because CSS custom properties',
        ' * inherit through shadow boundaries.',
        ' */',
        'export const CATALOG_CSS: string =',
        `    ${JSON.stringify(stripped)};`,
        '',
    ].join('\n');

    const outPath = path.join(designRoot, 'src', 'styles', 'catalog-styles.ts');
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, module, 'utf8');
    return outPath;
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
 * Also emits `src/styles/catalog-styles.ts` (T-001) for Shadow DOM
 * adoption — the catalog CSS without the `:root` block.
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

    // T-001: emit the catalog styles module for Shadow DOM adoption.
    if (catalog.length > 0) {
        await writeCatalogStylesModule(designRoot, catalog);
    }

    return outPath;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    await writeDesignCss();
}
