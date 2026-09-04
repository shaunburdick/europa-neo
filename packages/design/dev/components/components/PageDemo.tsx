import type React from 'react';
import { EuropaPage } from '../../../src/components';

export function PageDemo(): React.ReactElement {
    return (
        <section id="page" className="dev-section">
            <h2 className="dev-section__heading">Page</h2>
            <p className="dev-section__description">The outermost page wrapper with consistent padding.</p>
            <EuropaPage>
                <p>Page content goes here</p>
            </EuropaPage>
        </section>
    );
}
