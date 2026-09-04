import type React from 'react';
import { EuropaButton, EuropaStack } from '../../../src/components';

export function StackDemo(): React.ReactElement {
    return (
        <section id="stack" className="dev-section">
            <h2 className="dev-section__heading">Stack</h2>
            <p className="dev-section__description">A vertical or horizontal layout primitive for stacking elements.</p>
            <h3 className="dev-section__subheading">Vertical</h3>
            <EuropaStack>
                <EuropaButton>Default</EuropaButton>
                <EuropaButton variant="primary">Primary</EuropaButton>
                <EuropaButton variant="error">Error</EuropaButton>
            </EuropaStack>
            <h3 className="dev-section__subheading">Horizontal</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
                <EuropaButton>Default</EuropaButton>
                <EuropaButton variant="primary">Primary</EuropaButton>
                <EuropaButton variant="error">Error</EuropaButton>
            </div>
        </section>
    );
}
