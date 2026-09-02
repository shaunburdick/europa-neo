import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BRAND_MANIFEST } from '../../src/brand/manifest.js';
import { SOURCE_MASTER_PATHS } from './inventory.fixture.js';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const repoRoot = path.resolve(packageRoot, '../..');
const distributionRoot = path.join(packageRoot, 'dist', 'brand');
const manualBrandRoot = path.join(repoRoot, 'docs', 'manual', 'assets', 'brand');
const designDocument = path.join(repoRoot, 'DESIGN.md');

const outputName = (assetPath: string): string => assetPath.slice('brand/'.length);
const manifestNames = BRAND_MANIFEST.assets.map(({ path: assetPath }) => outputName(assetPath)).sort();

interface PackageJson {
    readonly exports?: Record<string, unknown>;
}

interface DesignInventoryRow {
    readonly id: string;
    readonly path: string;
    readonly formatAndDimensions: string;
}

const tableRows = (document: string, heading: string, nextHeading: string): readonly string[] => {
    const start = document.indexOf(heading);
    const end = document.indexOf(nextHeading, start + heading.length);
    if (start < 0 || end < 0) throw new Error(`DESIGN.md is missing inventory section: ${heading}`);
    return document
        .slice(start + heading.length, end)
        .split('\n')
        .filter((line) => line.startsWith('| `'));
};

const parseGeneratedInventory = (document: string): readonly DesignInventoryRow[] =>
    tableRows(document, '#### Generated distribution', 'The machine-readable').map((line) => {
        const columns = line.split('|').map((column) => column.trim());
        if (columns.length < 5) throw new Error(`Malformed generated inventory row: ${line}`);
        return { id: columns[1].slice(1, -1), path: columns[2].slice(1, -1), formatAndDimensions: columns[3] };
    });

const parseSourceInventory = (document: string): readonly string[] =>
    tableRows(document, '#### Source masters', '#### Generated distribution').map((line) => {
        const columns = line.split('|').map((column) => column.trim());
        if (columns.length < 3) throw new Error(`Malformed source inventory row: ${line}`);
        return columns[1].slice(1, -1);
    });

describe('brand integration drift boundaries', () => {
    it('keeps the typed manifest and DESIGN.md generated inventory identical', async () => {
        const document = await readFile(designDocument, 'utf8');
        const documented = parseGeneratedInventory(document);
        expect(documented).toHaveLength(BRAND_MANIFEST.assets.length);
        expect(documented.map(({ id }) => id).sort()).toEqual([...BRAND_MANIFEST.assets.map(({ id }) => id)].sort());
        expect(documented.map(({ path: assetPath }) => assetPath).sort()).toEqual(
            [...BRAND_MANIFEST.assets.map(({ path: assetPath }) => assetPath)].sort(),
        );
        expect(documented.map(({ id, formatAndDimensions }) => `${id}:${formatAndDimensions}`).sort()).toEqual(
            BRAND_MANIFEST.assets
                .map(({ id, format, width, height }) => {
                    if (format === 'svg') return id === 'favicon' ? 'SVG, emblem only' : 'SVG, scalable';
                    if (format === 'ico') return 'ICO, 16×16/32×32/48×48';
                    if (format === 'webmanifest') return 'Web manifest';
                    return `PNG, ${width}×${height}`;
                })
                .map((description, index) => `${BRAND_MANIFEST.assets[index]?.id}:${description}`)
                .sort(),
        );
    });

    it('keeps the documented source master inventory complete and source-only', async () => {
        const document = await readFile(designDocument, 'utf8');
        const documentedSources = parseSourceInventory(document);
        expect([...documentedSources].sort()).toEqual([...SOURCE_MASTER_PATHS].sort());
        expect(
            documentedSources.every(
                (source) => !BRAND_MANIFEST.assets.some(({ path: assetPath }) => assetPath === source),
            ),
        ).toBe(true);
        for (const source of SOURCE_MASTER_PATHS) {
            const details = await stat(path.join(packageRoot, source));
            expect(details.isFile()).toBe(true);
        }
    });

    it('keeps source SVG masters byte-identical to their generated SVG counterparts', async () => {
        const sourceToOutput: readonly (readonly [string, string])[] = [
            ['lockup.svg', 'europa-neo-lockup.svg'],
            ['lockup-light.svg', 'europa-neo-lockup-light.svg'],
            ['lockup-dark.svg', 'europa-neo-lockup-dark.svg'],
            ['lockup-mono.svg', 'europa-neo-lockup-mono.svg'],
            ['emblem.svg', 'europa-neo-emblem.svg'],
            ['emblem-light.svg', 'europa-neo-emblem-light.svg'],
            ['emblem-dark.svg', 'europa-neo-emblem-dark.svg'],
            ['emblem-mono.svg', 'europa-neo-emblem-mono.svg'],
            ['emblem-compact.svg', 'europa-neo-emblem-compact.svg'],
            ['emblem.svg', 'favicon.svg'],
        ];
        for (const [sourceName, outputFile] of sourceToOutput) {
            await expect(readFile(path.join(distributionRoot, outputFile))).resolves.toEqual(
                await readFile(path.join(packageRoot, 'src', 'brand', 'masters', sourceName)),
            );
        }
    });

    it('keeps package exports limited to generated manifest files', async () => {
        const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as PackageJson;
        expect(packageJson.exports?.['./brand']).toEqual({
            types: './dist/brand/index.d.ts',
            import: './dist/brand/index.js',
        });
        expect(packageJson.exports?.['./brand/*']).toBe('./dist/brand/*');
        const distributionNames = await readdir(distributionRoot);
        const packageEntryNames = ['index.d.ts', 'index.js', 'index.js.map'];
        expect(distributionNames.sort()).toEqual([...manifestNames, ...packageEntryNames].sort());
        for (const name of manifestNames) {
            const details = await stat(path.join(distributionRoot, name));
            expect(details.isFile()).toBe(true);
            expect(details.size).toBeGreaterThan(0);
        }
        expect(manifestNames.some((name) => name.includes('masters'))).toBe(false);
        await expect(import('@europa/design/brand')).resolves.toMatchObject({ BRAND_MANIFEST });
    });

    it('keeps checked-in manual staging byte-identical to package distribution', async () => {
        expect(await readdir(manualBrandRoot)).toEqual(manifestNames);
        for (const name of manifestNames) {
            await expect(readFile(path.join(manualBrandRoot, name))).resolves.toEqual(
                await readFile(path.join(distributionRoot, name)),
            );
        }
    });
});
