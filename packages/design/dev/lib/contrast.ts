/**
 * WCAG 2.x contrast ratio helpers — extracted from preview/main.ts (T-001).
 *
 * Pure functions with no DOM or document dependencies.
 * All color values arrive as parameters; no internal hex literals (AC-042).
 */

/**
 * Parse a hex color string (#rgb, #rrggbb) into [r, g, b] channels (0–255).
 *
 * @param hex - Hex color (with or without leading #).
 * @returns Tuple of [red, green, blue] in 0–255 range.
 */
export function parseHex(hex: string): [number, number, number] {
    const clean = hex.startsWith('#') ? hex.slice(1) : hex;
    const expanded = clean.length === 3 ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}` : clean;
    const num = Number.parseInt(expanded, 16);
    return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

/**
 * Compute the WCAG 2.x relative luminance of an sRGB color.
 *
 * Uses the formula from WCAG 2.1 definition of relative luminance:
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 *
 * @param r - Red channel (0–255).
 * @param g - Green channel (0–255).
 * @param b - Blue channel (0–255).
 * @returns Relative luminance in [0, 1].
 */
export function relativeLuminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map((c) => {
        const srgb = c / 255;
        return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Compute the WCAG 2.x contrast ratio between two hex colors.
 *
 * @param fg - Foreground hex color.
 * @param bg - Background hex color.
 * @returns Contrast ratio string (e.g. "8.26:1").
 */
export function contrastRatio(fg: string, bg: string): string {
    const [r1, g1, b1] = parseHex(fg);
    const [r2, g2, b2] = parseHex(bg);
    const l1 = relativeLuminance(r1, g1, b1);
    const l2 = relativeLuminance(r2, g2, b2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    const ratio = (lighter + 0.05) / (darker + 0.05);
    return `${ratio.toFixed(2)}:1`;
}

/**
 * Compute the numeric contrast ratio (for threshold checks).
 *
 * @param fg - Foreground hex color.
 * @param bg - Background hex color.
 * @returns Numeric contrast ratio.
 */
export function contrastRatioNumeric(fg: string, bg: string): number {
    const [r1, g1, b1] = parseHex(fg);
    const [r2, g2, b2] = parseHex(bg);
    const l1 = relativeLuminance(r1, g1, b1);
    const l2 = relativeLuminance(r2, g2, b2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}
