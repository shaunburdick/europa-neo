#!/usr/bin/env node
/**
 * check-orphaned-vitest-configs.ts — Guard against orphaned vitest config files.
 *
 * Ensures every `vitest.config*.ts` under `packages/` is referenced by at
 * least one npm script in its sibling `package.json` or one CI workflow in
 * `.github/workflows/`.  Unreferenced configs are likely dead configuration
 * that should be removed or wired up.
 *
 * Usage:
 *   tsx scripts/check-orphaned-vitest-configs.ts   # direct
 *   pnpm guard:config                              # via root script
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

const PACKAGES_DIR = 'packages';
const WORKFLOWS_DIR = '.github/workflows';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect files matching `vitest.config*.ts` under `dir`. */
function findVitestConfigs(dir: string): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const info = statSync(full);
        if (info.isDirectory()) {
            if (entry === 'node_modules') {
                continue;
            }
            results.push(...findVitestConfigs(full));
        } else if (/^vitest\.config.*\.ts$/.test(entry)) {
            results.push(full);
        }
    }
    return results;
}

/** Read a text file, returning null on any filesystem error. */
function readText(path: string): string | null {
    try {
        return readFileSync(path, 'utf-8');
    } catch {
        return null;
    }
}

/** Collect all text content from `.yml` / `.yaml` files in a directory. */
function readWorkflowContents(dir: string): string {
    if (!existsSync(dir)) {
        return '';
    }
    let combined = '';
    for (const entry of readdirSync(dir)) {
        if (!/\.ya?ml$/.test(entry)) {
            continue;
        }
        const content = readText(join(dir, entry));
        if (content !== null) {
            combined += content;
        }
    }
    return combined;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const configs = findVitestConfigs(PACKAGES_DIR);
const workflowText = readWorkflowContents(WORKFLOWS_DIR);

const orphaned: string[] = [];

for (const configPath of configs) {
    const configBasename = basename(configPath);
    const pkgDir = dirname(configPath);
    const pkgJsonPath = join(pkgDir, 'package.json');

    const pkgJson = readText(pkgJsonPath);
    const pkgReferencesConfig = pkgJson?.includes(configBasename);

    const workflowReferencesConfig = workflowText.includes(configBasename);

    if (!pkgReferencesConfig && !workflowReferencesConfig) {
        orphaned.push(configPath);
    }
}

if (orphaned.length > 0) {
    for (const p of orphaned) {
        const rel = relative(process.cwd(), p);
        process.stderr.write(
            `::error::Orphaned vitest config: ${rel} (not referenced by any npm script or CI workflow)\n`,
        );
    }
    process.exit(1);
}

process.stdout.write('All vitest configs are referenced.\n');
process.exit(0);
