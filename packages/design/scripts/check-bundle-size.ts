/**
 * Bundle-size guard for the shareable design system (feature 014, T-013 / FR-025).
 *
 * Asserts `dist/components.js` gzip ≤ 15 KB (15,360 bytes). The components
 * bundle is emitted standalone (`tsup` second entry with `splitting: false`,
 * plan D-4), so the 15 KB budget is measurable on a single file.
 *
 * Exposed as `pnpm --filter @europa/design check:bundle-size`.
 *
 * Note: `dist/components.js` does not exist until the Wave 7 build (T-072)
 * produces it. Running this script before then fails with a "file missing"
 * message — that is the expected initial state; the guard is verified green
 * after the build (T-074).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** The gzip budget for `dist/components.js` in bytes (FR-025: ≤ 15 KB). */
export const BUNDLE_BUDGET_BYTES = 15_360;

/** Result of the bundle-size check. */
export interface BundleSizeResult {
    /** True when the gzipped bundle is within budget (or the file is absent). */
    readonly ok: boolean;
    /** Gzip byte count of `dist/components.js` (0 when the file is missing). */
    readonly gzipBytes: number;
}

/**
 * Resolve the package root from this file's own location — never from the
 * process cwd, so the check behaves identically no matter where it is invoked
 * from (mirrors `packages/design/scripts/build-css.ts`).
 *
 * `packages/design/scripts/` sits one level below the package root.
 *
 * @returns Absolute path to `packages/design`.
 */
function resolveDesignRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, '..');
}

/**
 * Assert `dist/components.js` gzip ≤ 15 KB (FR-025).
 *
 * Reads the built components bundle, computes its gzip size, and reports
 * whether it is within the 15,360-byte budget. A missing file is reported as
 * `ok: false` with `gzipBytes: 0` so the CLI can surface a clear "file
 * missing" failure before the Wave 7 build produces the bundle.
 *
 * @param componentsPath - Absolute path to `dist/components.js` (defaults to resolved package path).
 * @returns Whether the bundle is within budget and its gzip byte count.
 */
export function checkBundleSize(
    componentsPath: string = path.join(resolveDesignRoot(), 'dist', 'components.js'),
): BundleSizeResult {
    let buffer: Buffer;
    try {
        buffer = readFileSync(componentsPath);
    } catch {
        return { ok: false, gzipBytes: 0 };
    }
    const gzipBytes = gzipSync(buffer).length;
    return { ok: gzipBytes <= BUNDLE_BUDGET_BYTES, gzipBytes };
}

/**
 * CLI entry point: print the gzip byte count and a clear pass/fail message,
 * exiting non-zero when the bundle is over budget or missing. Extracted so the
 * failure path is unit-testable (constitution III).
 *
 * @param check - Check to run (defaults to {@link checkBundleSize}).
 */
export function runMain(check: () => BundleSizeResult = checkBundleSize): void {
    const result = check();
    if (!result.ok) {
        if (result.gzipBytes === 0) {
            console.error('FR-025: dist/components.js is missing — run `pnpm --filter @europa/design build` first');
        } else {
            console.error(
                `FR-025: dist/components.js gzip ${result.gzipBytes} B exceeds the ${BUNDLE_BUDGET_BYTES} B (15 KB) budget`,
            );
        }
        process.exit(1);
    }
    console.log(`FR-025: dist/components.js gzip ${result.gzipBytes} B ≤ ${BUNDLE_BUDGET_BYTES} B (15 KB) — OK`);
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    runMain();
}
