import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { ControlMappingSession } from '../../src/input/control-mapping';
import { ControlsOverlay } from '../../src/ui/controls-overlay';
import '../../src/styles/index.css';
import { expectNoDomA11yViolations } from '../setup-a11y-dom';

afterEach(() => cleanup());

describe('ControlsOverlay accessibility', () => {
    test('provides a labelled modal, readable binding rows, and no axe violations', async () => {
        await render(
            <ControlsOverlay
                open
                onClose={() => undefined}
                session={new ControlMappingSession()}
                gamepadSupported
                setGamepadCaptureHandler={() => undefined}
            />,
        );
        const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
        expect(dialog).not.toBeNull();
        expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy();
        expect(dialog?.textContent).toContain('Configure keyboard');
        await expectNoDomA11yViolations(document.body);
    });
});
