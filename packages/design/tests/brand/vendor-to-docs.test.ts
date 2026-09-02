import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateBrandAssets } from '../../scripts/generate-brand.js';
import { stageBrandToDocs } from '../../scripts/vendor-to-docs.js';
import { BRAND_MANIFEST } from '../../src/brand/manifest.js';

const assetNames = BRAND_MANIFEST.assets.map(({ path: assetPath }) => assetPath.slice('brand/'.length)).sort();

describe('manual brand staging', () => {
    it('copies exactly the manifest inventory byte-for-byte and removes stale output', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'europa-brand-stage-'));
        const distribution = path.join(root, 'dist', 'brand');
        const target = path.join(root, 'manual', 'assets', 'brand');
        try {
            await generateBrandAssets({ outputDirectory: distribution });
            await mkdir(target, { recursive: true });
            await writeFile(path.join(target, 'stale.txt'), 'not package-owned');

            const staged = await stageBrandToDocs({ distributionDirectory: distribution, targetDirectory: target });
            expect(staged).toEqual(assetNames);
            expect(await readdir(target)).toEqual(assetNames);
            for (const name of assetNames) {
                expect(await readFile(path.join(target, name))).toEqual(await readFile(path.join(distribution, name)));
            }
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('fails closed when a selected package file is absent without creating output', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'europa-brand-stage-'));
        const distribution = path.join(root, 'dist', 'brand');
        const target = path.join(root, 'manual', 'assets', 'brand');
        try {
            await generateBrandAssets({ outputDirectory: distribution });
            await rm(path.join(distribution, 'favicon.svg'));

            await expect(
                stageBrandToDocs({ distributionDirectory: distribution, targetDirectory: target }),
            ).rejects.toThrow(/missing package distribution file\(s\): favicon\.svg/);
            await expect(readdir(target)).rejects.toMatchObject({ code: 'ENOENT' });
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('fails closed when the package distribution itself is absent', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'europa-brand-stage-'));
        try {
            await expect(
                stageBrandToDocs({
                    distributionDirectory: path.join(root, 'missing-brand'),
                    targetDirectory: path.join(root, 'manual', 'assets', 'brand'),
                }),
            ).rejects.toThrow(/package distribution is unavailable/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
