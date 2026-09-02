import { TOKENS } from '../tokens.js';

/** A browser-installable icon entry in the generated web app manifest. */
export interface WebManifestIcon {
    readonly src: `./${string}`;
    readonly sizes: `${number}x${number}`;
    readonly type: 'image/png';
    readonly purpose?: 'any' | 'maskable';
}

/** The stable, local-only web app manifest emitted with the brand assets. */
export interface WebManifest {
    readonly name: 'Europa Neo';
    readonly short_name: 'Europa Neo';
    readonly start_url: './';
    readonly scope: './';
    readonly display: 'standalone';
    readonly theme_color: string;
    readonly background_color: string;
    readonly icons: readonly WebManifestIcon[];
}

/**
 * Build the manifest using paths relative to its own generated brand directory.
 * Relative URLs keep both repository-base Pages deployments and self-hosted
 * subpath deployments independent of the host's origin.
 */
export const createWebManifest = (): WebManifest => ({
    name: 'Europa Neo',
    short_name: 'Europa Neo',
    start_url: './',
    scope: './',
    display: 'standalone',
    theme_color: TOKENS.color.pageBg,
    background_color: TOKENS.color.pageBg,
    icons: [
        { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: './icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
});

/** Serialize the manifest with stable indentation and a trailing newline. */
export const serializeWebManifest = (): string => `${JSON.stringify(createWebManifest(), null, 4)}\n`;
