/** Validate the built brand export targets and their distribution boundary. */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { BRAND_MANIFEST } from '../src/brand/manifest.js';
import { BRAND_OUTPUT_DIRECTORY } from './generate-brand.js';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');
const PACKAGE_FILE = path.join(PACKAGE_ROOT, 'package.json');
const ENTRY_ARTIFACTS = new Set(['index.js', 'index.d.ts', 'index.js.map', 'index.d.ts.map']);
const REQUIRED_ENTRY_ARTIFACTS = ['index.js', 'index.d.ts'] as const;

interface PackageJson {
    readonly exports?: Record<string, unknown>;
    readonly files?: readonly string[];
}

const assert = (condition: boolean, message: string): asserts condition => {
    if (!condition) throw new Error(message);
};

/** Check that only generated brand files are reachable from the package surface. */
export async function assertBrandPackageSurface(): Promise<void> {
    const packageJson = JSON.parse(await readFile(PACKAGE_FILE, 'utf8')) as PackageJson;
    assert(packageJson.files?.length === 1 && packageJson.files[0] === 'dist', 'Brand package must ship only dist');
    assert(
        JSON.stringify(packageJson.exports?.['./brand']) ===
            JSON.stringify({ types: './dist/brand/index.d.ts', import: './dist/brand/index.js' }),
        'Brand root export must target the generated index entry',
    );
    assert(packageJson.exports?.['./brand/*'] === './dist/brand/*', 'Brand wildcard export must target dist/brand');

    const expected = new Set(BRAND_MANIFEST.assets.map((asset) => asset.path.slice('brand/'.length)));
    const actual = new Set(await readdir(BRAND_OUTPUT_DIRECTORY));
    for (const name of REQUIRED_ENTRY_ARTIFACTS) {
        assert(actual.has(name), `Brand root export target is missing: ${name}`);
    }
    const allowed = new Set([...expected, ...ENTRY_ARTIFACTS]);
    const unexpected = [...actual].filter((name) => !allowed.has(name));
    assert(unexpected.length === 0, `Brand export exposes undeclared files: ${unexpected.join(', ')}`);
    for (const name of expected) {
        const details = await stat(path.join(BRAND_OUTPUT_DIRECTORY, name));
        assert(details.isFile() && details.size > 0, `Brand export target is not a non-empty file: ${name}`);
    }
    for (const name of ENTRY_ARTIFACTS) {
        if (actual.has(name)) {
            const details = await stat(path.join(BRAND_OUTPUT_DIRECTORY, name));
            assert(details.isFile() && details.size > 0, `Brand entry artifact is invalid: ${name}`);
        }
    }
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(import.meta.filename)) {
    assertBrandPackageSurface().catch((error: unknown) => {
        process.stderr.write(`check-brand-surface failed: ${String(error)}\n`);
        process.exitCode = 1;
    });
}
