import { formatBundleBudgetReport, sumGzipBytes } from './selfhost-budget.js';

const assetPaths = process.argv.slice(2);
if (assetPaths.length === 0) {
    process.stderr.write('[test-selfhost] FAIL: no browser JS/CSS assets supplied for gzip measurement.\n');
    process.exitCode = 1;
} else {
    try {
        process.stdout.write(`${formatBundleBudgetReport(sumGzipBytes(assetPaths))}\n`);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[test-selfhost] FAIL: unable to measure browser bundle: ${detail}\n`);
        process.exitCode = 1;
    }
}
