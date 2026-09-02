/**
 * Vendoring helper for the shareable design system and logo feature
 * (spec 012 FR-014 / spec 015 T-017).
 *
 * Copies `packages/design/dist/design.css` → `docs/manual/assets/design.css`
 * as a byte-identical, checked-in vendored asset and stages the selected brand
 * distribution files under `docs/manual/assets/brand/` so the Jekyll build
 * (`actions/jekyll-build-pages` `source: ./docs/manual`) serves the
 * shared stylesheet without widening artifact scope.
 *
 * Deterministic: raw byte copy (no re-encoding, no timestamp, no BOM).
 * Idempotent — running twice produces identical output and hashes. The
 * file is written with LF-ending bytes from the source, UTF-8.
 *
 * The package build invokes this script after generating the CSS and brand
 * distribution. The explicit `stage:manual` alias exposes the same
 * idempotent boundary to Pages and local callers.
 */

import { copyFile, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BRAND_MANIFEST } from '../src/brand/manifest.js';

/**
 * Resolve the repository root from this file's own location — never from
 * the process cwd (mirrors `packages/version/scripts/check-version-drift.ts`).
 *
 * `packages/design/scripts/` sits three levels below the repo root.
 *
 * @returns Absolute path to the repository root.
 */
function resolveRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, '..', '..', '..');
}

/**
 * Copy the built stylesheet to the vendored docs path, byte-identically.
 *
 * @param repoRoot - Absolute path to the repository root (defaults to resolved root).
 * @returns Absolute path to the vendored file.
 */
export async function vendorToDocs(repoRoot: string = resolveRepoRoot()): Promise<string> {
    const sourcePath = path.join(repoRoot, 'packages', 'design', 'dist', 'design.css');
    const targetPath = path.join(repoRoot, 'docs', 'manual', 'assets', 'design.css');
    const bytes = await readFile(sourcePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, bytes);
    await stageBrandToDocs({
        distributionDirectory: path.join(repoRoot, 'packages', 'design', 'dist', 'brand'),
        targetDirectory: path.join(repoRoot, 'docs', 'manual', 'assets', 'brand'),
    });
    return targetPath;
}

/** Options for the package-distribution-to-manual brand staging boundary. */
export interface BrandStagingOptions {
    /** The generated `@europa/design/dist/brand` directory. */
    readonly distributionDirectory: string;
    /** The manual's local `assets/brand` directory. */
    readonly targetDirectory: string;
}

const assetName = (assetPath: `brand/${string}`): string => assetPath.slice('brand/'.length);

/**
 * Stage exactly the manifest inventory from the built design distribution.
 *
 * The destination is replaced rather than merged: stale files, source masters,
 * and hand-authored competing copies cannot survive a successful stage. The
 * operation intentionally accepts directories for tests and future consumers,
 * while the production wrapper supplies only package-owned paths.
 *
 * @returns The sorted names written below the manual brand directory.
 */
export async function stageBrandToDocs(options: BrandStagingOptions): Promise<readonly string[]> {
    const expected = [...new Set(BRAND_MANIFEST.assets.map(({ path: assetPath }) => assetName(assetPath)))].sort();
    let sourceEntries: string[];
    try {
        sourceEntries = await readdir(options.distributionDirectory);
    } catch (error: unknown) {
        throw new Error(
            `Cannot stage manual brand assets: package distribution is unavailable at ${options.distributionDirectory}. ` +
                'Run `pnpm --filter @europa/design build` first.',
            { cause: error },
        );
    }
    const missing = expected.filter((name) => !sourceEntries.includes(name));
    if (missing.length > 0) {
        throw new Error(
            `Cannot stage manual brand assets: missing package distribution file(s): ${missing.join(', ')}. ` +
                'Run `pnpm --filter @europa/design build` first.',
        );
    }

    const sourceRoot = path.resolve(options.distributionDirectory);
    const sourcePaths = expected.map((name) => {
        const sourcePath = path.resolve(sourceRoot, name);
        if (path.dirname(sourcePath) !== sourceRoot) {
            throw new Error(`Cannot stage unsafe brand path: ${name}`);
        }
        return { name, sourcePath };
    });
    for (const { name, sourcePath } of sourcePaths) {
        const details = await lstat(sourcePath);
        if (!details.isFile() || details.isSymbolicLink()) {
            throw new Error(`Cannot stage package brand asset that is not a regular file: ${name}`);
        }
    }

    await rm(options.targetDirectory, { recursive: true, force: true });
    await mkdir(options.targetDirectory, { recursive: true });
    for (const { name, sourcePath } of sourcePaths) {
        await copyFile(sourcePath, path.join(options.targetDirectory, name));
    }
    return expected;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    await vendorToDocs();
}
