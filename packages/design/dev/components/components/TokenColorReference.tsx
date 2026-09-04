import type React from 'react';
import { TOKENS } from '../../../src/tokens';

/**
 * Player identity colors — maps player 1–4 to their canonical token colors.
 * These are the same values used by {@link EuropaPlayerBadge}.
 */
const PLAYER_COLOR_ENTRIES: ReadonlyArray<{ player: number; color: string }> = [
    { player: 1, color: TOKENS.color.accent },
    { player: 2, color: TOKENS.color.city },
    { player: 3, color: TOKENS.color.green },
    { player: 4, color: TOKENS.color.blue },
];

/**
 * Pipe slope indicator colors — maps each direction to its canonical token.
 * These are the same values used by {@link EuropaPipeSlope}.
 */
const PIPE_SLOPE_ENTRIES: ReadonlyArray<{ name: string; color: string }> = [
    { name: 'downhill', color: TOKENS.color.pipeDownhill },
    { name: 'flat', color: TOKENS.color.pipeFlat },
    { name: 'uphill', color: TOKENS.color.pipeUphill },
    { name: 'stalled', color: TOKENS.color.pipeStalled },
];

/**
 * Keys in the color token table that are not user-visible swatches
 * (numeric calibration values and transparency-only entries).
 */
const SKIP_COLOR_KEYS: ReadonlySet<string> = new Set([
    'landHue',
    'landMaxLightnessPct',
    'landMinLightnessPct',
    'landSaturationPct',
]);

/**
 * Token color reference section — renders swatches for player colors,
 * pipe-slope colors, and the base color palette.
 *
 * Each swatch shows a color preview with the token name and hex value.
 * All colors are sourced from the canonical {@link TOKENS} table —
 * zero hardcoded hex/rgb literals in property values.
 *
 * @returns The token-colors demo section with id="token-colors" for hash navigation.
 */
export function TokenColorReference(): React.ReactElement {
    /** Entries from the base palette (non-player, non-pipe, non-land). */
    const basePalette = Object.entries(TOKENS.color).filter(
        ([key]) =>
            !key.startsWith('player') &&
            !key.startsWith('pipe') &&
            !key.startsWith('land') &&
            !SKIP_COLOR_KEYS.has(key),
    );

    return (
        <section id="token-colors" className="dev-section">
            <h2 className="dev-section__heading">Token Colors</h2>
            <p className="dev-section__description">Player colors, pipe slopes, elevation ramp, and base palette</p>

            {/* Player colors */}
            <h3 className="dev-section__subheading">Player Colors</h3>
            <div className="dev-swatch-grid">
                {PLAYER_COLOR_ENTRIES.map(({ player, color }) => (
                    <div key={player} className="dev-swatch-card">
                        <div className="dev-swatch-preview" style={{ backgroundColor: color }} />
                        <code>player-{player}</code>
                    </div>
                ))}
            </div>

            {/* Pipe slope colors */}
            <h3 className="dev-section__subheading">Pipe Slope Colors</h3>
            <div className="dev-swatch-grid">
                {PIPE_SLOPE_ENTRIES.map(({ name, color }) => (
                    <div key={name} className="dev-swatch-card">
                        <div className="dev-swatch-preview" style={{ backgroundColor: color }} />
                        <code>pipe-{name}</code>
                    </div>
                ))}
            </div>

            {/* Base palette */}
            <h3 className="dev-section__subheading">Base Palette</h3>
            <div className="dev-swatch-grid">
                {basePalette.slice(0, 20).map(([key, value]) => (
                    <div key={key} className="dev-swatch-card">
                        <div className="dev-swatch-preview" style={{ backgroundColor: String(value) }} />
                        <code>{key}</code>
                    </div>
                ))}
            </div>
        </section>
    );
}
