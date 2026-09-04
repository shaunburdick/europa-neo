import type React from 'react';
import { EuropaWaiting } from '../../../src/components';

export function WaitingDemo(): React.ReactElement {
    return (
        <section id="waiting" className="dev-section">
            <h2 className="dev-section__heading">Waiting</h2>
            <EuropaWaiting message="Loading game data..." />
        </section>
    );
}
