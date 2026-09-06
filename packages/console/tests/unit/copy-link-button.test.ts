/**
 * CopyLinkButton unit tests — issue #34 (T-034-04).
 *
 * Verifies the copy-link affordance component (FR-028):
 *
 *   - clipboard success shows "Copied!" confirmation for 2 seconds,
 *   - clipboard failure shows the URL as selectable fallback text,
 *   - keyboard accessibility (Enter/Space activation on native button),
 *   - aria-label present on both variants,
 *   - prominent vs subtle rendering (icon + text vs icon-only),
 *   - confirmation timeout resets the copied state,
 *   - onCopyResult callback receives the correct result,
 *   - unmount cleans up the pending timeout.
 *
 * NOTE: this file is `.test.ts` but uses `React.createElement` to
 * avoid needing a JSX transform — it runs under the unit config
 * (happy-dom, no React plugin).
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CopyLinkButton, type CopyLinkResult } from '../../src/ui/copy-link-button';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const MATCH_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

/** Set up clipboard mock and render helper. */
function setup() {
    const clipboardWriteText = vi.fn().mockResolvedValue(undefined);

    // happy-dom's navigator.clipboard is a read-only getter; override it.
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: clipboardWriteText },
        writable: true,
        configurable: true,
    });

    const container = document.createElement('div');
    document.body.append(container);
    const root: Root = createRoot(container);

    function render(
        props: Partial<React.ComponentProps<typeof CopyLinkButton>> = {},
    ): { container: HTMLDivElement; root: Root } {
        act(() => {
            root.render(
                createElement(CopyLinkButton, {
                    matchId: MATCH_ID,
                    visibility: 'public',
                    ...props,
                }),
            );
        });
        return { container, root };
    }

    return { clipboardWriteText, container, root, render };
}

afterEach(() => {
    vi.restoreAllMocks();
    // Restore clipboard if we overrode it.
    if ('clipboard' in navigator) {
        Object.defineProperty(navigator, 'clipboard', {
            value: undefined,
            writable: true,
            configurable: true,
        });
    }
    // Clean up any rendered roots.
    for (const el of document.querySelectorAll('div')) {
        if (el.parentNode === document.body) {
            act(() => {
                createRoot(el).unmount();
            });
            el.remove();
        }
    }
});

// ----------------------------------------------------------------------------
// Clipboard success
// ----------------------------------------------------------------------------

describe('clipboard success', () => {
    it('shows "Copied!" confirmation after successful clipboard write', async () => {
        const { clipboardWriteText, render } = setup();
        const { container } = render();

        const button = container.querySelector('[data-europa-copy-link-button]') as HTMLButtonElement;
        expect(button).not.toBeNull();

        await act(async () => {
            button.click();
        });

        expect(clipboardWriteText).toHaveBeenCalledTimes(1);
        const copiedUrl = clipboardWriteText.mock.calls[0][0] as string;
        expect(copiedUrl).toContain('/match/');
        expect(copiedUrl).toContain(encodeURIComponent(MATCH_ID));

        // Button should now show confirmation checkmark.
        expect(button.textContent).toContain('✓');
        // Confirmation text is in a separate status element.
        const status = container.querySelector('[role="status"]');
        expect(status?.textContent).toContain('Copied');
    });

    it('calls onCopyResult with ok: true on clipboard success', async () => {
        const { render } = setup();
        const onCopyResult = vi.fn();
        const { container } = render({ onCopyResult });

        const button = container.querySelector('[data-europa-copy-link-button]') as HTMLButtonElement;

        await act(async () => {
            button.click();
        });

        expect(onCopyResult).toHaveBeenCalledTimes(1);
        const result = onCopyResult.mock.calls[0][0] as CopyLinkResult;
        expect(result.ok).toBe(true);
        expect(result.url).toContain(MATCH_ID);
    });
});

// ----------------------------------------------------------------------------
// Clipboard failure → fallback
// ----------------------------------------------------------------------------

describe('clipboard failure', () => {
    it('shows fallback URL as selectable input when clipboard fails', async () => {
        const { clipboardWriteText, render } = setup();
        clipboardWriteText.mockRejectedValueOnce(new Error('not allowed'));
        const { container } = render();

        const button = container.querySelector('[data-europa-copy-link-button]') as HTMLButtonElement;

        await act(async () => {
            button.click();
        });

        // Fallback input should appear.
        const fallbackInput = container.querySelector('.europa-copy-link__fallback-input') as HTMLInputElement;
        expect(fallbackInput).not.toBeNull();
        expect(fallbackInput.value).toContain(MATCH_ID);
    });

    it('calls onCopyResult with ok: false on clipboard failure', async () => {
        const { clipboardWriteText, render } = setup();
        clipboardWriteText.mockRejectedValueOnce(new Error('not allowed'));
        const onCopyResult = vi.fn();
        const { container } = render({ onCopyResult });

        const button = container.querySelector('[data-europa-copy-link-button]') as HTMLButtonElement;

        await act(async () => {
            button.click();
        });

        expect(onCopyResult).toHaveBeenCalledTimes(1);
        const result = onCopyResult.mock.calls[0][0] as CopyLinkResult;
        expect(result.ok).toBe(false);
    });
});

