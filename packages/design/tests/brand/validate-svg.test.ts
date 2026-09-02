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
        ['event handler', '<path onload="alert(1)"/>'],
        ['unknown active element', '<iframe src="https://example.test"/>'],
        ['embedded object', '<object data="logo.svg"/>'],
    ])('rejects %s', (_label, element) => {
        expect(validateSvg(`<svg viewBox="0 0 10 10">${element}</svg>`).valid).toBe(false);
    });

    it('rejects event attributes regardless of their spelling or element', () => {
        const result = validateSvg('<svg viewBox="0 0 10 10"><g oNcLiCk="alert(1)"/></svg>');
        expect(result.errors).toContain('event-handler attribute: oNcLiCk');
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

    it('handles XML comments, CDATA, processing instructions, and tag edge cases', () => {
        expect(validateSvg('<?xml version="1.0"?><svg viewBox="0 0 1 1"/>').valid).toBe(true);
        expect(validateSvg('<svg viewBox="0 0 1 1"><!-- safe --><![CDATA[decorative text]]><?pi ok?></svg>')).toEqual({
            valid: true,
            errors: [],
        });
        expect(validateSvg('<svg viewBox="0 0 1 1"><!-- -- bad --></svg>').errors).toContain(
            'invalid double hyphen in comment',
        );
        expect(validateSvg('<svg viewBox="0 0 1 1"><!--').errors).toContain('unterminated comment');
        expect(validateSvg('<svg viewBox="0 0 1 1"><![CDATA[').errors).toContain('unterminated CDATA section');
        expect(validateSvg('<svg viewBox="0 0 1 1"><?pi').errors).toContain('unterminated processing instruction');
        expect(validateSvg('<svg viewBox="0 0 1 1"><').errors).toContain('unterminated element');
        expect(validateSvg('<svg viewBox="0 0 1 1"><!bad></svg>').errors).toContain('malformed element tag');
        expect(validateSvg('<svg viewBox="0 0 1 1"></svg>after').errors).toContain('text outside the SVG root');
    });
});
