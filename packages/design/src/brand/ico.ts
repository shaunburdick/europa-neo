/** Deterministic PNG-backed ICO writing and structural validation. */

const ICO_HEADER_BYTES = 6;
const ICO_ENTRY_BYTES = 16;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const REQUIRED_SIZES = [16, 32, 48] as const;

export interface IcoLayer {
    readonly width: number;
    readonly height: number;
    readonly png: Uint8Array;
}

export interface IcoEntry {
    readonly width: number;
    readonly height: number;
    readonly colorCount: number;
    readonly reserved: number;
    readonly planes: number;
    readonly bitDepth: number;
    readonly bytesInRes: number;
    readonly imageOffset: number;
    readonly payload: Uint8Array;
}

export interface IcoFile {
    readonly entries: readonly IcoEntry[];
}

export interface IcoValidationResult {
    readonly valid: boolean;
    readonly errors: readonly string[];
}

const readUint32 = (bytes: Uint8Array, offset: number): number =>
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);

const readPngUint32 = (bytes: Uint8Array, offset: number): number =>
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);

const readUint16 = (bytes: Uint8Array, offset: number): number =>
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);

const hasPngSignature = (png: Uint8Array): boolean =>
    png.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, index) => png[index] === byte);

const pngDimensions = (png: Uint8Array): readonly [number, number] => {
    if (!hasPngSignature(png) || png.length < 24) throw new Error('ICO layer is not a PNG');
    return [readPngUint32(png, 16), readPngUint32(png, 20)];
};

const requiredSizeSet = (layers: readonly IcoLayer[]): void => {
    if (layers.length !== REQUIRED_SIZES.length) throw new Error('ICO must contain exactly three PNG layers');
    for (const size of REQUIRED_SIZES) {
        const matches = layers.filter((layer) => layer.width === size && layer.height === size);
        if (matches.length !== 1) throw new Error(`ICO must contain exactly one ${size}×${size} layer`);
    }
};

/** Pack exactly one square PNG layer at each of 16, 32, and 48 pixels. */
export function writeIco(layers: readonly IcoLayer[]): Uint8Array {
    requiredSizeSet(layers);
    const ordered = REQUIRED_SIZES.map((size) => layers.find((layer) => layer.width === size) as IcoLayer);
    for (const layer of ordered) {
        const [width, height] = pngDimensions(layer.png);
        if (width !== layer.width || height !== layer.height) {
            throw new Error(`ICO PNG dimensions are ${width}×${height}; expected ${layer.width}×${layer.height}`);
        }
    }

    const payloadOffset = ICO_HEADER_BYTES + ICO_ENTRY_BYTES * ordered.length;
    const totalBytes = payloadOffset + ordered.reduce((total, layer) => total + layer.png.byteLength, 0);
    const output = new Uint8Array(totalBytes);
    const view = new DataView(output.buffer);
    view.setUint16(0, 0, true);
    view.setUint16(2, 1, true);
    view.setUint16(4, ordered.length, true);

    let offset = payloadOffset;
    ordered.forEach((layer, index) => {
        const entryOffset = ICO_HEADER_BYTES + index * ICO_ENTRY_BYTES;
        view.setUint8(entryOffset, layer.width === 256 ? 0 : layer.width);
        view.setUint8(entryOffset + 1, layer.height === 256 ? 0 : layer.height);
        view.setUint8(entryOffset + 2, 0);
        view.setUint8(entryOffset + 3, 0);
        view.setUint16(entryOffset + 4, 1, true);
        view.setUint16(entryOffset + 6, 32, true);
        view.setUint32(entryOffset + 8, layer.png.byteLength, true);
        view.setUint32(entryOffset + 12, offset, true);
        output.set(layer.png, offset);
        offset += layer.png.byteLength;
    });
    return output;
}

/** Parse ICO directory entries and expose bounded PNG payload views. */
export function parseIco(data: Uint8Array): IcoFile {
    if (data.length < ICO_HEADER_BYTES) throw new Error('ICO header is truncated');
    if (readUint16(data, 0) !== 0 || readUint16(data, 2) !== 1) throw new Error('ICO header has an invalid type');
    const count = readUint16(data, 4);
    const directoryEnd = ICO_HEADER_BYTES + count * ICO_ENTRY_BYTES;
    if (count === 0 || directoryEnd > data.length) throw new Error('ICO directory is truncated');

    const entries: IcoEntry[] = [];
    for (let index = 0; index < count; index += 1) {
        const entryOffset = ICO_HEADER_BYTES + index * ICO_ENTRY_BYTES;
        const encodedWidth = data[entryOffset] ?? 0;
        const encodedHeight = data[entryOffset + 1] ?? 0;
        const bytesInRes = readUint32(data, entryOffset + 8);
        const imageOffset = readUint32(data, entryOffset + 12);
        if (imageOffset < directoryEnd || bytesInRes > data.length - imageOffset) {
            throw new Error(`ICO entry ${index} payload is out of bounds`);
        }
        const payload = data.slice(imageOffset, imageOffset + bytesInRes);
        const [pngWidth, pngHeight] = pngDimensions(payload);
        const width = encodedWidth === 0 ? 256 : encodedWidth;
        const height = encodedHeight === 0 ? 256 : encodedHeight;
        if (pngWidth !== width || pngHeight !== height)
            throw new Error(`ICO entry ${index} directory/PNG dimensions differ`);
        entries.push({
            width,
            height,
            colorCount: data[entryOffset + 2] ?? 0,
            reserved: data[entryOffset + 3] ?? 0,
            planes: readUint16(data, entryOffset + 4),
            bitDepth: readUint16(data, entryOffset + 6),
            bytesInRes,
            imageOffset,
            payload,
        });
    }
    return { entries };
}

/** Validate exact favicon cardinality, dimensions, offsets, and PNG payloads. */
export function validateIco(data: Uint8Array): IcoValidationResult {
    try {
        const { entries } = parseIco(data);
        if (entries.length !== REQUIRED_SIZES.length) throw new Error('ICO must contain exactly three entries');
        const dimensions = entries.map(({ width, height }) => `${width}×${height}`);
        if (new Set(dimensions).size !== dimensions.length) throw new Error('ICO contains duplicate dimensions');
        if (!REQUIRED_SIZES.every((size) => dimensions.includes(`${size}×${size}`))) {
            throw new Error('ICO must contain exactly 16×16, 32×32, and 48×48 entries');
        }
        return { valid: true, errors: [] };
    } catch (error: unknown) {
        return { valid: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
}
