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
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
}

main().catch((error: unknown) => {
    process.exitCode = 1;
    process.stderr.write(`build-assets failed: ${String(error)}\n`);
});
