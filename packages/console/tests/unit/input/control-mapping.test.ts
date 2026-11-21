import { describe, expect, test } from 'vitest';
import {
    CONTROL_ACTION_IDS,
    ControlMappingSession,
    cloneControlMapping,
    controlMappingFromLegacy,
    matchKeyboardBinding,
    matchPointerBinding,
    validateControlMapping,
} from '../../../src/input/control-mapping';
import type { ControlActionId, ControlBinding, ControlMapping, InputMapping } from '../../../src/state/types';
import { DEFAULT_INPUT_MAPPING } from '../../../src/state/types';

function keyboardEvent(
    key: string,
    overrides: Partial<Pick<KeyboardEvent, 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {},
): Pick<KeyboardEvent, 'key' | 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'> {
    return {
        key,
        code: overrides.code ?? '',
        altKey: overrides.altKey ?? false,
        ctrlKey: overrides.ctrlKey ?? false,
        metaKey: overrides.metaKey ?? false,
        shiftKey: overrides.shiftKey ?? false,
    };
}

function withBinding(mapping: ControlMapping, action: ControlActionId, binding: ControlBinding): ControlMapping {
    return { ...mapping, [action]: [...mapping[action], binding] };
}

describe('runtime control mapping foundation', () => {
    test('adapts the existing defaults without changing their keyboard semantics', () => {
        const mapping = controlMappingFromLegacy(DEFAULT_INPUT_MAPPING);
        expect(mapping.pipeNorth).toEqual([
            { kind: 'keyboard', event: 'key', value: 'i', modifiers: [], caseSensitive: false, modifierMatch: 'exact' },
        ]);
        expect(mapping.pipeNorthExclusive).toEqual([
            {
                kind: 'keyboard',
                event: 'key',
                value: 'i',
                modifiers: ['alt'],
                caseSensitive: false,
                modifierMatch: 'exact',
            },
        ]);
        expect(mapping.paratroop.map((binding) => ('value' in binding ? binding.value : ''))).toEqual(['p', 'h']);
        expect(mapping.reserve7).toEqual([
            {
                kind: 'keyboard',
                event: 'key',
                value: '7',
                modifiers: [],
                caseSensitive: false,
                modifierMatch: 'subset',
            },
        ]);
        expect(matchKeyboardBinding(mapping, keyboardEvent('I', { shiftKey: true }))).toBe('pipeNorth');
        expect(matchKeyboardBinding(mapping, keyboardEvent('i', { altKey: true }))).toBe('pipeNorthExclusive');
        expect(matchKeyboardBinding(mapping, keyboardEvent('p', { altKey: true }))).toBe('paratroop');
        expect(matchKeyboardBinding(mapping, keyboardEvent('p', { ctrlKey: true }))).toBeNull();
        expect(validateControlMapping(mapping).valid).toBe(true);
    });

    test('keeps host legacy key overrides and pointer bindings in the adapter', () => {
        const legacy: InputMapping = { ...DEFAULT_INPUT_MAPPING, paratroopPrimary: 'q' };
        const mapping = controlMappingFromLegacy(legacy);
        expect(matchKeyboardBinding(mapping, keyboardEvent('q'))).toBe('paratroop');
        expect(matchKeyboardBinding(mapping, keyboardEvent('p'))).toBeNull();
        expect(mapping.pointerPipeToggle).toEqual([{ kind: 'pointer', button: 'left', modifiers: [] }]);
        expect(mapping.pointerPipeExclusive).toContainEqual({ kind: 'pointer', button: 'right', modifiers: [] });
    });

    test('fails closed for malformed and colliding legacy configuration', () => {
        expect(() => controlMappingFromLegacy({ ...DEFAULT_INPUT_MAPPING, reserveKeys: ['0'] })).toThrow(/ten digit/);
        expect(() => controlMappingFromLegacy({ ...DEFAULT_INPUT_MAPPING, paratroopPrimary: '' })).toThrow(/empty/i);
        expect(() =>
            controlMappingFromLegacy({
                ...DEFAULT_INPUT_MAPPING,
                pipeKeys: { ...DEFAULT_INPUT_MAPPING.pipeKeys, pipeWest: 'i' },
            }),
        ).toThrow(/conflict/i);
        expect(() =>
            controlMappingFromLegacy({
                ...DEFAULT_INPUT_MAPPING,
                pipeExclusiveKeys: { ...DEFAULT_INPUT_MAPPING.pipeExclusiveKeys, pipeNorth: 'Fn+i' },
            }),
        ).toThrow(/unsupported modifier/i);
    });

    test('preserves right/Alt-pointer defaults and rejects middle because camera pan owns it', () => {
        const original = controlMappingFromLegacy();
        expect(original.pointerPipeExclusive).toContainEqual({ kind: 'pointer', button: 'right', modifiers: [] });
        expect(original.pointerPipeExclusive).toContainEqual({ kind: 'pointer', button: 'left', modifiers: ['alt'] });
        expect(original.pointerPipeExclusive).not.toContainEqual({ kind: 'pointer', button: 'middle', modifiers: [] });
        expect(() =>
            controlMappingFromLegacy({ ...DEFAULT_INPUT_MAPPING, pipeExclusive: { button: 'middle', modifiers: [] } }),
        ).toThrow(/middle pointer button is reserved for camera pan/i);

        const altLeft = controlMappingFromLegacy({
            ...DEFAULT_INPUT_MAPPING,
            pipeExclusive: { button: 'left', modifiers: ['alt'] },
        });
        expect(
            altLeft.pointerPipeExclusive.filter((binding) => binding.kind === 'pointer' && binding.button === 'left'),
        ).toHaveLength(1);

        const modifiedExclusive = controlMappingFromLegacy({
            ...DEFAULT_INPUT_MAPPING,
            pipeExclusive: { button: 'left', modifiers: ['alt', 'shift'] },
        });
        expect(modifiedExclusive.pointerPipeExclusive).toContainEqual({
            kind: 'pointer',
            button: 'left',
            modifiers: ['alt'],
        });
        expect(matchPointerBinding(modifiedExclusive, 'left', new Set(['alt']))).toBe('pointerPipeExclusive');
    });

    test('accepts multiple bindings for an action but rejects overlapping assignments atomically', () => {
        const session = new ControlMappingSession();
        const initial = session.getSnapshot();
        const alternate = {
            kind: 'keyboard',
            event: 'key',
            value: 'q',
            modifiers: [],
            caseSensitive: false,
            modifierMatch: 'exact',
        } as const;
        const accepted = session.replace(withBinding(initial, 'pipeNorth', alternate));
        expect(accepted.valid).toBe(true);
        expect(session.getSnapshot().pipeNorth).toHaveLength(2);
        expect(matchKeyboardBinding(session.getSnapshot(), keyboardEvent('q'))).toBe('pipeNorth');

        const current = session.getSnapshot();
        const conflict = session.replace({ ...current, pipeWest: [...current.pipeWest, alternate] });
        expect(conflict).toMatchObject({ valid: false, errors: [{ kind: 'collision' }] });
        expect(session.getSnapshot()).toBe(current);
    });

    test('rejects a duplicated binding even when both entries name the same action', () => {
        const session = new ControlMappingSession();
        const initial = session.getSnapshot();
        const north = initial.pipeNorth[0];
        if (north === undefined) throw new Error('Original mapping must bind pipe north.');
        const duplicate = { ...initial, pipeNorth: [...initial.pipeNorth, north] };
        expect(session.replace(duplicate)).toMatchObject({ valid: false, errors: [{ kind: 'invalid-binding' }] });
        expect(session.getSnapshot()).toBe(initial);
    });

    test('rejects equal-specificity modifier conflicts and incompatible source/action pairs', () => {
        const mapping = controlMappingFromLegacy();
        const altNorth = {
            kind: 'keyboard',
            event: 'key',
            value: 'q',
            modifiers: ['alt'] as const,
            caseSensitive: false,
            modifierMatch: 'subset',
        } as const;
        const shiftWest = {
            kind: 'keyboard',
            event: 'key',
            value: 'Q',
            modifiers: ['shift'] as const,
            caseSensitive: true,
            modifierMatch: 'subset',
        } as const;
        expect(
            validateControlMapping({
                ...mapping,
                pipeNorth: [...mapping.pipeNorth, altNorth],
                pipeWest: [...mapping.pipeWest, shiftWest],
            }),
        ).toMatchObject({ valid: false, errors: [{ kind: 'collision' }] });

        const pointerOnKeyboardAction = {
            ...mapping,
            pipeNorth: [{ kind: 'pointer', button: 'left', modifiers: [] }],
        } as unknown as ControlMapping;
        expect(validateControlMapping(pointerOnKeyboardAction)).toMatchObject({
            valid: false,
            errors: [{ kind: 'incompatible-source' }],
        });

        const keyboardOnPointerAction = {
            ...mapping,
            pointerPipeToggle: [
                {
                    kind: 'keyboard',
                    event: 'key',
                    value: 'q',
                    modifiers: [],
                    caseSensitive: false,
                    modifierMatch: 'exact',
                },
            ],
        } as unknown as ControlMapping;
        expect(validateControlMapping(keyboardOnPointerAction)).toMatchObject({
            valid: false,
            errors: [{ kind: 'incompatible-source' }],
        });

        const browserChord = withBinding(mapping, 'pipeNorth', {
            kind: 'keyboard',
            event: 'key',
            value: 'q',
            modifiers: ['ctrl'],
            caseSensitive: false,
            modifierMatch: 'exact',
        });
        expect(validateControlMapping(browserChord)).toMatchObject({
            valid: false,
            errors: [{ kind: 'invalid-binding' }],
        });
        expect(matchKeyboardBinding(browserChord, keyboardEvent('q', { ctrlKey: true }))).toBeNull();
    });

    test('keeps distinct modifier chords available for separate actions', () => {
        const mapping = controlMappingFromLegacy();
        const plain = {
            kind: 'keyboard',
            event: 'key',
            value: 'q',
            modifiers: [],
            caseSensitive: false,
            modifierMatch: 'exact',
        } as const;
        const alt = {
            kind: 'keyboard',
            event: 'key',
            value: 'q',
            modifiers: ['alt'] as const,
            caseSensitive: false,
            modifierMatch: 'exact',
        } as const;
        const chordMapping = {
            ...mapping,
            pipeNorth: [...mapping.pipeNorth, plain],
            pipeWest: [...mapping.pipeWest, alt],
        };
        expect(validateControlMapping(chordMapping).valid).toBe(true);
        expect(matchKeyboardBinding(chordMapping, keyboardEvent('q'))).toBe('pipeNorth');
        expect(matchKeyboardBinding(chordMapping, keyboardEvent('q', { altKey: true }))).toBe('pipeWest');
    });

    test('keeps captured case-sensitive event.key chords distinct from Original case-folded keys', () => {
        const mapping = controlMappingFromLegacy();
        const shifted = {
            kind: 'keyboard',
            event: 'key',
            value: 'Q',
            modifiers: ['shift'] as const,
            caseSensitive: true,
            modifierMatch: 'exact',
        } as const;
        const custom = { ...mapping, moveNorth: [...mapping.moveNorth, shifted] };
        expect(matchKeyboardBinding(custom, keyboardEvent('Q', { shiftKey: true }))).toBe('moveNorth');
        expect(matchKeyboardBinding(custom, keyboardEvent('q'))).toBeNull();
    });

    test('includes default selection-only Gamepad bindings and can reject disabled sources', () => {
        const session = new ControlMappingSession();
        expect(session.getSnapshot().moveNorth).toContainEqual({
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 12,
        });
        expect(session.getSnapshot().moveNorth).toContainEqual({
            kind: 'gamepad-axis',
            mapping: 'standard',
            axis: 1,
            direction: -1,
        });

        const disabledSession = new ControlMappingSession(DEFAULT_INPUT_MAPPING, ['keyboard', 'pointer']);
        const initial = disabledSession.getSnapshot();
        const mapping = withBinding(initial, 'moveNorth', {
            kind: 'gamepad-button',
            mapping: 'standard',
            button: 12,
        });
        expect(disabledSession.replace(mapping)).toMatchObject({
            valid: false,
            errors: [{ kind: 'unsupported-source' }],
        });
        expect(disabledSession.getSnapshot()).toBe(initial);
    });

    test('validates standard Gamepad button and axis shapes when that source is enabled', () => {
        const mapping = controlMappingFromLegacy();
        const sources = ['keyboard', 'pointer', 'gamepad-button', 'gamepad-axis'] as const;
        const button = { kind: 'gamepad-button', mapping: 'standard', button: 12 } as const;
        const axis = { kind: 'gamepad-axis', mapping: 'standard', axis: 1, direction: -1 } as const;
        const valid = {
            ...mapping,
            moveNorth: [...mapping.moveNorth, button],
            moveSouth: [...mapping.moveSouth, axis],
        };
        expect(validateControlMapping(valid, sources).valid).toBe(true);
        expect(cloneControlMapping(valid).moveNorth.at(-1)).toEqual(button);
        expect(cloneControlMapping(valid).moveSouth.at(-1)).toEqual(axis);

        const duplicateButton = { ...valid, moveWest: [...valid.moveWest, button] };
        expect(validateControlMapping(duplicateButton, sources)).toMatchObject({
            valid: false,
            errors: [{ kind: 'collision' }],
        });
        const axisCollision = { ...valid, moveEast: [...valid.moveEast, axis] };
        expect(validateControlMapping(axisCollision, sources)).toMatchObject({
            valid: false,
            errors: [{ kind: 'collision' }],
        });
        const invalidButton = {
            ...mapping,
            moveNorth: [{ kind: 'gamepad-button', mapping: 'standard', button: 32 }],
        } as unknown as ControlMapping;
        expect(validateControlMapping(invalidButton, sources)).toMatchObject({
            valid: false,
            errors: [{ kind: 'invalid-binding' }],
        });
        const invalidAxis = {
            ...mapping,
            moveNorth: [{ kind: 'gamepad-axis', mapping: 'standard', axis: 4, direction: 0 }],
        } as unknown as ControlMapping;
        expect(validateControlMapping(invalidAxis, sources)).toMatchObject({
            valid: false,
            errors: [{ kind: 'invalid-binding' }],
        });
        const invalidModifiers = {
            ...mapping,
            moveNorth: [
                {
                    kind: 'keyboard',
                    event: 'key',
                    value: 'q',
                    modifiers: ['alt', 'alt'],
                    caseSensitive: false,
                    modifierMatch: 'exact',
                },
            ],
        } as unknown as ControlMapping;
        expect(validateControlMapping(invalidModifiers)).toMatchObject({
            valid: false,
            errors: [{ kind: 'invalid-binding' }],
        });
        const invalidModifierMode = {
            ...mapping,
            moveNorth: [
                {
                    kind: 'keyboard',
                    event: 'key',
                    value: 'q',
                    modifiers: [],
                    caseSensitive: false,
                    modifierMatch: 'loose',
                },
            ],
        } as unknown as ControlMapping;
        expect(validateControlMapping(invalidModifierMode)).toMatchObject({
            valid: false,
            errors: [{ kind: 'invalid-binding' }],
        });
        const invalidPointer = {
            ...mapping,
            pointerPipeToggle: [{ kind: 'pointer', button: 'side', modifiers: [] }],
        } as unknown as ControlMapping;
        expect(validateControlMapping(invalidPointer)).toMatchObject({
            valid: false,
            errors: [{ kind: 'invalid-binding' }],
        });
    });

    test('reports missing and unknown action arrays', () => {
        const mapping = controlMappingFromLegacy();
        const missing = { ...mapping, pipeNorth: undefined } as unknown as ControlMapping;
        expect(validateControlMapping(missing)).toMatchObject({ valid: false, errors: [{ kind: 'incomplete' }] });
        const unknown = { ...mapping, unknownAction: [] } as unknown as ControlMapping;
        expect(validateControlMapping(unknown)).toMatchObject({ valid: false, errors: [{ kind: 'incomplete' }] });
        const malformed = { ...mapping, pipeNorth: [null] } as unknown as ControlMapping;
        expect(validateControlMapping(malformed)).toMatchObject({
            valid: false,
            errors: [{ kind: 'invalid-binding' }],
        });
        expect(validateControlMapping(null as unknown as ControlMapping)).toMatchObject({
            valid: false,
            errors: [{ kind: 'incomplete' }],
        });
    });

    test('notifies only committed replacements and reset', () => {
        const session = new ControlMappingSession();
        let notifications = 0;
        const unsubscribe = session.subscribe(() => {
            notifications += 1;
        });
        const mapping = session.getSnapshot();
        const west = mapping.pipeWest[0];
        if (west === undefined) throw new Error('Original mapping must bind pipe west.');
        const invalid = { ...mapping, pipeNorth: [...mapping.pipeNorth, west] };
        expect(session.replace(invalid).valid).toBe(false);
        expect(notifications).toBe(0);
        expect(session.replace(mapping).valid).toBe(true);
        expect(notifications).toBe(1);
        session.reset();
        expect(notifications).toBe(2);
        unsubscribe();
        session.reset();
        expect(notifications).toBe(2);
    });

    test('isolates runtime instances and reset restores each instance initial map', () => {
        const first = new ControlMappingSession();
        const second = new ControlMappingSession();
        const changed = withBinding(first.getSnapshot(), 'moveNorth', {
            kind: 'keyboard',
            event: 'key',
            value: 'w',
            modifiers: [],
            caseSensitive: false,
            modifierMatch: 'exact',
        });
        expect(first.replace(changed).valid).toBe(true);
        expect(matchKeyboardBinding(first.getSnapshot(), keyboardEvent('w'))).toBe('moveNorth');
        expect(matchKeyboardBinding(second.getSnapshot(), keyboardEvent('w'))).toBeNull();
        first.reset();
        expect(first.getSnapshot().moveNorth).toEqual(second.getSnapshot().moveNorth);
    });

    test('covers every declared action id in the public mapping record', () => {
        const mapping = controlMappingFromLegacy();
        expect(Object.keys(mapping).sort()).toEqual([...CONTROL_ACTION_IDS].sort());
    });

    test('pointer binding resolution prefers the most-specific modifier action', () => {
        const mapping = controlMappingFromLegacy();
        expect(matchPointerBinding(mapping, 'left', new Set())).toBe('pointerPipeToggle');
        expect(matchPointerBinding(mapping, 'left', new Set(['alt']))).toBe('pointerPipeExclusive');
        expect(matchPointerBinding(mapping, 'right', new Set())).toBe('pointerPipeExclusive');
        expect(matchPointerBinding(mapping, 'middle', new Set())).toBeNull();
        expect(matchPointerBinding(mapping, 'right', new Set(['ctrl']))).toBe('pointerPipeExclusive');
        expect(matchPointerBinding(mapping, 'middle', new Set(['shift']))).toBeNull();
        expect(matchPointerBinding(mapping, 'left', new Set(['meta']))).toBe('pointerPipeToggle');
        expect(
            matchPointerBinding({ ...mapping, pointerPipeToggle: [], pointerPipeExclusive: [] }, 'left', new Set()),
        ).toBeNull();
    });
});
