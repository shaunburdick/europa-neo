import type React from 'react';
import { EuropaTroopChip } from '../../../src/components';
import { TOKENS } from '../../../src/tokens';

export function TroopChipDemo(): React.ReactElement {
    return (
        <section id="troop-chip" className="dev-section">
            <h2 className="dev-section__heading">TroopChip</h2>
            <p className="dev-section__description">Caller-colored chip showing troop count on the board.</p>
            <EuropaTroopChip count={5} color={TOKENS.color.playerColor1} />
            <EuropaTroopChip count={3} color={TOKENS.color.playerColor2} />
            <EuropaTroopChip count={8} color={TOKENS.color.playerColor3} />
            <EuropaTroopChip count={1} color={TOKENS.color.playerColor4} />
        </section>
    );
}
