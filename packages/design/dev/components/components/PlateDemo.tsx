import type React from 'react';
import { EuropaPlate } from '../../../src/components';

export function PlateDemo(): React.ReactElement {
    return (
        <section id="plate" className="dev-section">
            <h2 className="dev-section__heading">Plate</h2>
            <EuropaPlate>
                <p>Plate content</p>
            </EuropaPlate>
        </section>
    );
}
