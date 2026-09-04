import type React from 'react';
import { EuropaTroopChip } from '../../../src/components';

export function TroopChipDemo(): React.ReactElement {
    return (
        <section id="troop-chip" className="dev-section">
            <h2 className="dev-section__heading">TroopChip</h2>
            <p className="dev-section__description">Player-colored chip showing troop count on the board.</p>
            <EuropaTroopChip count={5} owner={1} />
            <EuropaTroopChip count={3} owner={2} />
            <EuropaTroopChip count={8} owner={3} />
            <EuropaTroopChip count={1} owner={4} />
        </section>
    );
}
