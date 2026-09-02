import { test, expect } from '@playwright/test';

test.describe('Manual link verification', () => {
    test('all internal links resolve', async ({ page }) => {
        const baseUrl = 'http://localhost:4321';
        const visited = new Set<string>();
        const queue = ['/europa-neo/'];
        const failures: { url: string; status: number }[] = [];
        const maxPages = 50; // Safety limit to prevent runaway crawling

        while (queue.length > 0 && visited.size < maxPages) {
            const path = queue.shift()!;
            if (visited.has(path)) continue;
            visited.add(path);

            const response = await page.goto(`${baseUrl}${path}`, {
                waitUntil: 'domcontentloaded',
            });
            const status = response?.status() ?? 0;

            if (status !== 200) {
                failures.push({ url: path, status });
                continue;
            }

            // Discover internal links on this page
            const links = await page.$$eval('a[href]', (anchors) =>
                anchors.map((a) => (a as HTMLAnchorElement).href)
            );

            for (const href of links) {
                try {
                    const url = new URL(href);
                    const relativePath = url.pathname;
                    if (
                        relativePath.startsWith('/europa-neo/') &&
                        !visited.has(relativePath)
                    ) {
                        queue.push(relativePath);
                    }
                } catch {
                    // Ignore malformed URLs
                }
            }
        }

        console.log(`Visited ${visited.size} pages`);
        if (failures.length > 0) {
            console.log('Failures:', failures);
        }
        expect(failures).toEqual([]);
    });
});
