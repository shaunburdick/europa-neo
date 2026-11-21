import {
    type ControlActionId,
    type ControlBinding,
    type ControlMapping,
    type ControlModifier,
    DEFAULT_INPUT_MAPPING,
    type InputMapping,
    type PointerBinding,
} from '../state/types';

const EMPTY_CONTROL_MAPPING: Record<ControlActionId, ControlBinding[]> = {
    pipeNorth: [],
    pipeWest: [],
    pipeSouth: [],
    pipeEast: [],
    pipeNorthExclusive: [],
    pipeWestExclusive: [],
    pipeSouthExclusive: [],
    pipeEastExclusive: [],
    clearCellPipes: [],
    paratroop: [],
    gun: [],
    reserve0: [],
    reserve1: [],
    reserve2: [],
    reserve3: [],
    reserve4: [],
    reserve5: [],
    reserve6: [],
    reserve7: [],
    reserve8: [],
    reserve9: [],
    cancel: [],
    moveNorth: [],
    moveWest: [],
    moveSouth: [],
    moveEast: [],
    pointerPipeToggle: [],
    pointerPipeExclusive: [],
    zoomIn: [],
    zoomOut: [],
    zoomReset: [],
    helpToggle: [],
};

export const CONTROL_ACTION_IDS = Object.keys(EMPTY_CONTROL_MAPPING) as ControlActionId[];

export type SupportedControlSource = ControlBinding['kind'];
export type ControlMappingProfile = 'original' | 'mmo-wasd' | 'custom';

export interface ControlMappingReader {
    getSnapshot(): ControlMapping;
    subscribe?(listener: () => void): () => void;
}

export interface ControlMappingValidationError {
    readonly kind: 'incomplete' | 'invalid-binding' | 'unsupported-source' | 'incompatible-source' | 'collision';
    readonly message: string;
    readonly actions: readonly ControlActionId[];
}

export type ControlMappingValidation =
    | { readonly valid: true; readonly errors: readonly [] }
    | { readonly valid: false; readonly errors: readonly ControlMappingValidationError[] };

const POINTER_ACTIONS = new Set<ControlActionId>(['pointerPipeToggle', 'pointerPipeExclusive']);
const BASE_SOURCES: readonly SupportedControlSource[] = ['keyboard', 'pointer'];
const ALL_SOURCES: readonly SupportedControlSource[] = [...BASE_SOURCES, 'gamepad-button', 'gamepad-axis'];
const CONTROL_SOURCES: readonly string[] = ['keyboard', 'pointer', 'gamepad-button', 'gamepad-axis'];

function withDefaultGamepadBindings(mapping: ControlMapping): ControlMapping {
    return {
        ...mapping,
        moveNorth: [
            ...mapping.moveNorth,
            { kind: 'gamepad-button', mapping: 'standard', button: 12 },
            { kind: 'gamepad-axis', mapping: 'standard', axis: 1, direction: -1 },
        ],
        moveWest: [
            ...mapping.moveWest,
            { kind: 'gamepad-button', mapping: 'standard', button: 14 },
            { kind: 'gamepad-axis', mapping: 'standard', axis: 0, direction: -1 },
        ],
        moveSouth: [
            ...mapping.moveSouth,
            { kind: 'gamepad-button', mapping: 'standard', button: 13 },
            { kind: 'gamepad-axis', mapping: 'standard', axis: 1, direction: 1 },
        ],
        moveEast: [
            ...mapping.moveEast,
            { kind: 'gamepad-button', mapping: 'standard', button: 15 },
            { kind: 'gamepad-axis', mapping: 'standard', axis: 0, direction: 1 },
        ],
    };
}

function emptyMapping(): Record<ControlActionId, ControlBinding[]> {
    const mapping: Record<ControlActionId, ControlBinding[]> = { ...EMPTY_CONTROL_MAPPING };
    for (const action of CONTROL_ACTION_IDS) mapping[action] = [];
    return mapping;
}

function normalizedKey(value: string): string {
    return value.length === 1 ? value.toLowerCase() : value;
}

function modifierSet(modifiers: readonly string[], omitShift: boolean): ReadonlySet<string> {
    return new Set(modifiers.filter((modifier) => !omitShift || modifier !== 'shift'));
}

