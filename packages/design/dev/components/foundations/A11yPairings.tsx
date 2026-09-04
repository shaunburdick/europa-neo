/**
 * A11yPairings — WCAG contrast pairings table for the dev page.
 *
 * Renders a table of foreground/background color pairings with computed
 * contrast ratios and AA/AAA compliance status. Data is sourced from
 * {@link buildA11yPairings} which reads directly from TOKENS.
 *
 * Section id "a11y" supports hash navigation from the sidebar.
 */

import type React from 'react';
import { buildA11yPairings } from '../../lib/token-utils';

/**
 * Parse the numeric value from a ratio string like "12.50:1".
 *
 * @param ratio - Formatted ratio string.
 * @returns Numeric contrast ratio.
 */
function parseRatio(ratio: string): number {
    return Number.parseFloat(ratio.split(':')[0] ?? '0');
}

export function A11yPairings(): React.ReactElement {
    const pairings = buildA11yPairings();

    return (
        <section id="a11y" className="dev-section">
            <h2 className="dev-section__heading">Accessibility</h2>
            <p className="dev-section__desc">Contrast pairings and compliance</p>
            <table className="dev-token-table">
                <thead>
                    <tr>
                        <th>Foreground</th>
                        <th>Background</th>
                        <th>Ratio</th>
                        <th>AA (4.5:1)</th>
                        <th>AAA (7:1)</th>
                    </tr>
                </thead>
                <tbody>
                    {pairings.map((pairing) => {
                        const numeric = parseRatio(pairing.ratio);
                        const passAA = pairing.pass;
                        const passAAA = numeric >= 7;

                        return (
                            <tr key={pairing.pairing}>
                                <td>
                                    <span
                                        className="dev-swatch-inline"
                                        style={{ backgroundColor: pairing.foreground }}
                                    />
                                    {pairing.pairing.split(' on ')[0]}
                                </td>
                                <td>
                                    <span
                                        className="dev-swatch-inline"
                                        style={{ backgroundColor: pairing.background }}
                                    />
                                    {pairing.pairing.split(' on ')[1]}
                                </td>
                                <td>{pairing.ratio}</td>
                                <td className={passAA ? 'dev-pass' : 'dev-fail'}>{passAA ? '✓ Pass' : '✗ Fail'}</td>
                                <td className={passAAA ? 'dev-pass' : 'dev-fail'}>{passAAA ? '✓ Pass' : '✗ Fail'}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </section>
    );
}
