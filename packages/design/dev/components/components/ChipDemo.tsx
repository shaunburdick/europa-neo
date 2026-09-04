import type React from 'react';
import { EuropaChip } from '../../../src/components';

export function ChipDemo(): React.ReactElement {
    return (
        <section id="chip" className="dev-section">
            <h2 className="dev-section__heading">Chip</h2>
            <p className="dev-section__description">A compact element displaying a count with optional label.</p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <EuropaChip count={3}>Scouts</EuropaChip>
                <EuropaChip count={7}>Infantry</EuropaChip>
                <EuropaChip count={0}>Reserves</EuropaChip>
            </div>
        </section>
    );
}
