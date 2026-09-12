import type React from 'react';
import { EuropaPlayerBadge } from '../../../src/components';
import { TOKENS } from '../../../src/tokens';

/**
 * PlayerBadge component demo — renders badges for all four player slots.
 *
 * Each badge is passed a display name and the canonical
 * `TOKENS.color.playerColor*` identity color by the caller; the component
 * itself is identity-agnostic (issue #74).
 *
 * @returns The player-badge demo section with id="player-badge" for hash navigation.
 */
export function PlayerBadgeDemo(): React.ReactElement {
    return (
        <section id="player-badge" className="dev-section">
            <h2 className="dev-section__heading">PlayerBadge</h2>
            <p className="dev-section__description">Player identity badge with caller-supplied identity colors.</p>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <EuropaPlayerBadge name="Player 1" color={TOKENS.color.playerColor1} />
                <EuropaPlayerBadge name="Player 2" color={TOKENS.color.playerColor2} />
                <EuropaPlayerBadge name="Player 3" color={TOKENS.color.playerColor3} />
                <EuropaPlayerBadge name="Player 4" color={TOKENS.color.playerColor4} />
            </div>
        </section>
    );
}
