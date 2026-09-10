/**
 * Vendor identity guard for the shareable design system (spec 012, T-017 / G-05).
 *
 * Asserts both vendored manual stylesheets — `docs/manual/assets/design.css`
 * (the G-05 target) and `docs/manual/public/design.css` (the copy the Astro
 * manual serves) — are byte-identical to `packages/design/dist/design.css`
 * (FR-014). Failure names every path and its sha256 hash so the stale copy
 * is unambiguous.
 *
 * Exposed as `pnpm --filter @europa/design check:vendor-identity`.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Compute the sha256 hex digest of a buffer. */
export function sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
}

/** Result of the vendor identity check. */
export interface VendorIdentityResult {
    /** True when all three files hash identically. */
    readonly ok: boolean;
    /** sha256 of the package stylesheet. */
    readonly designHash: string;
    /** sha256 of the vendored manual stylesheet (assets/). */
    readonly vendoredHash: string;
    /** sha256 of the served manual stylesheet (public/). */
    readonly servedHash: string;
    /** Absolute path to the package stylesheet. */
    readonly designPath: string;
    /** Absolute path to the vendored stylesheet. */
    readonly vendoredPath: string;
    /** Absolute path to the served stylesheet. */
    readonly servedPath: string;
}

/** Resolve the repository root from this script's location. */
function resolveRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, '..', '..', '..');
}

/**
 * Check byte identity of the three stylesheets.
 *
 * @param designPath - Package stylesheet (defaults to resolved path).
 * @param vendoredPath - Vendored manual stylesheet (defaults to resolved path).
 * @param servedPath - Served manual stylesheet (defaults to resolved path).
 * @returns Hashes and whether they all match.
 */
export async function checkVendorIdentity(
    designPath: string = path.join(resolveRepoRoot(), 'packages', 'design', 'dist', 'design.css'),
    vendoredPath: string = path.join(resolveRepoRoot(), 'docs', 'manual', 'assets', 'design.css'),
    servedPath: string = path.join(resolveRepoRoot(), 'docs', 'manual', 'public', 'design.css'),
): Promise<VendorIdentityResult> {
    const [designBuf, vendoredBuf, servedBuf] = await Promise.all([
        readFile(designPath),
        readFile(vendoredPath),
        readFile(servedPath),
    ]);
    const designHash = sha256(designBuf);
    const vendoredHash = sha256(vendoredBuf);
    const servedHash = sha256(servedBuf);
    return {
        ok: designHash === vendoredHash && designHash === servedHash,
        designHash,
        vendoredHash,
        servedHash,
        designPath,
        vendoredPath,
        servedPath,
    };
}

/**
 * CLI entry point: print both hashes and exit non-zero when the vendored copy
 * differs. Extracted so the failure path is unit-testable (constitution III).
 *
 * @param check - Check to run (defaults to {@link checkVendorIdentity}).
 */
export async function runMain(check: () => Promise<VendorIdentityResult> = checkVendorIdentity): Promise<void> {
    const result = await check();
    if (!result.ok) {
        console.error('G-05: vendored stylesheet differs from the package source');
        console.error(`  source:   ${result.designPath} (${result.designHash})`);
        console.error(`  vendored: ${result.vendoredPath} (${result.vendoredHash})`);
        console.error(`  served:   ${result.servedPath} (${result.servedHash})`);
        console.error('  remediation: run `pnpm --filter @europa/design build`');
        process.exit(1);
    }
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    await runMain();
}
