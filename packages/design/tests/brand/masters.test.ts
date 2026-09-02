import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SOURCE_MASTER_PATHS } from './inventory.fixture.js';

const mastersDirectory = resolve(import.meta.dirname, '../../src/brand/masters');
const readMaster = (relativePath: string): Promise<string> => readFile(resolve(mastersDirectory, relativePath), 'utf8');

const geometry = (svg: string): string =>
    svg
        .replace(/<title[\s\S]*?<\/title>/g, '')
        .replace(/<desc[\s\S]*?<\/desc>/g, '')
        .replace(/fill="#[0-9a-fA-F]{6}"/g, 'fill="COLOR"')
        .replace(/\s+/g, ' ')
        .trim();

describe('brand SVG masters', () => {
    it('contains nine parseable, self-contained SVG documents', async () => {
        const documents = await Promise.all(
            SOURCE_MASTER_PATHS.map((path) => readMaster(path.replace('src/brand/masters/', ''))),
        );

        for (const document of documents) {
            expect(document).toMatch(/^<svg\s[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
            expect(document).toMatch(/viewBox="0 0 256 256"|viewBox="0 0 640 256"/);
            expect(document).not.toMatch(/<\s*(image|script|animate|style|foreignObject)\b/i);
            expect(document).not.toMatch(/(?:href|xlink:href)\s*=\s*["'](?:https?:|data:|\/\/)/i);
            expect(document).not.toMatch(/@font-face|url\s*\(/i);
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

    it('keeps treatment geometry identical while changing only value/color treatment', async () => {
        const [base, light, dark, mono] = await Promise.all(
            ['emblem.svg', 'emblem-light.svg', 'emblem-dark.svg', 'emblem-mono.svg'].map(readMaster),
        );
        expect(geometry(base)).toBe(geometry(light));
        expect(geometry(base)).toBe(geometry(dark));
        expect(geometry(base)).toBe(geometry(mono));
    });

    it('retains independent square and triangular terminal geometry in every treatment', async () => {
        const documents = await Promise.all(
            ['emblem.svg', 'emblem-light.svg', 'emblem-dark.svg', 'emblem-mono.svg', 'emblem-compact.svg'].map(
                readMaster,
            ),
        );
        for (const document of documents) {
            expect(document).toMatch(/M48 80h24v24H48Z/);
            expect(document).toMatch(/m184 80 24 12-24 12Z/);
            expect(document).toMatch(/m128 120 16 8v16l-16 8-16-8v-16Z/);
        }
    });
});
