/**
 * Token builder functions — extracted from preview/main.ts (T-002).
 *
 * Pure data-layer helpers that read from TOKENS and return structured
 * objects. No DOM or document dependencies — safe for SSR, testing,
 * and the dev-page React layer.
 *
 * All color values come from {@link TOKENS} or are computed via
 * contrast helpers; no hex/rgb literals in this module (AC-042).
 */

import { TOKENS } from '../../src/tokens.ts';
import { contrastRatio, contrastRatioNumeric } from './contrast.ts';

// ---------------------------------------------------------------------------
// Shared interfaces
// ---------------------------------------------------------------------------

interface ColorSwatch {
    readonly name: string;
    readonly value: string;
    readonly contrastRatio: string;
    readonly contrastPass: boolean;
}

interface ColorCategory {
    readonly title: string;
    readonly swatches: ReadonlyArray<ColorSwatch>;
}

interface TypeSample {
    readonly token: string;
    readonly value: string;
    readonly sample: string;
}

interface TokenEntry {
    readonly name: string;
    readonly cssVar: string;
    readonly value: string;
}

interface TokenGroup {
    readonly title: string;
    readonly isNew: boolean;
    readonly entries: ReadonlyArray<TokenEntry>;
}

interface A11yPairing {
    readonly pairing: string;
    readonly foreground: string;
    readonly background: string;
    readonly ratio: string;
    readonly target: string;
    readonly pass: boolean;
}

// ---------------------------------------------------------------------------
// Token builder functions
// ---------------------------------------------------------------------------

/**
 * Convert a camelCase identifier to kebab-case.
 *
 * @param value - Identifier (e.g. `pageBg`).
 * @returns Kebab-case form (e.g. `page-bg`).
 */
