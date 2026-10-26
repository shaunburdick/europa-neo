import type { JSX, ReactNode } from 'react';
import { createContext, useContext, useEffect, useRef } from 'react';
import { ControlMappingSession } from './control-mapping';
import { GamepadController } from './gamepad-controller';

const ControlMappingContext = createContext<ControlMappingSession | null>(null);
const GamepadControllerContext = createContext<GamepadController | null>(null);

export interface ControlMappingProviderProps {
    readonly session: ControlMappingSession;
    readonly gamepadController: GamepadController;
    readonly children?: ReactNode | undefined;
}

export function ControlMappingProvider({
    session,
    gamepadController,
    children,
}: ControlMappingProviderProps): JSX.Element {
    useEffect(() => {
        gamepadController.attach();
        return () => gamepadController.dispose();
    }, [gamepadController]);

    return (
        <ControlMappingContext.Provider value={session}>
            <GamepadControllerContext.Provider value={gamepadController}>{children}</GamepadControllerContext.Provider>
        </ControlMappingContext.Provider>
    );
}

/** Return the nearest runtime-owned mapping, or a private fallback for isolated App renders. */
export function useControlMappingSession(): ControlMappingSession {
    const provided = useContext(ControlMappingContext);
    const local = useRef<ControlMappingSession | null>(null);
    if (provided !== null) {
        return provided;
    }
    if (local.current === null) {
        local.current = new ControlMappingSession();
    }
    return local.current;
}

/** Return the runtime Gamepad owner, or an App-private owner for isolated renders. */
export function useGamepadController(mappingSession: ControlMappingSession): {
    readonly controller: GamepadController;
    readonly providerManaged: boolean;
} {
    const provided = useContext(GamepadControllerContext);
    const local = useRef<GamepadController | null>(null);
    if (provided !== null) return { controller: provided, providerManaged: true };
    if (local.current === null) local.current = new GamepadController(mappingSession);
    return { controller: local.current, providerManaged: false };
}
