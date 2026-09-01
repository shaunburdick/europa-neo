/**
 * G-10 drift guard for shared UI web components (spec 014, T-012 / FR-020).
 *
 * Asserts every registered `europa-*` custom element has a corresponding
 * entry in `DESIGN.md` section 2 (the web-component table added in Wave 6),
 * and vice versa. Fails naming the missing or extra tag.
 *
 * The web-component subsection in DESIGN.md § 2 does not exist until Wave 6
 * (T-067). When run before that wave the script correctly reports all
 * registered tags as "missing in DESIGN.md" — that is the expected initial
 * state.
 *
 * Registered tags are extracted from `registry.ts` as **text** (regex) rather
 * than importing the module, because the registry imports component classes
 * that extend `HTMLElement` — which is undefined in Node.js.
 *
 * Exposed as `pnpm --filter @europa/design check:component-catalog`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Result of the component catalog drift check. */
export interface ComponentCatalogResult {
    /** True when registered and documented tag sets are equal. */
    readonly ok: boolean;
    /** Tags present in registry but absent from DESIGN.md § 2. */
    readonly missing: string[];
    /** Tags present in DESIGN.md § 2 but absent from registry. */
    readonly extra: string[];
}

/** Regex matching a `europa-*` custom element tag name. */
const TAG_PATTERN = /europa-[a-z][a-z0-9-]*/g;

/**
 * Regex matching the `tag: '...'` property in a `ComponentDefinition` entry
 * inside `registry.ts`. Captures the tag name string (group 1).
 *
 * Example match: `tag: 'europa-button'` → captures `europa-button`.
 */
const REGISTRY_TAG_PATTERN = /tag:\s*['"]([^'"]+)['"]/g;

/**
 * Extract `europa-*` tag names from `registry.ts` source text.
 *
 * Parses the file as plain text and matches every `tag: '...'` or
 * `tag: "..."` line in the `REGISTRY` array, avoiding any runtime import
 * of the component classes (which require a DOM environment).
 *
 * @param registrySource - Full text of `registry.ts`.
 * @returns Sorted unique tag names found in the registry source.
 */
export function extractRegisteredTags(registrySource: string): string[] {
    const tags = new Set<string>();
    const matches = registrySource.matchAll(REGISTRY_TAG_PATTERN);
    for (const match of matches) {
        const tag = match[1];
        if (tag !== undefined) {
            tags.add(tag);
        }
    }

    return [...tags].sort();
}

/**
 * Extract documented `europa-*` tag names from DESIGN.md section 2.
 *
 * Scopes to the text between `## 2.` and `## 3.` headers, then matches
 * every `europa-[a-z][a-z0-9-]*` occurrence and returns the unique set
 * sorted lexicographically.
 *
 * @param designMd - Full text of DESIGN.md.
 * @returns Sorted unique tag names found in section 2.
 */
export function extractDocumentedTags(designMd: string): string[] {
    const section2Start = designMd.indexOf('## 2.');
    const section3Start = designMd.indexOf('## 3.');

    if (section2Start === -1) {
        return [];
    }

    const end = section3Start !== -1 ? section3Start : designMd.length;
    const section2Text = designMd.slice(section2Start, end);

    const tags = new Set<string>();
    const matches = section2Text.matchAll(TAG_PATTERN);
    for (const match of matches) {
        if (match[0] !== undefined) {
            tags.add(match[0]);
        }
    }

    return [...tags].sort();
}

/**
 * Resolve the path to `registry.ts` relative to the repo root.
 */
function resolveRegistryPath(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, '..', 'src', 'components', 'registry.ts');
}

/** Resolve the repository root from this script's location. */
function resolveRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, '..', '..', '..');
}

/**
 * Assert every registered `europa-*` custom element has a corresponding
 * entry in `DESIGN.md` section 2, and vice versa. Fails naming the
 * missing/extra tag.
 *
 * Registered tags are extracted by reading `registry.ts` as text and
 * matching `tag: '...'` entries, avoiding any import of the component
 * classes that depend on `HTMLElement`.
 *
 * @param designMdPath - Absolute path to DESIGN.md (defaults to repo root).
 * @returns Set-equality result with `missing` (registered but undocumented)
 *   and `extra` (documented but unregistered) tag lists.
 */
export function checkComponentCatalog(
    designMdPath: string = path.join(resolveRepoRoot(), 'DESIGN.md'),
): ComponentCatalogResult {
    let registeredTags: string[];
    try {
        const registrySource = readFileSync(resolveRegistryPath(), 'utf8');
        registeredTags = extractRegisteredTags(registrySource);
    } catch {
        // If registry.ts cannot be read, there are no registered tags.
        registeredTags = [];
    }

    let documentedTags: string[];
    try {
        const designMd = readFileSync(designMdPath, 'utf8');
        documentedTags = extractDocumentedTags(designMd);
    } catch {
        // If DESIGN.md cannot be read, every registered tag is missing.
        documentedTags = [];
    }

    const registeredSet = new Set(registeredTags);
    const documentedSet = new Set(documentedTags);

    const missing = registeredTags.filter((tag) => !documentedSet.has(tag));
    const extra = documentedTags.filter((tag) => !registeredSet.has(tag));

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
            console.error(`registered but not in DESIGN.md: ${tag}`);
        }
        process.exit(1);
    }
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    runMain();
}
