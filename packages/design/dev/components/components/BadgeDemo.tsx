import type React from 'react';
import { EuropaBadge } from '../../../src/components';

export function BadgeDemo(): React.ReactElement {
    return (
        <section id="badge" className="dev-section">
            <h2 className="dev-section__heading">Badge</h2>
            <EuropaBadge>Default</EuropaBadge>
            <EuropaBadge>Your match</EuropaBadge>
            <EuropaBadge>3 players</EuropaBadge>
        </section>
    );
}
