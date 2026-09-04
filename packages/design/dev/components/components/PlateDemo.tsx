import type React from 'react';
import { EuropaPlate } from '../../../src/components';

export function PlateDemo(): React.ReactElement {
    return (
        <section id="plate" className="dev-section">
            <h2 className="dev-section__heading">Plate</h2>
            <p className="dev-section__description">A low-emphasis surface for secondary content.</p>
            <div className="dev-demo" style={{ maxWidth: '400px' }}>
                <EuropaPlate>
                    <span>Label: </span>
                    <strong>Value</strong>
                </EuropaPlate>
                <EuropaPlate>
                    <span style={{ marginRight: '8px' }}>&#9679;</span>
                    Icon placeholder with text
                </EuropaPlate>
            </div>
        </section>
    );
}
