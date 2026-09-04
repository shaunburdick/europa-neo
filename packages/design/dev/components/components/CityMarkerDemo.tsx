import type React from 'react';
import { EuropaCityMarker } from '../../../src/components';

export function CityMarkerDemo(): React.ReactElement {
    return (
        <section id="city-marker" className="dev-section">
            <h2 className="dev-section__heading">CityMarker</h2>
            <p className="dev-section__description">Player-colored marker indicating city ownership.</p>
            <EuropaCityMarker owner={1} />
            <EuropaCityMarker owner={2} />
            <EuropaCityMarker owner={3} />
            <EuropaCityMarker owner={4} />
        </section>
    );
}
