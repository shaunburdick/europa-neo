import type React from 'react';
import { EuropaElevationSwatch } from '../../../src/components';

/**
 * Biome zone metadata — names and flow behavior for each elevation band.
 * Matches spec 024 FR-001/FR-050 zone definitions.
 */
const BIOME_ZONES = [
    { name: 'Smooth Ice', range: '0–80', flow: 'Always flowable', example: 40 },
    { name: 'Fractured Ice', range: '81–160', flow: 'Flowable but slower', example: 120 },
    { name: 'Rocky Outcrops', range: '161–208', flow: 'May stall uphill', example: 185 },
    { name: 'Ice Peaks', range: '209–255', flow: 'Extreme — uphill always stalled', example: 232 },
] as const;

/**
 * ElevationSwatch component demo — renders the land elevation ramp.
 *
 * Shows all 4 biome zones with representative elevation swatches,
 * zone names, elevation ranges, and flow viability behavior.
 *
 * @returns The elevation-swatch demo section with id="elevation-swatch" for hash navigation.
 */
export function ElevationSwatchDemo(): React.ReactElement {
    return (
        <section id="elevation-swatch" className="dev-section">
            <h2 className="dev-section__heading">ElevationSwatch</h2>
            <p className="dev-section__description">
                Biome zone color ramp — 4 zones mapping elevation to terrain color and pipe flow viability.
            </p>

            {/* Zone-by-zone breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.75rem' }}>
                {BIOME_ZONES.map((zone) => (
                    <div key={zone.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <EuropaElevationSwatch elevation={Math.round((zone.example / 255) * 100)} />
                        <div>
                            <strong>{zone.name}</strong>
                            <span style={{ color: '#9ca3af', marginLeft: '0.5rem' }}>elev {zone.range}</span>
                            <br />
                            <span style={{ color: '#e5e7eb', fontSize: '0.85em' }}>{zone.flow}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Full ramp */}
            <h3 style={{ marginTop: '1.25rem', marginBottom: '0.5rem', fontSize: '0.9em', color: '#9ca3af' }}>
                Full ramp (0 → 100)
            </h3>
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((e) => (
                    <div key={e} style={{ textAlign: 'center' }}>
                        <EuropaElevationSwatch elevation={e} />
                        <div style={{ fontSize: '0.65em', color: '#6b7280', marginTop: 2 }}>{e}</div>
                    </div>
                ))}
            </div>
        </section>
    );
}
