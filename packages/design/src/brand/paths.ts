import { isAbsolute, relative, resolve } from 'node:path';

import { BRAND_MANIFEST, type BrandAssetId, type BrandAssetPath } from './manifest.js';

export const BRAND_SOURCE_DIRECTORY = 'src/brand/masters';
export const BRAND_DISTRIBUTION_DIRECTORY = 'dist/brand';

const SOURCE_MASTER_NAMES = new Set([
    'lockup.svg',
    'emblem.svg',
    'lockup-light.svg',
    'lockup-dark.svg',
    'lockup-mono.svg',
    'emblem-light.svg',
    'emblem-dark.svg',
    'emblem-mono.svg',
    'emblem-compact.svg',
    'lockup-vertical.svg',
]);

const manifestAssetByPath = new Map(BRAND_MANIFEST.assets.map((asset) => [asset.path, asset]));
const manifestAssetById = new Map(BRAND_MANIFEST.assets.map((asset) => [asset.id, asset]));

const packageRoot = resolve(import.meta.dirname, '../..');

function assertSafeRelativePath(input: string, description: string): void {
    if (
        isAbsolute(input) ||
        input.includes('\\') ||
        input.startsWith('/') ||
        input.includes('?') ||
        input.includes('#')
    ) {
        throw new Error(`${description} must be a safe POSIX-relative path: ${input}`);
    }

    const normalized = input.split('/');
    if (normalized.some((segment) => segment === '..' || segment === '.')) {
        throw new Error(`${description} must not contain traversal segments: ${input}`);
    }
}

function resolveWithin(root: string, relativePath: string, description: string): string {
    const resolved = resolve(root, relativePath);
    const escaped = relative(root, resolved).startsWith('..');
    if (escaped) {
        throw new Error(`${description} escapes its package boundary: ${relativePath}`);
    }
    return resolved;
}

/** Resolve a canonical source master without permitting consumer paths. */
export function resolveBrandSourcePath(masterName: string, root: string = packageRoot): string {
    assertSafeRelativePath(masterName, 'Brand source master');
    if (!SOURCE_MASTER_NAMES.has(masterName)) {
        throw new Error(`Undeclared or non-source brand master: ${masterName}`);
    }
    return resolveWithin(root, `${BRAND_SOURCE_DIRECTORY}/${masterName}`, 'Brand source path');
}

/** Resolve a manifest-declared generated asset by stable logical ID. */
export function resolveBrandDistributionPath(assetId: BrandAssetId, root: string = packageRoot): string {
    const asset = manifestAssetById.get(assetId);
    if (!asset) {
        throw new Error(`Undeclared brand asset ID: ${assetId}`);
    }
    return resolveBrandAssetPath(asset.path, root);
}

/** Resolve only a manifest-declared path below the package distribution. */
export function resolveBrandAssetPath(assetPath: string, root: string = packageRoot): string {
    assertSafeRelativePath(assetPath, 'Brand distribution path');
    if (!assetPath.startsWith('brand/')) {
        throw new Error(`Brand distribution path must begin with brand/: ${assetPath}`);
    }
    if (!manifestAssetByPath.has(assetPath as BrandAssetPath)) {
        throw new Error(`Undeclared brand distribution path: ${assetPath}`);
    }
    return resolveWithin(
        root,
        `${BRAND_DISTRIBUTION_DIRECTORY}/${assetPath.slice('brand/'.length)}`,
        'Brand distribution path',
    );
}
