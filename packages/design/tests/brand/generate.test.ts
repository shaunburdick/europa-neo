import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
    assertGeneratedBrandAssets,
    BRAND_MASTERS_DIRECTORY,
    createSocialSvg,
    generateBrandAssets,
    MASKABLE_SAFE_AREA_DIAMETER_RATIO,
    MASKABLE_SCALE,
    transformMaskablePoint,
} from '../../scripts/generate-brand.js';

const pngSize = (png: Uint8Array): readonly [number, number] => {
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    return [view.getUint32(16), view.getUint32(20)];
};

describe('brand raster generation', () => {
    it('keeps every essential emblem geometry inside the centered circular safe area', () => {
        const safeRadius = (512 * MASKABLE_SAFE_AREA_DIAMETER_RATIO) / 2;
        // Conservative authored-space bounds include the shield stroke/miter,
        // moon, circuitry, and the clipped energy-beam extremities.
        const essentialBounds: readonly (readonly [number, number])[] = [
            [82, 42],
            [430, 42],
            [50, 74],
            [462, 74],
            [50, 326],
            [462, 326],
            [74, 388],
            [438, 388],
            [256, 490], // shield, including stroke margin
            [142, 136],
            [370, 360], // moon circle bounds
            [74, 94],
            [438, 426], // circuitry extents plus stroke margin
            [50, 257],
            [462, 365], // clipped blue/orange energy bounds
        ];
        const distances = essentialBounds.map(([x, y]) => {
            const [transformedX, transformedY] = transformMaskablePoint([x, y]);
            return Math.hypot(transformedX - 256, transformedY - 256);
        });
        const maximumDistance = Math.max(...distances);
        const sourceMaximumDistance = maximumDistance / MASKABLE_SCALE;

        expect(transformMaskablePoint([256, 256])).toEqual([256, 256]);
        expect(maximumDistance).toBeLessThanOrEqual(safeRadius);
        // This is a regression guard for the former moon-only 0.8 transform:
        // the shield corners would have been cropped by the circular mask.
        expect(sourceMaximumDistance * 0.8).toBeGreaterThan(safeRadius);
        expect(MASKABLE_SCALE).toBe(0.72);
        expect(safeRadius - maximumDistance).toBeGreaterThan(5);
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
            expect(await readFile(path.join(first, 'favicon.svg'), 'utf8')).toEqual(
                await readFile(path.join(BRAND_MASTERS_DIRECTORY, 'emblem.svg'), 'utf8'),
            );
        } finally {
            await Promise.all([
                rm(first, { recursive: true, force: true }),
                rm(second, { recursive: true, force: true }),
            ]);
        }
    }, 30_000);

    it('fails with an actionable source path when a master is missing', async () => {
        const output = await mkdtemp(path.join(os.tmpdir(), 'europa-brand-missing-'));
        try {
            await expect(
                generateBrandAssets({
                    mastersDirectory: path.join(output, 'missing-masters'),
                    outputDirectory: output,
                }),
            ).rejects.toThrow(/missing-masters[\\/]emblem\.svg/);
        } finally {
            await rm(output, { recursive: true, force: true });
        }
    });

    it('rejects an incomplete generated inventory during the clean-build assertion', async () => {
        const output = await mkdtemp(path.join(os.tmpdir(), 'europa-brand-output-'));
        try {
            await expect(assertGeneratedBrandAssets(output)).rejects.toThrow(/missing:/);
        } finally {
            await rm(output, { recursive: true, force: true });
        }
    });

    it('rejects malformed ICO and manifest output during the clean-build assertion', async () => {
        const output = await mkdtemp(path.join(os.tmpdir(), 'europa-brand-malformed-'));
        try {
            await generateBrandAssets({ outputDirectory: output });
            const ico = await readFile(path.join(output, 'favicon.ico'));
            new DataView(ico.buffer, ico.byteOffset, ico.byteLength).setUint16(2, 0, true);
            await writeFile(path.join(output, 'favicon.ico'), ico);
            await expect(assertGeneratedBrandAssets(output)).rejects.toThrow(/favicon\.ico failed validation/);

            await generateBrandAssets({ outputDirectory: output });
            await writeFile(path.join(output, 'site.webmanifest'), '{}\n');
            await expect(assertGeneratedBrandAssets(output)).rejects.toThrow(
                /site\.webmanifest is not manifest-consistent/,
            );
        } finally {
            await rm(output, { recursive: true, force: true });
        }
    }, 30_000);
});
