import type { ControlActionId, ControlMapping, KeyboardControlBinding } from '../state/types';
import type { ControlMappingProfile } from './control-mapping';
import { CONTROL_ACTION_IDS, cloneControlMapping } from './control-mapping';

const WASD_SELECTION_BINDINGS: Readonly<Record<'moveNorth' | 'moveWest' | 'moveSouth' | 'moveEast', string>> = {
    moveNorth: 'w',
    moveWest: 'a',
    moveSouth: 's',
    moveEast: 'd',
};

type MutableControlMapping = { -readonly [Action in keyof ControlMapping]: ControlMapping[Action] };

function keyboardBinding(value: string): KeyboardControlBinding {
    return {
        kind: 'keyboard',
        event: 'key',
        value,
        modifiers: [],
        caseSensitive: false,
        modifierMatch: 'exact',
    };
}

function preserveNonKeyboardBindings(current: ControlMapping, source: ControlMapping): ControlMapping {
    const next: MutableControlMapping = { ...cloneControlMapping(current) };
    for (const action of CONTROL_ACTION_IDS) {
        const nonKeyboard = current[action].filter((binding) => binding.kind !== 'keyboard');
        const keyboard = source[action].filter(
            (binding): binding is KeyboardControlBinding => binding.kind === 'keyboard',
        );
        next[action] = [...keyboard, ...nonKeyboard];
    }
    return next;
}

/** Build an atomic in-memory keyboard profile without erasing non-keyboard inputs. */
export function controlMappingForProfile(
    current: ControlMapping,
    original: ControlMapping,
    profile: ControlMappingProfile,
): ControlMapping {
    if (profile === 'custom') return cloneControlMapping(current);
    if (profile === 'original') return preserveNonKeyboardBindings(current, original);

    const next: MutableControlMapping = { ...cloneControlMapping(current) };
    for (const [action, value] of Object.entries(WASD_SELECTION_BINDINGS) as Array<[ControlActionId, string]>) {
        const nonKeyboard = current[action].filter((binding) => binding.kind !== 'keyboard');
        next[action] = [keyboardBinding(value), ...nonKeyboard];
    }
    return next;
}
