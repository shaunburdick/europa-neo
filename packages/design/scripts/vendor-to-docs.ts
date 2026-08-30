/**
 * Vendoring helper for the shareable design system (spec 012, FR-014 / T-016).
 *
 * Copies `packages/design/dist/design.css` → `docs/manual/assets/design.css`
 * as a byte-identical, checked-in vendored asset so the Jekyll build
 * (`actions/jekyll-build-pages` `source: ./docs/manual`) serves the
 * shared stylesheet without widening artifact scope.
 *
 * Deterministic: raw byte copy (no re-encoding, no timestamp, no BOM).
 * Idempotent — running twice produces identical output and hashes. The
 * file is written with LF-ending bytes from the source, UTF-8.
 *
 * This stub is introduced in T-006 so the script exists alongside the
 * deterministic CSS emitter; full wiring (`build` → vendor) and the
 * Jekyll layout land in T-016. The copy is deliberately NOT invoked by
 * `scripts/build-css.ts` here so T-006 can stay scoped to `:root` vars
 * only (catalog classes come in T-007).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    return targetPath;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    await vendorToDocs();
}
