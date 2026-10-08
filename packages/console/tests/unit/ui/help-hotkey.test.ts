/** Focus-guard tests for the App's help-overlay keyboard shortcut. */

import { describe, expect, test } from 'vitest';
import { isHelpToggleKey } from '../../../src/ui/help-hotkey';

describe('isHelpToggleKey', () => {
    test('interactive chrome focus suppresses the help toggle', () => {
        const button = document.createElement('button');
        document.body.append(button);
        button.focus();
        const event = new KeyboardEvent('keydown', { key: '?', bubbles: true });
        button.dispatchEvent(event);

        try {
            expect(isHelpToggleKey(event)).toBe(false);
        } finally {
            button.remove();
        }
    });

    test('ordinary board/background focus permits the help toggle', () => {
        const board = document.createElement('div');
        board.tabIndex = 0;
        document.body.append(board);
        board.focus();
        const event = new KeyboardEvent('keydown', { key: '?', bubbles: true });
        board.dispatchEvent(event);

        try {
            expect(isHelpToggleKey(event)).toBe(true);
        } finally {
            board.remove();
        }
    });

    test('modified help shortcuts remain available to the browser', () => {
        const event = new KeyboardEvent('keydown', { key: '?', ctrlKey: true });
        expect(isHelpToggleKey(event)).toBe(false);
    });
});
