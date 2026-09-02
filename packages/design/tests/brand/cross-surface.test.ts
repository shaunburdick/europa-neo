/**
 * T-028: Cross-surface integration tests.
 *
 * Proves that console, manual, host, and Docker references resolve to
 * locally staged design distribution files rather than competing copies.
 *
 * Coverage:
 *   - Console: staged brand files are byte-identical to design distribution
 *   - Manual: staged brand files are byte-identical to design distribution
 *   - Host: MIME type mapping covers every brand asset format
 *   - Docker: Dockerfile and docker-smoke.sh contain the expected brand
 *     integration patterns
 *
 * @see specs/015-logo-assets/spec.md — FR-012, FR-013, FR-014, FR-017, AC-006, AC-007
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BRAND_MANIFEST } from '../../src/brand/manifest.js';

/* ------------------------------------------------------------------ */
/*  Path constants                                                     */
/* ------------------------------------------------------------------ */

const packageRoot = path.resolve(import.meta.dirname, '../..');
const repoRoot = path.resolve(packageRoot, '../..');

/** @europa/design generated brand distribution directory. */
const designDistBrand = path.join(packageRoot, 'dist', 'brand');

/** Console staged brand directory (after `pnpm --filter @europa/console build`). */
const consoleBrandDir = path.join(repoRoot, 'packages', 'console', 'dist', 'assets', 'brand');

/** Manual staged brand directory (after `pnpm --filter @europa/design stage:manual`). */
const manualBrandDir = path.join(repoRoot, 'docs', 'manual', 'assets', 'brand');

/** Host script source for static MIME analysis. */
const hostScriptPath = path.join(repoRoot, 'packages', 'console', 'scripts', 'host.ts');

/** Dockerfile for structural validation. */
const dockerfilePath = path.join(repoRoot, 'Dockerfile');

