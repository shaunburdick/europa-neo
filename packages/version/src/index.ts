/**
 * Public surface of the `@europa/version` package.
 *
 * Deliberately tiny (plan §1): the single-source `APP_VERSION`
 * constant plus the pure drift checker that keeps every guarded
 * surface in lockstep with it (FR-009).
 */
export { APP_VERSION } from './app-version';
export {
    checkVersionDrift,
    type DriftMismatch,
    type DriftReport,
    type VersionSource,
    type VersionSourceKind,
} from './check-version-drift';
