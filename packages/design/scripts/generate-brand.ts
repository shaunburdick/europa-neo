/**
 * Generate package-owned raster brand assets from the approved SVG masters.
 *
 * There are no timestamps, random identifiers, system-font lookups, or network
 * inputs here. The outputs are consequently a pure function of the checked-in
 * master bytes and the pinned resvg renderer.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Resvg } from '@resvg/resvg-js';

import { writeIco } from '../src/brand/ico.js';

import { serializeWebManifest } from '../src/brand/web-manifest.js';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');
export const BRAND_MASTERS_DIRECTORY = path.join(PACKAGE_ROOT, 'src', 'brand', 'masters');
export const BRAND_OUTPUT_DIRECTORY = path.join(PACKAGE_ROOT, 'dist', 'brand');

const SVG_VARIANTS = {
    'europa-neo-emblem.svg': 'emblem.svg',
    'europa-neo-emblem-compact.svg': 'emblem-compact.svg',
    'europa-neo-emblem-dark.svg': 'emblem-dark.svg',
    'europa-neo-emblem-light.svg': 'emblem-light.svg',
    'europa-neo-emblem-mono.svg': 'emblem-mono.svg',
    'europa-neo-lockup.svg': 'lockup.svg',
    'europa-neo-lockup-dark.svg': 'lockup-dark.svg',
    'europa-neo-lockup-light.svg': 'lockup-light.svg',
    'europa-neo-lockup-mono.svg': 'lockup-mono.svg',
} as const;

export interface BrandGenerationOptions {
    readonly mastersDirectory?: string;
    readonly outputDirectory?: string;
}

interface RasterTarget {
    readonly name: string;
    readonly width: number;
    readonly height: number;
    readonly svg: (emblem: string) => string;
}

const extractSvgBody = (source: string): string => source.replace(/^\s*<svg\b[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');

/** Wrap an emblem in an opaque plate for install surfaces. */
export const createIconSvg = (emblem: string, size: number, scale = 1): string => {
    const offset = ((1 - scale) * 512) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}"><title>Europa Neo</title><desc>Europa Neo emblem</desc><rect width="512" height="512" fill="#0a0f1a"/><g transform="translate(${offset} ${offset}) scale(${scale})">${extractSvgBody(emblem)}</g></svg>`;
};

/** Compose the fixed 1200×630 dark social scene from the lockup master. */
export const createSocialSvg = (lockup: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630"><title>Europa Neo</title><desc>Europa Neo — real-time strategy on Europa</desc><defs><linearGradient id="social-background" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#111827"/></linearGradient><linearGradient id="social-beam-blue" x1="0" x2="1"><stop stop-color="#1d4ed8" stop-opacity="0"/><stop offset=".5" stop-color="#3b82f6" stop-opacity=".7"/><stop offset="1" stop-color="#bae6fd" stop-opacity="0"/></linearGradient><linearGradient id="social-beam-orange" x1="1" x2="0"><stop stop-color="#c2410c" stop-opacity="0"/><stop offset=".5" stop-color="#f97316" stop-opacity=".7"/><stop offset="1" stop-color="#fed7aa" stop-opacity="0"/></linearGradient></defs><rect width="1200" height="630" fill="url(#social-background)"/><path d="M40 470 H1160" stroke="url(#social-beam-blue)" stroke-width="3"/><path d="M40 480 H1160" stroke="url(#social-beam-orange)" stroke-width="3"/><g transform="translate(344 59) scale(.9)">${extractSvgBody(lockup)}</g></svg>`;

const RASTER_TARGETS: readonly RasterTarget[] = [
    { name: 'apple-touch-icon.png', width: 180, height: 180, svg: (emblem) => createIconSvg(emblem, 180) },
    { name: 'icon-192.png', width: 192, height: 192, svg: (emblem) => createIconSvg(emblem, 192) },
    { name: 'icon-512.png', width: 512, height: 512, svg: (emblem) => createIconSvg(emblem, 512) },
    // 80% centered artwork fits the manifest's central circular safe area.
    { name: 'icon-512-maskable.png', width: 512, height: 512, svg: (emblem) => createIconSvg(emblem, 512, 0.8) },
];

/** Render an SVG at an exact size with system fonts disabled. */
export const renderPng = (svg: string, width: number, height: number): Uint8Array => {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } })
        .render()
        .asPng();
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const renderedWidth = view.getUint32(16);
    const renderedHeight = view.getUint32(20);
    if (renderedWidth !== width || renderedHeight !== height) {
        throw new Error(`resvg produced ${renderedWidth}×${renderedHeight}; expected ${width}×${height}`);
    }
    return png;
};

const getMaster = (masters: ReadonlyMap<string, string>, name: string): string => {
    const master = masters.get(name);
    if (master === undefined) throw new Error(`Missing brand master: ${name}`);
    return master;
};

/** Generate every T-010 output below a package distribution directory. */
export async function generateBrandAssets(options: BrandGenerationOptions = {}): Promise<void> {
    const mastersDirectory = options.mastersDirectory ?? BRAND_MASTERS_DIRECTORY;
    const outputDirectory = options.outputDirectory ?? BRAND_OUTPUT_DIRECTORY;
    await mkdir(outputDirectory, { recursive: true });

    const masters = new Map<string, string>();
    for (const sourceName of new Set(Object.values(SVG_VARIANTS))) {
        masters.set(sourceName, await readFile(path.join(mastersDirectory, sourceName), 'utf8'));
    }
    for (const [outputName, sourceName] of Object.entries(SVG_VARIANTS)) {
        await writeFile(path.join(outputDirectory, outputName), getMaster(masters, sourceName));
    }

    const emblem = getMaster(masters, 'emblem.svg');
    for (const target of RASTER_TARGETS) {
        await writeFile(
            path.join(outputDirectory, target.name),
            renderPng(target.svg(emblem), target.width, target.height),
        );
    }
    const faviconLayers = [16, 32, 48].map((size) => ({
        width: size,
        height: size,
        png: renderPng(createIconSvg(emblem, size), size, size),
    }));
    await writeFile(path.join(outputDirectory, 'favicon.ico'), writeIco(faviconLayers));
    await writeFile(
        path.join(outputDirectory, 'europa-neo-social.png'),
        renderPng(createSocialSvg(getMaster(masters, 'lockup.svg')), 1200, 630),
    );
    await writeFile(path.join(outputDirectory, 'site.webmanifest'), serializeWebManifest(), 'utf8');
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(import.meta.filename)) {
    generateBrandAssets().catch((error: unknown) => {
        process.stderr.write(`generate-brand failed: ${String(error)}\n`);
        process.exitCode = 1;
    });
}
