import type React from 'react';
import { EuropaBadge } from '../../../src/components';

export function BadgeDemo(): React.ReactElement {
    return (
        <section id="badge" className="dev-section">
            <h2 className="dev-section__heading">Badge</h2>
            <p className="dev-section__description">A small status indicator for labels and counts.</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <EuropaBadge className="europa-badge--success">Success</EuropaBadge>
                <EuropaBadge className="europa-badge--warning">Warning</EuropaBadge>
                <EuropaBadge className="europa-badge--error">Error</EuropaBadge>
                <EuropaBadge className="europa-badge--info">Info</EuropaBadge>
                <EuropaBadge className="europa-badge--accent">Accent</EuropaBadge>
            </div>
        </section>
    );
}
