/**
 * Identity Migration Guard — Issue #74 (Wave 0, T003)
 *
 * Regression guard that scans ALL package source files for patterns
 * that must NOT exist after the numeric PlayerId migration:
 *
 *   1. Direct runtime `nanoid` imports (CSPRNG must be injected, never imported)
 *   2. Numeric `PlayerId` literal casts (`as PlayerId`) in SOURCE files
 *      (test files are excluded — they need numeric fixtures during transition)
 *   3. Authoritative `localeCompare` in runtime ordering paths
 *      (build scripts and tests are excluded)
 *   4. `GuestPlayerId` numeric literal assignments in source
 *
 * This test lives in `@europa/core` because core owns the `PlayerId` type
 * and has zero workspace dependencies — it runs first in any test order.
 *
 * If this test fires:
 *   1. Read the failing pattern description below.
 *   2. Fix the source file to comply (replace the pattern).
 *   3. NEVER add a suppression or skip - fix the code.
 *   4. The guard exists to catch regressions; weakening it defeats its purpose.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Packages to scan (all workspace packages with src/ directories). */
const PACKAGES = [
    'core',
    'engine',
    'terrain',
    'fog',
    'networking',
    'matchmaking',
    'console',
    'design',
    'version',
    'logging',
] as const;

/** Repo root (3 levels up from packages/core/tests/). */
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** File extensions to scan. */
const TS_EXTENSIONS = new Set(['.ts', '.tsx']);

/** Directories to skip within each package. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '__screenshots__']);

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively collect all `.ts`/`.tsx` files under a directory,
 * skipping common non-source directories.
 */
function collectFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
            if (!SKIP_DIRS.has(entry)) {
                results.push(...collectFiles(full));
            }
        } else if (TS_EXTENSIONS.has(getExtension(entry))) {
            results.push(full);
        }
    }
    return results;
}

function getExtension(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.slice(dot) : '';
}

/** Collect source files (packages/PKG/src/) across all packages. */
function getSourceFiles(): string[] {
    const files: string[] = [];
    for (const pkg of PACKAGES) {
        const srcDir = join(REPO_ROOT, 'packages', pkg, 'src');
        try {
            files.push(...collectFiles(srcDir));
        } catch {
            // package may not have src/ — skip
        }
    }
    return files;
}

/** Collect test files (packages/<pkg>/tests/) across all packages. */
function getTestFiles(): string[] {
    const files: string[] = [];
    for (const pkg of PACKAGES) {
        const testsDir = join(REPO_ROOT, 'packages', pkg, 'tests');
        try {
            files.push(...collectFiles(testsDir));
        } catch {
            // package may not have tests/ — skip
        }
    }
    return files;
}

/** Check if a file path is a build/script file (not runtime source). */
function isBuildFile(filePath: string): boolean {
    return /[/\\](scripts|build|dev)[/\\]/.test(filePath) || /\.config\.[cm]?ts$/.test(filePath);
}

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

interface PatternCheck {
    readonly name: string;
    readonly description: string;
    readonly regex: RegExp;
    /**
     * If true, this pattern is ONLY checked against source files (src/),
     * not test files. Use for patterns that are expected in test fixtures
     * during the transition period.
     */
    readonly sourceOnly: boolean;
    /** If true, build/script files are exempt from this check. */
    readonly buildExempt: boolean;
}

const PATTERNS: ReadonlyArray<PatternCheck> = [
    {
        name: 'no-nanoid-import',
        description:
            'Direct runtime nanoid imports are forbidden. The CSPRNG must be injected, never imported directly.',
        regex: /from\s+['"]nanoid['"]|require\(\s*['"]nanoid['"]\s*\)/,
        sourceOnly: false,
        buildExempt: false,
    },
    {
        name: 'no-numeric-player-id-cast',
        description:
            'Numeric `as PlayerId` casts in source files indicate identity derivation from seat/index positions. Use the identity registry instead.',
        regex: /as\s+PlayerId\b/,
        sourceOnly: true,
        buildExempt: false,
    },
    {
        name: 'no-locale-compare-authoritative',
        description:
            'localeCompare in runtime source files is non-deterministic across locales. Use the explicit UTF-16 code-unit comparator.',
        regex: /\.localeCompare\s*\(/,
        sourceOnly: true,
        buildExempt: true,
    },
    {
        name: 'no-numeric-guest-player-id',
        description:
            'Numeric GuestPlayerId casts in source files indicate identity derivation from non-server sources.',
        regex: /as\s+GuestPlayerId\b/,
        sourceOnly: true,
        buildExempt: false,
    },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Identity migration guard (issue #74)', () => {
    const sourceFiles = getSourceFiles();
    const allTestFiles = getTestFiles();

    it('should have source files to scan (sanity check)', () => {
        expect(sourceFiles.length).toBeGreaterThan(50);
    });

    for (const pattern of PATTERNS) {
        describe(pattern.name, () => {
            it(pattern.description, () => {
                const violations: Array<{ file: string; line: number; match: string; context: string }> = [];

                // Determine which files to scan
                const filesToScan = pattern.sourceOnly ? sourceFiles : [...sourceFiles, ...allTestFiles];

                for (const filePath of filesToScan) {
                    // Skip build-exempt files if applicable
                    if (pattern.buildExempt && isBuildFile(filePath)) {
                        continue;
                    }

                    const content = readFileSync(filePath, 'utf-8');
                    const lines = content.split('\n');

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        const trimmed = line.trimStart();

                        // Skip single-line comments and block comment lines
                        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
                            continue;
                        }

                        const match = pattern.regex.exec(line);
                        if (match) {
                            violations.push({
                                file: relative(REPO_ROOT, filePath),
                                line: i + 1,
                                match: match[0],
                                context: trimmed.slice(0, 120),
                            });
                        }
                    }
                }

                if (violations.length > 0) {
                    const summary = violations
                        .map((v) => `  ${v.file}:${v.line} — "${v.match}" in: ${v.context}`)
                        .join('\n');
                    expect.fail(
                        `\n${violations.length} violation(s) of "${pattern.name}":\n${summary}\n\nRule: ${pattern.description}\n\nFix: Replace the pattern in the listed files. Do NOT add suppressions.`,
                    );
                }
            });
        });
    }
});
