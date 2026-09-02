import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BRAND_ARTWORK_COLOR_EXTENSIONS } from '../../src/brand/colors.js';
import { SOURCE_MASTER_PATHS } from './inventory.fixture.js';

const mastersDirectory = resolve(import.meta.dirname, '../../src/brand/masters');
const readMaster = (relativePath: string): Promise<string> => readFile(resolve(mastersDirectory, relativePath), 'utf8');

describe('brand SVG masters', () => {
    it('contains nine parseable, self-contained SVG documents', async () => {
        const documents = await Promise.all(
            SOURCE_MASTER_PATHS.map((path) => readMaster(path.replace('src/brand/masters/', ''))),
        );

        for (const [index, document] of documents.entries()) {
            expect(document).toMatch(/^<svg\s[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
            expect(document).toMatch(/viewBox="0 0 (?:32 32|512 512|512 600|1024 512)"/);
            expect(document).not.toMatch(/<\s*(image|script|animate|style|foreignObject)\b/i);
            expect(document).not.toMatch(/(?:href|xlink:href)\s*=\s*["'](?:https?:|data:|\/\/)/i);
            expect(document).not.toMatch(/@font-face|font-family|<text\b/i);
            expect(document).toContain('<title id="title">');
            expect(document).toContain('<desc id="description">');
            expect(document).toContain('aria-labelledby="title description"');
            expect(index).toBeGreaterThanOrEqual(0);
        }
    });

    it('gives every standalone emblem meaningful accessible metadata', async () => {
        for (const name of [
            'emblem.svg',
            'emblem-light.svg',
            'emblem-dark.svg',
            'emblem-mono.svg',
            'emblem-compact.svg',
        ]) {
            const document = await readMaster(name);
            expect(document).toMatch(/<title id="title">[^<]+<\/title>/);
            expect(document).toMatch(/<desc id="description">[^<]+<\/desc>/);
            expect(document).toContain('aria-labelledby="title description"');
        }
    });

    it('keeps the full composition and deterministic wordmark paths in lockups', async () => {
        const documents = await Promise.all(
            ['lockup.svg', 'lockup-light.svg', 'lockup-dark.svg', 'lockup-mono.svg', 'lockup-vertical.svg'].map(
                readMaster,
            ),
        );
        for (const document of documents) {
            expect(document).toContain('clip-path');
            expect(document).toContain('wordmark');
            expect(document).not.toContain('<text');
            expect(document).toMatch(/<path d="[Mm]/);
        }
    });

    it('places every lockup wordmark inside the upper shield composition', async () => {
        const documents = await Promise.all(
            ['lockup.svg', 'lockup-light.svg', 'lockup-dark.svg', 'lockup-mono.svg'].map(readMaster),
        );

        for (const document of documents) {
            expect(document).toContain('viewBox="0 0 512 512"');
            expect(document).toMatch(/<g id="wordmark" transform="translate\(256 100\) scale\(\.55\)">/);
            expect(document).not.toContain('translate(530 88)');
        }

        const vertical = await readMaster('lockup-vertical.svg');
        expect(vertical).toMatch(/<g\s+id="wordmark"\s+transform="translate\(256 100\) scale\(\.55\)"/);
        expect(vertical).not.toContain('translate(530 88)');
    });

    it('keeps the complete path wordmark rendered above clipping masks and inside each viewBox', async () => {
        const names = ['lockup.svg', 'lockup-light.svg', 'lockup-dark.svg', 'lockup-mono.svg', 'lockup-vertical.svg'];

        for (const name of names) {
            const document = await readMaster(name);
            const wordmarkStart = document.indexOf('<g id="wordmark"');
            const wordmark = document.slice(wordmarkStart, document.lastIndexOf('</svg>'));
            const viewBox = document
                .match(/viewBox="([^"]+)"/)?.[1]
                .split(/\s+/)
                .map(Number);
            const paths = [...wordmark.matchAll(/<path\s+d="([^"]+)"/g)];
            const pathCoordinates = paths.flatMap((match) =>
                [...match[1].matchAll(/-?\d+(?:\.\d+)?/g)].map(([value]) => Number(value)),
            );

            expect(wordmarkStart).toBeGreaterThan(-1);
            expect(wordmark).not.toContain('clip-path');
            expect(paths).toHaveLength(9);
            expect(pathCoordinates.length).toBeGreaterThan(400);
            expect(viewBox).toHaveLength(4);

            const [viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight] = viewBox;

            const sourceMin = Math.min(...pathCoordinates);
            const sourceMax = Math.max(...pathCoordinates);
            const renderedMin = 256 + sourceMin * 0.55 - 3 * 0.55;
            const renderedMax = 256 + sourceMax * 0.55 + 3 * 0.55;

            expect(renderedMin).toBeGreaterThanOrEqual(viewBoxX);
            expect(renderedMax).toBeLessThanOrEqual(viewBoxX + viewBoxWidth);
            expect(100 + -55.31 * 0.55 - 3 * 0.55).toBeGreaterThanOrEqual(viewBoxY);
            expect(100 + (192 + 1.09) * 0.55 + 3 * 0.55).toBeLessThanOrEqual(viewBoxY + viewBoxHeight);
        }
    });

    it('preserves separate blue and orange conflict treatments', async () => {
        const documents = await Promise.all(['emblem.svg', 'emblem-light.svg', 'emblem-dark.svg'].map(readMaster));
        for (const document of documents) {
            expect(document).toContain(BRAND_ARTWORK_COLOR_EXTENSIONS.blueBeam);
            expect(document).toContain(BRAND_ARTWORK_COLOR_EXTENSIONS.orangeBeam);
            expect(document).toContain('clip-path');
        }
    });

    it('keeps every SVG colour documented in the approved artwork palette', async () => {
        const designContract = await readFile(resolve(import.meta.dirname, '../../../../DESIGN.md'), 'utf8');
        const palette = designContract
            .match(/<!-- brand-artwork-palette:start -->([\s\S]*?)<!-- brand-artwork-palette:end -->/)?.[1]
            ?.match(/#[0-9a-f]{6}/gi);
        expect(palette).toBeDefined();
        const documented = new Set(palette?.map((colour) => colour.toLowerCase()));
        const documents = await Promise.all(
            SOURCE_MASTER_PATHS.map((path) => readMaster(path.replace('src/brand/masters/', ''))),
        );
        const used = new Set(
            documents
                .flatMap((document) => document.match(/#[0-9a-f]{6}/gi) ?? [])
                .map((colour) => colour.toLowerCase()),
        );
        expect([...used].filter((colour) => !documented.has(colour))).toEqual([]);
        expect(documented).toContain(BRAND_ARTWORK_COLOR_EXTENSIONS.blueBeam);
        expect(documented).toContain(BRAND_ARTWORK_COLOR_EXTENSIONS.orangeBeam);
    });
});
