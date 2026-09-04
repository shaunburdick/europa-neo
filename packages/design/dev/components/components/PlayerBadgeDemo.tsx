import type React from 'react';
import { EuropaPlayerBadge } from '../../../src/components';

/**
 * PlayerBadge component demo — renders badges for all four player slots.
 *
 * Each badge shows the player's identity color (accent, city, green, blue)
 * and a display name.
 *
 * @returns The player-badge demo section with id="player-badge" for hash navigation.
 */
export function PlayerBadgeDemo(): React.ReactElement {
    return (
        <section id="player-badge" className="dev-section">
            <h2 className="dev-section__heading">PlayerBadge</h2>
            <p className="dev-section__description">Player identity badge with faction colors.</p>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <EuropaPlayerBadge player={1} name="Player 1" />
                <EuropaPlayerBadge player={2} name="Player 2" />
                <EuropaPlayerBadge player={3} name="Player 3" />
                <EuropaPlayerBadge player={4} name="Player 4" />
            </div>
        </section>
    );
}
