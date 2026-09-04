import type React from 'react';
import { EuropaChip } from '../../../src/components';

export function ChipDemo(): React.ReactElement {
    return (
        <section id="chip" className="dev-section">
            <h2 className="dev-section__heading">Chip</h2>
            <EuropaChip count={3} />
            <EuropaChip count={7}>troops</EuropaChip>
            <EuropaChip count={0}>empty</EuropaChip>
        </section>
    );
}
