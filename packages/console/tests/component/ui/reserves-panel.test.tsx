/**
 * Reserves panel component tests — Feature 005 (T065).
 *
 * Covers Q-A05 (US4 portion): the panel renders the current cell's
 * reserves as a slider + 0-9 digit buttons; arrow keys move the
 * slider; the slider has `aria-valuenow`, `aria-valuemin`,
 * `aria-valuemax`; the digit buttons have `aria-label`
 * ("Set reserves to 70%"); the panel is keyboard-operable.
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import { createElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';
import type { ReservesPct } from '../../../src/state/types';
import { ReservesPanel } from '../../../src/ui/reserves-panel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Mount the panel for cell (5, 7) with a recording sink (awaited). */
async function mountPanel(currentPercent: ReservesPct = 7) {
  const onSetReserves = vi.fn();
  await render(
    createElement(ReservesPanel, {
      cell: { x: 5, y: 7 },
      currentPercent,
      disabled: false,
      onSetReserves,
    }),
  );
  return { onSetReserves };
}

/** The panel's slider element (asserted present). */
function slider(): HTMLInputElement {
  const node = document.querySelector<HTMLInputElement>('#reserves-slider');
  expect(node).not.toBeNull();
  return node as HTMLInputElement;
}

describe('ReservesPanel (T065)', () => {
  test('renders slider + ten digit buttons with contract ARIA', async () => {
    await mountPanel(7);

    const sliderNode = slider();
    expect(sliderNode.getAttribute('aria-valuemin')).toBe('0');
    expect(sliderNode.getAttribute('aria-valuemax')).toBe('90');
    expect(sliderNode.getAttribute('aria-valuenow')).toBe('70');
    expect(sliderNode.getAttribute('aria-valuetext')).toBe('70%');

    const digits = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.europa-reserves__digit'),
    );
    expect(digits).toHaveLength(10);
    expect(digits.map((button) => button.textContent)).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ]);
    expect(digits[7]?.getAttribute('aria-label')).toBe('Set reserves to 70%');
    expect(digits[0]?.getAttribute('aria-label')).toBe('Set reserves to 0%');
    // Engaged value mirrored non-visually.
    expect(digits[7]?.getAttribute('aria-pressed')).toBe('true');
    expect(digits[6]?.getAttribute('aria-pressed')).toBe('false');
  });

  test('clicking a digit button dispatches its percent', async () => {
    const { onSetReserves } = await mountPanel(0);
    const user = userEvent.setup();

    const digitSeven = document.querySelector<HTMLButtonElement>(
      '.europa-reserves__digit:nth-child(8)',
    );
    expect(digitSeven).not.toBeNull();
    await user.click(digitSeven as HTMLButtonElement);

    expect(onSetReserves).toHaveBeenCalledWith(7);
  });

  test('arrow keys move the slider in 10% steps', async () => {
    const { onSetReserves } = await mountPanel(3);
    const user = userEvent.setup();

    slider().focus();

    await user.keyboard('{ArrowUp}');
    expect(onSetReserves).toHaveBeenLastCalledWith(4);

    await user.keyboard('{ArrowRight}');
    expect(onSetReserves).toHaveBeenLastCalledWith(4);

    await user.keyboard('{ArrowDown}');
    expect(onSetReserves).toHaveBeenLastCalledWith(2);
  });

  test('the panel is keyboard-operable end to end', async () => {
    const { onSetReserves } = await mountPanel(0);
    const user = userEvent.setup();

    // Tab reaches the slider first, then the digit buttons.
    await user.keyboard('{Tab}');
    expect(document.activeElement?.id).toBe('reserves-slider');

    await user.keyboard('{Tab}');
    expect(document.activeElement?.classList.contains('europa-reserves__digit')).toBe(true);

    // Enter activates the focused digit button natively.
    await user.keyboard('{Enter}');
    expect(onSetReserves).toHaveBeenCalled();
  });

  test('disabled state blocks every control', async () => {
    await render(
      createElement(ReservesPanel, {
        cell: { x: 1, y: 2 },
        currentPercent: 0,
        disabled: true,
        onSetReserves: () => undefined,
      }),
    );

    expect(slider().disabled).toBe(true);
    for (const button of document.querySelectorAll<HTMLButtonElement>('.europa-reserves__digit')) {
      expect(button.disabled).toBe(true);
    }
  });
});
