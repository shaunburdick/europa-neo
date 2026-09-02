import { mkdtemp, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { assertGeneratedBrandAssets, generateBrandAssets } from '../../scripts/generate-brand.js';
import { BRAND_MANIFEST } from '../../src/brand/manifest.js';
import { createWebManifest } from '../../src/brand/web-manifest.js';

const outputName = (assetPath: string): string => assetPath.slice('brand/'.length);

interface ParsedWebManifest {
    readonly icons: readonly { readonly src: string; readonly purpose?: string }[];
}

describe('generated brand output contract', () => {
    it('contains every manifest asset with safe paths and authoritative metadata', async () => {
        const output = await mkdtemp(path.join(os.tmpdir(), 'europa-brand-output-'));
        try {
            await generateBrandAssets({ outputDirectory: output });
            const names = new Set(await readdir(output));
            expect(names).toEqual(new Set(BRAND_MANIFEST.assets.map(({ path: assetPath }) => outputName(assetPath))));
            for (const asset of BRAND_MANIFEST.assets) {
                expect(asset.path).toMatch(/^brand\/[A-Za-z0-9._-]+$/);
                expect(asset.path).not.toMatch(/(?:^|\/)(?:\.|\.\.)\//);
                const bytes = await readFile(path.join(output, outputName(asset.path)));
                if (asset.format === 'svg') expect(bytes.toString('utf8')).toContain('<svg');
                if (asset.format === 'png')
                    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
                if (asset.format === 'ico') expect([...bytes.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
                if (asset.format === 'webmanifest') {
                    const manifest = JSON.parse(bytes.toString('utf8')) as ParsedWebManifest;
                    expect(manifest).toEqual(createWebManifest());
                    expect(manifest.icons.every(({ src }) => /^\.\/[A-Za-z0-9._-]+$/.test(src))).toBe(true);
                    expect(manifest.icons.map(({ purpose }) => purpose)).toEqual(['any', 'any', 'maskable']);
                }
            }
        } finally {
            await rm(output, { recursive: true, force: true });
        }
    }, 30_000);

    it('rejects missing, stale, malformed, and source-drifting output in a clean assertion', async () => {
        const output = await mkdtemp(path.join(os.tmpdir(), 'europa-brand-output-'));
        try {
            await generateBrandAssets({ outputDirectory: output });
            await unlink(path.join(output, 'icon-192.png'));
            await expect(assertGeneratedBrandAssets(output)).rejects.toThrow(/missing:.*icon-192\.png/);

            await generateBrandAssets({ outputDirectory: output });
            await writeFile(path.join(output, 'stale.txt'), 'stale');
            await expect(assertGeneratedBrandAssets(output)).rejects.toThrow(/unexpected: stale\.txt/);

            await rm(path.join(output, 'stale.txt'));
            await writeFile(path.join(output, 'europa-neo-emblem.svg'), '<svg>broken</svg>');
            await expect(assertGeneratedBrandAssets(output)).rejects.toThrow(
                /failed validation|differs from emblem\.svg/,
            );
        } finally {
            await rm(output, { recursive: true, force: true });
        }
    }, 30_000);

    it('repeats generation byte-for-byte across the complete declared inventory', async () => {
        const first = await mkdtemp(path.join(os.tmpdir(), 'europa-brand-repeat-'));
        const second = await mkdtemp(path.join(os.tmpdir(), 'europa-brand-repeat-'));
        try {
            await generateBrandAssets({ outputDirectory: first });
            await generateBrandAssets({ outputDirectory: second });
            for (const asset of BRAND_MANIFEST.assets) {
                const firstBytes = await readFile(path.join(first, outputName(asset.path)));
                const secondBytes = await readFile(path.join(second, outputName(asset.path)));
                expect(firstBytes).toEqual(secondBytes);
            }
        } finally {
            await Promise.all([
                rm(first, { recursive: true, force: true }),
                rm(second, { recursive: true, force: true }),
            ]);
        }
    }, 30_000);
});
