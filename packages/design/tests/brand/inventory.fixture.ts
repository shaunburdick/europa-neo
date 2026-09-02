/**
 * Contract fixtures for the brand asset inventory (spec 015, T-003).
 *
 * These declarations intentionally describe files that do not exist yet. They
 * give the source and generator tasks one typed, reviewable inventory without
 * coupling this scaffold to generator or DOM behavior.
 */

export const SOURCE_MASTER_PATHS = [
    'src/brand/masters/lockup.svg',
    'src/brand/masters/emblem.svg',
    'src/brand/masters/lockup-light.svg',
    'src/brand/masters/lockup-dark.svg',
    'src/brand/masters/lockup-mono.svg',
    'src/brand/masters/emblem-light.svg',
    'src/brand/masters/emblem-dark.svg',
    'src/brand/masters/emblem-mono.svg',
    'src/brand/masters/emblem-compact.svg',
] as const;

export type BrandFormat = 'svg' | 'png' | 'ico' | 'webmanifest';

export type BrandPurpose = 'logo' | 'favicon' | 'apple-touch' | 'pwa' | 'maskable' | 'social' | 'metadata';

export type BrandBackground = 'light' | 'dark' | 'transparent' | 'opaque' | 'mixed';

export type BrandAssetId =
    | 'apple-touch-icon'
    | 'emblem'
    | 'emblem-compact'
    | 'emblem-dark'
    | 'emblem-light'
    | 'emblem-mono'
    | 'favicon'
    | 'favicon-ico'
    | 'icon-192'
    | 'icon-512'
    | 'icon-512-maskable'
    | 'lockup'
    | 'lockup-dark'
    | 'lockup-light'
    | 'lockup-mono'
    | 'site-manifest'
    | 'social';

export interface BrandAssetFixture {
    readonly id: BrandAssetId;
    readonly path: `brand/${string}`;
    readonly format: BrandFormat;
    readonly width: number | null;
    readonly height: number | null;
    readonly purpose: BrandPurpose;
    readonly background: BrandBackground;
    readonly alt: string | null;
    readonly safeArea: { readonly shape: 'circle'; readonly diameterRatio: 0.8 } | null;
}

export interface BrandManifestFixture {
    readonly version: 1;
    readonly assets: readonly BrandAssetFixture[];
    readonly generatedFrom: 'packages/design/src/brand/masters';
}

const svgAsset = (id: BrandAssetId, path: `brand/${string}`, background: BrandBackground): BrandAssetFixture => ({
    id,
    path,
    format: 'svg',
    width: null,
    height: null,
    purpose: 'logo',
    background,
    alt: 'Europa Neo',
    safeArea: null,
});

/** The complete consumer-facing generated inventory. */
export const EXPECTED_BRAND_MANIFEST = {
    version: 1,
    generatedFrom: 'packages/design/src/brand/masters',
    assets: [
        {
            id: 'apple-touch-icon',
            path: 'brand/apple-touch-icon.png',
            format: 'png',
            width: 180,
            height: 180,
            purpose: 'apple-touch',
            background: 'opaque',
            alt: null,
            safeArea: null,
        },
        { ...svgAsset('emblem', 'brand/europa-neo-emblem.svg', 'transparent') },
        { ...svgAsset('emblem-compact', 'brand/europa-neo-emblem-compact.svg', 'transparent') },
        { ...svgAsset('emblem-dark', 'brand/europa-neo-emblem-dark.svg', 'dark') },
        { ...svgAsset('emblem-light', 'brand/europa-neo-emblem-light.svg', 'light') },
        { ...svgAsset('emblem-mono', 'brand/europa-neo-emblem-mono.svg', 'mixed') },
        {
            ...svgAsset('favicon', 'brand/favicon.svg', 'transparent'),
            purpose: 'favicon',
            alt: null,
        },
        {
            id: 'favicon-ico',
            path: 'brand/favicon.ico',
            format: 'ico',
            width: null,
            height: null,
            purpose: 'favicon',
            background: 'transparent',
            alt: null,
            safeArea: null,
        },
        { ...svgAsset('lockup', 'brand/europa-neo-lockup.svg', 'transparent') },
        { ...svgAsset('lockup-dark', 'brand/europa-neo-lockup-dark.svg', 'dark') },
        { ...svgAsset('lockup-light', 'brand/europa-neo-lockup-light.svg', 'light') },
        { ...svgAsset('lockup-mono', 'brand/europa-neo-lockup-mono.svg', 'mixed') },
        {
            id: 'icon-192',
            path: 'brand/icon-192.png',
            format: 'png',
            width: 192,
            height: 192,
            purpose: 'pwa',
            background: 'opaque',
            alt: null,
            safeArea: null,
        },
        {
            id: 'icon-512',
            path: 'brand/icon-512.png',
            format: 'png',
            width: 512,
            height: 512,
            purpose: 'pwa',
            background: 'opaque',
            alt: null,
            safeArea: null,
        },
        {
            id: 'icon-512-maskable',
            path: 'brand/icon-512-maskable.png',
            format: 'png',
            width: 512,
            height: 512,
            purpose: 'maskable',
            background: 'opaque',
            alt: null,
            safeArea: { shape: 'circle', diameterRatio: 0.8 },
        },
        {
            id: 'site-manifest',
            path: 'brand/site.webmanifest',
            format: 'webmanifest',
            width: null,
            height: null,
            purpose: 'metadata',
            background: 'mixed',
            alt: null,
            safeArea: null,
        },
        {
            id: 'social',
            path: 'brand/europa-neo-social.png',
            format: 'png',
            width: 1200,
            height: 630,
            purpose: 'social',
            background: 'dark',
            alt: 'Europa Neo',
            safeArea: null,
        },
    ],
} as const satisfies BrandManifestFixture;
