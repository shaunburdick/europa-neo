/** Contract-level inventory tests for the future brand generator (spec 015). */

import { describe, expect, it } from 'vitest';

import { EXPECTED_BRAND_MANIFEST, SOURCE_MASTER_PATHS } from './inventory.fixture.js';

describe('brand source-tree inventory', () => {
    it('names all nine source SVG masters', () => {
        expect(SOURCE_MASTER_PATHS).toHaveLength(9);
        expect(new Set(SOURCE_MASTER_PATHS).size).toBe(SOURCE_MASTER_PATHS.length);
        expect(SOURCE_MASTER_PATHS.every((path) => path.startsWith('src/brand/masters/'))).toBe(true);
    });

    it('keeps source masters outside the consumer manifest', () => {
        const generatedPaths = EXPECTED_BRAND_MANIFEST.assets.map(({ path }) => path);

        expect(generatedPaths.every((path) => path.startsWith('brand/'))).toBe(true);
        expect(generatedPaths.some((path) => path.includes('/masters/'))).toBe(false);
    });
});

describe('typed generated brand manifest scaffold', () => {
    it('names every required generated logical asset before generators exist', () => {
        expect(EXPECTED_BRAND_MANIFEST.version).toBe(1);
        expect(EXPECTED_BRAND_MANIFEST.assets).toHaveLength(17);
        const assetIds = EXPECTED_BRAND_MANIFEST.assets.map(({ id }) => id);

        expect(assetIds).toEqual([
            'apple-touch-icon',
            'emblem',
            'emblem-compact',
            'emblem-dark',
            'emblem-light',
            'emblem-mono',
            'favicon',
            'favicon-ico',
            'icon-192',
            'icon-512',
            'icon-512-maskable',
            'lockup',
            'lockup-dark',
            'lockup-light',
            'lockup-mono',
            'site-manifest',
            'social',
        ]);
        expect(assetIds).toEqual([...assetIds].sort());
    });

    it('pins the required raster dimensions and maskable safe area', () => {
        const assetsById = new Map(EXPECTED_BRAND_MANIFEST.assets.map((asset) => [asset.id, asset]));

        expect(assetsById.get('apple-touch-icon')).toMatchObject({ width: 180, height: 180 });
        expect(assetsById.get('icon-192')).toMatchObject({ width: 192, height: 192 });
        expect(assetsById.get('icon-512')).toMatchObject({ width: 512, height: 512 });
        expect(assetsById.get('icon-512-maskable')).toMatchObject({
            width: 512,
            height: 512,
            purpose: 'maskable',
            safeArea: { shape: 'circle', diameterRatio: 0.8 },
        });
        expect(assetsById.get('social')).toMatchObject({ width: 1200, height: 630 });
    });
});
