export { BRAND_ARTWORK_COLOR_EXTENSIONS } from './colors.js';
export type { IcoEntry, IcoFile, IcoLayer, IcoValidationResult } from './ico.js';
export { parseIco, validateIco, writeIco } from './ico.js';
export type {
    BrandAsset,
    BrandAssetId,
    BrandAssetPath,
    BrandBackground,
    BrandFormat,
    BrandManifest,
    BrandPurpose,
} from './manifest.js';
export { BRAND_MANIFEST } from './manifest.js';
export {
    BRAND_DISTRIBUTION_DIRECTORY,
    BRAND_SOURCE_DIRECTORY,
    resolveBrandAssetPath,
    resolveBrandDistributionPath,
    resolveBrandSourcePath,
} from './paths.js';