function validModifiers(value: unknown): boolean {
    if (!Array.isArray(value)) return false;
    const modifiers = value as readonly unknown[];
    return (
        modifiers.every(
            (modifier: unknown) => typeof modifier === 'string' && ['alt', 'ctrl', 'meta', 'shift'].includes(modifier),
        ) && new Set(modifiers).size === modifiers.length
    );
}

function toPointerBinding(binding: PointerBinding): ControlBinding {
    return { kind: 'pointer', button: binding.button, modifiers: [...binding.modifiers] };
}

function parseLegacyKey(value: string, modifierMatch: 'exact' | 'subset' = 'exact'): ControlBinding {
    const parts = value === '+' ? ['+'] : value.split('+');
    const key = parts.at(-1);
    if (key === undefined || key.length === 0) {
        throw new Error(`InputMapping contains an empty keyboard binding: ${JSON.stringify(value)}`);
    }
    const modifiers = parts.slice(0, -1).map((part) => part.toLowerCase());
    if (modifiers.some((modifier) => !['alt', 'ctrl', 'meta', 'shift'].includes(modifier))) {
        throw new Error(`InputMapping contains an unsupported modifier in ${JSON.stringify(value)}`);
    }
    return {
        kind: 'keyboard',
        event: 'key',
        value: key,
        modifiers: modifiers as ControlModifier[],
        caseSensitive: false,
        modifierMatch,
    };
}

function addLegacyKey(
    mapping: Record<ControlActionId, ControlBinding[]>,
    action: ControlActionId,
    value: string,
    modifierMatch: 'exact' | 'subset' = 'exact',
): void {
    mapping[action].push(parseLegacyKey(value, modifierMatch));
}

/** Adapt the source-compatible legacy table to per-action binding lists. */
export function controlMappingFromLegacy(input: InputMapping = DEFAULT_INPUT_MAPPING): ControlMapping {
    if (input.reserveKeys.length !== 10) {
        throw new Error('InputMapping.reserveKeys must contain exactly ten digit bindings.');
    }
    const mapping = emptyMapping();
    addLegacyKey(mapping, 'pipeNorth', input.pipeKeys.pipeNorth);
    addLegacyKey(mapping, 'pipeWest', input.pipeKeys.pipeWest);
    addLegacyKey(mapping, 'pipeSouth', input.pipeKeys.pipeSouth);
    addLegacyKey(mapping, 'pipeEast', input.pipeKeys.pipeEast);
    addLegacyKey(mapping, 'pipeNorthExclusive', input.pipeExclusiveKeys.pipeNorth);
    addLegacyKey(mapping, 'pipeWestExclusive', input.pipeExclusiveKeys.pipeWest);
    addLegacyKey(mapping, 'pipeSouthExclusive', input.pipeExclusiveKeys.pipeSouth);
    addLegacyKey(mapping, 'pipeEastExclusive', input.pipeExclusiveKeys.pipeEast);
    addLegacyKey(mapping, 'clearCellPipes', input.clearCellPipes, 'subset');
    addLegacyKey(mapping, 'paratroop', input.paratroopPrimary, 'subset');
    addLegacyKey(mapping, 'paratroop', input.paratroopAlt, 'subset');
    addLegacyKey(mapping, 'gun', input.gunPrimary, 'subset');
    addLegacyKey(mapping, 'gun', input.gunAlt, 'subset');
    input.reserveKeys.forEach((key, index) => {
        addLegacyKey(mapping, `reserve${index}` as ControlActionId, key, 'subset');
    });
    addLegacyKey(mapping, 'cancel', input.cancel, 'subset');
    addLegacyKey(mapping, 'moveNorth', input.selectionMove.north, 'subset');
    addLegacyKey(mapping, 'moveWest', input.selectionMove.west, 'subset');
    addLegacyKey(mapping, 'moveSouth', input.selectionMove.south, 'subset');
    addLegacyKey(mapping, 'moveEast', input.selectionMove.east, 'subset');

    mapping.pointerPipeToggle.push(toPointerBinding(input.pipeToggle));
    mapping.pointerPipeExclusive.push(toPointerBinding(input.pipeExclusive));
    const mapsBareAltLeft =
        input.pipeExclusive.button === 'left' &&
        input.pipeExclusive.modifiers.length === 1 &&
        input.pipeExclusive.modifiers[0] === 'alt';
    if (!mapsBareAltLeft) {
        mapping.pointerPipeExclusive.push({ kind: 'pointer', button: 'left', modifiers: ['alt'] });
    }

    addLegacyKey(mapping, 'zoomIn', '+');
    addLegacyKey(mapping, 'zoomIn', '=');
    addLegacyKey(mapping, 'zoomOut', '-');
    addLegacyKey(mapping, 'zoomOut', '_');
    addLegacyKey(mapping, 'zoomReset', 'Home');
    addLegacyKey(mapping, 'helpToggle', '?');

    const validation = validateControlMapping(mapping, BASE_SOURCES);
    if (!validation.valid) {
        throw new Error(validation.errors.map((error) => error.message).join('; '));
    }
    return cloneControlMapping(mapping);
}

