import type React from 'react';
import { EuropaContainer } from '../../../src/components';

export function ContainerDemo(): React.ReactElement {
    return (
        <section id="container" className="dev-section">
            <h2 className="dev-section__heading">Container</h2>
            <p className="dev-section__description">A constrained-width wrapper for content areas.</p>
            <EuropaContainer>
                <p>Container content</p>
            </EuropaContainer>
        </section>
    );
}
