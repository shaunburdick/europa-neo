import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { assertBrandPackageSurface } from '../../scripts/check-brand-surface.js';
import { BRAND_MANIFEST } from '../../src/brand/index.js';

interface PackageJson {
    readonly exports: Record<string, unknown>;
}

describe('built brand package surface', () => {
    it('has the typed export contract and generated-only wildcard boundary', async () => {
        await assertBrandPackageSurface();
        const packageJson = JSON.parse(
            await readFile(path.resolve(import.meta.dirname, '../../package.json'), 'utf8'),
        ) as PackageJson;

        expect(packageJson.exports['./brand']).toEqual({
            types: './dist/brand/index.d.ts',
            import: './dist/brand/index.js',
        });
        expect(packageJson.exports['./brand/*']).toBe('./dist/brand/*');
        expect(BRAND_MANIFEST.assets.every((asset) => asset.path.startsWith('brand/'))).toBe(true);
        expect(BRAND_MANIFEST.assets.some((asset) => asset.path.includes('/masters/'))).toBe(false);
    });

    it('loads the public runtime entry and exposes the manifest', async () => {
        const runtime = await import('@europa/design/brand');
        expect(runtime.BRAND_MANIFEST).toEqual(BRAND_MANIFEST);
        expect(Object.keys(runtime)).toContain('BRAND_MANIFEST');
    });
});