/** Copy bindings so callers cannot mutate a live session through their input object. */
export function cloneControlMapping(mapping: ControlMapping): ControlMapping {
    const copy = emptyMapping();
    for (const action of CONTROL_ACTION_IDS) {
        copy[action] = mapping[action].map((binding) => {
            switch (binding.kind) {
                case 'keyboard':
                    return { ...binding, modifiers: [...binding.modifiers] };
                case 'pointer':
                    return { ...binding, modifiers: [...binding.modifiers] };
                case 'gamepad-button':
                case 'gamepad-axis':
                    return { ...binding };
                default:
                    return binding satisfies never;
            }
        });
    }
    return copy;
}

function modifiersOverlap(
    left: ReadonlySet<string>,
    leftMode: 'exact' | 'subset',
    right: ReadonlySet<string>,
    rightMode: 'exact' | 'subset',
): boolean {
    if (leftMode === 'exact' && rightMode === 'exact') {
        return left.size === right.size && [...left].every((modifier) => right.has(modifier));
    }
    const same = left.size === right.size && [...left].every((modifier) => right.has(modifier));
    if (same) return true;
    const leftIncludesRight = [...right].every((modifier) => left.has(modifier));
    const rightIncludesLeft = [...left].every((modifier) => right.has(modifier));
    if (leftMode === 'exact' || rightMode === 'exact') return false;
    if (leftIncludesRight || rightIncludesLeft) return false;
    return true;
}

function bindingsOverlap(left: ControlBinding, right: ControlBinding): boolean {
    if (left.kind !== right.kind) return false;
    if (left.kind === 'keyboard' && right.kind === 'keyboard') {
        const keysOverlap =
            left.caseSensitive && right.caseSensitive
                ? left.value === right.value
                : normalizedKey(left.value) === normalizedKey(right.value);
        if (!keysOverlap) return false;
        return modifiersOverlap(
            modifierSet(left.modifiers, !left.caseSensitive),
            left.modifierMatch,
            modifierSet(right.modifiers, !right.caseSensitive),
            right.modifierMatch,
        );
    }
    if (left.kind === 'pointer' && right.kind === 'pointer') {
        const leftModifiers = modifierSet(left.modifiers, false);
        const rightModifiers = modifierSet(right.modifiers, false);
        return left.button === right.button && leftModifiers.size === rightModifiers.size;
    }
    if (left.kind === 'gamepad-button' && right.kind === 'gamepad-button') {
        return left.mapping === right.mapping && left.button === right.button;
    }
    if (left.kind === 'gamepad-axis' && right.kind === 'gamepad-axis') {
        return left.mapping === right.mapping && left.axis === right.axis && left.direction === right.direction;
    }
    return false;
}

