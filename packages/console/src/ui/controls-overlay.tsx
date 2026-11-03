import { EuropaButton, EuropaModal } from '@europa/design/components';
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ControlMappingSession } from '../input/control-mapping';
import {
    CONTROL_ACTION_IDS,
    type ControlMappingProfile,
    type ControlMappingValidationError,
    cloneControlMapping,
    validateControlMapping,
} from '../input/control-mapping';
import { controlMappingForProfile } from '../input/control-profiles';
import type { GamepadCaptureHandler } from '../input/gamepad-controller';
import type { ControlActionId, ControlBinding, ControlMapping } from '../state/types';
import './controls-overlay.css';

interface CaptureTarget {
    readonly action: ControlActionId;
    readonly index: number | null;
    readonly source: 'keyboard' | 'gamepad';
}

export interface ControlsOverlayProps {
    readonly open: boolean;
    readonly onClose: () => void;
    readonly session: ControlMappingSession;
    readonly gamepadSupported: boolean;
    readonly setGamepadCaptureHandler: (handler: GamepadCaptureHandler | null) => void;
}

function actionLabel(action: ControlActionId): string {
    if (action.startsWith('pipe')) {
        const exclusive = action.endsWith('Exclusive');
        const direction = action.slice(4, exclusive ? -'Exclusive'.length : undefined);
        return exclusive ? `Set pipe ${direction} exclusively` : `Toggle pipe ${direction}`;
    }
    if (action.startsWith('reserve')) return `Set reserves to ${Number(action.slice('reserve'.length)) * 10}%`;
    if (action.startsWith('move')) return `Move selection ${action.slice('move'.length)}`;
    switch (action) {
        case 'clearCellPipes':
            return 'Clear pipes in selected cell';
        case 'paratroop':
            return 'Fire paratroop';
        case 'gun':
            return 'Fire gun';
        case 'cancel':
            return 'Cancel selection';
        case 'pointerPipeToggle':
            return 'Pointer pipe toggle';
        case 'pointerPipeExclusive':
            return 'Pointer exclusive pipe';
        case 'zoomIn':
            return 'Zoom in';
        case 'zoomOut':
            return 'Zoom out';
        case 'zoomReset':
            return 'Reset zoom to fit';
        case 'helpToggle':
            return 'Toggle game help';
        default:
            return action;
    }
}

function bindingLabel(binding: ControlBinding): string {
    switch (binding.kind) {
        case 'keyboard': {
            const modifiers = binding.modifiers.map((modifier) => `${modifier[0]?.toUpperCase()}${modifier.slice(1)}`);
            const key = binding.value === ' ' ? 'Space' : binding.value;
            return [...modifiers, key].join('+');
        }
        case 'pointer':
            return `${binding.modifiers.join('+')}${binding.modifiers.length > 0 ? '+' : ''}${binding.button} click`;
        case 'gamepad-button':
            return `Standard controller button ${binding.button}`;
        case 'gamepad-axis':
            return `Standard controller axis ${binding.axis} ${binding.direction < 0 ? '−' : '+'}`;
        default:
            return binding satisfies never;
    }
}

function hasPointerOnlyBindings(action: ControlActionId): boolean {
    return action === 'pointerPipeToggle' || action === 'pointerPipeExclusive';
}

function bindingSlot(index: number): string {
    if (index === 0) return 'Primary';
    if (index === 1) return 'Secondary';
    return `Additional ${index - 1}`;
}

function isControlMappingProfile(value: string): value is ControlMappingProfile {
    return value === 'original' || value === 'mmo-wasd' || value === 'custom';
}

