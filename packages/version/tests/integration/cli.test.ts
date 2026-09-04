/**
 * Integration tests for the version drift-check CLI (feature 009, T-007).
 *
 * Three layers, per the task's design notes:
 *
 * 1. **In-process** — `gatherVersionSources` + `checkVersionDrift` imported
 *    directly against the REAL repository (positive lockstep proof) and
 *    against temp fixture trees. These runs are what the coverage tool
 *    measures (SC-006: the gather/report logic must clear 80% on every
 *    metric).
 * 2. **Spawned CLI** — the real script executed by the workspace `tsx`
 *    runner as a child process, asserting exit-code fidelity (0 clean /
 *    1 drift / 2 usage) and stderr mismatch lines (SC-001 both
 *    directions). Fixture trees live under `os.tmpdir()`; the real files
 *    are never mutated.
 * 3. **Full pnpm wiring** — one spawn of `pnpm version:check` from the
 *    repo root proving the root-script → `pnpm --filter` → package-script
 *    chain end to end.
 *
 * Bump-proofing: every agreeing fixture and expectation reads the REAL
 * `APP_VERSION` dynamically, so T-010's lockstep bump does not break this
 * suite.
 */

import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
    CONSTANT_SOURCE_FILE,
    formatMismatchLine,
    gatherVersionSources,
    MANUAL_INDEX_FOOTER_PATTERN,
    MANUAL_LAYOUT_FOOTER_PATTERN,
    README_RELEASE_LINE_PATTERN,
} from '../../scripts/gather-version-sources';
import { APP_VERSION } from '../../src/app-version';
import { checkVersionDrift } from '../../src/check-version-drift';

/**
 * Absolute path of the `@europa/version` package (`../..` from this FILE:
 * integration/ → tests/ → package root).
 */
const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Absolute path of the repository root (`../../../..`: tests → package → packages → repo). */
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

/** The workspace-installed tsx launcher used to execute the real CLI script. */
const TSX_BIN = path.join(PACKAGE_ROOT, 'node_modules', '.bin', 'tsx');

/** Absolute path of the drift-check entry point. */
const CLI_SCRIPT = path.join(PACKAGE_ROOT, 'scripts', 'check-version-drift.ts');

/** Every workspace package the real repository guards (engine, terrain, fog, networking, matchmaking, console, version, design). */
const EXPECTED_WORKSPACE_PACKAGES = 8;

/** What a completed CLI run tells the test. */
interface CliResult {
    /** Process exit code (0 clean, 1 drift, 2 usage). */
    readonly status: number;
    /** Everything the CLI wrote to stdout. */
    readonly stdout: string;
    /** Everything the CLI wrote to stderr (mismatch lines land here). */
    readonly stderr: string;
}

/**
 * Run the real CLI script via the workspace tsx binary.
 *
 * @param args - Argument values passed to the script.
 * @param cwd - Working directory for the child (tests vary it to prove cwd independence).
 * @returns The captured exit status and output streams.
 */