/** Validate source support, action compatibility, and overlapping assignments. */
export function validateControlMapping(
    mapping: ControlMapping,
    supportedSources: readonly SupportedControlSource[] = BASE_SOURCES,
): ControlMappingValidation {
    const errors: ControlMappingValidationError[] = [];
    if (typeof mapping !== 'object' || mapping === null) {
        return {
            valid: false,
            errors: [{ kind: 'incomplete', message: 'ControlMapping must be an object.', actions: [] }],
        };
    }
    const actionKeys = Object.keys(mapping);
    for (const action of CONTROL_ACTION_IDS) {
        if (!Array.isArray(mapping[action])) {
            errors.push({ kind: 'incomplete', message: `Missing bindings for ${action}.`, actions: [action] });
        }
    }
    for (const action of actionKeys) {
        if (!CONTROL_ACTION_IDS.includes(action as ControlActionId)) {
            errors.push({ kind: 'incomplete', message: `Unknown control action ${action}.`, actions: [] });
        }
    }

    const seen: Array<{ readonly action: ControlActionId; readonly binding: ControlBinding }> = [];
    for (const action of CONTROL_ACTION_IDS) {
        const bindings = mapping[action];
        if (!Array.isArray(bindings)) continue;
        for (const candidate of bindings as readonly unknown[]) {
            if (typeof candidate !== 'object' || candidate === null || !('kind' in candidate)) {
                errors.push({ kind: 'invalid-binding', message: `Invalid binding for ${action}.`, actions: [action] });
                continue;
            }
            const binding = candidate as ControlBinding;
            if (!CONTROL_SOURCES.includes(binding.kind)) {
                errors.push({ kind: 'invalid-binding', message: `Invalid binding for ${action}.`, actions: [action] });
                continue;
            }
            if (!supportedSources.includes(binding.kind)) {
                errors.push({
                    kind: 'unsupported-source',
                    message: `${binding.kind} input is not supported in this runtime.`,
                    actions: [action],
                });
                continue;
            }
            const pointerAction = POINTER_ACTIONS.has(action);
            if ((binding.kind === 'pointer') !== pointerAction) {
                errors.push({
                    kind: 'incompatible-source',
                    message: `${binding.kind} input cannot invoke ${action}.`,
                    actions: [action],
                });
                continue;
            }
            if (
                (binding.kind === 'gamepad-button' || binding.kind === 'gamepad-axis') &&
                (pointerAction ||
                    action === 'zoomIn' ||
                    action === 'zoomOut' ||
                    action === 'zoomReset' ||
                    action === 'helpToggle')
            ) {
                errors.push({
                    kind: 'incompatible-source',
                    message: `Gamepad input cannot invoke ${action}.`,
                    actions: [action],
                });
                continue;
            }
            if (binding.kind === 'pointer' && binding.button === 'middle') {
                errors.push({
                    kind: 'unsupported-source',
                    message: 'The middle pointer button is reserved for camera pan.',
                    actions: [action],
                });
                continue;
            }
            const valid =
                binding.kind === 'keyboard'
                    ? binding.event === 'key' &&
                      typeof binding.value === 'string' &&
                      binding.value.length > 0 &&
                      typeof binding.caseSensitive === 'boolean' &&
                      validModifiers(binding.modifiers) &&
                      binding.modifiers.every(
                          (modifier: ControlModifier) => modifier !== 'ctrl' && modifier !== 'meta',
                      ) &&
                      (binding.modifierMatch === 'exact' || binding.modifierMatch === 'subset')
                    : binding.kind === 'pointer'
                      ? ['left', 'middle', 'right'].includes(binding.button) && validModifiers(binding.modifiers)
                      : binding.kind === 'gamepad-button'
                        ? binding.mapping === 'standard' &&
                          Number.isInteger(binding.button) &&
                          binding.button >= 0 &&
                          binding.button <= 31
                        : binding.mapping === 'standard' &&
                          Number.isInteger(binding.axis) &&
                          binding.axis >= 0 &&
                          binding.axis <= 3 &&
                          (binding.direction === -1 || binding.direction === 1);
            if (!valid) {
                errors.push({ kind: 'invalid-binding', message: `Invalid binding for ${action}.`, actions: [action] });
                continue;
            }
            for (const previous of seen) {
                if (bindingsOverlap(previous.binding, binding)) {
                    if (previous.action === action) {
                        errors.push({
                            kind: 'invalid-binding',
                            message: `Duplicate binding for ${action}.`,
                            actions: [action],
                        });
                    } else {
                        errors.push({
                            kind: 'collision',
                            message: `Binding for ${action} conflicts with ${previous.action}.`,
                            actions: [previous.action, action],
                        });
                    }
                }
            }
            seen.push({ action, binding });
        }
    }
    return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
}

/** One mapping owner per app/tab or embedding runtime. */
export class ControlMappingSession implements ControlMappingReader {
    private readonly resetMapping: ControlMapping;
    private readonly supportedSources: readonly SupportedControlSource[];
    private mapping: ControlMapping;
    private profile: ControlMappingProfile = 'original';
    private readonly listeners = new Set<() => void>();

    constructor(
        input: InputMapping = DEFAULT_INPUT_MAPPING,
        supportedSources: readonly SupportedControlSource[] = ALL_SOURCES,
    ) {
        const legacyMapping = controlMappingFromLegacy(input);
        this.resetMapping =
            supportedSources.includes('gamepad-button') || supportedSources.includes('gamepad-axis')
                ? withDefaultGamepadBindings(legacyMapping)
                : legacyMapping;
        this.mapping = this.resetMapping;
        this.supportedSources = [...supportedSources];
    }

