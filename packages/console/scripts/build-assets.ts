/**
 * Asset pipeline for the Europa Neo console (research.md §8).
 *
 * Reads SVG sprites from `assets/sprites/*.svg` and renders each to
 * PNG at 1×/2×/3×/4× via @resvg/resvg-js, writing to `public/sprites/`.
 * Copies OGG sound sources from `assets/sounds/*.ogg` to
 * `public/sounds/` (no-op re-encode for v1 — silent placeholders per
 * research.md §11 "Risks").
 *
 * The script is reproducible: same input bytes → same output bytes
 * (no timestamps, no randomness). With an empty/missing `assets/`
 * tree it is a clean no-op, so `pnpm build` succeeds on the scaffold.
 *
 * CLI: `tsx scripts/build-assets.ts`
 */
import { existsSync } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BRAND_MANIFEST } from '@europa/design/brand';
import { Resvg } from '@resvg/resvg-js';

/** Scale multipliers every sprite is rendered at (1× baseline + HiDPI). */
const SPRITE_SCALES: readonly number[] = [1, 2, 3, 4];

/** Package root (this script lives in `<root>/scripts/`). */
const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');

/** Source directory for sprite sources. */
const SPRITES_SRC_DIR = path.join(PACKAGE_ROOT, 'assets', 'sprites');

/** Output directory for rendered sprite PNGs. */
const SPRITES_OUT_DIR = path.join(PACKAGE_ROOT, 'public', 'sprites');

/** Source directory for sound sources. */
const SOUNDS_SRC_DIR = path.join(PACKAGE_ROOT, 'assets', 'sounds');

/** Output directory for packaged sounds. */
const SOUNDS_OUT_DIR = path.join(PACKAGE_ROOT, 'public', 'sounds');

/** Output directory for package-owned brand assets. */
const BRAND_OUT_DIR = path.join(PACKAGE_ROOT, 'dist', 'assets', 'brand');

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const assetName = (assetPath: `brand/${string}`): string => assetPath.slice('brand/'.length);

/** Options for staging the generated design package brand inventory. */
export interface BrandStagingOptions {
    /** Absolute `@europa/design/dist/brand` directory. */
    readonly distributionDirectory: string;
    /** Destination `dist/assets/brand` directory. */
    readonly targetDirectory: string;
}

