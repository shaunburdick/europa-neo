import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateBrandAssets } from '../../scripts/generate-brand.js';
import { parseIco, validateIco } from '../../src/brand/ico.js';

describe('generated favicon ICO', () => {
    it('contains the three generated emblem layers and no extra entries', async () => {
        const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'europa-brand-ico-'));
        try {
            await generateBrandAssets({ outputDirectory });
            const ico = await readFile(path.join(outputDirectory, 'favicon.ico'));
            expect(validateIco(ico)).toEqual({ valid: true, errors: [] });
            expect(parseIco(ico).entries.map(({ width, height }) => [width, height])).toEqual([
                [16, 16],
                [32, 32],
                [48, 48],
            ]);
        } finally {
            await rm(outputDirectory, { recursive: true, force: true });
        }
    }, 30_000);
});
