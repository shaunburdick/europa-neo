/**
 * Vendor identity guard for the shareable design system (spec 012, T-017 / G-05).
 *
 * Asserts the vendored manual stylesheet `docs/manual/assets/design.css` is
 * byte-identical to `packages/design/dist/design.css` (FR-014). Failure names
 * both paths and their sha256 hashes so the stale copy is unambiguous.
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
    /** True when both files hash identically. */
    readonly ok: boolean;
    /** sha256 of the package stylesheet. */
    readonly designHash: string;
    /** sha256 of the vendored manual stylesheet. */
    readonly vendoredHash: string;
    /** Absolute path to the package stylesheet. */
    readonly designPath: string;
    /** Absolute path to the vendored stylesheet. */
    readonly vendoredPath: string;
}

/** Resolve the repository root from this script's location. */
function resolveRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, '..', '..', '..');
}

/**
 * Check byte identity of the two stylesheets.
 *
 * @param designPath - Package stylesheet (defaults to resolved path).
 * @param vendoredPath - Vendored manual stylesheet (defaults to resolved path).
 * @returns Hashes and whether they match.
 */
export async function checkVendorIdentity(
    designPath: string = path.join(resolveRepoRoot(), 'packages', 'design', 'dist', 'design.css'),
    vendoredPath: string = path.join(resolveRepoRoot(), 'docs', 'manual', 'assets', 'design.css'),
): Promise<VendorIdentityResult> {
    const [designBuf, vendoredBuf] = await Promise.all([readFile(designPath), readFile(vendoredPath)]);
    const designHash = sha256(designBuf);
    const vendoredHash = sha256(vendoredBuf);
    return {
        ok: designHash === vendoredHash,
        designHash,
        vendoredHash,
        designPath,
        vendoredPath,
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
        console.error('  remediation: run `pnpm --filter @europa/design build`');
        process.exit(1);
    }
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    await runMain();
}
