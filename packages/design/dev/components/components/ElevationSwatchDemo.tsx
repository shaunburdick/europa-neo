import type React from 'react';
import { EuropaElevationSwatch } from '../../../src/components';

/**
 * ElevationSwatch component demo — renders the land elevation ramp.
 *
 * Shows five swatches at increasing elevation values (0, 25, 50, 75, 100)
 * to visualize the lightness interpolation from min to max.
 *
 * @returns The elevation-swatch demo section with id="elevation-swatch" for hash navigation.
 */
export function ElevationSwatchDemo(): React.ReactElement {
    return (
        <section id="elevation-swatch" className="dev-section">
            <h2 className="dev-section__heading">ElevationSwatch</h2>
            <p className="dev-section__description">Color ramp showing terrain elevation levels.</p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <EuropaElevationSwatch elevation={0} />
                <EuropaElevationSwatch elevation={25} />
                <EuropaElevationSwatch elevation={50} />
                <EuropaElevationSwatch elevation={75} />
                <EuropaElevationSwatch elevation={100} />
            </div>
        </section>
    );
}
