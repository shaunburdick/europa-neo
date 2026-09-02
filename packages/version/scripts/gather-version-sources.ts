/**
 * Filesystem gathering half of the version drift check (feature 009,
 * FR-009 / plan §6).
 *
 * The pure comparison logic lives in `../src/check-version-drift`;
 * this module extracts one {@link VersionSource} observation per guarded
 * surface from a directory tree so the checker can compare them. The CLI
 * entry point (`scripts/check-version-drift.ts`) wires the two together.
 *
 * (This module lives under `scripts/` rather than `src/` because it is
 * the only I/O-bound code in the package and must stay out of the shipped
 * `dist/` surface; the coverage config explicitly includes it so SC-006
 * still measures it.)
 *
 * Guarded surfaces, in gather order (also the mismatch-report order):
 *
 * 1. `<root>/package.json` — the single-source-of-truth version field.
 * 2. every `<root>/packages/<name>/package.json` — every workspace package,
 *    readdir order **sorted** so reports are deterministic (FR-009 names
 *    every offender; stable order lets humans diff CI logs).
 * 3. the `constant` source — labeled {@link CONSTANT_SOURCE_FILE}, carrying
 *    whatever version the CALLER supplies.
 * 4. `<root>/README.md` — the release line pinned by
 *    {@link README_RELEASE_LINE_PATTERN}.
 * 5. `<root>/docs/manual/src/pages/index.mdx` — the footer line pinned by
 *    {@link MANUAL_INDEX_FOOTER_PATTERN}.
 * 6. `<root>/DESIGN.md` — the version header pinned by
 *    {@link DESIGN_VERSION_PATTERN} (spec 012 FR-020 / G-06). The design
 *    contract is a guarded surface so a stale header fails CI naming the
 *    file, exactly like any package version drift.
 *
 * ## How the constant resolves under `--root` fixtures
 *
 * The constant is the *compiled-in* release identity (plan AD-1): callers
 * import `APP_VERSION` from `../src/index` and pass it here. Pointing the
 * gatherer at another root (the CLI's `--root`) swaps the SURFACES only —
 * the expectation still comes from the code under test. Fixture trees
 * therefore carry surfaces agreeing with the real constant, and a stub
 * copy of this package inside a fixture is neither read nor required.
 *
 * ## Documented edge-case choices
 *
 * - Any read failure on a REQUIRED surface (root package, README, manual
 *   index) yields a `null` version observation — reported as a mismatch
 *   naming the file — rather than a thrown error, so one bad file cannot
 *   hide the state of the others (FR-009: report everything).
 * - A missing `<root>/packages/` directory yields zero workspace
 *   observations (nothing there is guarded).
 * - A `packages/<dir>/` directory WITHOUT a `package.json` is skipped: it
 *   is not a workspace package, so FR-009 does not guard it. Other read
 *   failures on an existing workspace `package.json` (e.g., it is a
 *   directory, or unreadable) yield `null` observations like any required
 *   surface.
 * - Doc-line matching is position-insensitive: the pattern may appear on
 *   any line. Plan §5 defines the literal formats; anchoring to "last
 *   line" would make the checker brittle against unrelated trailing
 *   content while adding no drift protection.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { DriftMismatch, VersionSource, VersionSourceKind } from '../src/check-version-drift';

/**
 * Repo-relative label reported for the `constant` source. It names the
 * real constant module's location in THIS repository, regardless of which
 * root the other surfaces were gathered from.
 */
export const CONSTANT_SOURCE_FILE = 'packages/version/src/app-version.ts';

/**
 * README header line (plan §5): `Current release: **vX.Y.Z**`.
 * Capture group 1 is the raw semver WITHOUT the display `v` prefix,
 * ready for direct equality comparison against `APP_VERSION`.
 */
export const README_RELEASE_LINE_PATTERN = /^Current release:\s*\*\*v(\d+\.\d+\.\d+)\*\*[ \t]*$/m;

/**
 * Player-manual index footer line (Astro migration): the
 * `<europa-typography>` component renders the version footer. The pattern
 * captures the raw semver WITHOUT the display `v` prefix, matching the
 * source `.mdx` content.
 */
export const MANUAL_INDEX_FOOTER_PATTERN = />This manual documents Europa Neo v(\d+\.\d+\.\d+)\.<\/europa-typography>/m;

/**
 * `DESIGN.md` version header line (spec 012 FR-020 / contracts §5):
 * `> **Version**: `0.1.0``. Capture group 1 is the raw semver WITHOUT the
 * display backticks, ready for direct equality comparison against
 * `APP_VERSION`. The pattern tolerates the quoted or unquoted form and also
 * matches the `<!-- Version: 0.1.0 -->` HTML-comment fallback present in the
 * file, so either marker pins the value. The regex is the canonical G-06
 * marker defined in `specs/012-design-system/contracts/design-system.contract.md`.
 */
export const DESIGN_VERSION_PATTERN = /Version:\s*`?(?<v>\d+\.\d+\.\d+)`?/m;

/** The only field this package cares about in a parsed `package.json`. */
interface PackageJsonShape {
    /** Declared package version; may be absent or of any type in malformed files. */
    readonly version?: unknown;
}

/**
 * Narrow parsed JSON to an object shaped like a `package.json`.
 *
 * @param value - The parsed JSON value.
 * @returns Whether it is a non-array object (safe to read `version` from).
 */
