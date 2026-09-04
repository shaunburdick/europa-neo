import type React from 'react';
import { EuropaButton } from '../../../src/components';

export function ButtonDemo(): React.ReactElement {
    return (
        <section id="button" className="dev-section">
            <h2 className="dev-section__heading">Button</h2>
            <p className="dev-section__description">Interactive trigger elements with multiple variants and sizes.</p>
            <EuropaButton>Default</EuropaButton>
            <EuropaButton variant="primary">Primary</EuropaButton>
            <EuropaButton variant="secondary">Secondary</EuropaButton>
            <EuropaButton variant="error">Error</EuropaButton>
            <EuropaButton disabled>Disabled</EuropaButton>
            <EuropaButton size="sm">Small</EuropaButton>
            <EuropaButton size="lg">Large</EuropaButton>
        </section>
    );
}
