/**
 * Test helper: wraps {@link LobbyRoot} in the {@link LobbyLayoutContext}
 * provider that the production route tree supplies via {@link LobbyLayout}.
 *
 * After the TanStack Router migration (T111), `LobbyRoot` renders
 * `<LobbyView />` which calls `useLobbyLayout()`. Tests that render
 * `LobbyRoot` directly (without the router tree) must provide this
 * context or the component throws.
 */

import type { JSX } from 'react';
import { useState } from 'react';

import { ControlMappingSession } from '../../src/input/control-mapping';
import { ControlMappingProvider } from '../../src/input/control-mapping-context';
import { GamepadController } from '../../src/input/gamepad-controller';
import { LobbyLayoutContext, type LobbyLayoutValue } from '../../src/internal/lobby-layout';
import { LobbyRoot, type LobbyRootProps } from '../../src/internal/lobby-runtime';
import { ControlsEditorHostProvider } from '../../src/ui/controls-editor-host';

/**
 * Props for the test wrapper. Everything the caller would pass to
 * `LobbyRoot`, plus any extra context values that differ from defaults.
 */
interface WrapperProps extends LobbyRootProps {
    /** Override the context value (defaults to `{ controller, wsUrl, announcer: null }`). */
    readonly contextOverride?: Partial<LobbyLayoutValue>;
    /** Mount the production-style runtime-scoped editor host for UI integration tests. */
    readonly withControlsEditor?: boolean;
}

/**
 * Render-ready wrapper: provides the lobby layout context that
 * `LobbyView` requires, then renders `LobbyRoot` inside it.
 */
export function LobbyRootWithLayout({
    contextOverride,
    withControlsEditor = false,
    ...rootProps
}: WrapperProps): JSX.Element {
    const [inputOwner] = useState(() => {
        const session = new ControlMappingSession();
        return { session, gamepadController: new GamepadController(session) };
    });
    const value: LobbyLayoutValue = {
        controller: rootProps.controller,
        wsUrl: rootProps.wsUrl,
        announcer: null,
        ...contextOverride,
    };

    const lobby = (
        <LobbyLayoutContext.Provider value={value}>
            <LobbyRoot {...rootProps} />
        </LobbyLayoutContext.Provider>
    );

    return withControlsEditor ? (
        <ControlMappingProvider session={inputOwner.session} gamepadController={inputOwner.gamepadController}>
            <ControlsEditorHostProvider>{lobby}</ControlsEditorHostProvider>
        </ControlMappingProvider>
    ) : (
        lobby
    );
}
