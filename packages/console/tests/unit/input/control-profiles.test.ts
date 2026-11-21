import { describe, expect, test } from 'vitest';
import { ControlMappingSession } from '../../../src/input/control-mapping';
import { controlMappingForProfile } from '../../../src/input/control-profiles';
import type { ControlMapping } from '../../../src/state/types';

function keyboardValues(mapping: ControlMapping, action: keyof ControlMapping): readonly string[] {
    return mapping[action].flatMap((binding) => (binding.kind === 'keyboard' ? [binding.value] : []));
}

describe('keyboard control profiles', () => {
    test('MMO/WASD changes selection movement only and preserves controller bindings', () => {
        const session = new ControlMappingSession();
        const customized = {
            ...session.getSnapshot(),
            reserve7: [
                ...session.getSnapshot().reserve7,
                { kind: 'gamepad-button', mapping: 'standard', button: 0 } as const,
            ],
        };
        expect(session.replace(customized).valid).toBe(true);
        const mmo = controlMappingForProfile(session.getSnapshot(), session.getResetSnapshot(), 'mmo-wasd');

        expect(keyboardValues(mmo, 'moveNorth')).toEqual(['w']);
        expect(keyboardValues(mmo, 'moveWest')).toEqual(['a']);
        expect(keyboardValues(mmo, 'moveSouth')).toEqual(['s']);
        expect(keyboardValues(mmo, 'moveEast')).toEqual(['d']);
        expect(keyboardValues(mmo, 'pipeNorth')).toEqual(['i']);
        expect(mmo.moveNorth).toContainEqual({ kind: 'gamepad-button', mapping: 'standard', button: 12 });
        expect(mmo.reserve7).toContainEqual({ kind: 'gamepad-button', mapping: 'standard', button: 0 });

        expect(session.replaceProfile(mmo, 'mmo-wasd').valid).toBe(true);
        expect(session.getProfileSnapshot()).toBe('mmo-wasd');
        const originalKeyboard = controlMappingForProfile(
            session.getSnapshot(),
            session.getResetSnapshot(),
            'original',
        );
        expect(keyboardValues(originalKeyboard, 'moveNorth')).toEqual(['ArrowUp']);
        expect(originalKeyboard.reserve7).toContainEqual({ kind: 'gamepad-button', mapping: 'standard', button: 0 });
    });

    test('rejects a conflicting preset atomically and keeps the Custom mapping/profile', () => {
        const session = new ControlMappingSession();
        const custom = {
            ...session.getSnapshot(),
            pipeNorth: [
                ...session.getSnapshot().pipeNorth,
                {
                    kind: 'keyboard',
                    event: 'key',
                    value: 'w',
                    modifiers: [],
                    caseSensitive: false,
                    modifierMatch: 'exact',
                } as const,
            ],
        };
        expect(session.replace(custom).valid).toBe(true);
        const current = session.getSnapshot();
        const mmo = controlMappingForProfile(current, session.getResetSnapshot(), 'mmo-wasd');

        expect(session.replaceProfile(mmo, 'mmo-wasd')).toMatchObject({
            valid: false,
            errors: [{ kind: 'collision' }],
        });
        expect(session.getSnapshot()).toBe(current);
        expect(session.getProfileSnapshot()).toBe('custom');
    });

    test('Custom profile leaves bindings unchanged and reset returns to Original', () => {
        const session = new ControlMappingSession();
        const original = session.getSnapshot();
        const mmo = controlMappingForProfile(original, session.getResetSnapshot(), 'mmo-wasd');
        expect(session.replaceProfile(mmo, 'mmo-wasd').valid).toBe(true);
        const selectedCustom = controlMappingForProfile(session.getSnapshot(), session.getResetSnapshot(), 'custom');
        expect(selectedCustom).toEqual(session.getSnapshot());
        expect(session.replaceProfile(selectedCustom, 'custom').valid).toBe(true);
        expect(session.getProfileSnapshot()).toBe('custom');
        session.reset();
        expect(session.getSnapshot()).toBe(original);
        expect(session.getProfileSnapshot()).toBe('original');
    });
});
