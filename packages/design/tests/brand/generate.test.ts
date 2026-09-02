import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
    assertGeneratedBrandAssets,
    BRAND_MASTERS_DIRECTORY,
    createMaskableIconSvg,
    createSocialSvg,
    generateBrandAssets,
    MASKABLE_SAFE_AREA_DIAMETER_RATIO,
    MASKABLE_SCALE,
    renderPng,
    transformMaskablePoint,
} from '../../scripts/generate-brand.js';
import { BRAND_MANIFEST } from '../../src/brand/manifest.js';

const pngSize = (png: Uint8Array): readonly [number, number] => {
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    return [view.getUint32(16), view.getUint32(20)];
};

interface DecodedPng {
    readonly width: number;
    readonly height: number;
    readonly pixels: Uint8Array;
}

/** Decode the RGBA PNG emitted by resvg without adding a production dependency. */
const decodeRgbaPng = (png: Uint8Array): DecodedPng => {
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    const idat: number[] = [];
    let offset = 8;
    let colorType = 0;
    let bitDepth = 0;
    while (offset < png.byteLength) {
        const length = view.getUint32(offset);
        const type = String.fromCharCode(...png.slice(offset + 4, offset + 8));
        const payload = png.slice(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            bitDepth = payload[8] ?? 0;
            colorType = payload[9] ?? 0;
        } else if (type === 'IDAT') {
            idat.push(...payload);
        }
        offset += 12 + length;
    }
    expect([bitDepth, colorType]).toEqual([8, 6]);
    const stride = width * 4;
    const filtered = inflateSync(Uint8Array.from(idat));
    const pixels = new Uint8Array(height * stride);
    for (let y = 0; y < height; y += 1) {
        const filter = filtered[y * (stride + 1)];
        const rowStart = y * stride;
        const sourceStart = y * (stride + 1) + 1;
        for (let x = 0; x < stride; x += 1) {
            const left = x >= 4 ? pixels[rowStart + x - 4] : 0;
            const above = y > 0 ? pixels[rowStart - stride + x] : 0;
            const upperLeft = y > 0 && x >= 4 ? pixels[rowStart - stride + x - 4] : 0;
            const value = filtered[sourceStart + x] ?? 0;
            const predictor =
                filter === 1
                    ? left
                    : filter === 2
                      ? above
                      : filter === 3
                        ? Math.floor((left + above) / 2)
                        : filter === 4
                          ? paeth(left, above, upperLeft)
                          : 0;
            pixels[rowStart + x] = (value + predictor) & 0xff;
        }
    }
    return { width, height, pixels };
};

const paeth = (left: number, above: number, upperLeft: number): number => {
    const estimate = left + above - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const aboveDistance = Math.abs(estimate - above);
    const upperLeftDistance = Math.abs(estimate - upperLeft);
    return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
        ? left
        : aboveDistance <= upperLeftDistance
          ? above
          : upperLeft;
};

describe('brand raster generation', () => {
    it('keeps the generated maskable SVG and emitted PNG inside the manifest safe area', async () => {
        const emblem = await readFile(path.join(BRAND_MASTERS_DIRECTORY, 'emblem.svg'), 'utf8');
        const maskableSvg = createMaskableIconSvg(emblem);
        const maskableAsset = BRAND_MANIFEST.assets.find((asset) => asset.id === 'icon-512-maskable');
        expect(maskableAsset).toBeDefined();
        expect(maskableAsset?.safeArea).toEqual({ shape: 'circle', diameterRatio: 0.8 });
        const safeArea = maskableAsset?.safeArea;
        if (safeArea === null || safeArea === undefined) throw new Error('Maskable manifest asset lacks a safe area');
        expect(safeArea.diameterRatio).toBe(0.8);
        expect(safeArea.diameterRatio).toBe(MASKABLE_SAFE_AREA_DIAMETER_RATIO);
        const safeRadius = (512 * safeArea.diameterRatio) / 2;
        const expectedOffset = ((1 - MASKABLE_SCALE) * 512) / 2;
        expect(maskableSvg).toContain(`translate(${expectedOffset} ${expectedOffset}) scale(${MASKABLE_SCALE})`);
        expect(maskableSvg).toContain(emblem.replace(/^\s*<svg\b[^>]*>/i, '').replace(/<\/svg>\s*$/i, ''));
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

        const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'europa-brand-maskable-'));
        try {
            await generateBrandAssets({ outputDirectory });
            const emittedMaskablePng = await readFile(path.join(outputDirectory, 'icon-512-maskable.png'));
            const rendered = decodeRgbaPng(emittedMaskablePng);
            const visiblePixels: Array<readonly [number, number]> = [];
            for (let y = 0; y < rendered.height; y += 1) {
                for (let x = 0; x < rendered.width; x += 1) {
                    const index = (y * rendered.width + x) * 4;
                    const differsFromPlate = [0, 1, 2].some(
                        (channel) => Math.abs((rendered.pixels[index + channel] ?? 0) - [10, 15, 26][channel]) > 3,
                    );
                    if (differsFromPlate) visiblePixels.push([x + 0.5, y + 0.5]);
                }
            }
            const renderedMaximumDistance = Math.max(...visiblePixels.map(([x, y]) => Math.hypot(x - 256, y - 256)));
            expect(renderedMaximumDistance).toBeLessThanOrEqual(safeRadius);
            expect(safeRadius - renderedMaximumDistance).toBeGreaterThan(2);
        } finally {
            await rm(outputDirectory, { recursive: true, force: true });
        }

        // Keep this direct renderer check alongside the generated-output check so
        // failures identify whether composition or output selection regressed.
        const rendered = decodeRgbaPng(renderPng(maskableSvg, 512, 512));
        const visiblePixels: Array<readonly [number, number]> = [];
        for (let y = 0; y < rendered.height; y += 1) {
            for (let x = 0; x < rendered.width; x += 1) {
                const index = (y * rendered.width + x) * 4;
                const differsFromPlate = [0, 1, 2].some(
                    (channel) => Math.abs((rendered.pixels[index + channel] ?? 0) - [10, 15, 26][channel]) > 3,
                );
                if (differsFromPlate) visiblePixels.push([x + 0.5, y + 0.5]);
            }
        }
        const renderedMaximumDistance = Math.max(...visiblePixels.map(([x, y]) => Math.hypot(x - 256, y - 256)));
        expect(renderedMaximumDistance).toBeLessThanOrEqual(safeRadius);
        expect(safeRadius - renderedMaximumDistance).toBeGreaterThan(2);
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
