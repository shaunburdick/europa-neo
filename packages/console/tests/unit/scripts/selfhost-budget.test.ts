import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { describe, expect, test } from 'vitest';

const PACKAGE_ROOT = process.cwd();
const BUDGET_HELPER = join(PACKAGE_ROOT, 'scripts', 'browser-bundle-budget.sh');
const SELFHOST_SCRIPT = join(PACKAGE_ROOT, 'scripts', 'test-selfhost.sh');

function reportBudget(measured: string, target = '155648'): ReturnType<typeof spawnSync> {
    return spawnSync(
        'bash',
        ['-c', 'source "$1"; report_browser_bundle_budget "$2" "$3"', 'budget-test', BUDGET_HELPER, measured, target],
        { encoding: 'utf8' },
    );
}

interface SelfhostFixtureOptions {
    readonly overBudget?: boolean;
    readonly failGzip?: boolean;
    readonly failGrep?: boolean;
    readonly remoteUrl?: boolean;
    readonly untrustedUrl?: string;
    readonly allowlistedUrls?: boolean;
    readonly failHttp?: boolean;
    readonly failMissingAssetProbe?: boolean;
    readonly wrongMissingAssetStatus?: boolean;
    readonly failWebSocket?: boolean;
}

interface SelfhostFixtureResult {
    readonly status: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly hostTrace: string;
    readonly expectedTotal: number | null;
}

function createOverBudgetAsset(byteLength: number, initialState: number): Buffer {
    const bytes = Buffer.alloc(byteLength);
    let state = initialState;
    for (let index = 0; index < bytes.length; index += 1) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        bytes[index] = state & 0xff;
    }
    return Buffer.from(bytes.toString('base64'));
}

function gzipAssetSize(path: string): number {
    const result = spawnSync('gzip', ['-c', '--', path]);
    if (result.status !== 0) throw new Error(`Unable to gzip selfhost fixture asset: ${path}`);
    return result.stdout.byteLength;
}