export function toKebabCase(value: string): string {
    return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Build the color swatch categories from the token table.
 *
 * Organizes colors into Surfaces, Text, and Semantic categories.
 * Each swatch shows the token name, hex value, and contrast ratio
 * against its typical background.
 *
 * @returns Array of color categories with computed contrast ratios.
 */
export function buildColorCategories(): ReadonlyArray<ColorCategory> {
    const c = TOKENS.color;

    /**
     * Helper to build a swatch with a contrast ratio against a background.
     */
    function swatch(name: string, value: string, bg: string = c.surface): ColorSwatch {
        const ratio = contrastRatio(value, bg);
        const numeric = contrastRatioNumeric(value, bg);
        return {
            name,
            value,
            contrastRatio: ratio,
            contrastPass: numeric >= 4.5,
        };
    }

    return [
        {
            title: 'Surfaces',
            swatches: [
                swatch('page-bg', c.pageBg, c.pageBg),
                swatch('void-bg', c.voidBg, c.voidBg),
                swatch('surface', c.surface, c.surface),
                swatch('surface-raised', c.surfaceRaised, c.surface),
                swatch('border', c.border, c.surface),
            ],
        },
        {
            title: 'Text',
            swatches: [
                swatch('text-primary', c.textPrimary, c.surface),
                swatch('text-secondary', c.textSecondary, c.surface),
                swatch('text-muted', c.textMuted, c.surface),
                swatch('text-link', c.textLink, c.surface),
            ],
        },
        {
            title: 'Semantic',
            swatches: [
                swatch('success', c.success, c.successBg),
                swatch('warning', c.warning, c.warningBg),
                swatch('error', c.error, c.errorBg),
                swatch('info', c.info, c.infoBg),
                swatch('accent', c.accent, c.surface),
                swatch('chip-bg', c.chipBg, c.chipBg),
            ],
        },
    ];
}

/**
 * Build the typography scale samples from the token table.
 *
 * @returns Array of type samples with size token values.
 */
export function buildTypeSamples(): ReadonlyArray<TypeSample> {
    const t = TOKENS.typography;
    return [
        { token: 'size3xl', value: t.size3xl, sample: 'Europa Neo' },
        { token: 'size2xl', value: t.size2xl, sample: 'Match Lobby' },
        { token: 'sizeXl', value: t.sizeXl, sample: 'Section Heading' },
        { token: 'sizeLg', value: t.sizeLg, sample: 'Card Title' },
        { token: 'sizeBase', value: t.sizeBase, sample: 'Body text for reading' },
        { token: 'sizeMd', value: t.sizeMd, sample: 'Secondary body text' },
        { token: 'sizeSm', value: t.sizeSm, sample: 'Small text and labels' },
        { token: 'sizeXs', value: t.sizeXs, sample: 'Caption and metadata' },
    ];
}

/**
 * Build token group tables from the token table.
 *
 * @returns Array of token groups with CSS variable entries.
 */
export function buildTokenGroups(): ReadonlyArray<TokenGroup> {
    const groups: TokenGroup[] = [];
    const tokenKeys = Object.keys(TOKENS) as Array<keyof typeof TOKENS>;
    const sortedGroups = [...tokenKeys].sort();

    for (const group of sortedGroups) {
        const groupValue = TOKENS[group] as Record<string, string | number>;
        const groupKebab = toKebabCase(group as string);
        const entries: TokenEntry[] = [];

        for (const leafKey of Object.keys(groupValue).sort()) {
            const rawValue = groupValue[leafKey];
            if (rawValue === undefined) {
                continue;
            }
            const leafKebab = toKebabCase(leafKey);
            const cssVar = `--europa-${groupKebab}-${leafKebab}`;
            const cssValue = typeof rawValue === 'number' ? String(rawValue) : rawValue;
            entries.push({ name: leafKey, cssVar, value: cssValue });
        }

        // Mark shadow and motion groups as "New" per the spec
        const isNew = group === 'shadows' || group === 'motion';

        groups.push({
            title: `${group.charAt(0).toUpperCase()}${group.slice(1)} Tokens`,
            isNew,
            entries,
        });
    }

    return groups;
}

/**
 * Build the accessibility contrast pairings from the token table.
 *
 * These match the pairings documented in DESIGN.md section 3.
 *
 * @returns Array of contrast pairings.
 */
export function buildA11yPairings(): ReadonlyArray<A11yPairing> {
    const c = TOKENS.color;
    const fr = TOKENS.focusRing;

    return [
        {
            pairing: 'textLink on surface',
            foreground: c.textLink,
            background: c.surface,
            ratio: contrastRatio(c.textLink, c.surface),
            target: '4.5:1',
            pass: contrastRatioNumeric(c.textLink, c.surface) >= 4.5,
        },
        {
            pairing: 'accentActive on surface',
            foreground: c.accentActive,
            background: c.surface,
            ratio: contrastRatio(c.accentActive, c.surface),
            target: '4.5:1',
            pass: contrastRatioNumeric(c.accentActive, c.surface) >= 4.5,
        },
        {
            pairing: 'textLink on pageBg',
            foreground: c.textLink,
            background: c.pageBg,
            ratio: contrastRatio(c.textLink, c.pageBg),
            target: '4.5:1',
            pass: contrastRatioNumeric(c.textLink, c.pageBg) >= 4.5,
        },
        {
            pairing: 'cardHoverBorder on surface',
            foreground: c.cardHoverBorder,
            background: c.surface,
            ratio: contrastRatio(c.cardHoverBorder, c.surface),
            target: '4.5:1',
            pass: contrastRatioNumeric(c.cardHoverBorder, c.surface) >= 4.5,
        },
        {
            pairing: 'success on successBg',
            foreground: c.success,
            background: c.successBg,
            ratio: contrastRatio(c.success, c.successBg),
            target: '4.5:1',
            pass: contrastRatioNumeric(c.success, c.successBg) >= 4.5,
        },
        {
            pairing: 'warning on warningBg',
            foreground: c.warning,
            background: c.warningBg,
            ratio: contrastRatio(c.warning, c.warningBg),
            target: '4.5:1',
            pass: contrastRatioNumeric(c.warning, c.warningBg) >= 4.5,
        },
        {
            pairing: 'error on errorBg',
            foreground: c.error,
            background: c.errorBg,
            ratio: contrastRatio(c.error, c.errorBg),
            target: '4.5:1',
            pass: contrastRatioNumeric(c.error, c.errorBg) >= 4.5,
        },
        {
            pairing: 'info on infoBg',
            foreground: c.info,
            background: c.infoBg,
            ratio: contrastRatio(c.info, c.infoBg),
            target: '4.5:1',
            pass: contrastRatioNumeric(c.info, c.infoBg) >= 4.5,
        },
        {
            pairing: 'accent on chipBg',
            foreground: c.accent,
            background: c.chipBg,
            ratio: contrastRatio(c.accent, c.chipBg),
            target: '4.5:1',
            pass: contrastRatioNumeric(c.accent, c.chipBg) >= 4.5,
        },
        {
            pairing: 'focusRing on surface',
            foreground: fr.color,
            background: c.surface,
            ratio: contrastRatio(fr.color, c.surface),
            target: '3:1',
            pass: contrastRatioNumeric(fr.color, c.surface) >= 3,
        },
        {
            pairing: 'lightColor on surface',
            foreground: fr.lightColor,
            background: c.surface,
            ratio: contrastRatio(fr.lightColor, c.surface),
            target: '3:1',
            pass: contrastRatioNumeric(fr.lightColor, c.surface) >= 3,
        },
        {
            pairing: 'darkColor on surfaceRaised',
            foreground: fr.darkColor,
            background: c.surfaceRaised,
            ratio: contrastRatio(fr.darkColor, c.surfaceRaised),
            target: '3:1',
            pass: contrastRatioNumeric(fr.darkColor, c.surfaceRaised) >= 3,
        },
    ];
}
