import type React from 'react';
import { EuropaPipeSlope } from '../../../src/components';

/**
 * PipeSlope component demo — renders all four flow directions.
 *
 * Shows the visual representation of pipe elevation gradients:
 * downhill (green), flat (amber), uphill (red), stalled (muted gray).
 *
 * @returns The pipe-slope demo section with id="pipe-slope" for hash navigation.
 */
export function PipeSlopeDemo(): React.ReactElement {
    return (
        <section id="pipe-slope" className="dev-section">
            <h2 className="dev-section__heading">PipeSlope</h2>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <EuropaPipeSlope direction="downhill" />
                <EuropaPipeSlope direction="flat" />
                <EuropaPipeSlope direction="uphill" />
                <EuropaPipeSlope direction="stalled" />
            </div>
        </section>
    );
}
