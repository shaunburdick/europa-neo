import type React from 'react';
import { EuropaFogOverlay } from '../../../src/components';

/**
 * FogOverlay component demo — renders visible and hidden fog states.
 *
 * Two containers with a surface-colored background demonstrate the fog overlay:
 * one with fog visible (opaque cover) and one with fog cleared (empty/null).
 * Labels clarify each state since the hidden variant renders nothing.
 *
 * @returns The fog-overlay demo section with id="fog-overlay" for hash navigation.
 */
export function FogOverlayDemo(): React.ReactElement {
    return (
        <section id="fog-overlay" className="dev-section">
            <h2 className="dev-section__heading">FogOverlay</h2>
            <div style={{ display: 'flex', gap: '1rem' }}>
                <div
                    style={{
                        position: 'relative',
                        width: '200px',
                        height: '100px',
                        background: 'var(--europa-color-surface-raised)',
                        border: '1px solid var(--europa-color-border)',
                        borderRadius: 'var(--europa-radii-sm)',
                    }}
                >
                    <EuropaFogOverlay visible={true} />
                    <span
                        style={{
                            position: 'absolute',
                            bottom: '4px',
                            right: '8px',
                            fontSize: '0.75rem',
                            color: 'var(--europa-color-text-muted)',
                        }}
                    >
                        visible
                    </span>
                </div>
                <div
                    style={{
                        position: 'relative',
                        width: '200px',
                        height: '100px',
                        background: 'var(--europa-color-surface-raised)',
                        border: '1px solid var(--europa-color-border)',
                        borderRadius: 'var(--europa-radii-sm)',
                    }}
                >
                    <EuropaFogOverlay visible={false} />
                    <span
                        style={{
                            position: 'absolute',
                            bottom: '4px',
                            right: '8px',
                            fontSize: '0.75rem',
                            color: 'var(--europa-color-text-muted)',
                        }}
                    >
                        hidden
                    </span>
                </div>
            </div>
        </section>
    );
}
