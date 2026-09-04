import type React from 'react';
import { EuropaReserveIndicator } from '../../../src/components';

/**
 * ReserveIndicator component demo — renders reserves at four percentage levels.
 *
 * Shows the chip-styled percentage display at 0%, 30%, 60%, and 90% reserves
 * to demonstrate the full range of the reserve indicator.
 *
 * @returns The reserve-indicator demo section with id="reserve-indicator" for hash navigation.
 */
export function ReserveIndicatorDemo(): React.ReactElement {
    return (
        <section id="reserve-indicator" className="dev-section">
            <h2 className="dev-section__heading">ReserveIndicator</h2>
            <p className="dev-section__description">Gauge showing reserve troop capacity.</p>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <EuropaReserveIndicator percent={0} />
                <EuropaReserveIndicator percent={30} />
                <EuropaReserveIndicator percent={60} />
                <EuropaReserveIndicator percent={90} />
            </div>
        </section>
    );
}
