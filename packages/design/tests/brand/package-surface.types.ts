/** Compile-time witness for the public generated brand entry point. */

import type { BrandAssetPath, BrandManifest } from '@europa/design/brand';
import { BRAND_MANIFEST } from '@europa/design/brand';

const manifest: BrandManifest = BRAND_MANIFEST;
const assetPaths: readonly BrandAssetPath[] = manifest.assets.map(({ path }) => path);

export const BRAND_PACKAGE_SURFACE_TYPECHECK = { assetPaths, manifest };
