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
        accentActive: '#d97706',
        accentGlow: 'rgba(245, 158, 11, 0.08)',
        accentGlowStrong: 'rgba(245, 158, 11, 0.3)',
        banner: '#d97706',
        /**
         * Biome zone configuration (spec 024 FR-001/FR-031). Each zone
         * maps a contiguous elevation range to a distinct hue family,
         * replacing the retired single-hue 6-band land shading.
         *
         * Zone boundaries align with the pipe flow formula's behavioral
         * transitions (flowBase=7, flowDownhillStep=1, flowUphillStep=1,
         * flowSlopeDeltaCap=5, flowUphillCap=80):
         *   Zone 0 (0–80):   downhill bonus — easy flow (Ice Plains)
         *   Zone 1 (81–160):  flat-to-mild-uphill — moderate flow (Fractured Ice)
         *   Zone 2 (161–208): stalled uphill — hard flow (Rocky Outcrops)
         *   Zone 3 (209–255): extreme uphill — extreme (Ice Peaks)
         */
        biomeZones: [
            { elevationMax: 80, hue: 210, saturationPct: 65, lightnessMin: 38, lightnessMax: 52 },
            { elevationMax: 160, hue: 170, saturationPct: 55, lightnessMin: 26, lightnessMax: 40 },
            { elevationMax: 208, hue: 30, saturationPct: 55, lightnessMin: 30, lightnessMax: 42 },
            { elevationMax: 255, hue: 200, saturationPct: 15, lightnessMin: 80, lightnessMax: 95 },
        ] as const,
        blue: '#2563eb',
        border: '#374151',
        captureEffect: 'rgba(16, 185, 129, 0.55)',
        cardHoverBorder: '#f59e0b',
        chipBg: '#111827',
        chipText: '#f9fafb',
        city: '#fbbf24',
        cityGlow: '#ff6b6b',
        cityGlowStrong: '#ff4444',
        combatEffect: 'rgba(239, 68, 68, 0.55)',
        divider: '#374151',
        // Semantic state colors — dark-theme values for success/warning/error/info.
        // Each state has a base fill, bg, border, hover, and active variant.  Sourced
        // from the OpenDesign reference (packages/design/tmp/system/variables.dark.css).
        error: '#dc6966',
        errorActive: '#ad5553',
        errorBg: '#32191a',
        errorBorder: '#5b3231',
        errorHover: '#e89590',
        errorText: '#fca5a5',
        focusRing: '#ffffff',
        genericEffect: 'rgba(148, 163, 184, 0.45)',
        green: '#059669',
        greenGlow: 'rgba(5, 150, 105, 0.5)',
        info: '#dca12e',
        infoActive: '#ad872f',
        infoBg: '#302311',
        infoBorder: '#5b461d',
        infoHover: '#e8c35e',
        overlaySoft: 'rgba(26, 34, 51, 0.6)',
        overlayStrong: 'rgba(26, 34, 51, 0.75)',
        pageBg: '#0b0f19',
        // Pipe slope indicators (spec 005 FR-013): downhill/flat/uphill/stalled.
        // Values reuse the canonical green/accent/red/textMuted tokens — zero new
        // hex literals (FR-009 / FR-010); pairings documented in DESIGN.md § 1.1/§ 3.
        pipeDownhill: '#059669',
        pipeFlat: '#f59e0b',
        pipeOutline: 'rgba(0, 0, 0, 0.7)',
        pipeStalled: '#9ca3af',
        pipeUphill: '#dc2626',
        red: '#dc2626',
        success: '#059669',
        successActive: '#1b7154',
        successBg: '#11221d',
        successBorder: '#173f31',
        successHover: '#3aa07a',
        surface: '#111827',
        surfaceRaised: '#1f2937',
        textLink: '#f59e0b',
        textMuted: '#9ca3af',
        textPrimary: '#f9fafb',
        textSecondary: '#e5e7eb',
        voidBg: '#1a2233',
        voidGradientCenter: '#1e2940',
        voidGradientEdge: '#151c2a',
        warning: '#dcaa37',
        warningActive: '#ad872f',
        warningBg: '#312512',
        warningBorder: '#5b4920',
        warningHover: '#e8c35e',
        water: '#1d4ed8',
        waterDeep: '#1e3a5f',
        waterShallow: '#4a90d9',
    },
    // Canonical interactive-control heights — buttons, inputs, selects.
    controlHeight: {
        default: '32px',
        lg: '40px',
        sm: '24px',
        xs: '16px',
    },
    focusRing: {
        color: '#ffffff',
        darkColor: '#111827',
        lightColor: '#ffffff',
        offset: '2px',
        style: 'solid',
        width: '2px',
    },
    motion: {
        duration: '120ms',
        durationMs: 120,
        easing: 'ease',
        easingInOut: 'ease-in-out',
        easingLinear: 'linear',
        easingOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
        spinDuration: '1.2s',
        transitionDefault: '120ms',
        transitionFast: '80ms',
        transitionSlow: '200ms',
        transitionSpring: '300ms',
    },
    radii: {
        card: '6px',
        input: '4px',
        pill: '999px',
        plate: '8px',
        sm: '3px',
    },
    shadows: {
        board: 'inset 0 1px 4px rgba(0, 0, 0, 0.3)',
        cardActive: '0 2px 4px rgba(0, 0, 0, 0.25)',
        cardHover: '0 4px 12px rgba(0, 0, 0, 0.3)',
        hud: '0 2px 8px rgba(0, 0, 0, 0.25)',
        modal: '0 8px 32px rgba(0, 0, 0, 0.4)',
        plate: '0 2px 8px rgba(0, 0, 0, 0.2)',
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
        heading: '1.5rem',
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
        subheading: '1.2rem',
        trackingNormal: '0',
        trackingTight: '-0.025em',
        trackingWide: '0.05em',
    },
} as const;

/** Typed view of the canonical token table. */
export type Tokens = typeof TOKENS;

/** Union of token groups. */
export type TokenGroup = keyof Tokens;
