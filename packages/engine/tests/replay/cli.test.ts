/**
 * CLI Integration Tests — Feature 022 (Developer Debugging Tools)
 *
 * Spawns the capture, run, and update scripts via child_process and
 * verifies exit codes, stdout output, and fixture file correctness.
 *
 * These are integration tests that exercise the full CLI pipeline:
 *   - capture: creates a fixture from seed + settings
 *   - run: replays and compares hash
 *   - update: replays and overwrites hash
 *
 * Uses a temporary directory for fixture files (cleaned up after each test).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const ENGINE_DIR = import.meta.dirname ? join(import.meta.dirname, '..', '..') : process.cwd();

/**
 * Resolve the `tsx` binary. In pnpm workspaces, binaries may be hoisted
 * to the root `node_modules/.bin/` or scoped to the package's own
 * `node_modules/.bin/`. Check the engine-local path first (CI-safe),
 * then fall back to the repo root.
 */
function resolveTsx(): string {
    const local = join(ENGINE_DIR, 'node_modules', '.bin', 'tsx');
    if (existsSync(local)) return local;
    const root = join(ENGINE_DIR, '..', '..', 'node_modules', '.bin', 'tsx');
    if (existsSync(root)) return root;
    // Last resort: try PATH resolution via `which`.
    try {
        return execFileSync('which', ['tsx'], { encoding: 'utf-8' }).trim();
    } catch {
        throw new Error('Cannot find tsx binary — install dependencies first');
    }
}

const TSX = resolveTsx();
const CAPTURE_SCRIPT = join(ENGINE_DIR, 'scripts', 'capture.ts');
const RUN_SCRIPT = join(ENGINE_DIR, 'scripts', 'run.ts');
const UPDATE_SCRIPT = join(ENGINE_DIR, 'scripts', 'update.ts');

let tmpDir: string;

beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'replay-cli-test-'));
});

afterEach(() => {
    // Clean up any fixture files created during tests.
    try {
        rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = mkdtempSync(join(tmpdir(), 'replay-cli-test-'));
    } catch {
        // Ignore cleanup errors.
    }
});

function runScript(script: string, args: string[]): { stdout: string; stderr: string; exitCode: number } {
    try {
        const stdout = execFileSync(TSX, [script, ...args], {
            cwd: ENGINE_DIR,
            timeout: 30_000,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { stdout, stderr: '', exitCode: 0 };
    } catch (err) {
        const error = err as { stdout?: string; stderr?: string; status?: number };
        return {
            stdout: error.stdout ?? '',
            stderr: error.stderr ?? '',
            exitCode: error.status ?? 2,
        };
    }
}

describe('CLI integration', () => {
    it('capture creates a valid fixture file', () => {
        const outPath = join(tmpDir, 'capture-test.json');
        const result = runScript(CAPTURE_SCRIPT, ['--seed', '42', '--out', outPath]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Captured fixture:');
        expect(result.stdout).toContain('hash:');

        // Fixture file should exist and be valid JSON.
        const raw = readFileSync(outPath, 'utf-8');
        const fixture = JSON.parse(raw) as Record<string, unknown>;
        expect(fixture.version).toBe(1);
        expect(fixture.seed).toBe(42);
        expect(typeof fixture.finalStateHash).toBe('string');
        expect(typeof fixture.terminalTick).toBe('number');
        expect(Array.isArray(fixture.orders)).toBe(true);
    });

    it('run exits 0 when hash matches', () => {
        const fixturePath = join(tmpDir, 'run-match.json');

        // First capture a fixture.
        runScript(CAPTURE_SCRIPT, ['--seed', '42', '--out', fixturePath]);

        // Then run it — should PASS.
        const result = runScript(RUN_SCRIPT, [fixturePath]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toMatch(/^PASS \d+ ticks$/);
    });

    it('run exits 2 for missing file', () => {
        const result = runScript(RUN_SCRIPT, ['/tmp/nonexistent-replay-test.json']);
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('cannot read file');
    });

    it('run exits 2 for invalid JSON', () => {
        const badPath = join(tmpDir, 'bad.json');
        writeFileSync(badPath, 'not json', 'utf-8');

        const result = runScript(RUN_SCRIPT, [badPath]);
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('invalid JSON');
    });

    it('run exits 2 for missing required fields', () => {
        const incompletePath = join(tmpDir, 'incomplete.json');
        writeFileSync(incompletePath, '{"version":1}', 'utf-8');

        const result = runScript(RUN_SCRIPT, [incompletePath]);
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('missing');
    });

    it('update overwrites the hash in the fixture', () => {
        const fixturePath = join(tmpDir, 'update-test.json');

        // Capture a fixture.
        runScript(CAPTURE_SCRIPT, ['--seed', '42', '--out', fixturePath]);

        // Read the original hash.
        const original = JSON.parse(readFileSync(fixturePath, 'utf-8')) as Record<string, unknown>;
        const oldHash = original.finalStateHash as string;

        // Update — should print old → new (same value since nothing changed).
        const result = runScript(UPDATE_SCRIPT, [fixturePath]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`${oldHash} → ${oldHash}`);

        // Verify the file was written.
        const updated = JSON.parse(readFileSync(fixturePath, 'utf-8')) as Record<string, unknown>;
        expect(updated.finalStateHash).toBe(oldHash);
    });

    it('update exits 2 for missing file', () => {
        const result = runScript(UPDATE_SCRIPT, ['/tmp/nonexistent-update-test.json']);
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('cannot read file');
    });

    it('capture with empty orders produces valid fixture', () => {
        const outPath = join(tmpDir, 'empty-orders.json');
        const result = runScript(CAPTURE_SCRIPT, ['--seed', '99', '--out', outPath]);

        expect(result.exitCode).toBe(0);

        const fixture = JSON.parse(readFileSync(outPath, 'utf-8')) as Record<string, unknown>;
        expect(fixture.orders).toEqual([]);
        expect(typeof fixture.finalStateHash).toBe('string');
    });

    it('capture with custom orders replays correctly', () => {
        const ordersPath = join(tmpDir, 'orders.json');
        writeFileSync(
            ordersPath,
            JSON.stringify([
                { tick: 0, playerId: 1, order: { kind: 'setReserves', player: 1, cell: { x: 1, y: 1 }, percent: 5 } },
            ]),
            'utf-8',
        );

        const fixturePath = join(tmpDir, 'custom-orders.json');
        runScript(CAPTURE_SCRIPT, ['--seed', '42', '--orders', ordersPath, '--out', fixturePath]);

        // Run should PASS.
        const result = runScript(RUN_SCRIPT, [fixturePath]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toMatch(/^PASS \d+ ticks$/);
    });
});
