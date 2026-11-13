import { EuropaButton } from '@europa/design/components';
import type { JSX, ReactNode } from 'react';
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useControlMappingSession, useGamepadController } from '../input/control-mapping-context';
import type { GamepadCaptureHandler } from '../input/gamepad-controller';
import './controls-editor-host.css';

const LazyControlsOverlay = lazy(() =>
    import('./controls-overlay').then((module) => ({ default: module.ControlsOverlay })),
);

export interface ControlsEditorState {
    readonly open: boolean;
    readonly openEditor: (trigger?: HTMLElement | null) => void;
    readonly closeEditor: (restoreFocus?: boolean) => void;
}

const CLOSED_EDITOR: ControlsEditorState = {
    open: false,
    openEditor: () => undefined,
    closeEditor: () => undefined,
};

const ControlsEditorContext = createContext<ControlsEditorState>(CLOSED_EDITOR);

export interface ControlsEditorHostProviderProps {
    readonly children?: ReactNode | undefined;
    /** Render the embedding-only launcher in the host shell, not the match sidebar. */
    readonly launcherPlacement?: 'none' | 'host-shell';
}

/** Runtime-scoped host for the existing editor, shared by lobby and pre-entry surfaces. */
export function ControlsEditorHostProvider({
    children,
    launcherPlacement = 'none',
}: ControlsEditorHostProviderProps): JSX.Element {
    const session = useControlMappingSession();
    const { controller } = useGamepadController(session);
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLElement | null>(null);
    const restoreFocusRef = useRef(false);
    const wasOpenRef = useRef(false);

    const openEditor = useCallback(
        (trigger?: HTMLElement | null): void => {
            triggerRef.current = trigger ?? null;
            restoreFocusRef.current = trigger !== undefined && trigger !== null;
            controller.setCaptureHandler(null);
            setOpen(true);
        },
        [controller],
    );

    const closeEditor = useCallback(
        (restoreFocus = true): void => {
            restoreFocusRef.current = restoreFocus && triggerRef.current !== null;
            controller.setCaptureHandler(null);
            setOpen(false);
        },
        [controller],
    );

    const setGamepadCaptureHandler = useCallback(
        (handler: GamepadCaptureHandler | null): void => {
            controller.setCaptureHandler(handler);
        },
        [controller],
    );

    useEffect(() => {
        if (wasOpenRef.current && !open && restoreFocusRef.current) triggerRef.current?.focus();
        wasOpenRef.current = open;
        if (!open) {
            triggerRef.current = null;
            restoreFocusRef.current = false;
        }
    }, [open]);

    const contextValue: ControlsEditorState = { open, openEditor, closeEditor };
    const gamepadSupported = controller.isSupported();

    return (
        <ControlsEditorContext.Provider value={contextValue}>
            {launcherPlacement === 'host-shell' ? (
                <div className="europa-controls-host__launcher">
                    <EuropaButton
                        variant="secondary"
                        className="europa-focus-ring"
                        data-europa-controls-host-launcher="true"
                        onClick={(event) => openEditor(event.currentTarget)}
                    >
                        Configure controls…
                    </EuropaButton>
                </div>
            ) : null}
            {children}
            {open ? (
                <Suspense fallback={null}>
                    <LazyControlsOverlay
                        open
                        onClose={closeEditor}
                        session={session}
                        gamepadSupported={gamepadSupported}
                        setGamepadCaptureHandler={setGamepadCaptureHandler}
                    />
                </Suspense>
            ) : null}
        </ControlsEditorContext.Provider>
    );
}

/** Access the runtime's existing editor entry point; absent hosts are inert for static App renders. */
export function useControlsEditor(): ControlsEditorState {
    return useContext(ControlsEditorContext);
}
