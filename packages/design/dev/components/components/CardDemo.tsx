import type React from 'react';
import { EuropaButton, EuropaCard } from '../../../src/components';

export function CardDemo(): React.ReactElement {
    return (
        <section id="card" className="dev-section">
            <h2 className="dev-section__heading">Card</h2>
            <p className="dev-section__description">A contained surface for grouping related content.</p>
            <div className="dev-demo" style={{ maxWidth: '400px' }}>
                <EuropaCard>
                    <p>Simple text-only card.</p>
                </EuropaCard>
                <EuropaCard>
                    <h3>Card with heading</h3>
                    <p>This card contains a heading and body text.</p>
                </EuropaCard>
                <EuropaCard>
                    <p>Card with an action:</p>
                    <EuropaButton variant="primary">Click me</EuropaButton>
                </EuropaCard>
            </div>
        </section>
    );
}