function isPackageJsonLike(value: unknown): value is PackageJsonShape {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extract the `version` field from raw `package.json` text.
 *
 * @param raw - Full file contents.
 * @returns The version string, or `null` when the JSON is malformed, not
 *          an object, or carries no string `version` field.
 */
function extractPackageVersion(raw: string): string | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isPackageJsonLike(parsed)) {
        return null;
    }
    const version = parsed.version;
    return typeof version === 'string' ? version : null;
}

/**
 * Extract the version token from document text using one of the plan §5
 * patterns.
 *
 * @param content - Full document contents.
 * @param pattern - A doc-surface pattern whose capture group 1 is the raw semver.
 * @returns The captured version, or `null` when no line matches.
 */
function extractDocVersion(content: string, pattern: RegExp): string | null {
    return pattern.exec(content)?.[1] ?? null;
}

/**
 * True when the thrown value is a Node ENOENT (file/directory absent).
 *
 * @param error - Anything thrown by a filesystem call.
 * @returns Whether the error signals plain absence.
 */
function isEnoent(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/**
 * Read one surface file and turn its contents into a version observation.
 * Every read failure becomes a `null` observation (see module docs) —
 * gathering never throws for absent or unreadable files.
 *
 * @param rootDir - Directory the display path is relative to.
 * @param relativeFile - Repo-style POSIX relative path (also the mismatch label).
 * @param kind - Which guarded surface this is.
 * @param transform - Parses raw file text into a version (or `null`).
 * @returns The observation for this surface.
 */
async function readSurface(
    rootDir: string,
    relativeFile: string,
    kind: VersionSourceKind,
    transform: (raw: string) => string | null,
): Promise<VersionSource> {
    const absoluteFile = path.join(rootDir, ...relativeFile.split('/'));
    try {
        return { kind, file: relativeFile, version: transform(await readFile(absoluteFile, 'utf8')) };
    } catch {
        return { kind, file: relativeFile, version: null };
    }
}

/**
 * Gather observations for every workspace `package.json` under the root's
 * `packages/` directory, sorted by directory name for deterministic
 * reporting.
 *
 * @param packagesDir - Absolute path to the `packages/` directory.
 * @returns One observation per workspace package (possibly zero).
 * @throws Only for genuinely unexpected `readdir` failures (absence is handled).
 */
async function gatherWorkspacePackages(packagesDir: string): Promise<VersionSource[]> {
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
        entries = await readdir(packagesDir, { withFileTypes: true });
    } catch {
        // No packages/ directory: nothing there is guarded (module docs).
        return [];
    }

    const packageDirs = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

    const sources: VersionSource[] = [];
    for (const name of packageDirs) {
        const relativeFile = `packages/${name}/package.json`;
        const absoluteFile = path.join(packagesDir, name, 'package.json');
        let raw: string;
        try {
            raw = await readFile(absoluteFile, 'utf8');
        } catch (error) {
            if (isEnoent(error)) {
                // A directory without package.json is not a workspace package.
                continue;
            }
            // Existing-but-unreadable (or EISDIR): report it like any broken surface.
            sources.push({ kind: 'workspace-package', file: relativeFile, version: null });
            continue;
        }
        sources.push({ kind: 'workspace-package', file: relativeFile, version: extractPackageVersion(raw) });
    }
    return sources;
}

/**
 * Gather one {@link VersionSource} per guarded surface under `rootDir`,
 * in the documented gather order (see module docs).
 *
 * The constant observation carries `constantVersion` verbatim — callers
 * pass the compiled-in `APP_VERSION` (see "How the constant resolves"
 * in the module docs).
 *
 * @param rootDir - Absolute path to the tree to inspect (repo root, or a
 *                  fixture root via the CLI's `--root`).
 * @param constantVersion - The compiled-in application version.
 * @returns Observations ready for {@link checkVersionDrift}; mismatch
 *          order follows this gather order.
 */
export async function gatherVersionSources(rootDir: string, constantVersion: string): Promise<VersionSource[]> {
    const sources: VersionSource[] = [];

    sources.push(await readSurface(rootDir, 'package.json', 'root-package', extractPackageVersion));
    sources.push(...(await gatherWorkspacePackages(path.join(rootDir, 'packages'))));
    sources.push({ kind: 'constant', file: CONSTANT_SOURCE_FILE, version: constantVersion });
    sources.push(
        await readSurface(rootDir, 'README.md', 'readme', (raw) => extractDocVersion(raw, README_RELEASE_LINE_PATTERN)),
    );
    sources.push(
        await readSurface(rootDir, 'docs/manual/src/pages/index.mdx', 'manual-index', (raw) =>
            extractDocVersion(raw, MANUAL_INDEX_FOOTER_PATTERN),
        ),
    );
    sources.push(
        await readSurface(rootDir, 'DESIGN.md', 'design-md', (raw) => extractDocVersion(raw, DESIGN_VERSION_PATTERN)),
    );

    return sources;
}

/**
 * Format one mismatch as the CLI's stderr line (one per offending file).
 *
 * Shape: `mismatch: <file> expected <expected> but found <actual>` — with
 * `found nothing (surface missing or unparseable)` standing in when the
 * observation was `null`.
 *
 * @param mismatch - The disagreeing surface to render.
 * @returns The complete stderr line (no trailing newline).
 */
export function formatMismatchLine(mismatch: DriftMismatch): string {
    const actual = mismatch.actual === null ? 'nothing (surface missing or unparseable)' : mismatch.actual;
    return `mismatch: ${mismatch.file} expected ${mismatch.expected} but found ${actual}`;
}
