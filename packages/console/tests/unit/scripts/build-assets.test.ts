import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { BRAND_MANIFEST } from '@europa/design/brand';
import { afterEach, describe, expect, it } from 'vitest';

import { stageBrandAssets } from '../../../scripts/build-assets.js';

const temporaryDirectories: string[] = [];

const png = (width: number, height: number): Buffer => {
    const bytes = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
    return bytes;
};

const ico = (): Buffer => {
    const bytes = Buffer.alloc(6 + 3 * 16);
    bytes.writeUInt16LE(1, 2);
    bytes.writeUInt16LE(3, 4);
    [16, 32, 48].forEach((size, index) => {
        bytes[6 + index * 16] = size;
        bytes[7 + index * 16] = size;
    });
    return bytes;
};

async function createDistribution(): Promise<{ source: string; target: string }> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'europa-console-assets-'));
    temporaryDirectories.push(root);
    const source = path.join(root, 'distribution');
    const target = path.join(root, 'target');
    await mkdir(source, { recursive: true });
    for (const asset of BRAND_MANIFEST.assets) {
        const name = asset.path.slice('brand/'.length);
        let bytes: Buffer;
        if (asset.format === 'png') bytes = png(asset.width ?? 1, asset.height ?? 1);
        else if (asset.format === 'ico') bytes = ico();
        else if (asset.format === 'svg') bytes = Buffer.from('<svg viewBox="0 0 1 1"></svg>');
        else bytes = Buffer.from('{}');
        await writeFile(path.join(source, name), bytes);
    }
    return { source, target };
}

afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await Promise.all(
        temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

describe('stageBrandAssets', () => {
    it('copies exactly the manifest inventory and removes stale files', async () => {
        const { source, target } = await createDistribution();
        await mkdir(target, { recursive: true });
        await writeFile(path.join(target, 'stale.svg'), 'stale');

        const staged = await stageBrandAssets({ distributionDirectory: source, targetDirectory: target });

        expect(staged).toEqual(
            BRAND_MANIFEST.assets.map(({ path: assetPath }) => assetPath.slice('brand/'.length)).sort(),
        );
        await expect(readFile(path.join(target, 'stale.svg'))).rejects.toThrow();
        await expect(readFile(path.join(target, 'favicon.svg'))).resolves.toEqual(
            await readFile(path.join(source, 'favicon.svg')),
        );
    });

    it('fails before changing the destination when a manifest file is absent', async () => {
        const { source, target } = await createDistribution();
        const { rm } = await import('node:fs/promises');
        await rm(path.join(source, 'icon-192.png'));
        await mkdir(target, { recursive: true });
        await writeFile(path.join(target, 'keep.txt'), 'keep');

        await expect(stageBrandAssets({ distributionDirectory: source, targetDirectory: target })).rejects.toThrow(
            'icon-192.png',
        );
        await expect(readFile(path.join(target, 'keep.txt'))).resolves.toEqual(Buffer.from('keep'));
    });

    it('fails on a generated file whose dimensions disagree with the manifest', async () => {
        const { source, target } = await createDistribution();
        await writeFile(path.join(source, 'icon-192.png'), png(191, 192));

        await expect(stageBrandAssets({ distributionDirectory: source, targetDirectory: target })).rejects.toThrow(
            'icon-192.png is 191×192; expected 192×192',
        );
    });
});