function runCli(args: readonly string[], cwd: string): CliResult {
    const result = spawnSync(TSX_BIN, [CLI_SCRIPT, ...args], { cwd, encoding: 'utf8' });
    if (result.error !== undefined) {
        throw new Error(`failed to launch tsx: ${result.error.message}`);
    }
    if (result.status === null) {
        throw new Error(`tsx was terminated by signal ${String(result.signal)}`);
    }
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * Create a unique temporary fixture root.
 *
 * @param label - Short name woven into the directory prefix for debuggability.
 * @returns Absolute path of the created directory.
 */
async function createFixtureRoot(label: string): Promise<string> {
    return mkdtemp(path.join(tmpdir(), `europa-version-${label}-`));
}

/**
 * Seed a minimal agreeing fixture tree: a root package.json, two workspace
 * packages (`zeta`, `alpha` — created in REVERSE order so the gatherer's
 * sort is observable), the README release line, and the manual footer —
 * all carrying `version`.
 *
 * @param root - Fixture root to populate.
 * @param version - Version written to every surface.
 */
async function seedAgreeingTree(root: string, version: string): Promise<void> {
    await mkdir(path.join(root, 'docs', 'manual', 'src', 'pages'), { recursive: true });
    await mkdir(path.join(root, 'docs', 'manual', 'src', 'layouts'), { recursive: true });
    await mkdir(path.join(root, 'packages', 'zeta'), { recursive: true });
    await mkdir(path.join(root, 'packages', 'alpha'), { recursive: true });

    const packageJson = (name: string): string => `${JSON.stringify({ name, private: true, version }, null, 4)}\n`;

    await writeFile(path.join(root, 'package.json'), packageJson('fixture-root'));
    await writeFile(path.join(root, 'packages', 'zeta', 'package.json'), packageJson('@fixture/zeta'));
    await writeFile(path.join(root, 'packages', 'alpha', 'package.json'), packageJson('@fixture/alpha'));
    await writeFile(
        path.join(root, 'README.md'),
        `# Fixture\n\n[badge]\n\nCurrent release: **v${version}**\n\nSome body text.\n`,
    );
    await writeFile(
        path.join(root, 'docs', 'manual', 'src', 'pages', 'index.mdx'),
        `# Fixture manual\n\n<EuropaTypography variant="caption">This manual documents Europa Neo v${version}.</EuropaTypography>\n`,
    );
    await writeFile(
        path.join(root, 'docs', 'manual', 'src', 'layouts', 'ManualLayout.astro'),
        `---\ninterface Props { title: string; }\n---\n<html><body><footer><span>v${version}</span></footer></body></html>\n`,
    );
    await writeFile(
        path.join(root, 'DESIGN.md'),
        `# Fixture design system\n\n> **Version**: \`${version}\` <!-- Version: ${version} -->\n\nSome body text.\n`,
    );
}

/** Directories created by the current test; removed after each test. */
const tempRoots: string[] = [];

afterEach(async () => {
    while (tempRoots.length > 0) {
        const dir = tempRoots.pop();
        if (dir !== undefined) {
            await rm(dir, { recursive: true, force: true });
        }
    }
});

/** Create a tracked fixture root so afterEach cleans it up. */
async function trackedFixtureRoot(label: string): Promise<string> {
    const dir = await createFixtureRoot(label);
    tempRoots.push(dir);
    return dir;
}

describe('drift check against the REAL repository (positive lockstep proof)', () => {
    it('gathered sources cover every guarded surface kind with seven workspace packages', async () => {
        const sources = await gatherVersionSources(REPO_ROOT, APP_VERSION);

        expect(sources.filter((source) => source.kind === 'root-package')).toHaveLength(1);
        expect(sources.filter((source) => source.kind === 'workspace-package')).toHaveLength(
            EXPECTED_WORKSPACE_PACKAGES,
        );
        expect(sources.filter((source) => source.kind === 'constant')).toHaveLength(1);
        expect(sources.filter((source) => source.kind === 'readme')).toHaveLength(1);
        expect(sources.filter((source) => source.kind === 'manual-index')).toHaveLength(1);
        expect(sources.filter((source) => source.kind === 'manual-layout')).toHaveLength(1);
        expect(sources.filter((source) => source.kind === 'design-md')).toHaveLength(1);
    });

    it('every real surface agrees with APP_VERSION — checker reports ok (SC-001 restore direction)', async () => {
        const report = checkVersionDrift(await gatherVersionSources(REPO_ROOT, APP_VERSION));

        expect(report.ok).toBe(true);
        expect(report.mismatches).toEqual([]);
    });

    it('the plan §5 patterns extract exactly APP_VERSION from the real README, manual index, and layout footer (SC-005)', async () => {
        const { readFile } = await import('node:fs/promises');
        const readme = await readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
        const manualIndex = await readFile(path.join(REPO_ROOT, 'docs/manual/src/pages/index.mdx'), 'utf8');
        const layout = await readFile(path.join(REPO_ROOT, 'docs/manual/src/layouts/ManualLayout.astro'), 'utf8');

        expect(README_RELEASE_LINE_PATTERN.exec(readme)?.[1]).toBe(APP_VERSION);
        expect(MANUAL_INDEX_FOOTER_PATTERN.exec(manualIndex)?.[1]).toBe(APP_VERSION);
        expect(MANUAL_LAYOUT_FOOTER_PATTERN.exec(layout)?.[1]).toBe(APP_VERSION);
    });

    it('the spawned CLI exits 0 silently against the real repo root', () => {
        const result = runCli([], REPO_ROOT);

        expect(result.status).toBe(0);
        expect(result.stderr).not.toContain('mismatch:');
    });

    it('the CLI is cwd-independent: exit 0 even when invoked from an unrelated directory', () => {
        const result = runCli([], tmpdir());

        expect(result.status).toBe(0);
        expect(result.stderr).not.toContain('mismatch:');
    });

    it('`pnpm version:check` from the repo root exits 0 through the full script wiring', { timeout: 60_000 }, () => {
        const result = spawnSync('pnpm', ['version:check'], { cwd: REPO_ROOT, encoding: 'utf8' });
        if (result.error !== undefined) {
            throw new Error(`failed to launch pnpm: ${result.error.message}`);
        }

        expect(result.status).toBe(0);
        expect(`${result.stdout ?? ''}${result.stderr ?? ''}`).not.toContain('mismatch:');
    });
});

describe('spawned CLI against temp fixture trees (SC-001 both directions)', () => {
    it('a fully agreeing fixture exits 0 with empty stderr', async () => {
        const root = await trackedFixtureRoot('agree');
        await seedAgreeingTree(root, APP_VERSION);

        // cwd = the fixture itself: the default root comes from the script
        // location, not the working directory.
        const result = runCli(['--root', root], root);

        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
    });

    it('one edited workspace package.json exits 1 naming exactly that file', async () => {
        const root = await trackedFixtureRoot('edited-pkg');
        await seedAgreeingTree(root, APP_VERSION);
        await writeFile(
            path.join(root, 'packages', 'zeta', 'package.json'),
            `${JSON.stringify({ name: '@fixture/zeta', private: true, version: '0.0.9' }, null, 4)}\n`,
        );

        const result = runCli(['--root', root], REPO_ROOT);

        expect(result.status).toBe(1);
        expect(result.stderr.match(/mismatch:/g)).toHaveLength(1);
        expect(result.stderr).toContain(`mismatch: packages/zeta/package.json expected ${APP_VERSION} but found 0.0.9`);
        expect(result.stderr).not.toContain('packages/alpha/package.json');
    });

    it('a stale README release line exits 1 naming README.md', async () => {
        const root = await trackedFixtureRoot('stale-readme');
        await seedAgreeingTree(root, APP_VERSION);
        await writeFile(
            path.join(root, 'README.md'),
            `# Fixture\n\n[badge]\n\nCurrent release: **v9.9.9**\n\nSome body text.\n`,
        );

        const result = runCli(['--root', root], REPO_ROOT);

        expect(result.status).toBe(1);
        expect(result.stderr.match(/mismatch:/g)).toHaveLength(1);
        expect(result.stderr).toContain(`mismatch: README.md expected ${APP_VERSION} but found 9.9.9`);
    });

    it('a stale DESIGN.md version header exits 1 naming DESIGN.md (spec 012 FR-020 / G-06)', async () => {
        const root = await trackedFixtureRoot('stale-design');
        await seedAgreeingTree(root, APP_VERSION);
        await writeFile(
            path.join(root, 'DESIGN.md'),
            `# Fixture design system\n\n> **Version**: \`9.9.9\` <!-- Version: 9.9.9 -->\n\nSome body text.\n`,
        );

        const result = runCli(['--root', root], REPO_ROOT);

        expect(result.status).toBe(1);
        expect(result.stderr.match(/mismatch:/g)).toHaveLength(1);
        expect(result.stderr).toContain(`mismatch: DESIGN.md expected ${APP_VERSION} but found 9.9.9`);
    });

    it('a stale layout footer exits 1 naming the Astro layout file', async () => {
        const root = await trackedFixtureRoot('stale-layout');
        await seedAgreeingTree(root, APP_VERSION);
        await writeFile(
            path.join(root, 'docs', 'manual', 'src', 'layouts', 'ManualLayout.astro'),
            `---\ninterface Props { title: string; }\n---\n<html><body><footer><span>v0.1.0</span></footer></body></html>\n`,
        );

        const result = runCli(['--root', root], REPO_ROOT);

        expect(result.status).toBe(1);
        expect(result.stderr.match(/mismatch:/g)).toHaveLength(1);
        expect(result.stderr).toContain(
            `mismatch: docs/manual/src/layouts/ManualLayout.astro expected ${APP_VERSION} but found 0.1.0`,
        );
    });

    it('a missing manual footer exits 1 naming docs/manual/src/pages/index.mdx as unparseable', async () => {
        const root = await trackedFixtureRoot('missing-footer');
        await seedAgreeingTree(root, APP_VERSION);
        await writeFile(
            path.join(root, 'docs', 'manual', 'src', 'pages', 'index.mdx'),
            '# Fixture manual\n\nNo footer here.\n',
        );

        const result = runCli(['--root', root], REPO_ROOT);

        expect(result.status).toBe(1);
        expect(result.stderr.match(/mismatch:/g)).toHaveLength(1);
        expect(result.stderr).toContain(
            `mismatch: docs/manual/src/pages/index.mdx expected ${APP_VERSION} but found nothing (surface missing or unparseable)`,
        );
    });

    it('simultaneous mismatches name EVERY offender in deterministic gather order (FR-009)', async () => {
        const root = await trackedFixtureRoot('multi-drift');
        await seedAgreeingTree(root, APP_VERSION);
        await writeFile(
            path.join(root, 'packages', 'zeta', 'package.json'),
            `${JSON.stringify({ name: '@fixture/zeta', private: true, version: '0.0.9' }, null, 4)}\n`,
        );
        await writeFile(
            path.join(root, 'README.md'),
            `# Fixture\n\n[badge]\n\nCurrent release: **v9.9.9**\n\nSome body text.\n`,
        );
        await writeFile(
            path.join(root, 'docs', 'manual', 'src', 'pages', 'index.mdx'),
            '# Fixture manual\n\nNo footer here.\n',
        );

        const result = runCli(['--root', root], REPO_ROOT);

        expect(result.status).toBe(1);
        expect(result.stderr.match(/mismatch:/g)).toHaveLength(3);
        const zetaAt = result.stderr.indexOf('packages/zeta/package.json');
        const readmeAt = result.stderr.indexOf('README.md');
        const manualAt = result.stderr.indexOf('docs/manual/src/pages/index.mdx');
        expect(zetaAt).toBeGreaterThan(-1);
        expect(readmeAt).toBeGreaterThan(zetaAt);
        expect(manualAt).toBeGreaterThan(readmeAt);
    });

    it('an unrecognized flag is a usage error with exit code 2', () => {
        const result = runCli(['--frobnicate'], REPO_ROOT);

        expect(result.status).toBe(2);
        expect(result.stderr).toContain('unrecognized argument: --frobnicate');
        expect(result.stderr).toContain('usage:');
    });

    it('a valueless --root is a usage error with exit code 2', () => {
        const result = runCli(['--root'], REPO_ROOT);

        expect(result.status).toBe(2);
        expect(result.stderr).toContain('--root requires a directory argument');
    });
});

describe('gatherVersionSources extraction details (in-process; feeds coverage)', () => {
    it('extracts versions from every agreeing fixture surface, sorted, with the labeled constant', async () => {
        const root = await trackedFixtureRoot('extract');
        await seedAgreeingTree(root, APP_VERSION);

        const sources = await gatherVersionSources(root, APP_VERSION);

        expect(sources.map((source) => source.file)).toEqual([
            'package.json',
            'packages/alpha/package.json',
            'packages/zeta/package.json',
            CONSTANT_SOURCE_FILE,
            'README.md',
            'docs/manual/src/pages/index.mdx',
            'docs/manual/src/layouts/ManualLayout.astro',
            'DESIGN.md',
        ]);
        expect(sources.every((source) => source.version === APP_VERSION)).toBe(true);
    });

    it('reports null for a missing root package.json, malformed JSON, and a missing version field', async () => {
        const root = await trackedFixtureRoot('broken-root');
        await mkdir(path.join(root, 'packages'));
        await writeFile(path.join(root, 'package.json'), '{ not json at all');

        const sources = await gatherVersionSources(root, APP_VERSION);

        const rootPackage = sources.find((source) => source.kind === 'root-package');
        expect(rootPackage).toMatchObject({ file: 'package.json', version: null });

        await writeFile(path.join(root, 'package.json'), '{"name":"broken"}');
        const reparsed = await gatherVersionSources(root, APP_VERSION);
        expect(reparsed.find((source) => source.kind === 'root-package')).toMatchObject({ version: null });
    });

    it('a JSON-array package.json yields a null observation (not an object)', async () => {
        const root = await trackedFixtureRoot('array-root');
        await mkdir(path.join(root, 'packages'));
        await writeFile(path.join(root, 'package.json'), '[1, 2, 3]\n');

        const sources = await gatherVersionSources(root, APP_VERSION);

        expect(sources.find((source) => source.kind === 'root-package')).toMatchObject({ version: null });
    });

    it('a missing packages directory yields zero workspace observations', async () => {
        const root = await trackedFixtureRoot('no-packages');
        await mkdir(root, { recursive: true });

        const sources = await gatherVersionSources(root, APP_VERSION);

        expect(sources.filter((source) => source.kind === 'workspace-package')).toEqual([]);
    });

    it('skips package-less directories but reports unreadable workspace package.json files as null', async () => {
        const root = await trackedFixtureRoot('weird-packages');
        await mkdir(path.join(root, 'packages', 'plain'), { recursive: true });
        // A DIRECTORY named package.json: readFile raises EISDIR (not ENOENT),
        // exercising the non-absence error branch deterministically.
        await mkdir(path.join(root, 'packages', 'hostile', 'package.json'), { recursive: true });

        const sources = await gatherVersionSources(root, APP_VERSION);

        expect(sources.filter((source) => source.kind === 'workspace-package')).toEqual([
            { kind: 'workspace-package', file: 'packages/hostile/package.json', version: null },
        ]);
    });

    it('doc surfaces yield null when the file is absent or the line format is wrong', async () => {
        const root = await trackedFixtureRoot('doc-formats');
        await mkdir(path.join(root, 'docs', 'manual', 'src', 'pages'), { recursive: true });
        await mkdir(path.join(root, 'docs', 'manual', 'src', 'layouts'), { recursive: true });
        await writeFile(path.join(root, 'README.md'), 'Current release: v0.0.0 without bold markers\n');
        await writeFile(path.join(root, 'docs', 'manual', 'src', 'pages', 'index.mdx'), 'no footer\n');
        await writeFile(
            path.join(root, 'docs', 'manual', 'src', 'layouts', 'ManualLayout.astro'),
            '<span>no version</span>\n',
        );

        const sources = await gatherVersionSources(root, APP_VERSION);

        expect(sources.find((source) => source.kind === 'readme')).toMatchObject({
            file: 'README.md',
            version: null,
        });
        expect(sources.find((source) => source.kind === 'manual-index')).toMatchObject({
            file: 'docs/manual/src/pages/index.mdx',
            version: null,
        });
        expect(sources.find((source) => source.kind === 'manual-layout')).toMatchObject({
            file: 'docs/manual/src/layouts/ManualLayout.astro',
            version: null,
        });

        await rm(path.join(root, 'README.md'));
        await rm(path.join(root, 'docs', 'manual'), { recursive: true });
        const afterRemoval = await gatherVersionSources(root, APP_VERSION);
        expect(afterRemoval.find((source) => source.kind === 'readme')).toMatchObject({ version: null });
        expect(afterRemoval.find((source) => source.kind === 'manual-index')).toMatchObject({ version: null });
        expect(afterRemoval.find((source) => source.kind === 'manual-layout')).toMatchObject({ version: null });
    });

    it('the constant observation carries the caller-supplied version under the fixed label', async () => {
        const root = await trackedFixtureRoot('constant-label');
        await mkdir(root, { recursive: true });

        const sources = await gatherVersionSources(root, '31.33.7');

        expect(sources.find((source) => source.kind === 'constant')).toEqual({
            kind: 'constant',
            file: CONSTANT_SOURCE_FILE,
            version: '31.33.7',
        });
    });
});

describe('formatMismatchLine rendering', () => {
    it('renders present actuals inline', () => {
        expect(formatMismatchLine({ file: 'README.md', expected: '0.0.1', actual: '0.0.0' })).toBe(
            'mismatch: README.md expected 0.0.1 but found 0.0.0',
        );
    });

    it('renders null actuals as an explicit missing-surface note', () => {
        expect(formatMismatchLine({ file: 'docs/manual/src/pages/index.mdx', expected: '0.0.1', actual: null })).toBe(
            'mismatch: docs/manual/src/pages/index.mdx expected 0.0.1 but found nothing (surface missing or unparseable)',
        );
    });
});
