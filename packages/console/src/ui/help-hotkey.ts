/**
 * Help overlay keyboard binding — Feature 018 FR-008 / spec 005 FR-018.
 * The `?` shortcut shares the standard order/hotkey focus guard so
 * interactive chrome can use the character without toggling the modal.
 */

import { shouldIgnoreKeyEvent } from '../input/order-draft';

/** Whether a keydown should toggle the help overlay. */
export function isHelpToggleKey(event: {
    readonly key: string;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly altKey: boolean;
    readonly defaultPrevented: boolean;
    readonly repeat: boolean;
    readonly target: EventTarget | null;
}): boolean {
    return event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey && !shouldIgnoreKeyEvent(event);
}
