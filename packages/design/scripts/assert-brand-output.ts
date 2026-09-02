/** Fail the package build when its generated brand inventory is incomplete. */
import { assertGeneratedBrandAssets } from './generate-brand.js';

assertGeneratedBrandAssets().catch((error: unknown) => {
    process.stderr.write(`brand output assertion failed: ${String(error)}\n`);
    process.exitCode = 1;
});
