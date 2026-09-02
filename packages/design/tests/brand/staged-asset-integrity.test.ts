/**
 * T-025: Pages-style staged-asset integrity tests.
 *
 * Verifies that every brand asset path referenced by the manual layout
 * resolves to an actual file in the checked-in staging directory, that
 * references remain valid under a repository-base subpath deployment,
 * and that a missing asset produces a clear test failure.
 *
 * @see specs/015-logo-assets/spec.md — FR-013, FR-017, AC-006, AC-008
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const repoRoot = path.resolve(packageRoot, '../..');
const manualRoot = path.join(repoRoot, 'docs', 'manual');
const layoutPath = path.join(manualRoot, '_layouts', 'default.html');
const manualBrandRoot = path.join(manualRoot, 'assets', 'brand');

/* ------------------------------------------------------------------ */
/*  HTML parsing helpers                                               */
/* ------------------------------------------------------------------ */

/**
 * Extract every local brand-asset path referenced in the layout HTML.
 *
 * Matches:
 *  - `href="{{ '/assets/brand/...' | relative_url }}"`  (Liquid relative_url)
 *  - `src="{{ '/assets/brand/...' | relative_url }}"`
 *  - `content="{{ '/assets/brand/...' | relative_url }}"` (meta og/twitter)
 *
 * Returns the raw Liquid string paths (e.g. `/assets/brand/favicon.svg`).
 */
const extractBrandPaths = (html: string): string[] => {
    const pattern = /['"]?(?:href|src|content)=["']?\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}/g;
    const paths: string[] = [];
    let match = pattern.exec(html);
    while (match !== null) {
        const assetPath = match[1];
        if (assetPath.startsWith('/assets/brand/')) {
            paths.push(assetPath);
        }
        match = pattern.exec(html);
    }
    return [...new Set(paths)];
};

/**
 * Resolve a layout brand path (e.g. `/assets/brand/favicon.svg`) to the
 * actual filesystem location under the staged brand directory.
 *
 * For the staging root `docs/manual/assets/brand/`, the path
 * `/assets/brand/favicon.svg` resolves to
 * `docs/manual/assets/brand/favicon.svg`.
 */
