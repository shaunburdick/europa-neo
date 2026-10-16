#!/usr/bin/env node
/**
 * check-referenced-contract-files.ts — Guard against orphaned spec-side
 * contract mirrors (008 FR-033, issue #145 AC-3).
 *
 * Fails when any TypeScript contract file under `specs/<feature>/contracts/`
 * (any contracts/ segment at any depth) is not referenced by a test or
 * source file. "Referenced" means BOTH reference styles seen in the
 * shipped tree:
 *   (a) imports — a module specifier ending in the contract path
 *       (with or without the `.ts` suffix), and
 *   (b) explicit path-string mappings — the repo-relative `.ts` path
 *       appearing as a string literal (as in the console
 *       contract-conformance test's API_VERSION_SOURCES map).
 * Both reduce to: the repo-relative path (with or without `.ts`)
 * appears somewhere under `packages/` or `scripts/`.
 *
 * Scoping (008 FR-033): `.ts` files ONLY — prose `.md` contract
 * documents are documentation, not mirrors, and are never collected.
 * `specs/003-procedural-terrain-generation/contracts/` (README-only)
 * therefore passes vacuously; the deferred 64x64 terrain question
 * (issue #138) is untouched. As of 2026-10-13 no `.ts` file remains
 * under `specs/<feature>/contracts/` (hygiene pass #160 deleted every mirror),
 * so this guard ships vacuously green and exists as regression
 * protection against re-introducing an unreferenced hand-maintained
 * mirror.
 *
 * Usage:
 *   tsx scripts/check-referenced-contract-files.ts   # direct
 *   pnpm exec tsx scripts/check-referenced-contract-files.ts  # via verify.sh Phase 13
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO_ROOT = process.cwd();
const SPECS_DIR = 'specs';
const REFERENCE_ROOTS = ['packages', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);

/** Recursively collect files under `dir` where `want(relPath)` is true. */
function walk(dir: string, want: (relPath: string) => boolean, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry)) {
            continue;
        }
        const full = join(dir, entry);
        const rel = relative(REPO_ROOT, full);
        const info = statSync(full);
        if (info.isDirectory()) {
            walk(full, want, out);
        } else if (want(rel)) {
            out.push(rel);
        }
    }
    return out;
}

/** Every `.ts` file under a `contracts/` path segment inside specs/. */
function findSpecContractFiles(): string[] {
    return walk(join(REPO_ROOT, SPECS_DIR), (rel) => rel.split(sep).includes('contracts') && rel.endsWith('.ts'));
}

/** Concatenated text of every `.ts`/`.tsx` file under the reference roots. */
function readReferenceCorpus(): string {
    const parts: string[] = [];
    for (const root of REFERENCE_ROOTS) {
        const files = walk(join(REPO_ROOT, root), (rel) => rel.endsWith('.ts') || rel.endsWith('.tsx'));
        for (const file of files) {
            parts.push(readFileSync(file, 'utf-8'));
        }
    }
    return parts.join('\n');
}

const contractFiles = findSpecContractFiles();

if (contractFiles.length === 0) {
    process.stdout.write(
        'check-referenced-contract-files: OK — no .ts contract files under specs/ (vacuously green).\n',
    );
    process.exit(0);
}

const corpus = readReferenceCorpus();
const orphans = contractFiles.filter((file) => {
    const posixPath = file.split(sep).join('/');
    return !corpus.includes(posixPath) && !corpus.includes(posixPath.replace(/\.ts$/, ''));
});

if (orphans.length > 0) {
    process.stderr.write('check-referenced-contract-files: FAIL — unreferenced .ts contract files:\n');
    for (const orphan of orphans) {
        process.stderr.write(`  ${orphan.split(sep).join('/')}\n`);
    }
    process.stderr.write('Every spec-side .ts contract file must be imported or path-string-mapped by\n');
    process.stderr.write('a test or source file (008 FR-033). Spec-side mirrors are otherwise forbidden\n');
    process.stderr.write('(single-sourcing rulings: 001 v1.17 FR-027, 004 v1.13 FR-029, 006 v1.10 FR-027).\n');
    process.exit(1);
}

process.stdout.write(
    `check-referenced-contract-files: OK — all ${contractFiles.length} .ts contract file(s) under specs/ are referenced.\n`,
);
