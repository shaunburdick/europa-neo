import type React from 'react';
import { TOKENS } from '../../../src/tokens';
import { toKebabCase } from '../../lib/token-utils';

/**
 * SpacingBorders — renders spacing, border, shadow, motion, and control
 * height token reference tables for the design-system dev page.
 *
 * Each token group is displayed as a three-column table (Token Name,
 * CSS Variable, Value). Spacing tokens receive an additional visual bar
 * row that renders each value at relative scale so designers can compare
 * sizes at a glance.
 *
 * Section id is `"spacing"` for hash-navigation from the sidebar.
 *
 * @returns A React element containing the spacing/borders section.
 */
export function SpacingBorders(): React.ReactElement {
    const groups = ['spacing', 'borders', 'radii', 'shadows', 'motion', 'controlHeight'] as const;

    return (
        <section id="spacing" className="dev-section">
            <h2 className="dev-section__heading">Spacing &amp; Borders</h2>
            <p className="dev-section__desc">Spacing, borders, shadows, motion tokens</p>
            {groups.map((group) => (
                <div key={group}>
                    <h3 className="dev-section__subheading">{group}</h3>
                    <TokenTable group={group} tokens={TOKENS[group] as Record<string, string | number>} />
                    {group === 'spacing' && <SpacingBars tokens={TOKENS.spacing as Record<string, string>} />}
                </div>
            ))}
        </section>
    );
}

// ---------------------------------------------------------------------------
// TokenTable — renders a three-column table for a single token group.
// ---------------------------------------------------------------------------

interface TokenTableProps {
    readonly group: string;
    readonly tokens: Record<string, string | number>;
}

function TokenTable({ group, tokens }: TokenTableProps): React.ReactElement {
    const groupKebab = toKebabCase(group);

    return (
        <table className="dev-token-table">
            <thead>
                <tr>
                    <th>Token</th>
                    <th>CSS Variable</th>
                    <th>Value</th>
                </tr>
            </thead>
            <tbody>
                {Object.entries(tokens).map(([key, value]) => (
                    <tr key={key}>
                        <td>{key}</td>
                        <td>
                            <code>
                                --europa-{groupKebab}-{toKebabCase(key)}
                            </code>
                        </td>
                        <td>{String(value)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ---------------------------------------------------------------------------
// SpacingBars — visual bar chart showing relative spacing sizes.
// ---------------------------------------------------------------------------

interface SpacingBarsProps {
    readonly tokens: Record<string, string>;
}

function SpacingBars({ tokens }: SpacingBarsProps): React.ReactElement {
    /**
     * Parse a CSS length string into a numeric pixel value.
     *
     * Supports `rem` (assumes 16px root) and `px` units. Returns
     * `NaN` for unrecognised formats so callers can skip gracefully.
     *
     * @param value - CSS length string (e.g. `"1rem"`, `"12px"`).
     * @returns Numeric pixel value, or `NaN` if unparseable.
     */
    function parsePx(value: string): number {
        if (value.endsWith('rem')) {
            return parseFloat(value) * 16;
        }
        if (value.endsWith('px')) {
            return parseFloat(value);
        }
        return Number.NaN;
    }

    const entries = Object.entries(tokens).map(([key, value]) => ({ key, value, px: parsePx(value) }));

    const maxPx = Math.max(...entries.map((e) => e.px).filter((n) => !Number.isNaN(n)));

    return (
        <div
            className="dev-spacing-bars"
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--europa-spacing-sm)',
                marginBottom: 'var(--europa-spacing-md)',
            }}
        >
            {entries.map(({ key, value, px }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--europa-spacing-sm)' }}>
                    <span
                        style={{
                            minWidth: '3rem',
                            fontFamily: 'var(--europa-typography-font-mono)',
                            fontSize: 'var(--europa-typography-size-xs)',
                            color: 'var(--europa-color-text-muted)',
                        }}
                    >
                        {key}
                    </span>
                    <div
                        style={{
                            width: Number.isNaN(px) || maxPx === 0 ? '0px' : `${(px / maxPx) * 100}%`,
                            height: 'var(--europa-control-height-xs)',
                            backgroundColor: 'var(--europa-color-accent)',
                            borderRadius: 'var(--europa-radii-sm)',
                            minWidth: '2px',
                        }}
                    />
                    <span
                        style={{
                            fontFamily: 'var(--europa-typography-font-mono)',
                            fontSize: 'var(--europa-typography-size-xs)',
                            color: 'var(--europa-color-text-secondary)',
                        }}
                    >
                        {value}
                    </span>
                </div>
            ))}
        </div>
    );
}
