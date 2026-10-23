import type { JSX, ReactNode } from 'react';
import { createContext, useContext, useRef } from 'react';
import { ControlMappingSession } from './control-mapping';

const ControlMappingContext = createContext<ControlMappingSession | null>(null);

export interface ControlMappingProviderProps {
    readonly session: ControlMappingSession;
    readonly children?: ReactNode | undefined;
}

export function ControlMappingProvider({ session, children }: ControlMappingProviderProps): JSX.Element {
    return <ControlMappingContext.Provider value={session}>{children}</ControlMappingContext.Provider>;
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