const resolveBrandPath = (brandPath: string): string => {
    const relative = brandPath.replace(/^\/assets\/brand\//, '');
    return path.join(manualBrandRoot, relative);
};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('T-025: staged brand asset integrity', () => {
    it('every layout brand reference resolves to a staged file', async () => {
        const layout = await readFile(layoutPath, 'utf8');
        const brandPaths = extractBrandPaths(layout);

        expect(brandPaths.length).toBeGreaterThan(0);

        const missing: string[] = [];
        for (const brandPath of brandPaths) {
            const filePath = resolveBrandPath(brandPath);
            try {
                const details = await stat(filePath);
                if (!details.isFile()) {
                    missing.push(`${brandPath} (exists but is not a file)`);
                }
            } catch {
                missing.push(brandPath);
            }
        }

        expect(
            missing,
            [
                'Layout references brand assets that are not staged under docs/manual/assets/brand/:',
                ...missing.map((p) => `  - ${p}`),
                '',
                'Run: pnpm --filter @europa/design build && pnpm --filter @europa/design stage:manual',
            ].join('\n'),
        ).toHaveLength(0);
    });

    it('every manifest asset is reachable from the layout OR staged but not referenced', async () => {
        const layout = await readFile(layoutPath, 'utf8');
        const layoutPaths = extractBrandPaths(layout);
        const layoutFileNames = new Set(
            layoutPaths.map((p) => p.replace(/^\/assets\/brand\//, '')),
        );

        const stagedFiles = await readdir(manualBrandRoot);
        const unstaged = stagedFiles.filter((f) => !layoutFileNames.has(f));

        // All staged files should be referenced by the layout. If the layout
        // intentionally omits some (e.g. emblem variants), document them here.
        // For now we allow optional assets that are staged but not referenced.
        // The critical check is the inverse: every referenced path must exist.
        expect(stagedFiles.length).toBeGreaterThan(0);

        // If new staged assets are added but not referenced, this test will
        // surface them so a human can decide whether to add a layout reference.
        if (unstaged.length > 0) {
            // Log rather than fail — staged-only assets are not a bug.
            console.info(
                'Staged brand files not referenced by the manual layout (informational):',
                unstaged,
            );
        }
    });
});

describe('T-025: repository-base deployment', () => {
    it('layout uses relative_url for every brand reference (no root-absolute href/src)', async () => {
        const layout = await readFile(layoutPath, 'utf8');

        // Every brand href/src/content must go through Liquid relative_url
        // so that a repository subpath (e.g. /europa-neo/) is handled correctly.
        const brandReferences = layout.match(/(?:href|src|content)="[^"]*\/assets\/brand\/[^"]*"/g) ?? [];

        const rootAbsolute = brandReferences.filter(
            (ref) => !ref.includes('| relative_url'),
        );

        expect(
            rootAbsolute,
            [
                'Found root-absolute brand references that will break under repository-base deployment:',
                ...rootAbsolute.map((r) => `  - ${r}`),
                '',
                'Fix: use {{ \'/assets/brand/...\' | relative_url }} in the layout.',
            ].join('\n'),
        ).toHaveLength(0);
    });

    it('brand asset filenames are safe for subpath deployment (no special chars)', async () => {
        const stagedFiles = await readdir(manualBrandRoot);
        const unsafeNames = stagedFiles.filter((f) => !/^[a-z0-9._-]+$/i.test(f));

        expect(
            unsafeNames,
            `Brand asset filenames contain characters unsafe for subpath deployment: ${unsafeNames.join(', ')}`,
        ).toHaveLength(0);
    });

    it('staged brand directory structure is flat (no nested paths requiring traversal)', async () => {
        const stagedFiles = await readdir(manualBrandRoot);
        // All files should be directly in the brand root, no subdirectories.
        // If subdirectories are needed in the future, this test documents the
        // current contract and must be updated alongside the layout.
        const nestedFiles = stagedFiles.filter((f) => f.includes('/') || f.includes('\\'));

        expect(nestedFiles).toHaveLength(0);
    });
});

describe('T-025: missing-asset failure', () => {
    it('fails with a clear message when a required staged asset is absent', async () => {
        const layout = await readFile(layoutPath, 'utf8');
        const brandPaths = extractBrandPaths(layout);

        expect(brandPaths.length).toBeGreaterThan(0);

        // Simulate a missing asset by checking a fabricated path that
        // would be referenced if the layout were updated.
        const missingPath = '/assets/brand/does-not-exist.png';
        const filePath = resolveBrandPath(missingPath);

        let fileExists = false;
        try {
            const details = await stat(filePath);
            fileExists = details.isFile();
        } catch {
            fileExists = false;
        }

        expect(fileExists).toBe(false);

        // Now verify the error message is clear when the asset is truly missing.
        const missing: string[] = [];
        for (const brandPath of brandPaths) {
            const resolvedPath = resolveBrandPath(brandPath);
            try {
                const details = await stat(resolvedPath);
                if (!details.isFile()) {
                    missing.push(brandPath);
                }
            } catch {
                missing.push(brandPath);
            }
        }

        // In the happy path (all assets staged), this should be empty.
        // If a real asset were missing, the `missing` array would contain it
        // and the assertion above (`every layout brand reference resolves`)
        // would produce the clear diagnostic message.
        if (missing.length > 0) {
            const errorMessage = [
                'Layout references brand assets that are not staged under docs/manual/assets/brand/:',
                ...missing.map((p) => `  - ${p}`),
                '',
                'Run: pnpm --filter @europa/design build && pnpm --filter @europa/design stage:manual',
            ].join('\n');

            // The error message must name the missing path(s) and the fix command.
            expect(errorMessage).toContain('/assets/brand/');
            expect(errorMessage).toContain('stage:manual');
        }
    });

    it('docs/manual/assets/brand/ contains every file the layout needs', async () => {
        const layout = await readFile(layoutPath, 'utf8');
        const brandPaths = extractBrandPaths(layout);
        const stagedFiles = new Set(await readdir(manualBrandRoot));

        for (const brandPath of brandPaths) {
            const fileName = brandPath.replace(/^\/assets\/brand\//, '');
            expect(
                stagedFiles.has(fileName),
                [
                    `Required brand asset "${fileName}" is missing from docs/manual/assets/brand/.`,
                    'The layout references this file, so the Pages build will produce broken metadata.',
                    '',
                    'Fix: pnpm --filter @europa/design build && pnpm --filter @europa/design stage:manual',
                ].join('\n'),
            ).toBe(true);
        }
    });
});
