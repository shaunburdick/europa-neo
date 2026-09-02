import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
    BRAND_MASTERS_DIRECTORY,
    createIconSvg,
    createSocialSvg,
    generateBrandAssets,
} from '../../scripts/generate-brand.js';

const pngSize = (png: Uint8Array): readonly [number, number] => {
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    return [view.getUint32(16), view.getUint32(20)];
};

describe('brand raster generation', () => {
    it('keeps install artwork inside the documented maskable safe area', () => {
        const maskable = createIconSvg('<path d="M0 0h512v512H0z"/>', 512, 0.8);
        expect(maskable).toContain('translate(51.19999999999999 51.19999999999999) scale(0.8)');
        expect(maskable).toContain('fill="#0a0f1a"');
    });

    it('composes the social preview without external resources', async () => {
        const lockup = await readFile(path.join(BRAND_MASTERS_DIRECTORY, 'lockup.svg'), 'utf8');
        const social = createSocialSvg(lockup);
        expect(social).toContain('viewBox="0 0 1200 630"');
        expect(social).not.toMatch(/<(?:image|script)\b|\b(?:href|xlink:href)\s*=\s*["'](?!#)/i);
    });

    it('writes exact dimensions and reproducible bytes for all T-010 PNGs', async () => {
        const first = await mkdtemp(path.join(os.tmpdir(), 'europa-brand-'));
        const second = await mkdtemp(path.join(os.tmpdir(), 'europa-brand-'));
        try {
            await generateBrandAssets({ outputDirectory: first });
            await generateBrandAssets({ outputDirectory: second });
            for (const [name, dimensions] of Object.entries({
                'apple-touch-icon.png': [180, 180],
                'icon-192.png': [192, 192],
                'icon-512.png': [512, 512],
                'icon-512-maskable.png': [512, 512],
                'europa-neo-social.png': [1200, 630],
            })) {
                const firstBytes = await readFile(path.join(first, name));
                const secondBytes = await readFile(path.join(second, name));
                expect(pngSize(firstBytes)).toEqual(dimensions);
                expect(firstBytes).toEqual(secondBytes);
            }
            expect(await readFile(path.join(first, 'europa-neo-lockup.svg'), 'utf8')).toEqual(
                await readFile(path.join(BRAND_MASTERS_DIRECTORY, 'lockup.svg'), 'utf8'),
            );
        } finally {
            await Promise.all([
                rm(first, { recursive: true, force: true }),
                rm(second, { recursive: true, force: true }),
            ]);
        }
    }, 30_000);
});