/** Docker smoke test script for structural validation. */
const dockerSmokePath = path.join(repoRoot, 'scripts', 'docker-smoke.sh');

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Escape special regex characters in a literal string. */
function escapeRegExp(literal: string): string {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Extract the bare filename from a manifest brand path (e.g. "brand/foo.svg" -> "foo.svg"). */
const assetFileName = (assetPath: string): string => assetPath.slice('brand/'.length);

/** All expected brand filenames from the manifest, sorted for stable comparison. */
const expectedFileNames = BRAND_MANIFEST.assets.map(({ path: assetPath }) => assetFileName(assetPath)).sort();

/* ------------------------------------------------------------------ */
/*  Console cross-surface: byte-identical staging                      */
/* ------------------------------------------------------------------ */

describe('T-028: console brand staging byte-identity', () => {
    it('console staged files list matches the manifest inventory', async () => {
        const staged = await readdir(consoleBrandDir);
        expect(staged.sort()).toEqual(expectedFileNames);
    });

    it('every console staged file is byte-identical to the design distribution', async () => {
        for (const name of expectedFileNames) {
            const designBytes = await readFile(path.join(designDistBrand, name));
            const consoleBytes = await readFile(path.join(consoleBrandDir, name));
            expect(
                consoleBytes.equals(designBytes),
                [
                    `Console staged file "${name}" differs from design distribution.`,
                    'The console build must stage assets from @europa/design, not maintain independent copies.',
                    '',
                    'Fix: pnpm --filter @europa/design build && pnpm --filter @europa/console build',
                ].join('\n'),
            ).toBe(true);
        }
    });
});

/* ------------------------------------------------------------------ */
/*  Manual cross-surface: byte-identical staging                       */
/* ------------------------------------------------------------------ */

describe('T-028: manual brand staging byte-identity', () => {
    it('manual staged files list matches the manifest inventory', async () => {
        const staged = await readdir(manualBrandDir);
        expect(staged.sort()).toEqual(expectedFileNames);
    });

    it('every manual staged file is byte-identical to the design distribution', async () => {
        for (const name of expectedFileNames) {
            const designBytes = await readFile(path.join(designDistBrand, name));
            const manualBytes = await readFile(path.join(manualBrandDir, name));
            expect(
                manualBytes.equals(designBytes),
                [
                    `Manual staged file "${name}" differs from design distribution.`,
                    'The manual staging must copy from @europa/design, not maintain independent copies.',
                    '',
                    'Fix: pnpm --filter @europa/design build && pnpm --filter @europa/design stage:manual',
                ].join('\n'),
            ).toBe(true);
        }
    });
});

/* ------------------------------------------------------------------ */
/*  Host: MIME type mapping coverage                                   */
/* ------------------------------------------------------------------ */

describe('T-028: host MIME type mapping for brand assets', () => {
    /**
     * Static analysis of the host script source to verify MIME_TYPES
     * covers every brand asset format. This complements the live HTTP
     * tests in host-static.test.ts by catching source-level drift
     * (e.g. removing a MIME entry) without requiring a running server.
     */
    it('host.ts MIME_TYPES maps every brand format to its expected content type', async () => {
        const hostSource = await readFile(hostScriptPath, 'utf8');

        const expectedMappings: ReadonlyArray<readonly [string, string]> = [
            ['.svg', 'image/svg+xml'],
            ['.png', 'image/png'],
            ['.ico', 'image/x-icon'],
            ['.webmanifest', 'application/manifest+json'],
        ];

        for (const [extension, contentType] of expectedMappings) {
            const escapedType = escapeRegExp(contentType);
            // Match: '.svg': 'image/svg+xml' or '.svg': 'application/manifest+json; charset=utf-8'
            // The key is a quoted string like '.svg' and the value may include optional parameters.
            const pattern = new RegExp(`['"]${escapeRegExp(extension)}['"]\\s*:\\s*['"]${escapedType}[^'"]*['"]`);
            expect(
                hostSource,
                [
                    `host.ts MIME_TYPES is missing the mapping for "${extension}" -> "${contentType}".`,
                    'Brand assets with this extension will receive incorrect Content-Type headers.',
                    '',
                    `Add: '${extension}': '${contentType}' to the MIME_TYPES object in host.ts`,
                ].join('\n'),
            ).toMatch(pattern);
        }
    });

    it('host.ts MIME_TYPES covers all format types present in the brand manifest', async () => {
        const hostSource = await readFile(hostScriptPath, 'utf8');

        // Map manifest formats to the file extensions used in host.ts MIME_TYPES.
        // Every manifest format must have at least one extension mapped.
        const formatToExtensions: Readonly<Record<string, readonly string[]>> = {
            svg: ['.svg'],
            png: ['.png'],
            ico: ['.ico'],
            webmanifest: ['.webmanifest'],
        };

        const formats = [...new Set(BRAND_MANIFEST.assets.map(({ format }) => format))];

        for (const format of formats) {
            const extensions = formatToExtensions[format] ?? [];
            const hasMapping = extensions.some(
                (ext) => hostSource.includes(`'${ext}'`) || hostSource.includes(`"${ext}"`),
            );
            expect(
                hasMapping,
                [
                    `host.ts MIME_TYPES has no entry for format "${format}".`,
                    `Expected at least one of: ${extensions.join(', ')}`,
                ].join('\n'),
            ).toBe(true);
        }
    });
});

/* ------------------------------------------------------------------ */
/*  Docker: structural validation                                      */
/* ------------------------------------------------------------------ */

describe('T-028: Docker brand integration structure', () => {
    it('Dockerfile build stage copies the workspace including packages/design', async () => {
        const dockerfile = await readFile(dockerfilePath, 'utf8');

        // The build stage must COPY the packages directory (which includes
        // packages/design) so that pnpm build can run the design brand
        // generator and stage assets into the console dist.
        expect(dockerfile, 'Dockerfile must COPY the packages directory into the build stage').toMatch(
            /COPY\s+packages\s+\.\/packages/,
        );

        // The build stage must run pnpm build, which triggers the design
        // brand generation and console asset staging.
        expect(dockerfile, 'Dockerfile build stage must run pnpm build to generate brand assets').toMatch(
            /RUN\s+pnpm\s+build/,
        );
    });

    it('Dockerfile runtime stage copies built packages (including staged brand)', async () => {
        const dockerfile = await readFile(dockerfilePath, 'utf8');

        // The runtime stage must COPY --from=build the packages directory
        // so that the staged brand assets in console/dist are available.
        expect(dockerfile, 'Dockerfile runtime stage must COPY packages from the build stage').toMatch(
            /COPY\s+--from=build\s+\/app\/packages\s+\.\/packages/,
        );
    });

    it('docker-smoke.sh verifies the complete brand set in the console output', async () => {
        const smokeScript = await readFile(dockerSmokePath, 'utf8');

        // The smoke script must check that brand assets exist in the
        // container's console dist output.
        expect(smokeScript, 'docker-smoke.sh must verify brand assets in the console dist output').toMatch(
            /brand.*console.*dist|console.*dist.*brand/,
        );

        // It must verify content types for brand assets.
        expect(smokeScript, 'docker-smoke.sh must verify content types for brand assets').toMatch(/content-type/);
    });

    it('docker-smoke.sh validates MIME types for every brand format', async () => {
        const smokeScript = await readFile(dockerSmokePath, 'utf8');

        const formatChecks: ReadonlyArray<readonly [string, string]> = [
            ['svg', 'image/svg+xml'],
            ['png', 'image/png'],
            ['ico', 'image/x-icon'],
            ['webmanifest', 'application/manifest+json'],
        ];

        for (const [format, contentType] of formatChecks) {
            expect(smokeScript, `docker-smoke.sh must check Content-Type for ${format} brand assets`).toContain(
                contentType,
            );
        }
    });
});
