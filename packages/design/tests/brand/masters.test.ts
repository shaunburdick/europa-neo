import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

    it('preserves separate blue and orange conflict treatments', async () => {
        const documents = await Promise.all(['emblem.svg', 'emblem-light.svg', 'emblem-dark.svg'].map(readMaster));
        for (const document of documents) {
            expect(document).toContain('#3b82f6');
            expect(document).toContain('#f97316');
            expect(document).toContain('clip-path');
        }
    });
});
