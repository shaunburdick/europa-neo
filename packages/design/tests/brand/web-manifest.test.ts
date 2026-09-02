import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateBrandAssets } from '../../scripts/generate-brand.js';
import { createWebManifest, serializeWebManifest, type WebManifest } from '../../src/brand/web-manifest.js';
import { TOKENS } from '../../src/tokens.js';

describe('generated web app manifest', () => {
    it('contains the required install metadata and maskable treatment', () => {
        const manifest = createWebManifest();

        expect(manifest).toMatchObject({
            name: 'Europa Neo',
            short_name: 'Europa Neo',
            start_url: './',
            scope: './',
            display: 'standalone',
            theme_color: TOKENS.color.pageBg,
            background_color: TOKENS.color.pageBg,
        });
        expect(manifest.icons).toEqual([
            { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: './icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ]);
    });

    it('uses only relative paths that resolve within the generated brand directory', () => {
        const manifest = createWebManifest();
        const manifestUrl = new URL('https://self-host.example/game/brand/site.webmanifest');

        for (const icon of manifest.icons) {
            expect(icon.src.startsWith('./')).toBe(true);
            const resolved = new URL(icon.src, manifestUrl);
            expect(resolved.pathname).toMatch(/^\/game\/brand\/icon-(?:192|512)(?:-maskable)?\.png$/);
            expect(resolved.origin).toBe(manifestUrl.origin);
        }
        expect(manifest.start_url.startsWith('/')).toBe(false);
        expect(manifest.scope.startsWith('/')).toBe(false);
    });

    it('has stable JSON formatting and is emitted by the brand generator', async () => {
        const first = await mkdtemp(path.join(os.tmpdir(), 'europa-manifest-'));
        const second = await mkdtemp(path.join(os.tmpdir(), 'europa-manifest-'));
        try {
            await generateBrandAssets({ outputDirectory: first });
            await generateBrandAssets({ outputDirectory: second });
            const firstBytes = await readFile(path.join(first, 'site.webmanifest'), 'utf8');
            const secondBytes = await readFile(path.join(second, 'site.webmanifest'), 'utf8');

            expect(firstBytes).toBe(serializeWebManifest());
            expect(firstBytes).toBe(secondBytes);
            expect(JSON.parse(firstBytes) as WebManifest).toEqual(createWebManifest());
        } finally {
            await Promise.all([
                rm(first, { recursive: true, force: true }),
                rm(second, { recursive: true, force: true }),
            ]);
        }
    }, 30_000);
});
