import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

/** Advisory browser-payload reference used by the self-host check. */
export const REFERENCE_TARGET_BYTES = 155_648;

export type BundleBudgetRelation = 'below' | 'equal' | 'above';

export interface BundleBudgetComparison {
    readonly relation: BundleBudgetRelation;
    readonly differenceBytes: number;
}

type GzipCompressor = (contents: Buffer) => Buffer;

/** Sum the gzip byte lengths of the supplied browser asset files. */
export function sumGzipBytes(assetPaths: readonly string[], compress: GzipCompressor = gzipSync): number {
    let totalBytes = 0;
    for (const assetPath of assetPaths) {
        const compressed = compress(readFileSync(assetPath));
        totalBytes += compressed.byteLength;
        if (!Number.isSafeInteger(totalBytes)) {
            throw new RangeError('Browser bundle gzip total exceeds the safe integer range.');
        }
    }
    return totalBytes;
}

/** Compare a measured gzip total with a positive byte reference target. */
export function compareBundleBudget(totalBytes: number, targetBytes = REFERENCE_TARGET_BYTES): BundleBudgetComparison {
    if (!Number.isSafeInteger(totalBytes) || totalBytes < 0 || !Number.isSafeInteger(targetBytes) || targetBytes <= 0) {
        throw new RangeError('Invalid browser bundle measurement or reference target.');
    }

    if (totalBytes === targetBytes) {
        return { relation: 'equal', differenceBytes: 0 };
    }
    if (totalBytes < targetBytes) {
        return { relation: 'below', differenceBytes: targetBytes - totalBytes };
    }
    return { relation: 'above', differenceBytes: totalBytes - targetBytes };
}

/** Format the self-host budget report without making numeric excess blocking. */
export function formatBundleBudgetReport(totalBytes: number, targetBytes = REFERENCE_TARGET_BYTES): string {
    const comparison = compareBundleBudget(totalBytes, targetBytes);
    const report = `[test-selfhost] bundle size: ${String(totalBytes)} bytes gzipped (reference target ${String(targetBytes)} bytes)`;

    if (comparison.relation === 'equal') {
        return `${report}\n[test-selfhost] WARNING: browser payload equals the ${String(targetBytes)}-byte reference target (0 bytes above); continuing to required host smoke.`;
    }
    if (comparison.relation === 'above') {
        return `${report}\n[test-selfhost] WARNING: browser payload is ${String(comparison.differenceBytes)} bytes above the ${String(targetBytes)}-byte reference target; continuing to required host smoke.`;
    }

    const unit = comparison.differenceBytes === 1 ? 'byte' : 'bytes';
    return `${report}\n[test-selfhost] browser payload is within the reference target (${String(comparison.differenceBytes)} ${unit} below).`;
}
