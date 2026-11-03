import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
    compareBundleBudget,
    formatBundleBudgetReport,
    REFERENCE_TARGET_BYTES,
    sumGzipBytes,
} from '../../../scripts/selfhost-budget.js';

describe('self-host browser bundle budget', () => {
    let temporaryDirectory: string;

    beforeEach(() => {
        temporaryDirectory = mkdtempSync(join(tmpdir(), 'europa-selfhost-budget-'));
    });

    afterEach(() => {
        rmSync(temporaryDirectory, { recursive: true, force: true });
    });

    test('sums per-file gzip sizes for files in a temporary asset directory', () => {
        const scriptPath = join(temporaryDirectory, 'entry.js');
        const stylePath = join(temporaryDirectory, 'theme.css');
        const scriptContents = Buffer.from('console.log("selfhost");');
        const styleContents = Buffer.from('body { color: navy; }');
        writeFileSync(scriptPath, scriptContents);
        writeFileSync(stylePath, styleContents);

        expect(sumGzipBytes([scriptPath, stylePath])).toBe(
            gzipSync(scriptContents).byteLength + gzipSync(styleContents).byteLength,
        );
    });

    test.each([
        { relation: 'below', totalBytes: REFERENCE_TARGET_BYTES - 1, output: '1 byte below).' },
        { relation: 'equal', totalBytes: REFERENCE_TARGET_BYTES, output: '0 bytes above); continuing' },
        {
            relation: 'above',
            totalBytes: REFERENCE_TARGET_BYTES + 17,
            output: `17 bytes above the ${String(REFERENCE_TARGET_BYTES)}-byte reference target; continuing`,
        },
    ] as const)(
        'compares and formats the $relation boundary around the reference',
        ({ relation, totalBytes, output }) => {
            expect(compareBundleBudget(totalBytes)).toEqual({
                relation,
                differenceBytes: Math.abs(REFERENCE_TARGET_BYTES - totalBytes),
            });
            expect(formatBundleBudgetReport(totalBytes)).toContain(output);
        },
    );

    test('keeps filesystem read failures blocking', () => {
        expect(() => sumGzipBytes([join(temporaryDirectory, 'missing.js')])).toThrow();
    });

    test('keeps gzip failures blocking', () => {
        const scriptPath = join(temporaryDirectory, 'entry.js');
        writeFileSync(scriptPath, 'fixture');

        expect(() =>
            sumGzipBytes([scriptPath], () => {
                throw new Error('gzip failed');
            }),
        ).toThrow('gzip failed');
    });

    test('rejects invalid totals and targets rather than formatting them as advisory excess', () => {
        expect(() => compareBundleBudget(Number.NaN)).toThrow('Invalid browser bundle measurement');
        expect(() => compareBundleBudget(0, 0)).toThrow('Invalid browser bundle measurement');
    });
});
