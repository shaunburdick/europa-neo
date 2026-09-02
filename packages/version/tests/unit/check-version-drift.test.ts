/**
 * Unit tests for the pure version-drift checker (feature 009, T-002).
 *
 * Pinned semantics:
 * - all-agree → `ok: true` with zero mismatches
 * - each guarded surface kind mismatching alone → named with its exact
 *   file path plus expected/actual values
 * - multiple simultaneous mismatches → ALL reported, input order
 *   preserved (FR-009: never first-fail)
 * - missing/unparseable surfaces (`null` versions) → reported as
 *   mismatches with `actual: null`
 * - constant-presence contract: empty list, missing constant, and a
 *   `null` constant are all NOT ok (documented choices); duplicate
 *   constants throw as a caller contract violation
 *
 * These are behavior tests of OUR pure function only — no filesystem,
 * no library behavior. The gathering CLI that feeds real files to this
 * function lands in T-007.
 */

import { describe, expect, it } from 'vitest';

import { checkVersionDrift, type VersionSource } from '../../src/check-version-drift';
import * as versionPackage from '../../src/index';

/** The version every agreeing fixture pretends is compiled in. */
const V = '0.0.1';

const CONSTANT_FILE = 'packages/version/src/app-version.ts';

/** Builds a constant-source fixture at the real constant module path. */
function constantSource(version: string | null): VersionSource {
    return { kind: 'constant', file: CONSTANT_FILE, version };
}

/**
 * Full five-surface fixture set in gather order: root package, two
 * workspace packages, the constant, and both doc surfaces — all agreeing.
 */
function agreeableSources(): VersionSource[] {
    return [
        { kind: 'root-package', file: 'package.json', version: V },
        { kind: 'workspace-package', file: 'packages/engine/package.json', version: V },
        { kind: 'workspace-package', file: 'packages/console/package.json', version: V },
        constantSource(V),
        { kind: 'readme', file: 'README.md', version: V },
        { kind: 'manual-index', file: 'docs/manual/src/pages/index.mdx', version: V },
    ];
}

describe('checkVersionDrift', () => {
    describe('all surfaces agree', () => {
        it('returns ok:true with zero mismatches when every surface matches the constant', () => {
            const report = checkVersionDrift(agreeableSources());

            expect(report.ok).toBe(true);
            expect(report.mismatches).toEqual([]);
        });

        it('accepts agreement regardless of kind — equality is the only criterion', () => {
            // A doc line extracted to the same raw token as the constant is
            // fine even though the kinds differ; no per-kind comparison rules.
            const report = checkVersionDrift([constantSource(V), { kind: 'readme', file: 'README.md', version: V }]);

            expect(report.ok).toBe(true);
            expect(report.mismatches).toEqual([]);
        });

        it('is vacuously ok when only the constant is supplied', () => {
            const report = checkVersionDrift([constantSource(V)]);

            expect(report.ok).toBe(true);
            expect(report.mismatches).toEqual([]);
        });
    });

    describe('single-surface mismatches name the exact file', () => {
        it('root-package disagreeing alone', () => {
            const report = checkVersionDrift(
                agreeableSources().map((source) =>
                    source.kind === 'root-package' ? { ...source, version: '0.0.2' } : source,
                ),
            );

            expect(report.ok).toBe(false);
            expect(report.mismatches).toEqual([{ file: 'package.json', expected: V, actual: '0.0.2' }]);
        });

        it('workspace-package disagreeing alone', () => {
            const report = checkVersionDrift(
                agreeableSources().map((source) =>
                    source.file === 'packages/console/package.json' ? { ...source, version: '0.0.9' } : source,
                ),
            );

            expect(report.ok).toBe(false);
            expect(report.mismatches).toEqual([
                { file: 'packages/console/package.json', expected: V, actual: '0.0.9' },
            ]);
        });

        it('readme disagreeing alone', () => {
            const report = checkVersionDrift(
                agreeableSources().map((source) =>
                    source.kind === 'readme' ? { ...source, version: '0.0.0' } : source,
                ),
            );

            expect(report.ok).toBe(false);
            expect(report.mismatches).toEqual([{ file: 'README.md', expected: V, actual: '0.0.0' }]);
        });

        it('manual-index disagreeing alone', () => {
            const report = checkVersionDrift(
                agreeableSources().map((source) =>
                    source.kind === 'manual-index' ? { ...source, version: '9.9.9' } : source,
                ),
            );

            expect(report.ok).toBe(false);
            expect(report.mismatches).toEqual([
                { file: 'docs/manual/src/pages/index.mdx', expected: V, actual: '9.9.9' },
            ]);
        });
    });

    describe('multiple simultaneous mismatches', () => {
        it('reports EVERY offending file in input order — never first-fail (FR-009)', () => {
            const report = checkVersionDrift(
                agreeableSources().map((source) => {
                    if (source.kind === 'root-package') {
                        return { ...source, version: '0.0.2' };
                    }
                    if (source.kind === 'readme') {
                        return { ...source, version: null };
                    }
                    if (source.kind === 'manual-index') {
                        return { ...source, version: 'v0.0.0' };
                    }
                    return source;
                }),
            );

            expect(report.ok).toBe(false);
            expect(report.mismatches).toEqual([
                { file: 'package.json', expected: V, actual: '0.0.2' },
                { file: 'README.md', expected: V, actual: null },
                { file: 'docs/manual/src/pages/index.mdx', expected: V, actual: 'v0.0.0' },
            ]);
        });
    });

    describe('missing or unparseable surfaces', () => {
        it('a null version on any non-constant source is a mismatch with actual:null', () => {
            const report = checkVersionDrift(
                agreeableSources().map((source) =>
                    source.file === 'packages/engine/package.json' ? { ...source, version: null } : source,
                ),
            );

            expect(report.ok).toBe(false);
            expect(report.mismatches).toEqual([{ file: 'packages/engine/package.json', expected: V, actual: null }]);
        });
    });

    describe('constant-presence contract', () => {
        it('an empty source list is NOT ok — the constant must be present (documented choice)', () => {
            const report = checkVersionDrift([]);

            expect(report.ok).toBe(false);
            expect(report.mismatches).toEqual([]);
        });

        it('a missing constant source is NOT ok, like the empty list', () => {
            const sources = agreeableSources().filter((source) => source.kind !== 'constant');
            const report = checkVersionDrift(sources);

            expect(report.ok).toBe(false);
            expect(report.mismatches).toEqual([]);
        });

        it('a constant whose own version is null is NOT ok (nothing comparable exists)', () => {
            const report = checkVersionDrift([constantSource(null)]);

            expect(report.ok).toBe(false);
            // No mismatch entries: a mismatch needs an `expected` string,
            // which a null constant cannot supply.
            expect(report.mismatches).toEqual([]);
        });

        it('more than one constant source throws as a caller contract violation', () => {
            expect(() => checkVersionDrift([constantSource(V), constantSource(V)])).toThrowError(
                /exactly one 'constant' source/,
            );
        });
    });

    describe('public barrel (src/index.ts)', () => {
        it('re-exports the drift checker alongside the APP_VERSION constant', () => {
            expect(typeof versionPackage.checkVersionDrift).toBe('function');
            expect(typeof versionPackage.APP_VERSION).toBe('string');
            // Semver-shaped, whatever the current lockstep value is (T-010 bumps it).
            expect(versionPackage.APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
        });
    });
});
