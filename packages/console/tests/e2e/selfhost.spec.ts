/**
 * Self-hostability E2E — Feature 005 (T092).
 *
 * Invokes `scripts/test-selfhost.sh` exactly as a release engineer
 * would: builds the console for production, scans `dist/` for remote
 * URLs (constitution Principle VII — no CDN, no telemetry, no remote
 * fonts), and enforces the Q-P03 gzipped-bundle budget (< 150 KB).
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

test('selfhost smoke: production build has zero remote URLs and fits the bundle budget', {
  tag: '@selfhost',
  annotation: {
    type: 'description',
    description:
      'Runs scripts/test-selfhost.sh (production build + remote-URL scan + Q-P03 gzip budget).',
  },
}, async () => {
  // Generous timeout: the script performs a full production build.
  test.setTimeout(300_000);
  // execFileSync throws on non-zero exit — which IS the assertion:
  // the script fails on any remote URL or budget breach.
  const output = execFileSync('bash', [SCRIPT], {
    encoding: 'utf-8',
    timeout: 290_000,
    env: { ...process.env, SELFHOST_BUNDLE_BUDGET_BYTES: '153600' },
  });
  expect(output).toContain('[test-selfhost] PASS');
});
