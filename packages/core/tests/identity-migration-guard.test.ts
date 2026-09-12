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
// Token-aware comment stripping (N4)
// ---------------------------------------------------------------------------

/** Lexer states used by {@link stripComments}. */
type ScanState = 'code' | 'line-comment' | 'block-comment' | 'single-quote' | 'double-quote' | 'template';

/**
 * Blank out `//` line comments and block comments while preserving all
 * code and string contents.
 *
 * Comment spans are replaced with spaces and newlines are preserved, so
 * line numbers and column offsets stay stable for diagnostics. Crucially,
 * code that precedes or follows an **inline** comment is retained and
 * still scanned: the previous implementation skipped any line whose first
 * non-space characters were `//`, `*`, or `/*`, which let
 * `/*x*\/ const id = seat as PlayerId;` evade the guard entirely.
 *
 * String literals are intentionally preserved (the `no-nanoid-import`
 * rule must see the module specifier), so the scanner tracks quote state
 * and does not treat `//` or `/*` inside a string as a comment.
 *
 * @param source - Raw TypeScript/TSX source text.
 * @returns Equivalent text with comment spans replaced by spaces.
 */
function stripComments(source: string): string {
    let out = '';
    let state: ScanState = 'code';
    for (let i = 0; i < source.length; i++) {
        const ch = source[i] ?? '';
        const next = source[i + 1] ?? '';
        switch (state) {
            case 'code': {
                if (ch === '/' && next === '/') {
                    state = 'line-comment';
                    out += '  ';
                    i += 1;
                } else if (ch === '/' && next === '*') {
                    state = 'block-comment';
                    out += '  ';
                    i += 1;
                } else if (ch === "'") {
                    state = 'single-quote';
                    out += ch;
                } else if (ch === '"') {
                    state = 'double-quote';
                    out += ch;
                } else if (ch === '`') {
                    state = 'template';
                    out += ch;
                } else {
                    out += ch;
                }
                break;
            }
            case 'line-comment': {
                if (ch === '\n') {
                    state = 'code';
                    out += ch;
                } else {
                    out += ' ';
                }
                break;
            }
            case 'block-comment': {
                if (ch === '*' && next === '/') {
                    state = 'code';
                    out += '  ';
                    i += 1;
                } else {
                    out += ch === '\n' ? '\n' : ' ';
                }
                break;
            }
            case 'single-quote':
            case 'double-quote':
            case 'template': {
                out += ch;
                if (ch === '\\') {
                    // Preserve the escaped code unit verbatim so an
                    // escaped quote cannot prematurely close the literal.
                    if (i + 1 < source.length) {
                        out += source[i + 1] ?? '';
                        i += 1;
                    }
                } else if (
                    (state === 'single-quote' && ch === "'") ||
                    (state === 'double-quote' && ch === '"') ||
                    (state === 'template' && ch === '`')
                ) {
                    state = 'code';
                }
                break;
            }
        }
    }
    return out;
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
    /** A synthetic snippet that MUST match `regex` (self-test, N4). */
    readonly badSample: string;
    /** A synthetic snippet that MUST NOT match `regex` (self-test, N4). */
    readonly cleanSample: string;
}

/**
 * Package name built at runtime so this guard's own self-test samples do
 * not themselves trip the `no-nanoid-import` rule when this test file is
 * scanned (the pattern is not source-only).
 */
const NANOID_MODULE = 'nanoid';

