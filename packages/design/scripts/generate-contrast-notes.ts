/**
 * Generate WCAG contrast notes from the token table.
 *
 * Computes relative-luminance contrast ratios for the design-system's
 * foreground/background pairings and writes `dist/contrast-notes.json`.
 * The companion drift guard (`check-contrast-notes.ts`) re-runs this
 * computation and compares against the checked-in output.
 *
 * WCAG 2.2 AA thresholds (normal text ≥ 4.5 : 1, large text ≥ 3 : 1).
 * We use the stricter 4.5 : 1 threshold uniformly.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TOKENS } from '../src/tokens.js';

/* ------------------------------------------------------------------ */
/*  WCAG relative luminance + contrast ratio                          */
/* ------------------------------------------------------------------ */

/**
 * Compute the WCAG 2.x relative luminance of an sRGB hex color.
 *
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const linearize = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Compute the WCAG 2.x contrast ratio between two sRGB hex colors.
 *
 * @returns Ratio in the range [1, 21].
 * @see https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
export function contrastRatio(hex1: string, hex2: string): number {
    const l1 = relativeLuminance(hex1);
    const l2 = relativeLuminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

/* ------------------------------------------------------------------ */
/*  Pairing table                                                      */
/* ------------------------------------------------------------------ */

/** A foreground/background pairing to evaluate. */
interface Pairing {
    readonly label: string;
    readonly fgToken: string;
    readonly bgToken: string;
    readonly target: number;
}

/** Resolve a dot-path like "color.textLink" to a hex value from TOKENS. */
function resolveHex(dotPath: string): string {
    const parts = dotPath.split('.');
    // The token table is a deeply nested readonly structure; we walk it
    // dynamically via a string path.  Each intermediate value is validated
    // before property access so we never silently read undefined.
    let current: Record<string, unknown> = TOKENS as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const value = current[part];
        if (value === undefined) {
            throw new Error(`Cannot resolve token path "${dotPath}": "${part}" is undefined`);
        }
        if (i < parts.length - 1) {
            if (typeof value !== 'object' || value === null) {
                throw new Error(`Cannot resolve token path "${dotPath}": "${part}" is not an object`);
            }
            current = value as Record<string, unknown>;
        } else {
            if (typeof value !== 'string') {
                throw new Error(`Token "${dotPath}" resolved to non-string: ${String(value)}`);
            }
            return value;
        }
    }
    throw new Error(`Cannot resolve token path "${dotPath}": empty path`);
}

/**
 * WCAG AA threshold for normal text.
 * We use the stricter 4.5 : 1 for all pairings.
 */
const AA_NORMAL = 4.5;

/**
 * WCAG AA threshold for large text (≥ 18 pt or ≥ 14 pt bold).
 */
const AA_LARGE = 3;

const PAIRINGS: readonly Pairing[] = [
    { label: 'textLink on pageBg', fgToken: 'color.textLink', bgToken: 'color.pageBg', target: AA_NORMAL },
    { label: 'accentActive on surface', fgToken: 'color.accentActive', bgToken: 'color.surface', target: AA_NORMAL },
    { label: 'divider on pageBg', fgToken: 'color.divider', bgToken: 'color.pageBg', target: AA_NORMAL },
    {
        label: 'cardHoverBorder on surface',
        fgToken: 'color.cardHoverBorder',
        bgToken: 'color.surface',
        target: AA_NORMAL,
    },
    { label: 'textLink on surface', fgToken: 'color.textLink', bgToken: 'color.surface', target: AA_NORMAL },
    { label: 'success on successBg', fgToken: 'color.success', bgToken: 'color.successBg', target: AA_NORMAL },
    { label: 'warning on warningBg', fgToken: 'color.warning', bgToken: 'color.warningBg', target: AA_NORMAL },
    { label: 'error on errorBg', fgToken: 'color.error', bgToken: 'color.errorBg', target: AA_NORMAL },
    { label: 'info on infoBg', fgToken: 'color.info', bgToken: 'color.infoBg', target: AA_NORMAL },
    { label: 'accent on chipBg', fgToken: 'color.accent', bgToken: 'color.chipBg', target: AA_NORMAL },
    { label: 'focusRing on surface', fgToken: 'focusRing.color', bgToken: 'color.surface', target: AA_LARGE },
    { label: 'lightColor on surface', fgToken: 'focusRing.lightColor', bgToken: 'color.surface', target: AA_LARGE },
    {
        label: 'darkColor on surfaceRaised',
        fgToken: 'focusRing.darkColor',
        bgToken: 'color.surfaceRaised',
        target: AA_LARGE,
    },
];

/* ------------------------------------------------------------------ */
/*  Computation                                                        */
/* ------------------------------------------------------------------ */

/** A single computed contrast note. */
export interface ContrastNote {
    readonly pairing: string;
    readonly foreground: string;
    readonly background: string;
    readonly ratio: string;
    readonly target: string;
    readonly pass: boolean;
}

/** Compute contrast notes for all pairings from the live token table. */
export function computeContrastNotes(): readonly ContrastNote[] {
    return PAIRINGS.map((pairing) => {
        const fgHex = resolveHex(pairing.fgToken);
        const bgHex = resolveHex(pairing.bgToken);

        // Only process hex colors (skip rgba or non-hex values).
        if (!fgHex.startsWith('#') || fgHex.length !== 7) {
            throw new Error(`Non-hex foreground value for "${pairing.label}": ${fgHex}`);
        }
        if (!bgHex.startsWith('#') || bgHex.length !== 7) {
            throw new Error(`Non-hex background value for "${pairing.label}": ${bgHex}`);
        }

        const ratio = contrastRatio(fgHex, bgHex);
        const ratioFormatted = `${ratio.toFixed(2)}:1`;
        const pass = ratio >= pairing.target;

        return {
            pairing: pairing.label,
            foreground: fgHex,
            background: bgHex,
            ratio: ratioFormatted,
            target: `${pairing.target}:1`,
            pass,
        };
    });
}

/* ------------------------------------------------------------------ */
/*  CLI entrypoint                                                     */
/* ------------------------------------------------------------------ */

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');
const CONTRAST_NOTES_PATH = path.join(PACKAGE_ROOT, 'dist', 'contrast-notes.json');

async function main(): Promise<void> {
    const notes = computeContrastNotes();
    await mkdir(path.dirname(CONTRAST_NOTES_PATH), { recursive: true });
    await writeFile(CONTRAST_NOTES_PATH, `${JSON.stringify(notes, null, 2)}\n`, 'utf8');

    const passCount = notes.filter((n) => n.pass).length;
    process.stdout.write(`contrast-notes: ${passCount}/${notes.length} pairings pass AA (${CONTRAST_NOTES_PATH})\n`);
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(import.meta.filename)) {
    main().catch((error: unknown) => {
        process.stderr.write(`generate-contrast-notes failed: ${String(error)}\n`);
        process.exitCode = 1;
    });
}
