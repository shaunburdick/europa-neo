import type React from 'react';
import { EuropaCard, EuropaGrid } from '../../../src/components';

export function GridDemo(): React.ReactElement {
    return (
        <section id="grid" className="dev-section">
            <h2 className="dev-section__heading">Grid</h2>
            <EuropaGrid variant="wrap">
                <EuropaCard>Cell 1</EuropaCard>
                <EuropaCard>Cell 2</EuropaCard>
                <EuropaCard>Cell 3</EuropaCard>
                <EuropaCard>Cell 4</EuropaCard>
                <EuropaCard>Cell 5</EuropaCard>
                <EuropaCard>Cell 6</EuropaCard>
            </EuropaGrid>
        </section>
    );
}