const PATTERNS: ReadonlyArray<PatternCheck> = [
    {
        name: 'no-nanoid-import',
        description:
            'Direct runtime nanoid imports are forbidden. The CSPRNG must be injected, never imported directly.',
        regex: /from\s+['"]nanoid['"]|require\(\s*['"]nanoid['"]\s*\)/,
        sourceOnly: false,
        buildExempt: false,
        badSample: `import { nanoid } from '${NANOID_MODULE}';`,
        cleanSample: "import { randomBytes } from 'node:crypto';",
    },
    {
        name: 'no-numeric-player-id-cast',
        description:
            'Numeric `as PlayerId` casts in source files indicate identity derivation from seat/index positions. Use the identity registry instead.',
        regex: /as\s+PlayerId\b/,
        sourceOnly: true,
        buildExempt: false,
        badSample: 'const id = seat as PlayerId;',
        cleanSample: 'const id = parsePlayerId(value);',
    },
    {
        name: 'no-locale-compare-authoritative',
        description:
            'localeCompare in runtime source files is non-deterministic across locales. Use the explicit UTF-16 code-unit comparator.',
        regex: /\.localeCompare\s*\(/,
        sourceOnly: true,
        buildExempt: true,
        badSample: 'ids.sort((a, b) => a.localeCompare(b));',
        cleanSample: 'ids.sort((a, b) => compareUtf16(a, b));',
    },
    {
        name: 'no-numeric-guest-player-id',
        description:
            'Numeric GuestPlayerId casts in source files indicate identity derivation from non-server sources.',
        regex: /as\s+GuestPlayerId\b/,
        sourceOnly: true,
        buildExempt: false,
        badSample: 'const id = value as GuestPlayerId;',
        cleanSample: 'const id = parseGuestPlayerId(value);',
    },
];

/**
 * Look up a pattern by name, failing loudly if the table and the tests
 * have drifted apart.
 *
 * @param name - The `PatternCheck.name` to resolve.
 * @returns The matching pattern definition.
 */
function patternByName(name: string): PatternCheck {
    const found = PATTERNS.find((pattern) => pattern.name === name);
    if (found === undefined) {
        throw new Error(`test setup: no pattern named '${name}'`);
    }
    return found;
}

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
                    // Strip comments token-aware (N4) so code adjacent to
                    // an inline comment is still scanned, while genuinely
                    // commented-out code is ignored. Line numbering is
                    // preserved by `stripComments`.
                    const lines = stripComments(content).split('\n');

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i] ?? '';
                        const match = pattern.regex.exec(line);
                        if (match) {
                            violations.push({
                                file: relative(REPO_ROOT, filePath),
                                line: i + 1,
                                match: match[0],
                                context: line.trim().slice(0, 120),
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

// ---------------------------------------------------------------------------
// Table self-tests (N4)
//
// These prove the guard's own machinery, independent of the (still-red)
// repository scan: every rule must flag its synthetic bad sample and pass
// its synthetic clean sample, and comment handling must be token-aware so
// inline comments cannot hide code and commented-out code cannot produce
// false positives.
// ---------------------------------------------------------------------------

describe('Identity migration guard — pattern table self-test (N4)', () => {
    for (const pattern of PATTERNS) {
        it(`detects bad / passes clean: ${pattern.name}`, () => {
            expect(
                pattern.regex.exec(stripComments(pattern.badSample)),
                `bad sample for '${pattern.name}' was not detected`,
            ).not.toBeNull();
            expect(
                pattern.regex.exec(stripComments(pattern.cleanSample)),
                `clean sample for '${pattern.name}' falsely matched`,
            ).toBeNull();
        });
    }

    it('catches code that shares a line with an inline block comment', () => {
        const pattern = patternByName('no-numeric-player-id-cast');
        // The bypass this guards against: a leading `/*x*/` used to make
        // the scanner skip the whole line.
        expect(pattern.regex.exec(stripComments('/*x*/ const id = seat as PlayerId;'))).not.toBeNull();
        expect(pattern.regex.exec(stripComments('const id = seat as PlayerId; /* tail */'))).not.toBeNull();
    });

    it('ignores genuinely commented-out code', () => {
        const pattern = patternByName('no-numeric-player-id-cast');
        expect(pattern.regex.exec(stripComments('// const id = seat as PlayerId;'))).toBeNull();
        expect(pattern.regex.exec(stripComments('/* const id = seat as PlayerId; */'))).toBeNull();
        // A `*`-prefixed line is only a comment CONTINUATION; inside a
        // real block comment the whole span is stripped.
        expect(pattern.regex.exec(stripComments('/*\n * const id = seat as PlayerId;\n */'))).toBeNull();
    });

    it('preserves the exact line count so diagnostics stay accurate', () => {
        const source = 'a\n// comment\nb\n/* multi\nline */ c\nd';
        expect(stripComments(source).split('\n')).toHaveLength(source.split('\n').length);
    });

    it('does not treat a comment marker inside a string as a comment', () => {
        const line = "const url = 'https://example.com';";
        expect(stripComments(line)).toBe(line);
    });
});
