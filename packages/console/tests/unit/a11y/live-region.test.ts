/**
 * LiveRegionAnnouncer unit tests — Feature 005 (T021, T097 coverage).
 *
 * Covers politeness routing, identical-message debouncing (WCAG 4.1.3
 * anti-spam), and clear().
 */

import { describe, expect, it } from 'vitest';

import { LiveRegionAnnouncer } from '../../../src/a11y/live-region';

function mounted(): { readonly host: HTMLElement; readonly announcer: LiveRegionAnnouncer } {
  const host = document.createElement('div');
  document.body.append(host);
  return { host, announcer: new LiveRegionAnnouncer(host) };
}

describe('LiveRegionAnnouncer', () => {
  it('routes text into polite and assertive regions', () => {
    const { host, announcer } = mounted();
    announcer.announce('Pipe set', 'polite');
    announcer.announce('Connection lost', 'assertive');
    expect(host.querySelector('[data-europa-live="polite"]')?.textContent).toBe('Pipe set');
    expect(host.querySelector('[data-europa-live="assertive"]')?.textContent).toBe(
      'Connection lost',
    );
    host.remove();
  });

  it('suppresses identical repeats within the debounce window', () => {
    const { host, announcer } = mounted();
    announcer.announce('same', 'polite');
    announcer.announce('same', 'polite'); // <500ms later, dropped
    const nodes = host.querySelectorAll('[data-europa-live="polite"]');
    expect(nodes).toHaveLength(1);
    // Different text passes.
    announcer.announce('different', 'polite');
    expect(host.querySelector('[data-europa-live="polite"]')?.textContent).toBe('different');
    host.remove();
  });

  it('clear() empties both regions', () => {
    const { host, announcer } = mounted();
    announcer.announce('x', 'polite');
    announcer.announce('y', 'assertive');
    announcer.clear();
    expect(host.querySelector('[data-europa-live="polite"]')?.textContent).toBe('');
    expect(host.querySelector('[data-europa-live="assertive"]')?.textContent).toBe('');
    host.remove();
  });
});
