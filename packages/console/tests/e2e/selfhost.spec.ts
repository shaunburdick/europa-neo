/**
 * Self-hostability E2E — Feature 005 (T092).
 *
 * Invokes `scripts/test-selfhost.sh` exactly as a release engineer
 * would: builds the console for production, scans `dist/` for remote
 * URLs (constitution Principle VII — no CDN, no telemetry, no remote
 * fonts), reports the Q-P03 155,648-byte reference target, and verifies
 * the required one-port HTTP/WS host smoke even when the target is exceeded.
 *
 * The script performs its own build, so this spec needs no dev
 * server; Playwright still boots one via the shared webServer config,
 * which is harmless.
 */

import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

// Playwright transpiles specs as ESM (no __dirname); derive the path
// from import.meta.url.
const SCRIPT = new URL('../../scripts/test-selfhost.sh', import.meta.url).pathname;

test('selfhost smoke: production build has zero remote URLs and passes the one-port host checks', {
    tag: '@selfhost',
    annotation: {
        type: 'description',
        description:
            'Runs scripts/test-selfhost.sh (production build + remote-URL scan + advisory Q-P03 report + host smoke).',
    },
}, async () => {
    // Generous timeout: the script performs a full production build.
    test.setTimeout(300_000);
    // execFileSync throws on non-zero exit — build, remote-URL, and host
    // failures remain blocking; the numeric payload target only warns.
    const output = execFileSync('bash', [SCRIPT], {
        encoding: 'utf-8',
        timeout: 290_000,
    });
    expect(output).toContain('[test-selfhost] starting one-port host smoke...');
    expect(output).toContain('[test-selfhost] PASS: remote-URL scan and one-port host surface are self-hostable.');
    const measured = output.match(/bundle size: (\d+) bytes gzipped \(reference target 155648 bytes\)/);
    expect(measured).not.toBeNull();
    if (measured === null) throw new Error('Self-host report omitted the measured browser payload.');
    const totalBytes = Number(measured[1]);
    if (totalBytes >= 155648) {
        const warningIndex = output.indexOf('[test-selfhost] WARNING: browser payload');
        const smokeIndex = output.indexOf('[test-selfhost] starting one-port host smoke...');
        expect(warningIndex).toBeGreaterThanOrEqual(0);
        expect(warningIndex).toBeLessThan(smokeIndex);
    } else {
        expect(output).toContain('[test-selfhost] browser payload is within the reference target');
    }
});
