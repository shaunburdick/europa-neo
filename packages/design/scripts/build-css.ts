/**
 * Deterministic CSS emitter for the shareable design system (spec 012,
 * T-006 / T-007) and Shadow DOM catalog stylesheet (T-001).
 *
 * Walks {@link TOKENS} in sorted key order, emits a single
 * `:root { --europa-*: value; }` block (LF, UTF-8, no BOM, no timestamp,
 * lexicographic order) and concatenates the authored catalog segment
 * (`src/styles/catalog.css`) deterministically, then writes
 * `dist/design.css`. Imported by the package `build` script so repeated
 * builds are byte-identical for the same token table and catalog source.
 *
 * The `build` script is two-phase because `src/components/base.ts` imports
 * the generated `src/styles/catalog-styles.ts` module (below): `tsup` cannot
 * bundle a fresh clone without it, yet `tsup`'s `clean: true` would delete a
 * pre-existing `dist/design.css`. The script therefore runs
 * 1. `build-css.ts --emit-module` — generate ONLY the module (tsup input),
 * 2. `tsup` — clean `dist/` and bundle,
 * 3. `build-css.ts` (full mode) — write `dist/design.css` for the final dist.
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
 * Emit ONLY `src/styles/catalog-styles.ts` — the module-only build mode
 * (CLI flag `--emit-module`).
 *
 * The package `build` script runs this mode before `tsup` because
 * `src/components/base.ts` imports the generated module: on a fresh clone
 * the file does not exist (it is gitignored — generated files are never
 * tracked), so bundling must be preceded by generation. This mode
 * deliberately skips `dist/design.css` — `tsup` runs immediately after with
 * `clean: true` and would delete it; the full mode (no flag) writes the
 * dist stylesheet once `tsup` has finished.
 *
 * Unlike {@link writeDesignCss}, which tolerates an absent catalog by
 * skipping the module emission, this mode fails loudly: the generated
 * module is a hard build input for `tsup`, so a missing or empty
 * `catalog.css` (tracked source) cannot produce a meaningful build.
 *
 * The emitted module is byte-identical to the one written by the full mode
 * — both go through {@link readCatalogCss} and {@link writeCatalogStylesModule}.
 *
 * @param designRoot - Absolute path to `packages/design` (defaults to resolved package root).
 * @returns Absolute path to the written module.
 * @throws Error when `src/styles/catalog.css` is missing or empty.
 */
export async function emitCatalogStylesModule(designRoot: string = resolveDesignRoot()): Promise<string> {
    const catalog = await readCatalogCss(designRoot);
    if (catalog.length === 0) {
        throw new Error(
            'src/styles/catalog.css is missing or empty — cannot emit src/styles/catalog-styles.ts ' +
                '(the generated module is a tsup build input and must exist before bundling).',
        );
    }
    return writeCatalogStylesModule(designRoot, catalog);
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

/**
 * CLI flag selecting module-only emission — writes only
 * `src/styles/catalog-styles.ts` (no `dist/design.css`). Used by the
 * package `build` script's pre-`tsup` generation pass; see
 * {@link emitCatalogStylesModule}.
 */
const EMIT_MODULE_FLAG = '--emit-module';

/**
 * CLI flag selecting JSON-only emission — writes only
 * `dist/tokens.json` (no `dist/design.css`, no catalog module). A
 * machine-readable representation of the complete token table (FR-006).
 */
const EMIT_JSON_FLAG = '--emit-json';

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    if (process.argv.includes(EMIT_MODULE_FLAG)) {
        await emitCatalogStylesModule();
    } else if (process.argv.includes(EMIT_JSON_FLAG)) {
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
