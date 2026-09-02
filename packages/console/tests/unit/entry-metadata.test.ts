import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { build } from 'vite';
import { describe, expect, it } from 'vitest';

const CONSOLE_ROOT = path.resolve(import.meta.dirname, '../..');
const INDEX_PATH = path.join(CONSOLE_ROOT, 'index.html');
const BRAND_PREFIX = 'assets/brand/';

describe('console entry metadata', () => {
    it('declares the complete local brand metadata set', async () => {
        const source = await readFile(INDEX_PATH, 'utf8');

        expect(source).toContain(`href="${BRAND_PREFIX}favicon.svg"`);
        expect(source).toContain(`href="${BRAND_PREFIX}favicon.ico"`);
        expect(source).toContain(`href="${BRAND_PREFIX}apple-touch-icon.png"`);
        expect(source).toContain(`href="${BRAND_PREFIX}site.webmanifest"`);
        expect(source).toContain(`content="${BRAND_PREFIX}europa-neo-social.png"`);
        expect(source).toContain('property="og:image:width" content="1200"');
        expect(source).toContain('property="og:image:height" content="630"');
        expect(source).toContain('property="og:image:type" content="image/png"');
        expect(source).toContain('name="twitter:card" content="summary_large_image"');
        expect(source).toContain('name="twitter:image:alt" content="Europa Neo"');
        expect(source).not.toMatch(/(?:https?:|data:)/);
    });

    it('keeps metadata URLs relative to preserve the configured repository base', async () => {
        const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'europa-console-entry-'));

        try {
            await build({
                root: CONSOLE_ROOT,
                base: '/europa-neo/',
                logLevel: 'silent',
                build: {
                    outDir: outputDirectory,
                    emptyOutDir: false,
                },
            });
            const transformed = await readFile(path.join(outputDirectory, 'index.html'), 'utf8');

            expect(transformed).toContain('href="assets/brand/favicon.svg"');
            expect(transformed).toContain('href="assets/brand/site.webmanifest"');
            expect(transformed).toContain('content="assets/brand/europa-neo-social.png"');
            expect(new URL('assets/brand/favicon.svg', 'https://self-host.example/europa-neo/lobby').pathname).toBe(
                '/europa-neo/assets/brand/favicon.svg',
            );
            expect(
                new URL('assets/brand/europa-neo-social.png', 'https://self-host.example/europa-neo/lobby').pathname,
            ).toBe('/europa-neo/assets/brand/europa-neo-social.png');
            expect(transformed).not.toMatch(/(?:href|content)="\/assets\/brand\//);
        } finally {
            await rm(outputDirectory, { recursive: true, force: true });
        }
    }, 30_000);
});
