import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateSvg } from '../../src/brand/validate-svg.js';
import { SOURCE_MASTER_PATHS } from './inventory.fixture.js';

const valid =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"><title>Logo</title><defs><linearGradient id="g"/><filter id="f"/></defs><path fill="url(#g)" filter="url(#f)" d="M0 0h1v1z"/></svg>';

describe('validateSvg', () => {
    it('accepts every supplied normalized master', async () => {
        for (const path of SOURCE_MASTER_PATHS) {
            const name = path.replace('src/brand/masters/', '');
            const source = await readFile(resolve(import.meta.dirname, '../../src/brand/masters', name), 'utf8');
            expect(validateSvg(source), name).toEqual({ valid: true, errors: [] });
        }
    });

    it('accepts approved gradients, filters, and local fragment references', () => {
        expect(validateSvg(valid)).toEqual({ valid: true, errors: [] });
    });

    it.each([
        ['embedded raster', '<image href="data:image/png;base64,abc"/>'],
        ['external reference', '<use href="https://example.test/logo.svg"/>'],
        ['network CSS reference', '<path style="fill:url(https://example.test/x)"/>'],
        ['font', '<text font-family="Montserrat">Neo</text>'],
        ['script', '<script>alert(1)</script>'],
        ['animation', '<animate attributeName="x"/>'],
    ])('rejects %s', (_label, element) => {
        expect(validateSvg(`<svg viewBox="0 0 10 10">${element}</svg>`).valid).toBe(false);
    });

    it.each([
        ['missing viewBox', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
        ['negative viewBox size', '<svg viewBox="0 0 -1 10"></svg>'],
        ['unclosed element', '<svg viewBox="0 0 10 10"><g></svg>'],
        ['mismatched element', '<svg viewBox="0 0 10 10"><g></path></svg>'],
        ['malformed attributes', '<svg viewBox="0 0 10 10" broken></svg>'],
        ['text before root', 'oops<svg viewBox="0 0 10 10"></svg>'],
    ])('rejects malformed content: %s', (_label, document) => {
        expect(validateSvg(document).valid).toBe(false);
    });

    it('reports all relevant failures with stable diagnostics', () => {
        const result = validateSvg('<svg viewBox="0 0 0 0"><image href="data:image/png,x"/><script/></svg>');
        expect(result.errors).toEqual(
            expect.arrayContaining([
                'forbidden element: image',
                'forbidden element: script',
                'viewBox width and height must be positive',
            ]),
        );
    });
});
