/**
 * ErrorBoundary component tests — Feature 005 (T085 support).
 *
 * Covers Q-B08: a render error in the guarded subtree surfaces the
 * accessible fallback — `aria-live="assertive"` announcement, visible
 * heading/body, and a Reload button — instead of a blank page; the
 * host's `onError` hook observes the error.
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { createElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-react';
import { ErrorBoundary } from '../../../src/render/ErrorBoundary';

/** Child that throws on every render (the failing subtree). */
function Bomb({ message }: { readonly message: string }): never {
  throw new Error(message);
}

afterEach(() => {
  cleanup();
  // React logs caught boundary errors via console.error during
  // tests; silence the expected noise for clean output.
  vi.restoreAllMocks();
});

describe('ErrorBoundary (T085)', () => {
  test('renders children while healthy', async () => {
    const onError = vi.fn();
    await render(
      createElement(ErrorBoundary, { onError }, createElement('p', null, 'healthy subtree')),
    );
    expect(document.body.textContent).toContain('healthy subtree');
    expect(onError).not.toHaveBeenCalled();
  });

  test('a throwing child surfaces the accessible fallback', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onError = vi.fn();
    await render(
      createElement(ErrorBoundary, { onError }, createElement(Bomb, { message: 'boom' })),
    );

    expect(document.body.textContent).toContain('Something went wrong');
    expect(document.body.textContent).toContain('Reload');

    const live = document.querySelector('[aria-live="assertive"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toContain('unexpected error');

    expect(onError).toHaveBeenCalledTimes(1);
    const reported = onError.mock.calls[0]?.[0] as Error | undefined;
    expect(reported?.message).toBe('boom');
    errorSpy.mockRestore();
  });
});
