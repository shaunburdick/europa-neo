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

import { LobbyLayoutContext, type LobbyLayoutValue } from '../../src/internal/lobby-layout';
import { LobbyRoot, type LobbyRootProps } from '../../src/internal/lobby-runtime';

/**
 * Props for the test wrapper. Everything the caller would pass to
 * `LobbyRoot`, plus any extra context values that differ from defaults.
 */
interface WrapperProps extends LobbyRootProps {
    /** Override the context value (defaults to `{ controller, wsUrl, announcer: null }`). */
    readonly contextOverride?: Partial<LobbyLayoutValue>;
}

/**
 * Render-ready wrapper: provides the lobby layout context that
 * `LobbyView` requires, then renders `LobbyRoot` inside it.
 */
export function LobbyRootWithLayout({ contextOverride, ...rootProps }: WrapperProps): JSX.Element {
    const value: LobbyLayoutValue = {
        controller: rootProps.controller,
        wsUrl: rootProps.wsUrl,
        announcer: null,
        ...contextOverride,
    };

    return (
        <LobbyLayoutContext.Provider value={value}>
            <LobbyRoot {...rootProps} />
        </LobbyLayoutContext.Provider>
    );
}