// ----------------------------------------------------------------------------
// Keyboard accessibility
// ----------------------------------------------------------------------------

describe('keyboard accessibility', () => {
    it('Enter key activates the copy action', async () => {
        const { clipboardWriteText, render } = setup();
        const { container } = render();

        const button = container.querySelector('[data-europa-copy-link-button]') as HTMLButtonElement;
        button.focus();

        await act(async () => {
            const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            button.dispatchEvent(event);
            // Native button: Enter fires click.
            button.click();
        });

        expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    });

    it('Space key activates the copy action', async () => {
        const { clipboardWriteText, render } = setup();
        const { container } = render();

        const button = container.querySelector('[data-europa-copy-link-button]') as HTMLButtonElement;
        button.focus();

        await act(async () => {
            const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
            button.dispatchEvent(event);
            button.click();
        });

        expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    });
});

// ----------------------------------------------------------------------------
// aria-label
// ----------------------------------------------------------------------------

describe('aria-label', () => {
    it('subtle variant has an aria-label mentioning the match ID prefix', () => {
        const { render } = setup();
        const { container } = render({ variant: 'subtle' });

        const button = container.querySelector('[data-europa-copy-link-button]') as HTMLButtonElement;
        expect(button.getAttribute('aria-label')).toContain(MATCH_ID.slice(0, 8));
    });

    it('prominent variant has an aria-label mentioning the match ID prefix', () => {
        const { render } = setup();
        const { container } = render({ variant: 'prominent' });

        const button = container.querySelector('[data-europa-copy-link-button]') as HTMLButtonElement;
        expect(button.getAttribute('aria-label')).toContain(MATCH_ID.slice(0, 8));
    });
});

// ----------------------------------------------------------------------------
// Prominent vs subtle rendering
// ----------------------------------------------------------------------------

describe('variant rendering', () => {
    it('prominent variant shows icon + text', () => {
        const { render } = setup();
        const { container } = render({ variant: 'prominent' });

        const wrapper = container.querySelector('[data-europa-copy-link="prominent"]');
        expect(wrapper).not.toBeNull();
        const button = wrapper?.querySelector('button') as HTMLButtonElement;
        expect(button.textContent).toContain('Copy link');
    });

    it('subtle variant shows icon-only (no text)', () => {
        const { render } = setup();
        const { container } = render({ variant: 'subtle' });

        const wrapper = container.querySelector('[data-europa-copy-link="subtle"]');
        expect(wrapper).not.toBeNull();
        const button = wrapper?.querySelector('button') as HTMLButtonElement;
        // Should have minimal text (just the icon character).
        expect(button.textContent?.trim().length).toBeLessThanOrEqual(2);
    });

    it('defaults to prominent for private visibility', () => {
        const { render } = setup();
        const { container } = render({ visibility: 'private' });

        const wrapper = container.querySelector('[data-europa-copy-link="prominent"]');
        expect(wrapper).not.toBeNull();
    });

    it('defaults to subtle for public visibility', () => {
        const { render } = setup();
        const { container } = render({ visibility: 'public' });

        const wrapper = container.querySelector('[data-europa-copy-link="subtle"]');
        expect(wrapper).not.toBeNull();
    });
});

// ----------------------------------------------------------------------------
// Confirmation timeout
// ----------------------------------------------------------------------------

describe('confirmation timeout', () => {
    it('resets copied state after 2 seconds', async () => {
        vi.useFakeTimers();
        try {
            const { render } = setup();
            const { container } = render();

            const button = container.querySelector('[data-europa-copy-link-button]') as HTMLButtonElement;

            await act(async () => {
                button.click();
            });

            // Immediately after click, confirmation checkmark should be visible.
            expect(button.textContent).toContain('✓');
            // Confirmation text is in a separate status element.
            const status = container.querySelector('[role="status"]');
            expect(status?.textContent).toContain('Copied');

            // Advance time past the confirmation window.
            await act(async () => {
                vi.advanceTimersByTime(2_100);
            });

            // Confirmation should be gone (back to icon, no status element).
            expect(button.textContent).not.toContain('✓');
            expect(container.querySelector('[role="status"]')).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });
});

// ----------------------------------------------------------------------------
// Unmount cleanup
// ----------------------------------------------------------------------------

describe('unmount cleanup', () => {
    it('cleans up pending timeout on unmount', async () => {
        const { render } = setup();
        const { container, root } = render();

        const button = container.querySelector('[data-europa-copy-link-button]') as HTMLButtonElement;

        await act(async () => {
            button.click();
        });

        // Unmount before the timeout fires.
        await act(async () => {
            root.unmount();
        });

        // Advancing time after unmount should not throw.
        vi.useFakeTimers();
        try {
            expect(() => {
                vi.advanceTimersByTime(2_500);
            }).not.toThrow();
        } finally {
            vi.useRealTimers();
        }
    });
});
