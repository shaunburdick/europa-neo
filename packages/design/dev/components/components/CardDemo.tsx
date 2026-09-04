import type React from 'react';
import { EuropaCard } from '../../../src/components';

export function CardDemo(): React.ReactElement {
    return (
        <section id="card" className="dev-section">
            <h2 className="dev-section__heading">Card</h2>
            <EuropaCard>
                <p>Card content</p>
            </EuropaCard>
        </section>
    );
}