function runSelfhostFixture(options: SelfhostFixtureOptions): SelfhostFixtureResult {
    const temporary = mkdtempSync(join(tmpdir(), 'europa-selfhost-smoke-fixture-'));
    const packageRoot = join(temporary, 'console');
    const scriptsDirectory = join(packageRoot, 'scripts');
    const assetsDirectory = join(packageRoot, 'dist', 'assets');
    const binaryDirectory = join(temporary, 'bin');
    const hostTrace = join(temporary, 'host-trace.log');
    const assetPath = join(assetsDirectory, 'entry.js');
    const stylesheetPath = join(assetsDirectory, 'theme.css');
    const sourceMapPath = join(assetsDirectory, 'entry.js.map');
    try {
        mkdirSync(scriptsDirectory, { recursive: true });
        mkdirSync(assetsDirectory, { recursive: true });
        mkdirSync(binaryDirectory);
        writeFileSync(join(scriptsDirectory, 'test-selfhost.sh'), readFileSync(SELFHOST_SCRIPT));
        writeFileSync(join(scriptsDirectory, 'browser-bundle-budget.sh'), readFileSync(BUDGET_HELPER));
        if (options.overBudget) {
            writeFileSync(assetPath, createOverBudgetAsset(120_000, 0x13579bdf));
            writeFileSync(stylesheetPath, createOverBudgetAsset(120_000, 0x2468ace0));
            writeFileSync(sourceMapPath, createOverBudgetAsset(120_000, 0x10203040));
        } else {
            const assetContents = options.untrustedUrl
                ? options.untrustedUrl
                : options.allowlistedUrls
                  ? [
                        '"http://"',
                        '"https://"',
                        '"http://localhost"',
                        '"http://www.w3.org/1998/Math/MathML"',
                        '"http://www.w3.org/1999/xlink"',
                        '"http://www.w3.org/2000/svg"',
                        '"http://www.w3.org/XML/1998/namespace"',
                        '"https://react.dev/errors/"',
                        '"https://github.com/shaunburdick/europa-neo"',
                        '"https://shaunburdick.github.io/europa-neo/manual/"',
                    ].join(';')
                  : options.remoteUrl
                    ? 'fetch("https://unexpected.invalid/resource");\n'
                    : 'console.log("fixture");\n';
            writeFileSync(assetPath, assetContents);
        }

        writeFileSync(
            join(binaryDirectory, 'pnpm'),
            [
                '#!/bin/sh',
                'if [ "$1" = "build" ]; then exit 0; fi',
                'if [ "$1" = "host" ]; then',
                '    printf "host:%s\\n" "$*" >> "$MOCK_HOST_TRACE"',
                '    exec sleep 60',
                'fi',
                'exit 98',
                '',
            ].join('\n'),
        );
        chmodSync(join(binaryDirectory, 'pnpm'), 0o755);
        writeFileSync(
            join(binaryDirectory, 'curl'),
            [
                '#!/bin/bash',
                'set -euo pipefail',
                'for url in "$@"; do :; done',
                'printf "curl:%s\\n" "$*" >> "$MOCK_HOST_TRACE"',
                'if [[ "$MOCK_MISSING_ASSET_FAIL" == "1" && "$url" == */assets/missing-selfhost.js ]]; then exit 23; fi',
                'if [[ "$MOCK_MISSING_ASSET_STATUS_FAIL" == "1" && "$url" == */assets/missing-selfhost.js ]]; then printf "500"; exit 0; fi',
                'if [[ "$url" == */assets/missing-selfhost.js ]]; then printf "404"; exit 0; fi',
                'if [[ "$url" == */%2e%2e/%2e%2e/package.json ]]; then printf "403"; exit 0; fi',
                'if [[ "$MOCK_HTTP_FAIL" == "1" && "$url" == */lobby ]]; then printf "HTTP/1.1 500 Internal Server Error\\r\\n\\r\\n"; exit 22; fi',
                'if [[ "$*" == *"Upgrade: websocket"* ]]; then',
                '    if [[ "$MOCK_WS_FAIL" == "1" ]]; then printf "HTTP/1.1 400 Bad Request\\r\\n\\r\\n"; else printf "HTTP/1.1 101 Switching Protocols\\r\\nConnection: Upgrade\\r\\nUpgrade: websocket\\r\\n\\r\\n"; fi',
                '    exit 0',
                'fi',
                'if [[ "$url" == */version ]]; then',
                '    if [[ "$*" == *"-D -"* ]]; then printf "HTTP/1.1 200 OK\\r\\nx-content-type-options: nosniff\\r\\nreferrer-policy: no-referrer\\r\\n\\r\\n"; fi',
                '    printf "{\\"appVersion\\":\\"test\\",\\"protocolVersion\\":\\"test\\"}"',
                '    exit 0',
                'fi',
                'if [[ "$url" == */assets/* ]]; then printf "HTTP/1.1 200 OK\\r\\ncontent-type: text/javascript\\r\\n\\r\\n"; exit 0; fi',
                'if [[ "$url" == */* ]]; then printf "HTTP/1.1 200 OK\\r\\nx-content-type-options: nosniff\\r\\nreferrer-policy: no-referrer\\r\\ncontent-type: text/html\\r\\n\\r\\n<div id=\\"root\\"></div>"; exit 0; fi',
                'exit 22',
                '',
            ].join('\n'),
        );
        chmodSync(join(binaryDirectory, 'curl'), 0o755);
        if (options.failGrep) {
            writeFileSync(join(binaryDirectory, 'grep'), '#!/bin/sh\nexit 2\n');
            chmodSync(join(binaryDirectory, 'grep'), 0o755);
        }
        if (options.failGzip) {
            writeFileSync(join(binaryDirectory, 'gzip'), '#!/bin/sh\nexit 9\n');
            chmodSync(join(binaryDirectory, 'gzip'), 0o755);
        }

        const result = spawnSync('bash', [join(scriptsDirectory, 'test-selfhost.sh')], {
            cwd: packageRoot,
            encoding: 'utf8',
            timeout: 20_000,
            env: {
                ...process.env,
                MOCK_HOST_TRACE: hostTrace,
                MOCK_HTTP_FAIL: options.failHttp ? '1' : '0',
                MOCK_MISSING_ASSET_FAIL: options.failMissingAssetProbe ? '1' : '0',
                MOCK_MISSING_ASSET_STATUS_FAIL: options.wrongMissingAssetStatus ? '1' : '0',
                MOCK_WS_FAIL: options.failWebSocket ? '1' : '0',
                PATH: `${binaryDirectory}${delimiter}${process.env.PATH ?? ''}`,
            },
        });
        let trace = '';
        try {
            trace = readFileSync(hostTrace, 'utf8');
        } catch {
            trace = '';
        }
        const expectedTotal = options.overBudget ? gzipAssetSize(assetPath) + gzipAssetSize(stylesheetPath) : null;
        return {
            status: result.status,
            stdout: result.stdout ?? '',
            stderr: result.stderr ?? '',
            hostTrace: trace,
            expectedTotal,
        };
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
}

describe('selfhost browser-payload reference report', () => {
    test('reports a below-target total and available distance', () => {
        const result = reportBudget('155647');
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('bundle size: 155647 bytes gzipped (reference target 155648 bytes)');
        expect(result.stdout).toContain('within the reference target (1 byte below)');
        expect(result.stdout).not.toContain('WARNING');
    });

    test('warns at the exact reference target without converting the advisory into failure', () => {
        const result = reportBudget('155648');
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('bundle size: 155648 bytes gzipped (reference target 155648 bytes)');
        expect(result.stdout).toContain(
            'WARNING: browser payload equals the 155648-byte reference target (0 bytes above)',
        );
    });

    test('warns with the exact excess above the reference target and exits successfully', () => {
        const result = reportBudget('156654');
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('bundle size: 156654 bytes gzipped (reference target 155648 bytes)');
        expect(result.stdout).toContain(
            'WARNING: browser payload is 1006 bytes above the 155648-byte reference target',
        );
    });

    test('rejects an invalid measurement instead of presenting it as a budget warning', () => {
        const result = reportBudget('not-a-number');
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('FAIL: invalid browser bundle measurement or reference target');
        expect(result.stdout).not.toContain('WARNING');
    });

    test('rejects a missing browser asset set instead of treating it as a zero-byte report', () => {
        const temporary = mkdtempSync(join(tmpdir(), 'europa-selfhost-empty-assets-'));
        try {
            const result = spawnSync(
                'bash',
                ['-c', 'source "$1"; require_browser_assets "$2" ""', 'asset-test', BUDGET_HELPER, temporary],
                { encoding: 'utf8' },
            );
            expect(result.status).toBe(1);
            expect(result.stderr).toContain('FAIL: no browser JS/CSS assets found');
            expect(result.stdout).not.toContain('WARNING');
        } finally {
            rmSync(temporary, { recursive: true, force: true });
        }
    });

    test('rejects a missing asset directory before reporting a bundle size', () => {
        const temporary = mkdtempSync(join(tmpdir(), 'europa-selfhost-missing-assets-'));
        try {
            const result = spawnSync(
                'bash',
                [
                    '-c',
                    'source "$1"; require_browser_assets "$2" ""',
                    'asset-test',
                    BUDGET_HELPER,
                    join(temporary, 'missing-assets'),
                ],
                { encoding: 'utf8' },
            );
            expect(result.status).toBe(1);
            expect(result.stderr).toContain('FAIL: browser asset directory is missing');
            expect(result.stdout).not.toContain('WARNING');
        } finally {
            rmSync(temporary, { recursive: true, force: true });
        }
    });

    test('keeps a production build failure blocking before the advisory report', () => {
        const temporary = mkdtempSync(join(tmpdir(), 'europa-selfhost-build-failure-'));
        try {
            const bin = join(temporary, 'bin');
            mkdirSync(bin);
            const pnpmStub = join(bin, 'pnpm');
            writeFileSync(pnpmStub, '#!/bin/sh\nexit 17\n');
            chmodSync(pnpmStub, 0o755);

            const result = spawnSync('bash', [SELFHOST_SCRIPT], {
                cwd: PACKAGE_ROOT,
                encoding: 'utf8',
                env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` },
            });
            expect(result.status).toBe(17);
            expect(result.stdout).toContain('[test-selfhost] building console...');
            expect(result.stdout).not.toContain('WARNING');
            expect(result.stdout).not.toContain('starting one-port host smoke');
        } finally {
            rmSync(temporary, { recursive: true, force: true });
        }
    });

    test('keeps remote-URL violations blocking before the advisory report', () => {
        const result = runSelfhostFixture({ remoteUrl: true });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain('FAIL: remote URLs found in built output');
        expect(result.stdout).not.toContain('WARNING');
        expect(result.stdout).not.toContain('starting one-port host smoke');
        expect(result.hostTrace).toBe('');
    });

    test('recognizes uppercase URL schemes and keeps external URLs blocking', () => {
        const result = runSelfhostFixture({
            untrustedUrl: 'fetch("HTTPS://unexpected.invalid/resource");\n',
        });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain('FAIL: remote URLs found in built output');
        expect(result.stdout).toContain('HTTPS://unexpected.invalid/resource');
        expect(result.stdout).not.toContain('starting one-port host smoke');
        expect(result.hostTrace).toBe('');
    });

    test('does not allow an unrelated origin that embeds trusted hosts in its path and query', () => {
        const result = runSelfhostFixture({
            untrustedUrl:
                'fetch("https://unexpected.invalid/path/github.com/shaunburdick/europa-neo?next=https://shaunburdick.github.io/europa-neo/");\n',
        });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain('FAIL: remote URLs found in built output');
        expect(result.stdout).toContain(
            'https://unexpected.invalid/path/github.com/shaunburdick/europa-neo?next=https://shaunburdick.github.io/europa-neo/',
        );
        expect(result.stdout).not.toContain('WARNING');
        expect(result.stdout).not.toContain('starting one-port host smoke');
        expect(result.hostTrace).toBe('');
    });

    test('does not allow a non-namespace URL on the XML namespace host', () => {
        const result = runSelfhostFixture({ untrustedUrl: 'fetch("https://www.w3.org/TR/");\n' });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain('FAIL: remote URLs found in built output');
        expect(result.stdout).toContain('https://www.w3.org/TR/');
        expect(result.stdout).not.toContain('WARNING');
        expect(result.stdout).not.toContain('starting one-port host smoke');
        expect(result.hostTrace).toBe('');
    });

    test('does not allow a nested external URL in an otherwise trusted URL query', () => {
        const result = runSelfhostFixture({
            untrustedUrl: 'fetch("https://github.com/shaunburdick/europa-neo?next=HTTPS://unexpected.invalid/x");\n',
        });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain('FAIL: remote URLs found in built output');
        expect(result.stdout).toContain('https://github.com/shaunburdick/europa-neo?next=HTTPS://unexpected.invalid/x');
        expect(result.stdout).not.toContain('WARNING');
        expect(result.stdout).not.toContain('starting one-port host smoke');
        expect(result.hostTrace).toBe('');
    });

    test.each([
        ['manual host path', 'https://shaunburdick.github.io/other'],
        ['manual URL query', 'https://shaunburdick.github.io/europa-neo/manual/?source=external'],
        ['manual URL fragment', 'https://shaunburdick.github.io/europa-neo/manual/#external'],
        ['repository URL query', 'https://github.com/shaunburdick/europa-neo?token=external'],
        ['repository URL fragment', 'https://github.com/shaunburdick/europa-neo#external'],
        ['uppercase GitHub scheme', 'HTTPS://github.com/shaunburdick/europa-neo'],
        ['uppercase GitHub hostname', 'https://GITHUB.com/shaunburdick/europa-neo'],
        ['GitHub hostname lookalike', 'https://github.com.evil.invalid/shaunburdick/europa-neo'],
        ['uppercase manual scheme', 'HTTPS://shaunburdick.github.io/europa-neo/manual/'],
        ['uppercase manual hostname', 'https://SHAUNBURDICK.github.io/europa-neo/manual/'],
        ['manual hostname lookalike', 'https://shaunburdick.github.io.evil.invalid/europa-neo/manual/'],
        ['non-exact localhost spelling', 'HTTP://LOCALHOST/'],
        ['non-exact namespace spelling', 'https://WWW.W3.ORG/2000/svg'],
        ['uppercase React scheme', 'HTTPS://react.dev/errors/'],
        ['uppercase React hostname', 'https://REACT.dev/errors/'],
        ['React error URL suffix', 'https://react.dev/errors/418'],
        ['React error URL query', 'https://react.dev/errors/?args=external'],
        ['React error URL fragment', 'https://react.dev/errors/#external'],
        ['legacy React error-decoder host', 'https://reactjs.org/docs/error-decoder.html?invariant=1'],
        [
            'nested URL on manual path',
            'https://shaunburdick.github.io/europa-neo/manual/?next=https://unexpected.invalid/x',
        ],
    ])('does not allow an unexpected %s', (_description, untrustedUrl) => {
        const result = runSelfhostFixture({ untrustedUrl: `fetch("${untrustedUrl}");\n` });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain('FAIL: remote URLs found in built output');
        expect(result.stdout).toContain(untrustedUrl);
        expect(result.stdout).not.toContain('starting one-port host smoke');
        expect(result.hostTrace).toBe('');
    });

    test('preserves the explicit self-host scanner URL exceptions', () => {
        const result = runSelfhostFixture({ allowlistedUrls: true });
        expect(result.status, `${result.stdout}\n${result.stderr}\n${result.hostTrace}`).toBe(0);
        expect(result.stdout).toContain('[test-selfhost] starting one-port host smoke...');
        expect(result.stdout).toContain(
            '[test-selfhost] PASS: remote-URL scan and one-port host surface are self-hostable.',
        );
    });

    test('keeps URL-scan tool failures blocking before the advisory report', () => {
        const result = runSelfhostFixture({ failGrep: true });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain('FAIL: remote-URL scanner failed');
        expect(result.stdout).not.toContain('WARNING');
        expect(result.stdout).not.toContain('starting one-port host smoke');
        expect(result.hostTrace).toBe('');
    });

    test('warns above target and completes the one-port HTTP/WS smoke', () => {
        const result = runSelfhostFixture({ overBudget: true });
        expect(result.status, `${result.stdout}\n${result.stderr}\n${result.hostTrace}`).toBe(0);
        const expectedTotal = result.expectedTotal;
        if (expectedTotal === null) throw new Error('Over-budget fixture did not calculate its expected asset total.');
        const expectedExcess = expectedTotal - 155648;
        expect(expectedTotal).toBeGreaterThanOrEqual(155648);
        expect(result.stdout).toContain(`bundle size: ${expectedTotal} bytes gzipped (reference target 155648 bytes)`);
        expect(result.stdout).toContain(
            `WARNING: browser payload is ${expectedExcess} bytes above the 155648-byte reference target`,
        );
        const warningIndex = result.stdout.indexOf('[test-selfhost] WARNING: browser payload is');
        const smokeIndex = result.stdout.indexOf('[test-selfhost] starting one-port host smoke...');
        expect(warningIndex).toBeGreaterThanOrEqual(0);
        expect(warningIndex).toBeLessThan(smokeIndex);
        expect(result.stdout).toContain(
            '[test-selfhost] PASS: remote-URL scan and one-port host surface are self-hostable.',
        );
        expect(result.hostTrace).toContain('host:host --port');
        expect(result.hostTrace).toContain('/version');
        expect(result.hostTrace).toContain('/lobby');
        expect(result.hostTrace).toMatch(/\/assets\/(?:entry\.js|theme\.css)/);
        expect(result.hostTrace).toContain('Upgrade: websocket');
        expect(result.hostTrace).toContain('/%2e%2e/%2e%2e/package.json');
    });

    test('keeps gzip measurement failures blocking before any advisory warning or host smoke', () => {
        const result = runSelfhostFixture({ overBudget: true, failGzip: true });
        expect(result.status).toBe(9);
        expect(result.stdout).not.toContain('WARNING');
        expect(result.stdout).not.toContain('starting one-port host smoke');
        expect(result.hostTrace).toBe('');
    });

    test('keeps an HTTP smoke failure blocking even after an over-target warning', () => {
        const result = runSelfhostFixture({ overBudget: true, failHttp: true });
        expect(result.status).toBe(22);
        const warningIndex = result.stdout.indexOf('[test-selfhost] WARNING: browser payload is');
        const smokeIndex = result.stdout.indexOf('[test-selfhost] starting one-port host smoke...');
        expect(warningIndex).toBeGreaterThanOrEqual(0);
        expect(warningIndex).toBeLessThan(smokeIndex);
        expect(result.hostTrace).toContain('/lobby');
        expect(result.hostTrace).not.toContain('Upgrade: websocket');
        expect(result.stdout).not.toContain('[test-selfhost] PASS:');
    });

    test('keeps an HTTP/WS smoke failure blocking even after an over-target warning', () => {
        const result = runSelfhostFixture({ overBudget: true, failWebSocket: true });
        expect(result.status).toBe(1);
        const warningIndex = result.stdout.indexOf('[test-selfhost] WARNING: browser payload is');
        const smokeIndex = result.stdout.indexOf('[test-selfhost] starting one-port host smoke...');
        expect(warningIndex).toBeGreaterThanOrEqual(0);
        expect(warningIndex).toBeLessThan(smokeIndex);
        expect(result.stdout).toContain('FAIL: WebSocket upgrade did not return 101');
        expect(result.hostTrace).toContain('Upgrade: websocket');
        expect(result.stdout).not.toContain('[test-selfhost] PASS:');
    });

    test('keeps the missing-asset probe transport failure blocking after an over-target warning', () => {
        const result = runSelfhostFixture({ overBudget: true, failMissingAssetProbe: true });
        expect(result.status).toBe(23);
        const warningIndex = result.stdout.indexOf('[test-selfhost] WARNING: browser payload is');
        const smokeIndex = result.stdout.indexOf('[test-selfhost] starting one-port host smoke...');
        expect(warningIndex).toBeGreaterThanOrEqual(0);
        expect(warningIndex).toBeLessThan(smokeIndex);
        expect(result.hostTrace).toContain('/assets/missing-selfhost.js');
        expect(result.stdout).not.toContain('[test-selfhost] PASS:');
    });

    test('keeps an unexpected missing-asset status blocking after an over-target warning', () => {
        const result = runSelfhostFixture({ overBudget: true, wrongMissingAssetStatus: true });
        expect(result.status).toBe(1);
        const warningIndex = result.stdout.indexOf('[test-selfhost] WARNING: browser payload is');
        const smokeIndex = result.stdout.indexOf('[test-selfhost] starting one-port host smoke...');
        expect(warningIndex).toBeGreaterThanOrEqual(0);
        expect(warningIndex).toBeLessThan(smokeIndex);
        expect(result.stdout).toContain('FAIL: missing asset probe returned 500, expected 404');
        expect(result.hostTrace).toContain('/assets/missing-selfhost.js');
        expect(result.stdout).not.toContain('[test-selfhost] PASS:');
    });
});
