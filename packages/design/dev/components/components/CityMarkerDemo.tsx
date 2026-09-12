import type React from 'react';
import { EuropaCityMarker } from '../../../src/components';
import { TOKENS } from '../../../src/tokens';

export function CityMarkerDemo(): React.ReactElement {
    return (
        <section id="city-marker" className="dev-section">
            <h2 className="dev-section__heading">CityMarker</h2>
            <p className="dev-section__description">Caller-colored marker indicating city ownership.</p>
            <EuropaCityMarker color={TOKENS.color.playerColor1} />
            <EuropaCityMarker color={TOKENS.color.playerColor2} />
            <EuropaCityMarker color={TOKENS.color.playerColor3} />
            <EuropaCityMarker color={TOKENS.color.playerColor4} />
        </section>
    );
}
