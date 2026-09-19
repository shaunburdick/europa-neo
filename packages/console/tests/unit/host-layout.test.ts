import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePackageRoot } from '../../scripts/host';

/** Temporary package roots created for package-layout validation. */
const temporaryRoots: string[] = [];

async function createPackageRoot(): Promise<string> {
    const packageRoot = await mkdtemp(path.join(tmpdir(), 'europa-console-host-'));
    temporaryRoots.push(packageRoot);
    return packageRoot;
}

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('resolvePackageRoot', () => {
    it('resolves the source launcher layout', async () => {
        const packageRoot = await createPackageRoot();
        const scriptsDirectory = path.join(packageRoot, 'scripts');
        await mkdir(scriptsDirectory);
        await writeFile(path.join(packageRoot, 'package.json'), '{}');
        await writeFile(path.join(scriptsDirectory, 'host.ts'), '');

        expect(resolvePackageRoot(scriptsDirectory)).toBe(packageRoot);
    });

    it('resolves the bundled launcher layout', async () => {
        const packageRoot = await createPackageRoot();
        const hostDirectory = path.join(packageRoot, 'dist', 'host');
        await mkdir(hostDirectory, { recursive: true });
        await writeFile(path.join(packageRoot, 'dist', 'index.html'), '<!doctype html>');
        await writeFile(path.join(hostDirectory, 'host.js'), '');

        expect(resolvePackageRoot(hostDirectory)).toBe(packageRoot);
    });

    it('rejects an unsupported entry layout with actionable expectations', async () => {
        const entryDirectory = path.join(await createPackageRoot(), 'unexpected');

        expect(() => resolvePackageRoot(entryDirectory)).toThrow(
            `host: unsupported package-root layout for "${entryDirectory}"; expected <package-root>/scripts/host.ts or <package-root>/dist/host/host.js`,
        );
    });

    it('rejects a bundled layout without its sibling SPA', async () => {
        const packageRoot = await createPackageRoot();
        const hostDirectory = path.join(packageRoot, 'dist', 'host');
        await mkdir(hostDirectory, { recursive: true });

        expect(() => resolvePackageRoot(hostDirectory)).toThrow(/unsupported package-root layout/);
    });

    it('rejects a source layout without its launcher file', async () => {
        const packageRoot = await createPackageRoot();
        const scriptsDirectory = path.join(packageRoot, 'scripts');
        await mkdir(scriptsDirectory);
        await writeFile(path.join(packageRoot, 'package.json'), '{}');

        expect(() => resolvePackageRoot(scriptsDirectory)).toThrow(/unsupported package-root layout/);
    });

    it('rejects a bundled layout without its launcher file', async () => {
        const packageRoot = await createPackageRoot();
        const hostDirectory = path.join(packageRoot, 'dist', 'host');
        await mkdir(hostDirectory, { recursive: true });
        await writeFile(path.join(packageRoot, 'dist', 'index.html'), '<!doctype html>');

        expect(() => resolvePackageRoot(hostDirectory)).toThrow(/unsupported package-root layout/);
    });

    it('rejects a source layout whose launcher path is a directory', async () => {
        const packageRoot = await createPackageRoot();
        const scriptsDirectory = path.join(packageRoot, 'scripts');
        await mkdir(path.join(scriptsDirectory, 'host.ts'), { recursive: true });
        await writeFile(path.join(packageRoot, 'package.json'), '{}');

        expect(() => resolvePackageRoot(scriptsDirectory)).toThrow(/unsupported package-root layout/);
    });

    it('rejects a bundled layout whose launcher path is a directory', async () => {
        const packageRoot = await createPackageRoot();
        const hostDirectory = path.join(packageRoot, 'dist', 'host');
        await mkdir(path.join(hostDirectory, 'host.js'), { recursive: true });
        await writeFile(path.join(packageRoot, 'dist', 'index.html'), '<!doctype html>');

        expect(() => resolvePackageRoot(hostDirectory)).toThrow(/unsupported package-root layout/);
    });
});
