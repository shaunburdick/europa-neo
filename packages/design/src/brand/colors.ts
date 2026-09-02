/**
 * Product-approved colours used by the standalone SVG masters.
 *
 * These are deliberately not UI tokens: SVG files must render without loading
 * the design stylesheet. The two conflict colours are named exports so their
 * exception to the UI palette is reviewable and mechanically guarded.
 */
export const BRAND_ARTWORK_COLOR_EXTENSIONS = {
    blueBeam: '#3b82f6',
    orangeBeam: '#f97316',
} as const;
