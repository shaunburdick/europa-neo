import { describe, expect, it } from 'vitest';

import { BRAND_MANIFEST } from '../../src/brand/manifest.js';
import { resolveBrandAssetPath, resolveBrandDistributionPath, resolveBrandSourcePath } from '../../src/brand/paths.js';

describe('brand package path helpers', () => {
    it('resolves declared generated paths below the package distribution', () => {
        expect(resolveBrandAssetPath('brand/favicon.svg')).toMatch(
            /packages[\\/]design[\\/]dist[\\/]brand[\\/]favicon\.svg$/,
        );
        expect(resolveBrandDistributionPath('social')).toMatch(
            /packages[\\/]design[\\/]dist[\\/]brand[\\/]europa-neo-social\.png$/,
        );
    });

    it('resolves canonical masters but never generated consumer paths as source', () => {
        expect(resolveBrandSourcePath('lockup.svg')).toMatch(
            /packages[\\/]design[\\/]src[\\/]brand[\\/]masters[\\/]lockup\.svg$/,
        );
        expect(() => resolveBrandSourcePath('../dist/brand/favicon.svg')).toThrow();
        expect(() => resolveBrandSourcePath('favicon.svg')).toThrow();
    });

    it.each([
        '../secret',
        'brand/../secret',
        '/tmp/logo.svg',
        'brand/favicon.svg?x',
        'brand/favicon.svg#x',
        'brand\\favicon.svg',
    ])('rejects unsafe path %s', (path) => {
        expect(() => resolveBrandAssetPath(path)).toThrow();
    });

    it('rejects paths that are safe-looking but not manifest-declared', () => {
        expect(() => resolveBrandAssetPath('brand/masters/lockup.svg')).toThrow('Undeclared');
        expect(() => resolveBrandAssetPath('brand/not-generated.svg')).toThrow('Undeclared');
        expect(BRAND_MANIFEST.assets.every((asset) => asset.path.startsWith('brand/'))).toBe(true);
    });
});
