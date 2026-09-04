/**
 * G-10 drift guard for React components (spec 014, T-012 / FR-020).
 *
 * Asserts every React component exported from the `@europa/design/components`
 * barrel has a corresponding entry in `DESIGN.md` section 2 (the React
 * component table), and vice versa. Fails naming the missing or extra tag.
 *
 * The React component subsection in DESIGN.md § 2 does not exist until Wave 6
 * (T-067). When run before that wave the script correctly reports all
 * exported tags as "missing in DESIGN.md" — that is the expected initial
 * state.
 *
 * Component tags are extracted from the barrel `src/components/index.ts` as
 * **text** (regex) rather than importing the module, because the components
 * depend on React and JSX — which are not directly importable in Node.js
 * without a bundler.
 *
 * Exposed as `pnpm --filter @europa/design check:component-catalog`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Result of the component catalog drift check. */
export interface ComponentCatalogResult {
    /** True when exported and documented tag sets are equal. */
    readonly ok: boolean;
    /** Tags present in barrel exports but absent from DESIGN.md § 2. */
    readonly missing: string[];
    /** Tags present in DESIGN.md § 2 but absent from barrel exports. */
    readonly extra: string[];
}

/**
 * Regex matching component export names in the barrel `index.ts`. Captures
 * the component name (group 1) — e.g. `EuropaButton`, `EuropaTroopChip`.
 *
 * Matches lines like: `export { EuropaButton, type EuropaButtonProps } from ...`
 * Only matches component exports (uppercase after `Europa`), not type exports
 * (which start with `type `).
 */
const BARREL_COMPONENT_PATTERN = /export\s*\{\s*(Europa[A-Z][a-zA-Z0-9]*)/g;

/**
 * Convert a PascalCase React component name to a kebab-case tag name.
 *
 * Strips the `Europa` prefix and converts the remainder to kebab-case.
 * Multi-word names like `ElevationSwatch` become `elevation-swatch`.
 *
 * @param componentName - PascalCase name, e.g. `EuropaButton`, `EuropaElevationSwatch`.
 * @returns Kebab-case tag name, e.g. `europa-button`, `europa-elevation-swatch`.
 */
export function toKebabTag(componentName: string): string {
    const withoutPrefix = componentName.startsWith('Europa') ? componentName.slice('Europa'.length) : componentName;
    // Insert hyphen before each uppercase letter that follows a lowercase letter
    // or before a sequence of uppercase letters followed by a lowercase letter.
    const kebab = withoutPrefix
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
    return `europa-${kebab}`;
}

/**
 * Extract `europa-*` tag names from the React barrel `src/components/index.ts`.
 *
 * Parses the file as plain text and matches every `export { Europa*` line,
 * converting each component name to its kebab-case tag equivalent. Avoids any
 * runtime import of the component modules (which require React/JSX).
 *
 * @param barrelSource - Full text of `src/components/index.ts`.
 * @returns Sorted unique tag names derived from the barrel exports.
 */
export function extractExportedTags(barrelSource: string): string[] {
    const tags = new Set<string>();
    const matches = barrelSource.matchAll(BARREL_COMPONENT_PATTERN);
    for (const match of matches) {
        const componentName = match[1];
        if (componentName !== undefined) {
            tags.add(toKebabTag(componentName));
        }
    }

    return [...tags].sort();
}

/**
 * Extract documented `europa-*` tag names from the React component subsection
 * of DESIGN.md § 2.
 *
 * Scopes to the text between `### React components (spec 014)` and the next
 * `---` separator (or `## 3.` as fallback).  Only the **first table column**
 * (the Tag column) is scanned, so event names like `europa-close` in the
 * Events column are not picked up as component tags.
 *
 * @param designMd - Full text of DESIGN.md.
 * @returns Sorted unique tag names found in the React component subsection.
 */
export function extractDocumentedTags(designMd: string): string[] {
    const subsectionStart = designMd.indexOf('### React components (spec 014)');
    if (subsectionStart === -1) {
        return [];
    }

    // Find the end boundary: the first `---` after the subsection start,
    // falling back to `## 3.` or end-of-file.
    const afterStart = designMd.slice(subsectionStart);
    const hrIndex = afterStart.indexOf('\n---');
    const section3Index = designMd.indexOf('## 3.', subsectionStart);

    let endOffset: number;
    if (hrIndex !== -1) {
        endOffset = subsectionStart + hrIndex;
    } else if (section3Index !== -1) {
        endOffset = section3Index;
    } else {
        endOffset = designMd.length;
    }

    const subsectionText = designMd.slice(subsectionStart, endOffset);

    const tags = new Set<string>();
    // Each row in the React component table starts with `| \`europa-...\``
    // (the Tag column).  This avoids matching event names in later columns.
    const tagRowPattern = /^\|\s*`(europa-[a-z][a-z0-9-]*)`/gm;
    const matches = subsectionText.matchAll(tagRowPattern);
    for (const match of matches) {
        if (match[1] !== undefined) {
            tags.add(match[1]);
        }
    }

    return [...tags].sort();
}

/**
 * Resolve the path to the React barrel `src/components/index.ts` relative
 * to the package root.
 */
function resolveBarrelPath(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, '..', 'src', 'components', 'index.ts');
}

/** Resolve the repository root from this script's location. */
function resolveRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, '..', '..', '..');
}

/**
 * Assert every exported React component has a corresponding entry in
 * `DESIGN.md` section 2, and vice versa. Fails naming the missing/extra tag.
 *
 * Component tags are extracted by reading the barrel `index.ts` as text and
 * matching `export { Europa*` lines, converting each PascalCase name to a
 * kebab-case tag — avoiding any import of the component modules that depend
 * on React.
 *
 * @param designMdPath - Absolute path to DESIGN.md (defaults to repo root).
 * @returns Set-equality result with `missing` (exported but undocumented)
 *   and `extra` (documented but unexported) tag lists.
 */
export function checkComponentCatalog(
    designMdPath: string = path.join(resolveRepoRoot(), 'DESIGN.md'),
): ComponentCatalogResult {
    let exportedTags: string[];
    try {
        const barrelSource = readFileSync(resolveBarrelPath(), 'utf8');
        exportedTags = extractExportedTags(barrelSource);
    } catch {
        // If the barrel cannot be read, there are no exported tags.
        exportedTags = [];
    }

    let documentedTags: string[];
    try {
        const designMd = readFileSync(designMdPath, 'utf8');
        documentedTags = extractDocumentedTags(designMd);
    } catch {
        // If DESIGN.md cannot be read, every exported tag is missing.
        documentedTags = [];
    }

    const exportedSet = new Set(exportedTags);
    const documentedSet = new Set(documentedTags);

    const missing = exportedTags.filter((tag) => !documentedSet.has(tag));
    const extra = documentedTags.filter((tag) => !exportedSet.has(tag));

    return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

/**
 * CLI entry point: print every discrepancy and exit non-zero on mismatch.
 * Extracted so the failure path is unit-testable (constitution III).
 *
 * @param check - Check to run (defaults to {@link checkComponentCatalog}).
 */
export function runMain(check: () => ComponentCatalogResult = checkComponentCatalog): void {
    const result = check();
    if (!result.ok) {
        for (const tag of result.missing) {
            console.error(`missing in DESIGN.md: ${tag}`);
        }
        for (const tag of result.extra) {
            console.error(`in DESIGN.md but not exported: ${tag}`);
        }
        process.exit(1);
    }
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    runMain();
}