    /** Current immutable-shaped snapshot; identity changes only on successful replacement. */
    getSnapshot = (): ControlMapping => this.mapping;

    /** Read the in-memory profile label paired with the current mapping. */
    getProfileSnapshot = (): ControlMappingProfile => this.profile;

    /** Return a detached copy of the session's original controls without applying them. */
    getResetSnapshot(): ControlMapping {
        return cloneControlMapping(this.resetMapping);
    }

    /** Subscribe controllers and React views to successful mapping changes. */
    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /** Validate fully before swapping the snapshot, so failed updates are atomic. */
    replace(mapping: ControlMapping): ControlMappingValidation {
        return this.replaceProfile(mapping, 'custom');
    }

    /** Atomically replace bindings and their in-memory profile label. */
    replaceProfile(mapping: ControlMapping, profile: ControlMappingProfile): ControlMappingValidation {
        const validation = validateControlMapping(mapping, this.supportedSources);
        if (!validation.valid) return validation;
        this.mapping = cloneControlMapping(mapping);
        this.profile = profile;
        for (const listener of this.listeners) listener();
        return validation;
    }

    /** Restore the runtime's initial mapping without persistence. */
    reset(): void {
        this.mapping = this.resetMapping;
        this.profile = 'original';
        for (const listener of this.listeners) listener();
    }
}

/** Resolve a keydown to a configured semantic action. */
export function matchKeyboardBinding(
    mapping: ControlMapping,
    event: Pick<KeyboardEvent, 'key' | 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
): ControlActionId | null {
    if (event.ctrlKey || event.metaKey) return null;
    const active = new Set<string>();
    if (event.altKey) active.add('alt');
    if (event.ctrlKey) active.add('ctrl');
    if (event.metaKey) active.add('meta');
    if (event.shiftKey) active.add('shift');
    let bestAction: ControlActionId | null = null;
    let bestSpecificity = -1;
    let ambiguous = false;
    for (const action of CONTROL_ACTION_IDS) {
        for (const binding of mapping[action]) {
            if (binding.kind !== 'keyboard') continue;
            const sameKey = binding.caseSensitive
                ? event.key === binding.value
                : normalizedKey(event.key) === normalizedKey(binding.value);
            if (!sameKey) continue;
            const required = modifierSet(binding.modifiers, !binding.caseSensitive);
            const actual = modifierSet([...active], !binding.caseSensitive);
            if ((actual.has('ctrl') && !required.has('ctrl')) || (actual.has('meta') && !required.has('meta')))
                continue;
            const modifierMatch =
                binding.modifierMatch === 'subset'
                    ? [...required].every((modifier) => actual.has(modifier))
                    : required.size === actual.size && [...required].every((modifier) => actual.has(modifier));
            if (!modifierMatch) continue;
            if (required.size > bestSpecificity) {
                bestAction = action;
                bestSpecificity = required.size;
                ambiguous = false;
            } else if (required.size === bestSpecificity && action !== bestAction) {
                ambiguous = true;
            }
        }
    }
    return ambiguous ? null : bestAction;
}

/** Resolve a board pointer event to a pipe gesture; more-specific chords win. */
export function matchPointerBinding(
    mapping: ControlMapping,
    button: 'left' | 'middle' | 'right',
    modifiers: ReadonlySet<ControlModifier>,
): 'pointerPipeToggle' | 'pointerPipeExclusive' | null {
    let bestAction: 'pointerPipeToggle' | 'pointerPipeExclusive' | null = null;
    let bestSpecificity = -1;
    let ambiguous = false;
    for (const action of ['pointerPipeToggle', 'pointerPipeExclusive'] as const) {
        for (const binding of mapping[action]) {
            if (
                binding.kind === 'pointer' &&
                binding.button === button &&
                binding.modifiers.every((item) => modifiers.has(item))
            ) {
                if (binding.modifiers.length > bestSpecificity) {
                    bestAction = action;
                    bestSpecificity = binding.modifiers.length;
                    ambiguous = false;
                } else if (binding.modifiers.length === bestSpecificity && action !== bestAction) {
                    ambiguous = true;
                }
            }
        }
    }
    return ambiguous ? null : bestAction;
}
