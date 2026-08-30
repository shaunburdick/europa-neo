/**
 * Canonical design tokens — single source of truth for Europa Neo's
 * shareable design system (spec 012, FR-003 / FR-004).
 *
 * Every color, typography, spacing, radii, border, shadow, focus-ring,
 * and motion decision lives here as a typed literal and is emitted to
 * CSS as `--europa-{group}-{kebab(name)}` by the deterministic build
 * step (T-006). No other file may contain hex/rgb literals outside
 * imports from this module (FR-009 / FR-010).
 *
 * Values are taken mechanically from the pre-migration console source
 * `packages/console/src/styles/index.css` (884 lines) and
 * `packages/console/src/render/palette.ts` (FR-003 first values):
 * every hex and rgba literal in those files has a matching entry
 * below — verified by grep audit in the T-005 commit.
 *
 * Determinism: keys within each group are sorted alphabetically so
 * the emitter can walk the table in stable order and produce a
 * byte-identical `dist/design.css` on every build.
 */

/**
 * Complete token table. Each leaf's CSS variable name is the
 * derivation `--europa-{group}-{kebab(name)}` (e.g. `color.pageBg`
 * → `--europa-color-page-bg`). The emitter maintains that mapping;
 * this file owns the canonical values only.
 */
export const TOKENS = {
    borders: {
        color: 'var(--europa-color-border)',
        style: 'solid',
        width: '1px',
    },
    color: {
        accent: '#f59e0b',
        banner: '#d97706',
        blue: '#2563eb',
        border: '#374151',
        captureEffect: 'rgba(16, 185, 129, 0.55)',
        chipBg: '#111827',
        chipText: '#f9fafb',
        city: '#fbbf24',
        combatEffect: 'rgba(239, 68, 68, 0.55)',
        errorText: '#fca5a5',
        focusRing: '#ffffff',
        genericEffect: 'rgba(148, 163, 184, 0.45)',
        green: '#059669',
        landHue: 120,
        landMaxLightnessPct: 62,
        landMinLightnessPct: 26,
        landSaturationPct: 12,
        overlaySoft: 'rgba(26, 34, 51, 0.6)',
        overlayStrong: 'rgba(26, 34, 51, 0.75)',
        pageBg: '#0b0f19',
        red: '#dc2626',
        surface: '#111827',
        surfaceRaised: '#1f2937',
        textMuted: '#9ca3af',
        textPrimary: '#f9fafb',
        textSecondary: '#e5e7eb',
        voidBg: '#1a2233',
        water: '#1d4ed8',
    },
    focusRing: {
        color: '#ffffff',
        offset: '2px',
        style: 'solid',
        width: '2px',
    },
    motion: {
        durationMs: 120,
        easing: 'ease',
        easingLinear: 'linear',
        spinDuration: '1.2s',
    },
    radii: {
        card: '6px',
        input: '4px',
        pill: '999px',
        plate: '8px',
        sm: '3px',
    },
    shadows: {
        board: 'none',
        modal: 'none',
        plate: 'none',
    },
    spacing: {
        lg: '1rem',
        md: '0.75rem',
        sm: '0.5rem',
        xl: '1.25rem',
        xs: '0.25rem',
    },
    typography: {
        fontMono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontStack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        lineHeightNormal: '1.2',
        lineHeightRelaxed: '1.4',
        size2xl: '1.2rem',
        size3xl: '1.5rem',
        sizeBase: '0.9rem',
        sizeChip: '11px',
        sizeLg: '1.05rem',
        sizeMd: '0.95rem',
        sizeReserve: '9px',
        sizeSm: '0.85rem',
        sizeXl: '1.1rem',
        sizeXs: '0.75rem',
    },
} as const;

/** Typed view of the canonical token table. */
export type Tokens = typeof TOKENS;

/** Union of token groups. */
export type TokenGroup = keyof Tokens;
