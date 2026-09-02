import { describe, expect, it } from 'vitest';

import { type IcoLayer, parseIco, validateIco, writeIco } from '../../src/brand/ico.js';

const png = (width: number, height = width): Uint8Array => {
    const output = new Uint8Array(24);
    output.set([137, 80, 78, 71, 13, 10, 26, 10]);
    new DataView(output.buffer).setUint32(16, width, false);
    new DataView(output.buffer).setUint32(20, height, false);
    return output;
};

const layers = (): readonly IcoLayer[] => [16, 32, 48].map((size) => ({ width: size, height: size, png: png(size) }));

describe('PNG-backed ICO packaging', () => {
    it('writes and parses exactly the required three entries in stable order', () => {
        const file = writeIco(layers());
        const parsed = parseIco(file);
        expect(parsed.entries.map(({ width, height }) => [width, height])).toEqual([
            [16, 16],
            [32, 32],
            [48, 48],
        ]);
        expect(parsed.entries.map(({ imageOffset, bytesInRes }) => [imageOffset, bytesInRes])).toEqual([
            [54, 24],
            [78, 24],
            [102, 24],
        ]);
        expect(validateIco(file)).toEqual({ valid: true, errors: [] });
    });

    it('rejects missing, duplicate, and extra layers before writing', () => {
        expect(() => writeIco(layers().slice(0, 2))).toThrow('exactly three');
        expect(() => writeIco([...layers(), { width: 16, height: 16, png: png(16) }])).toThrow('exactly three');
        expect(() => writeIco([{ width: 16, height: 16, png: png(32) }, ...layers().slice(1)])).toThrow('dimensions');
    });

    it('rejects malformed directory bounds and undocumented cardinality', () => {
        const file = writeIco(layers());
        const outOfBounds = file.slice();
        new DataView(outOfBounds.buffer).setUint32(18, 0xffff, true);
        expect(validateIco(outOfBounds).valid).toBe(false);

        const extra = new Uint8Array(file.length + 16);
        extra.set(file);
        new DataView(extra.buffer).setUint16(4, 4, true);
        expect(validateIco(extra).valid).toBe(false);
    });

    it('is byte-for-byte reproducible', () => {
        expect(writeIco(layers())).toEqual(writeIco(layers()));
    });
});
