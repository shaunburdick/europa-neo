/** WCAG 2.x contrast arithmetic shared by the render test suites. */

/** One sRGB channel byte (0–255) as a linear-light value (0–1). */
export function srgbToLinear(channelByte: number): number {
    const s = Math.max(0, Math.min(255, channelByte)) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of an sRGB byte triple. */
export function relativeLuminance(rgb: readonly [number, number, number]): number {
    return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
}
