/**
 * Version drift-check CLI (feature 009, FR-009) — the `pnpm version:check`
 * experience.
 *
 * Gathers every guarded surface from a repository tree, compares them
 * against the compiled-in `APP_VERSION` constant, prints one
 * `mismatch:` line per offending file to stderr (via `process.stderr.write`,
 * following the host.ts `say()` precedent — no `console`), and exits:
 *
 * - `0`  — every guarded surface agrees with the constant.
 * - `1`  — at least one surface disagrees (each named on stderr).
 * - `2`  — usage error (unrecognized flag or a valueless `--root`).
 *
 * Usage:
 *
 *     tsx scripts/check-version-drift.ts [--root <directory>]
 *
 * The default root is THIS repository, resolved from this file's own
 * location (`packages/version/scripts/` sits three levels below the repo
 * root) — never from the process cwd (plan §6). `--root` points the
 * surface gathering at another tree (integration tests build temp fixture
 * forests under `os.tmpdir()`); see sibling module
 * `gather-version-sources.ts` for how the constant still resolves to
 * the compiled-in value regardless of `--root`.
 *
 * Zero new dependencies: node:* builtins plus this package's own source,
 * executed by the workspace-catalog `tsx` runner.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION, checkVersionDrift } from '../src/index';
import { formatMismatchLine, gatherVersionSources } from './gather-version-sources';

/** Parsed CLI arguments. */
interface CliArgs {
    /** Explicit root directory (`--root`), when provided. */
    readonly root?: string;
}

/** Thrown for malformed invocations; maps to exit code 2. */
class UsageError extends Error {
    /**
     * @param message - Human-readable explanation, printed before the usage line.
     */
    constructor(message: string) {
        super(message);
        this.name = 'UsageError';
    }
}

/** The usage hint printed alongside any usage error. */
const USAGE_LINE = 'usage: tsx scripts/check-version-drift.ts [--root <directory>]';

/**
 * Parse raw argv values into {@link CliArgs}.
 *
 * Supports `--root <dir>` and `--root=<dir>`. Anything else is a usage
 * error so typos fail loudly instead of silently checking the wrong tree.
 *
 * @param argv - Argument values (already stripped of node/script paths).
 * @returns The parsed arguments.
 * @throws UsageError for unrecognized flags or a valueless `--root`.
 */
function parseArgs(argv: readonly string[]): CliArgs {
    let root: string | undefined;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === undefined) {
            continue; // Unreachable under the loop bounds; satisfies noUncheckedIndexedAccess.
        }
        if (arg === '--root') {
            const value = argv[index + 1];
            if (value === undefined || value.startsWith('--')) {
                throw new UsageError('--root requires a directory argument');
            }
            root = value;
            index += 1;
            continue;
        }
        if (arg.startsWith('--root=')) {
            const value = arg.slice('--root='.length);
            if (value.length === 0) {
                throw new UsageError('--root requires a directory argument');
            }
            root = value;
            continue;
        }
        throw new UsageError(`unrecognized argument: ${arg}`);
    }

    return { root };
}

/**
 * Resolve the default repository root from this file's own location —
 * never from the process cwd, so the check behaves identically no matter
 * where it is invoked from (plan §6).
 *
 * `packages/version/scripts/` sits three levels below the repo root.
 *
 * @returns Absolute path to the repository root.
 */
function defaultRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, '..', '..', '..');
}

/**
 * Run the drift check and produce the process exit code.
 *
 * @param argv - Raw argument values from `process.argv` (minus node/script).
 * @returns Resolved exit code: 0 clean, 1 drift, 2 usage error.
 */
async function run(argv: readonly string[]): Promise<number> {
    let args: CliArgs;
    try {
        args = parseArgs(argv);
    } catch (error) {
        const message = error instanceof UsageError ? error.message : 'invalid arguments';
        process.stderr.write(`${message}\n${USAGE_LINE}\n`);
        return 2;
    }

    // A relative --root resolves against the caller's cwd; the default is
    // cwd-independent by construction.
    const rootDir = args.root === undefined ? defaultRepoRoot() : path.resolve(args.root);

    const sources = await gatherVersionSources(rootDir, APP_VERSION);
    const report = checkVersionDrift(sources);

    for (const mismatch of report.mismatches) {
        process.stderr.write(`${formatMismatchLine(mismatch)}\n`);
    }

    return report.ok ? 0 : 1;
}

/**
 * Describe any unexpected failure for the crash-path stderr line.
 *
 * @param error - The rejected value.
 * @returns Its message when it is an Error, its string form otherwise.
 */
function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

// Exit via `process.exitCode` rather than `process.exit()`: setting the code
// lets pending stderr writes flush instead of being truncated mid-line.
run(process.argv.slice(2))
    .then((code) => {
        process.exitCode = code;
    })
    .catch((error: unknown) => {
        process.stderr.write(`version drift check failed: ${describeError(error)}\n`);
        process.exitCode = 1;
    });
