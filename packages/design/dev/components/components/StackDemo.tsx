import type React from 'react';
import { EuropaButton, EuropaStack } from '../../../src/components';

export function StackDemo(): React.ReactElement {
    return (
        <section id="stack" className="dev-section">
            <h2 className="dev-section__heading">Stack</h2>
            <EuropaStack>
                <EuropaButton>Button 1</EuropaButton>
                <EuropaButton>Button 2</EuropaButton>
                <EuropaButton>Button 3</EuropaButton>
            </EuropaStack>
        </section>
    );
}
