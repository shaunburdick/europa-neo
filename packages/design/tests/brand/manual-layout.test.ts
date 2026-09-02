import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const repoRoot = path.resolve(packageRoot, '../..');
const manualRoot = path.join(repoRoot, 'docs', 'manual');
const layoutPath = path.join(manualRoot, '_layouts', 'default.html');

const localBrandPaths = [
    '/assets/brand/favicon.svg',
    '/assets/brand/favicon.ico',
    '/assets/brand/apple-touch-icon.png',
    '/assets/brand/site.webmanifest',
    '/assets/brand/europa-neo-social.png',
    '/assets/brand/europa-neo-lockup-dark.svg',
] as const;

describe('manual brand layout', () => {
    it('uses relative_url for every local brand reference and exposes share metadata', async () => {
        const layout = await readFile(layoutPath, 'utf8');

        for (const brandPath of localBrandPaths) {
            expect(layout).toContain(`'${brandPath}' | relative_url`);
        }
        expect(layout).toContain('property="og:image"');
        expect(layout).toContain('name="twitter:card"');
        expect(layout).toContain('aria-label="Europa Neo home"');
        expect(layout).toContain('alt="" aria-hidden="true"');
        expect(layout).not.toMatch(/(?:href|src|content)="\/(?:assets|favicon)/);
    });

    it('applies the shared layout to every manual Markdown page', async () => {
        const [layout, config, pages] = await Promise.all([
            readFile(layoutPath, 'utf8'),
            readFile(path.join(manualRoot, '_config.yml'), 'utf8'),
            readdir(manualRoot),
        ]);

        expect(layout).toContain('{{ content }}');
        expect(config).toMatch(/values:\s*\n\s+layout: default/);
        expect(pages.filter((file) => file.endsWith('.md'))).toHaveLength(14);
    });
});
