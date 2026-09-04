import type React from 'react';
import { EuropaBanner } from '../../../src/components';

export function BannerDemo(): React.ReactElement {
    return (
        <section id="banner" className="dev-section">
            <h2 className="dev-section__heading">Banner</h2>
            <p className="dev-section__description">A prominent message bar for status updates and alerts.</p>
            <EuropaBanner variant="status">Information banner (polite)</EuropaBanner>
            <EuropaBanner variant="alert">Error banner (assertive)</EuropaBanner>
        </section>
    );
}
