/**
 * Pure version-drift checker for the shared application version
 * (feature 009, FR-009).
 *
 * This module is deliberately pure: no I/O and no `node:*` imports.
 * Callers extract version observations from the guarded surfaces and
 * hand them to {@link checkVersionDrift}; the CLI wrapper that gathers
 * real files and converts a {@link DriftReport} into an exit code lands
 * separately (`scripts/check-version-drift.ts`). Keeping extraction out
 * of this module keeps the comparison logic trivially unit-testable
 * (SC-006).
 */

/**
 * The guarded surface a version observation was extracted from.
 *
 * - `root-package` / `workspace-package`: `package.json` version fields.
 * - `constant`: the single-source `APP_VERSION` constant itself.
 * - `readme` / `manual-index`: the human-facing documentation lines.
 */
export type VersionSourceKind = 'root-package' | 'workspace-package' | 'constant' | 'readme' | 'manual-index';

/** One extracted version observation handed to {@link checkVersionDrift}. */
export interface VersionSource {
    /** Which guarded surface this observation came from. */
    readonly kind: VersionSourceKind;
    /** File the version was extracted from; reported verbatim in mismatches. */
    readonly file: string;
    /**
     * The extracted version string, or `null` when the required surface is
     * missing or unparseable (e.g., the README release line was not found).
     */
    readonly version: string | null;
}

/** One disagreeing surface named in a {@link DriftReport}. */
export interface DriftMismatch {
    /** File whose version disagrees with the constant. */
    readonly file: string;
    /** The version the constant demands. */
    readonly expected: string;
    /** The version actually found; `null` means the surface was missing/unparseable. */
    readonly actual: string | null;
}

/** Aggregate result of a drift check over a set of {@link VersionSource} observations. */
export interface DriftReport {
    /** `true` only when the constant was present and every other source agreed with it. */
    readonly ok: boolean;
    /** Every disagreeing surface, in input order (FR-009: never first-fail). */
    readonly mismatches: DriftMismatch[];
}

/**
 * Compare every source against the single `constant` source's value,
 * collecting EVERY mismatch rather than stopping at the first (FR-009).
 *
 * Comparison is plain string equality — the caller decides how version
 * tokens are extracted (and whether display prefixes like `v` are
 * stripped) before observations reach this function.
 *
 * Documented edge-case choices:
 * - An empty source list is **not ok**: the single source of truth must
 *   be present for the check to mean anything.
 * - A missing `constant` source is **not ok** for the same reason. No
 *   mismatch entries are produced because no expected value exists to
 *   name in one.
 * - A `constant` source whose own version is `null` is **not ok**, again
 *   with no mismatch entries (a mismatch needs an `expected` string,
 *   which does not exist here).
 * - More than one `constant` source is a caller contract violation and
 *   throws: the gatherer emits exactly one.
 * - Zero non-constant sources alongside a valid constant is vacuously
 *   ok — the checker compares exactly what it is given.
 *
 * @param sources - Extracted version observations, ideally one per guarded surface.
 * @returns The aggregate report; `mismatches` preserves input order so downstream output is stable.
 * @throws Error when more than one `constant` source is supplied.
 */
export function checkVersionDrift(sources: readonly VersionSource[]): DriftReport {
    const constants = sources.filter((source) => source.kind === 'constant');

    if (constants.length > 1) {
        throw new Error(`checkVersionDrift requires exactly one 'constant' source, received ${constants.length}`);
    }

    // Under noUncheckedIndexedAccess this read is `VersionSource | undefined`,
    // which folds the zero-constants case into the same guard.
    const constant = constants[0];
    if (!constant || constant.version === null) {
        return { ok: false, mismatches: [] };
    }

    const expected = constant.version;
    const mismatches: DriftMismatch[] = [];

    for (const source of sources) {
        // The constant defines `expected`; it cannot disagree with itself,
        // and duplicate constants were rejected above.
        if (source.kind === 'constant') {
            continue;
        }
        if (source.version === expected) {
            continue;
        }
        mismatches.push({ file: source.file, expected, actual: source.version });
    }

    return { ok: mismatches.length === 0, mismatches };
}