/** Accessible, staged editor for keyboard and standard Gamepad bindings. */
export function ControlsOverlay({
    open,
    onClose,
    session,
    gamepadSupported,
    setGamepadCaptureHandler,
}: ControlsOverlayProps): JSX.Element {
    const activeMapping = useSyncExternalStore(session.subscribe, session.getSnapshot);
    const activeProfile = useSyncExternalStore(session.subscribe, session.getProfileSnapshot);
    const [draft, setDraft] = useState<ControlMapping>(() => cloneControlMapping(activeMapping));
    const draftRef = useRef(draft);
    const [draftProfile, setDraftProfile] = useState<ControlMappingProfile>(activeProfile);
    const draftProfileRef = useRef(draftProfile);
    const [capture, setCapture] = useState<CaptureTarget | null>(null);
    const captureRef = useRef(capture);
    const [feedback, setFeedback] = useState('');
    const [errors, setErrors] = useState<readonly ControlMappingValidationError[]>([]);

    useEffect(() => {
        draftRef.current = draft;
    }, [draft]);
    useEffect(() => {
        draftProfileRef.current = draftProfile;
    }, [draftProfile]);
    useEffect(() => {
        captureRef.current = capture;
    }, [capture]);
    useEffect(() => {
        if (!open) return;
        const next = cloneControlMapping(session.getSnapshot());
        draftRef.current = next;
        setDraft(next);
        draftProfileRef.current = session.getProfileSnapshot();
        setDraftProfile(session.getProfileSnapshot());
        setCapture(null);
        setErrors([]);
        setFeedback('');
    }, [open, session]);

    const applyCapturedBinding = useCallback((binding: ControlBinding): void => {
        const target = captureRef.current;
        if (target === null) return;
        const current = draftRef.current;
        const bindings = [...current[target.action]];
        if (target.index === null) bindings.push(binding);
        else bindings[target.index] = binding;
        const candidate = { ...current, [target.action]: bindings };
        const validation = validateControlMapping(candidate, ['keyboard', 'pointer', 'gamepad-button', 'gamepad-axis']);
        if (!validation.valid) {
            setErrors(validation.errors);
            setFeedback('That binding conflicts with the current draft. The draft was not changed.');
        } else {
            draftRef.current = candidate;
            setDraft(candidate);
            draftProfileRef.current = 'custom';
            setDraftProfile('custom');
            setErrors([]);
            setFeedback(
                `Captured ${bindingLabel(binding)} for ${actionLabel(target.action)}. Apply changes to use it.`,
            );
        }
        setCapture(null);
    }, []);

    useEffect(() => {
        if (open && capture?.source === 'gamepad') setGamepadCaptureHandler(applyCapturedBinding);
        else setGamepadCaptureHandler(null);
        return () => setGamepadCaptureHandler(null);
    }, [open, capture, applyCapturedBinding, setGamepadCaptureHandler]);

    const startCapture = (target: CaptureTarget): void => {
        setErrors([]);
        setFeedback(
            target.source === 'keyboard'
                ? 'Press a key to capture. Ctrl and Meta shortcuts are reserved; Escape cancels capture.'
                : 'Press a standard controller button or move an axis to capture.',
        );
        setCapture(target);
    };

    const changeProfile = (profile: ControlMappingProfile): void => {
        const candidate = controlMappingForProfile(draftRef.current, session.getResetSnapshot(), profile);
        const validation = validateControlMapping(candidate, ['keyboard', 'pointer', 'gamepad-button', 'gamepad-axis']);
        if (!validation.valid) {
            setErrors(validation.errors);
            setFeedback('That profile conflicts with the current draft. The draft was not changed.');
            return;
        }
        draftRef.current = candidate;
        draftProfileRef.current = profile;
        setDraft(candidate);
        setDraftProfile(profile);
        setErrors([]);
        setFeedback(
            `${profile === 'mmo-wasd' ? 'MMO / WASD' : `${profile[0]?.toUpperCase()}${profile.slice(1)}`} profile staged.`,
        );
    };

    const handleKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
        const target = captureRef.current;
        if (target?.source !== 'keyboard') return;
        if (event.key === 'Tab') return;
        if (event.ctrlKey || event.metaKey) {
            setFeedback('Ctrl and Meta shortcuts are reserved and cannot be captured.');
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') {
            setCapture(null);
            setFeedback('Capture canceled.');
            return;
        }
        if (event.key === 'Shift' || event.key === 'Alt' || event.key === 'Dead' || event.key === 'Unidentified') {
            setFeedback('Press a non-modifier key to capture a binding.');
            return;
        }
        const binding: ControlBinding = {
            kind: 'keyboard',
            event: 'key',
            value: event.key,
            modifiers: [...(event.altKey ? (['alt'] as const) : []), ...(event.shiftKey ? (['shift'] as const) : [])],
            caseSensitive: event.key.length === 1 && event.shiftKey,
            modifierMatch: 'exact',
        };
        applyCapturedBinding(binding);
    };

    const removeBinding = (action: ControlActionId, index: number): void => {
        const current = draftRef.current;
        const candidate = { ...current, [action]: current[action].filter((_, bindingIndex) => bindingIndex !== index) };
        const validation = validateControlMapping(candidate, ['keyboard', 'pointer', 'gamepad-button', 'gamepad-axis']);
        if (!validation.valid) {
            setErrors(validation.errors);
            return;
        }
        draftRef.current = candidate;
        setDraft(candidate);
        draftProfileRef.current = 'custom';
        setDraftProfile('custom');
        setErrors([]);
        setFeedback(`Removed ${bindingSlot(index)} binding for ${actionLabel(action)}.`);
    };

    const applyChanges = (): void => {
        const result = session.replaceProfile(draftRef.current, draftProfileRef.current);
        if (!result.valid) {
            setErrors(result.errors);
            setFeedback('Changes were not applied because the mapping is invalid.');
            return;
        }
        setFeedback('Controls updated for this runtime.');
        onClose();
    };

    const resetToOriginal = (): void => {
        const original = controlMappingForProfile(draftRef.current, session.getResetSnapshot(), 'original');
        draftRef.current = original;
        setDraft(original);
        draftProfileRef.current = 'original';
        setDraftProfile('original');
        setCapture(null);
        setErrors([]);
        setFeedback(
            'Original keyboard controls are staged. Existing Gamepad bindings are preserved. Apply to use them.',
        );
    };

    return (
        <EuropaModal
            title="Controls"
            open={open}
            onClose={() => {
                setCapture(null);
                onClose();
            }}
            actions={
                <div onKeyDownCapture={handleKeyDownCapture}>
                    <EuropaButton variant="secondary" onClick={resetToOriginal}>
                        Reset to Original
                    </EuropaButton>
                    <EuropaButton variant="ghost" onClick={onClose}>
                        Cancel
                    </EuropaButton>
                    <EuropaButton variant="primary" onClick={applyChanges}>
                        Apply changes
                    </EuropaButton>
                </div>
            }
        >
            <div className="europa-controls-overlay" onKeyDownCapture={handleKeyDownCapture}>
                <p className="europa-controls-overlay__intro">
                    Configure keyboard and standard Gamepad bindings. Changes stay in memory for this runtime and reset
                    on reload. Captured controls do not activate gameplay.
                </p>
                <label className="europa-controls-overlay__profile">
                    Keyboard profile
                    <select
                        value={draftProfile}
                        onChange={(event) => {
                            const nextProfile = event.currentTarget.value;
                            if (isControlMappingProfile(nextProfile)) changeProfile(nextProfile);
                        }}
                    >
                        <option value="original">Original</option>
                        <option value="mmo-wasd">MMO / WASD selection</option>
                        <option value="custom">Custom</option>
                    </select>
                </label>
                {!gamepadSupported ? (
                    <p className="europa-controls-overlay__notice" role="status">
                        Gamepad input is unavailable in this browser. Keyboard and pointer controls remain active.
                    </p>
                ) : null}
                <p
                    className="europa-controls-overlay__feedback"
                    role={errors.length > 0 ? 'alert' : 'status'}
                    aria-live="polite"
                >
                    {feedback}
                    {errors.length > 0 ? ` ${errors.map((error) => error.message).join(' ')}` : ''}
                </p>
                <ul className="europa-controls-overlay__rows" aria-label="Control action bindings">
                    {CONTROL_ACTION_IDS.map((action) => (
                        <li className="europa-controls-overlay__row" key={action}>
                            <h3 className="europa-controls-overlay__action">{actionLabel(action)}</h3>
                            <ul
                                className="europa-controls-overlay__bindings"
                                aria-label={`${actionLabel(action)} bindings`}
                            >
                                {draft[action].map((binding, index) => (
                                    <li className="europa-controls-overlay__binding" key={`${action}-${index}`}>
                                        <span className="europa-controls-overlay__slot">{bindingSlot(index)}:</span>
                                        <kbd>{bindingLabel(binding)}</kbd>
                                        {binding.kind !== 'pointer' ? (
                                            <>
                                                <EuropaButton
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                        startCapture({
                                                            action,
                                                            index,
                                                            source:
                                                                binding.kind === 'keyboard' ? 'keyboard' : 'gamepad',
                                                        })
                                                    }
                                                    disabled={binding.kind !== 'keyboard' && !gamepadSupported}
                                                    aria-label={`Change ${bindingSlot(index)} binding for ${actionLabel(action)}`}
                                                >
                                                    Change
                                                </EuropaButton>
                                                <EuropaButton
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => removeBinding(action, index)}
                                                    aria-label={`Clear ${bindingSlot(index)} binding for ${actionLabel(action)}`}
                                                >
                                                    Clear
                                                </EuropaButton>
                                            </>
                                        ) : (
                                            <span className="europa-controls-overlay__fixed">Board gesture</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                            {!hasPointerOnlyBindings(action) ? (
                                <div className="europa-controls-overlay__add">
                                    <EuropaButton
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => startCapture({ action, index: null, source: 'keyboard' })}
                                    >
                                        Add keyboard binding
                                    </EuropaButton>
                                    <EuropaButton
                                        variant="secondary"
                                        size="sm"
                                        disabled={!gamepadSupported}
                                        onClick={() => startCapture({ action, index: null, source: 'gamepad' })}
                                    >
                                        Add Gamepad binding
                                    </EuropaButton>
                                </div>
                            ) : null}
                        </li>
                    ))}
                </ul>
            </div>
        </EuropaModal>
    );
}
