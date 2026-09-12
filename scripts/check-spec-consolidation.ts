#!/usr/bin/env node
/**
 * check-spec-consolidation.ts — Guard against spec consolidation regressions.
 *
 * Enforces four invariants derived from spec 008 FR-013..FR-017:
 *
 *   (a) FR-013 — No duplicate numeric prefixes under `specs/`.
 *   (b) FR-014 — Every Implemented spec must carry both `plan.md` and `tasks.md`.
 *   (c) FR-015 — Every numbered spec directory must contain `spec.md`.
 *   (d) FR-016 — No tracked file references the legacy `.specify/features/` path
 *       (allowlisted exclusions: this script, 008 spec, coordination dir).
 *
 * Timing contract (FR-017): completes in under 10 seconds.
 *
 * Usage:
 *   tsx scripts/check-spec-consolidation.ts   # direct
 *   pnpm guard:specs                         # via root script
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const SPECS_DIR = 'specs';

// Files that may legitimately reference `.specify/features/`.
const ALLOWLIST: readonly string[] = [
    'scripts/check-spec-consolidation.ts',
    'specs/008-ci-workflows/spec.md',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a text file, returning null on any filesystem error. */
function readText(filePath: string): string | null {
    try {
        return readFileSync(filePath, 'utf-8');
    } catch {
        return null;
    }
}

/** Check whether a path is inside the `.specify/issue-139-doc-cleanup/` directory. */
function isIssueCoordinationDir(filePath: string): boolean {
    return filePath.startsWith('.specify/issue-139-doc-cleanup/');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let failed = false;

// Collect numbered spec directories (NNN-* pattern).
const specEntries = readdirSync(SPECS_DIR).filter((entry) => {
    const full = join(SPECS_DIR, entry);
    return statSync(full).isDirectory() && /^\d{3}-/.test(entry);
});

// --- (a) Duplicate numeric prefixes (FR-013) ---
const prefixCount = new Map<string, string[]>();
for (const entry of specEntries) {
    const prefix = entry.slice(0, 3);
    const existing = prefixCount.get(prefix) ?? [];
    existing.push(entry);
    prefixCount.set(prefix, existing);
}

for (const [prefix, dirs] of prefixCount) {
    if (dirs.length > 1) {
        process.stderr.write(
            `::error::FR-013: Duplicate spec prefix ${prefix}: ${dirs.join(', ')}\n`,
        );
        failed = true;
    }
}

// --- (b) Implemented without plan/tasks (FR-014) ---
const implementedRegex = /Status:\s*Implemented/;

for (const entry of specEntries) {
    const specMd = join(SPECS_DIR, entry, 'spec.md');
    const content = readText(specMd);
    if (content === null) {
        // Missing spec.md is caught by check (c); skip here to avoid double-reporting.
        continue;
    }
    if (!implementedRegex.test(content)) {
        continue;
    }

    const dir = join(SPECS_DIR, entry);
    const hasPlan = existsSync(join(dir, 'plan.md'));
    const hasTasks = existsSync(join(dir, 'tasks.md'));

    if (!hasPlan || !hasTasks) {
        const missing = [
            ...(!hasPlan ? ['plan.md'] : []),
            ...(!hasTasks ? ['tasks.md'] : []),
        ].join(', ');
        process.stderr.write(
            `::error::FR-014: Implemented spec ${entry} is missing: ${missing}\n`,
        );
        failed = true;
    }
}

// --- (c) Spec dir without spec.md (FR-015) ---
for (const entry of specEntries) {
    const specMd = join(SPECS_DIR, entry, 'spec.md');
    if (!existsSync(specMd)) {
        process.stderr.write(
            `::error::FR-015: Spec directory ${entry} is missing spec.md\n`,
        );
        failed = true;
    }
}

// --- (d) Legacy `.specify/features/` in tracked files (FR-016) ---
let gitLsOutput: string;
try {
    gitLsOutput = execFileSync('git', ['ls-files'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
    });
} catch (err) {
    process.stderr.write(
        `::error::FR-016: Failed to run 'git ls-files': ${String(err)}\n`,
    );
    process.exit(1);
}

const trackedFiles = gitLsOutput.split('\n').filter(Boolean);
const legacyPattern = '.specify/features/';

for (const file of trackedFiles) {
    if (!file.includes(legacyPattern)) {
        continue;
    }
    // Allowlist: this script, 008 spec, and issue coordination dir.
    if (
        ALLOWLIST.includes(file) ||
        isIssueCoordinationDir(file)
    ) {
        continue;
    }
    process.stderr.write(
        `::error::FR-016: Tracked file references legacy path: ${file}\n`,
    );
    failed = true;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

if (failed) {
    process.exit(1);
}

process.stdout.write('All spec consolidation checks passed.\n');
process.exit(0);