const pngDimensions = (bytes: Uint8Array): readonly [number, number] => {
    if (bytes.length < 24 || !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
        throw new Error('file is not a PNG');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return [view.getUint32(16), view.getUint32(20)];
};

const validateAsset = async (asset: (typeof BRAND_MANIFEST.assets)[number], filePath: string): Promise<void> => {
    const bytes = await readFile(filePath);
    const name = assetName(asset.path);
    if (asset.format === 'png') {
        const [width, height] = pngDimensions(bytes);
        if (width !== asset.width || height !== asset.height) {
            throw new Error(`brand asset ${name} is ${width}×${height}; expected ${asset.width}×${asset.height}`);
        }
    } else if (asset.format === 'svg' && (!bytes.includes('<svg') || !bytes.includes('viewBox'))) {
        throw new Error(`brand asset ${name} is not a valid SVG distribution file`);
    } else if (asset.format === 'webmanifest') {
        try {
            JSON.parse(bytes.toString());
        } catch (error: unknown) {
            throw new Error(`brand asset ${name} is not valid JSON`, { cause: error });
        }
    } else if (asset.format === 'ico') {
        if (bytes.length < 6) throw new Error(`brand asset ${name} has a truncated ICO header`);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const count = view.getUint16(4, true);
        const dimensions = new Set<string>();
        for (let index = 0; index < count; index += 1) {
            const offset = 6 + index * 16;
            if (offset + 16 > bytes.length) throw new Error(`brand asset ${name} has a truncated ICO directory`);
            const width = bytes[offset] === 0 ? 256 : bytes[offset];
            const height = bytes[offset + 1] === 0 ? 256 : bytes[offset + 1];
            dimensions.add(`${width}×${height}`);
        }
        if (count !== 3 || ![16, 32, 48].every((size) => dimensions.has(`${size}×${size}`))) {
            throw new Error(`brand asset ${name} must contain 16×16, 32×32, and 48×48 images`);
        }
    }
};

/** Stage exactly the manifest-selected design distribution files into the console build. */
export async function stageBrandAssets(options: BrandStagingOptions): Promise<readonly string[]> {
    const assets = [...BRAND_MANIFEST.assets].sort((left, right) => left.path.localeCompare(right.path));
    let entries: string[];
    try {
        entries = await readdir(options.distributionDirectory);
    } catch (error: unknown) {
        throw new Error(
            `Cannot stage console brand assets: distribution is unavailable at ${options.distributionDirectory}`,
            {
                cause: error,
            },
        );
    }
    const expected = assets.map(({ path: assetPath }) => assetName(assetPath));
    const missing = expected.filter((name) => !entries.includes(name));
    if (missing.length > 0) {
        throw new Error(`Cannot stage console brand assets: missing distribution file(s): ${missing.join(', ')}`);
    }
    const sourceRoot = path.resolve(options.distributionDirectory);
    const sources = assets.map((asset) => {
        const name = assetName(asset.path);
        const sourcePath = path.resolve(sourceRoot, name);
        if (path.dirname(sourcePath) !== sourceRoot) throw new Error(`Cannot stage unsafe brand path: ${name}`);
        return { asset, name, sourcePath };
    });
    for (const { asset, name, sourcePath } of sources) {
        const details = await lstat(sourcePath);
        if (!details.isFile() || details.isSymbolicLink())
            throw new Error(`Cannot stage non-file brand asset: ${name}`);
        await validateAsset(asset, sourcePath);
    }
    await rm(options.targetDirectory, { recursive: true, force: true });
    await mkdir(options.targetDirectory, { recursive: true });
    for (const { name, sourcePath } of sources) await copyFile(sourcePath, path.join(options.targetDirectory, name));
    return expected;
}

/**
 * Renders one SVG source to PNGs at every configured scale.
 *
 * @param svgPath - Absolute path to the source SVG.
 * @param name - Output base filename (without extension).
 */
async function renderSprite(svgPath: string, name: string): Promise<void> {
    const svg = await readFile(svgPath);

    for (const scale of SPRITE_SCALES) {
        const resvg = new Resvg(svg, {
            fitTo: { mode: 'zoom', value: scale },
            font: { loadSystemFonts: false },
        });
        const png = resvg.render().asPng();
        await writeFile(path.join(SPRITES_OUT_DIR, `${name}@${scale}x.png`), png);
    }
}

/**
 * Entry point: renders sprites and copies sounds. Missing source
 * directories are a silent no-op so the scaffold build stays green.
 */
async function main(): Promise<void> {
    if (existsSync(SPRITES_SRC_DIR)) {
        await mkdir(SPRITES_OUT_DIR, { recursive: true });
        const sprites = (await readdir(SPRITES_SRC_DIR)).filter((f) => f.endsWith('.svg')).sort();
        for (const file of sprites) {
            await renderSprite(path.join(SPRITES_SRC_DIR, file), path.basename(file, '.svg'));
        }
    }

    if (existsSync(SOUNDS_SRC_DIR)) {
        await mkdir(SOUNDS_OUT_DIR, { recursive: true });
        const sounds = (await readdir(SOUNDS_SRC_DIR)).filter((f) => f.endsWith('.ogg')).sort();
        for (const file of sounds) {
            // No-op re-encode for v1: copy the OGG through unchanged.
            await writeFile(path.join(SOUNDS_OUT_DIR, file), await readFile(path.join(SOUNDS_SRC_DIR, file)));
        }
    }

    const designEntry = fileURLToPath(import.meta.resolve('@europa/design/brand'));
    const designDistribution = path.dirname(designEntry);
    await stageBrandAssets({ distributionDirectory: designDistribution, targetDirectory: BRAND_OUT_DIR });
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    main().catch((error: unknown) => {
        process.exitCode = 1;
        process.stderr.write(`build-assets failed: ${String(error)}\n`);
    });
}
