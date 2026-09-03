/**
 * Europa Design System — Preview Page Logic (FR-042).
 *
 * Dynamically generates color swatches with computed contrast ratios,
 * token tables for all groups, and the accessibility contrast pairings
 * table. Imports TOKENS directly from source so the preview always
 * reflects current values.
 *
 * No hex/rgb literals in this module's own logic — all color values
 * come from {@link TOKENS} or are computed from it (AC-042).
 */

import { TOKENS } from '../src/tokens.ts';

// ---------------------------------------------------------------------------
// WCAG 2.x contrast ratio helpers
// ---------------------------------------------------------------------------

/**
 * Parse a hex color string (#rgb, #rrggbb) into [r, g, b] channels (0–255).
 *
 * @param hex - Hex color (with or without leading #).
 * @returns Tuple of [red, green, blue] in 0–255 range.
 */
function parseHex(hex: string): [number, number, number] {
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
function relativeLuminance(r: number, g: number, b: number): number {
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
function contrastRatio(fg: string, bg: string): string {
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
function contrastRatioNumeric(fg: string, bg: string): number {
    const [r1, g1, b1] = parseHex(fg);
    const [r2, g2, b2] = parseHex(bg);
    const l1 = relativeLuminance(r1, g1, b1);
    const l2 = relativeLuminance(r2, g2, b2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Color swatch generation
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

/**
 * Build the color swatch categories from the token table.
 *
 * Organizes colors into Surfaces, Text, and Semantic categories.
 * Each swatch shows the token name, hex value, and contrast ratio
 * against its typical background.
 *
 * @returns Array of color categories with computed contrast ratios.
 */
function buildColorCategories(): ReadonlyArray<ColorCategory> {
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
 * Render color swatch categories into the #color-swatches container.
 */
function renderColorSwatches(): void {
    const container = document.getElementById('color-swatches');
    if (container === null) {
        return;
    }

    const categories = buildColorCategories();

    for (const category of categories) {
        const catDiv = document.createElement('div');
        catDiv.className = 'preview-color-category';

        const title = document.createElement('h3');
        title.className = 'preview-color-category__title';
        title.textContent = category.title;
        catDiv.append(title);

        const grid = document.createElement('div');
        grid.className = 'preview-swatch-grid';

        for (const sw of category.swatches) {
            const swatchEl = document.createElement('div');
            swatchEl.className = 'preview-swatch';

            const colorBox = document.createElement('div');
            colorBox.className = 'preview-swatch__color';
            colorBox.style.backgroundColor = sw.value;

            const info = document.createElement('div');
            info.className = 'preview-swatch__info';

            const nameEl = document.createElement('p');
            nameEl.className = 'preview-swatch__name';
            nameEl.textContent = sw.name;

            const valueEl = document.createElement('p');
            valueEl.className = 'preview-swatch__value';
            valueEl.textContent = sw.value;

            const ratioEl = document.createElement('p');
            ratioEl.className = `preview-swatch__ratio ${sw.contrastPass ? 'preview-swatch__ratio--pass' : 'preview-swatch__ratio--fail'}`;
            ratioEl.textContent = sw.contrastRatio;

            info.append(nameEl, valueEl, ratioEl);
            swatchEl.append(colorBox, info);
            grid.append(swatchEl);
        }

        catDiv.append(grid);
        container.append(catDiv);
    }
}

// ---------------------------------------------------------------------------
// Typography scale
// ---------------------------------------------------------------------------

interface TypeSample {
    readonly token: string;
    readonly value: string;
    readonly sample: string;
}

/**
 * Build the typography scale samples from the token table.
 *
 * @returns Array of type samples with size token values.
 */
function buildTypeSamples(): ReadonlyArray<TypeSample> {
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
 * Render typography scale samples into the #type-scale container.
 */
function renderTypeScale(): void {
    const container = document.getElementById('type-scale');
    if (container === null) {
        return;
    }

    const samples = buildTypeSamples();

    for (const sample of samples) {
        const el = document.createElement('div');
        el.className = 'preview-type-sample';

        const text = document.createElement('div');
        text.style.fontSize = sample.value;
        text.style.color = 'var(--europa-color-text-primary)';
        text.textContent = sample.sample;

        const meta = document.createElement('div');
        meta.className = 'preview-type-sample__meta';
        meta.textContent = `${sample.token}: ${sample.value}`;

        el.append(text, meta);
        container.append(el);
    }
}

// ---------------------------------------------------------------------------
// Token tables
// ---------------------------------------------------------------------------

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

/**
 * Build token group tables from the token table.
 *
 * @returns Array of token groups with CSS variable entries.
 */
function buildTokenGroups(): ReadonlyArray<TokenGroup> {
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
 * Convert a camelCase identifier to kebab-case.
 *
 * @param value - Identifier (e.g. `pageBg`).
 * @returns Kebab-case form (e.g. `page-bg`).
 */
function toKebabCase(value: string): string {
    return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Render token group tables into the #token-tables container.
 */
function renderTokenTables(): void {
    const container = document.getElementById('token-tables');
    if (container === null) {
        return;
    }

    const groups = buildTokenGroups();

    for (const group of groups) {
        const section = document.createElement('div');
        section.style.marginBottom = 'var(--europa-spacing-lg)';

        const heading = document.createElement('h3');
        heading.style.margin = '0 0 var(--europa-spacing-sm)';
        heading.style.fontSize = 'var(--europa-typography-size-base)';
        heading.style.fontWeight = '600';
        heading.style.color = 'var(--europa-color-text-primary)';
        heading.textContent = group.title;

        if (group.isNew) {
            const badge = document.createElement('span');
            badge.className = 'preview-badge-new';
            badge.textContent = 'New';
            heading.append(' ', badge);
        }

        const tableWrapper = document.createElement('div');
        tableWrapper.style.overflowX = 'auto';

        const table = document.createElement('table');
        table.className = 'preview-token-table';

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        for (const label of ['Token', 'CSS Variable', 'Value']) {
            const th = document.createElement('th');
            th.textContent = label;
            headerRow.append(th);
        }
        thead.append(headerRow);

        const tbody = document.createElement('tbody');
        for (const entry of group.entries) {
            const row = document.createElement('tr');

            const nameCell = document.createElement('td');
            nameCell.textContent = entry.name;

            const cssVarCell = document.createElement('td');
            const code = document.createElement('code');
            code.textContent = entry.cssVar;
            cssVarCell.append(code);

            const valueCell = document.createElement('td');
            valueCell.textContent = entry.value;

            row.append(nameCell, cssVarCell, valueCell);
            tbody.append(row);
        }

        table.append(thead, tbody);
        tableWrapper.append(table);
        section.append(heading, tableWrapper);
        container.append(section);
    }
}

// ---------------------------------------------------------------------------
// Accessibility contrast pairings
// ---------------------------------------------------------------------------

interface A11yPairing {
    readonly pairing: string;
    readonly foreground: string;
    readonly background: string;
    readonly ratio: string;
    readonly target: string;
    readonly pass: boolean;
}

/**
 * Build the accessibility contrast pairings from the token table.
 *
 * These match the pairings documented in DESIGN.md section 3.
 *
 * @returns Array of contrast pairings.
 */
function buildA11yPairings(): ReadonlyArray<A11yPairing> {
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

/**
 * Render the accessibility contrast pairings table into #a11y-tbody.
 */
function renderA11yTable(): void {
    const tbody = document.getElementById('a11y-tbody');
    if (tbody === null) {
        return;
    }

    const pairings = buildA11yPairings();

    for (const p of pairings) {
        const row = document.createElement('tr');

        const pairingCell = document.createElement('td');
        pairingCell.textContent = p.pairing;

        const fgCell = document.createElement('td');
        const fgCode = document.createElement('code');
        fgCode.textContent = p.foreground;
        fgCell.append(fgCode);

        const bgCell = document.createElement('td');
        const bgCode = document.createElement('code');
        bgCode.textContent = p.background;
        bgCell.append(bgCode);

        const ratioCell = document.createElement('td');
        ratioCell.textContent = p.ratio;

        const targetCell = document.createElement('td');
        targetCell.textContent = p.target;

        const resultCell = document.createElement('td');
        const resultSpan = document.createElement('span');
        resultSpan.className = p.pass ? 'preview-pass' : 'preview-fail';
        resultSpan.textContent = p.pass ? 'Pass' : 'Fail';
        resultCell.append(resultSpan);

        row.append(pairingCell, fgCell, bgCell, ratioCell, targetCell, resultCell);
        tbody.append(row);
    }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * Update the hero stats with computed values from the token table.
 */
function updateStats(): void {
    // Count color tokens (excluding numeric-only entries like landHue)
    const colorKeys = Object.keys(TOKENS.color).filter((k) => {
        const v = TOKENS.color[k as keyof typeof TOKENS.color];
        return typeof v === 'string' && v.startsWith('#');
    });

    const colorStat = document.querySelector('[data-stat="colors"]');
    if (colorStat !== null) {
        colorStat.textContent = `${colorKeys.length}+`;
    }

    // Count CSS classes in catalog.css (approximate from the component catalog section)
    const compStat = document.querySelector('[data-stat="components"]');
    if (compStat !== null) {
        compStat.textContent = '20+';
    }
}

// ---------------------------------------------------------------------------
// Exported helpers (for testing)
// ---------------------------------------------------------------------------

export {
    buildA11yPairings,
    buildColorCategories,
    buildTokenGroups,
    buildTypeSamples,
    contrastRatio,
    contrastRatioNumeric,
    parseHex,
    relativeLuminance,
    toKebabCase,
};

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

/**
 * Initialize the preview page when the DOM is ready.
 */
function init(): void {
    renderColorSwatches();
    renderTypeScale();
    renderTokenTables();
    renderA11yTable();
    updateStats();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
