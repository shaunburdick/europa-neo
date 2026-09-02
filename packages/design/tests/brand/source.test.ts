/** Source-master contract tests for the Europa Neo artwork (spec 015, T-009). */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SOURCE_MASTER_PATHS } from './inventory.fixture.js';

const mastersDirectory = resolve(import.meta.dirname, '../../src/brand/masters');
const masterNames = SOURCE_MASTER_PATHS.map((path) => path.replace('src/brand/masters/', ''));
const readMaster = (name: string): Promise<string> => readFile(resolve(mastersDirectory, name), 'utf8');

const lockupNames = ['lockup.svg', 'lockup-light.svg', 'lockup-dark.svg', 'lockup-mono.svg', 'lockup-vertical.svg'];
const emblemNames = ['emblem.svg', 'emblem-light.svg', 'emblem-dark.svg', 'emblem-mono.svg', 'emblem-compact.svg'];

/** Remove presentation-only attributes while retaining SVG geometry and layering. */
const geometrySignature = (svg: string): string =>
    [...svg.matchAll(/<(?:path|circle|rect|line|polygon|polyline)\b[^>]*>/g)]
        .map(([element]) =>
            element
                .replace(
                    /\s+(?:fill|stroke|opacity|filter|color-interpolation-filters|stop-color|stop-opacity)="[^"]*"/g,
                    '',
                )
                .replace(/\s+/g, ' ')
                .trim(),
        )
        .join('');

describe('brand source SVG inventory', () => {
    it('contains every declared source master', async () => {
        const documents = await Promise.all(masterNames.map(readMaster));

        expect(masterNames).toHaveLength(10);
        expect(new Set(masterNames).size).toBe(masterNames.length);
        expect(documents.every((document) => document.length > 0)).toBe(true);
    });
});

describe('brand source SVG metadata', () => {
    it('gives every source master a meaningful title and description', async () => {
        const documents = await Promise.all(masterNames.map(readMaster));

        for (const document of documents) {
            const title = document.match(/<title\b[^>]*>([^<]+)<\/title>/)?.[1].trim();
            const description = document.match(/<desc\b[^>]*>([^<]+)<\/desc>/)?.[1].trim();

            expect(title).toBeTruthy();
            expect(description).toBeTruthy();
            expect(document).toMatch(/aria-labelledby="title description"/);
        }
    });
});

describe('brand source SVG geometry', () => {
    it('keeps geometry invariant across lockup treatments', async () => {
        const documents = await Promise.all(lockupNames.slice(0, 4).map(readMaster));
        const signatures = documents.map(geometrySignature);

        expect(new Set(signatures).size).toBe(1);
    });

    it('keeps geometry invariant across emblem treatments', async () => {
        const documents = await Promise.all(emblemNames.slice(0, 4).map(readMaster));
        const signatures = documents.map(geometrySignature);

        expect(new Set(signatures).size).toBe(1);
    });
});

describe('brand source SVG safety', () => {
    it('contains no raster, text, executable, animated, or external content', async () => {
        const documents = await Promise.all(masterNames.map(readMaster));

        for (const document of documents) {
            expect(document).not.toMatch(
                /<\s*(image|foreignObject|script|animate|animateMotion|animateTransform|set|mpath)\b/i,
            );
            expect(document).not.toMatch(/<\s*text\b|@font-face|font-family\s*=|@import/i);
            expect(document).not.toMatch(/(?:href|xlink:href)\s*=\s*["'](?:https?:|data:|\/\/)/i);
            expect(document).not.toMatch(/url\(\s*["']?(?:https?:|data:|\/\/)/i);
            expect(document).not.toMatch(/(?:europa-source|mockup|third-party)/i);
        }
    });
});

describe('combined lockup source size', () => {
    it('keeps every combined lockup within the 30 KiB source limit', async () => {
        const documents = await Promise.all(lockupNames.map(readMaster));

        for (const document of documents) {
            expect(Buffer.byteLength(document, 'utf8')).toBeLessThanOrEqual(30 * 1024);
        }
    });
});
