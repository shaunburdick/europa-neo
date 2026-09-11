/**
 * Integration tests for EuropaModal React component (spec 014, FR-011 / FR-028).
 *
 * These tests verify cross-cutting modal behaviors that go beyond
 * structural rendering. Basic open/close, Escape, backdrop, a11y,
 * and body rendering tests live in modal.test.tsx and are not
 * duplicated here.
 *
 * Focus-trap integration (Tab/Shift+Tab cycling, focus restore) requires
 * real browser focus management and is covered by the browser-mode suite.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaModal } from '../../src/components/generic/modal.js';

describe('EuropaModal (integration)', () => {
    it('renders actions slot content', () => {
        render(
            <EuropaModal open title="Test" actions={<button type="button">OK</button>}>
                Content
            </EuropaModal>,
        );
        expect(screen.getByText('OK')).not.toBeNull();
    });

    it('backdrop has role="presentation" (invalid role="button" removed)', () => {
        const { container } = render(
            <EuropaModal open title="Test">
                Content
            </EuropaModal>,
        );
        const backdrop = container.querySelector('.europa-modal-backdrop');
        expect(backdrop).not.toBeNull();
        expect(backdrop?.getAttribute('role')).toBe('presentation');
        expect(backdrop?.hasAttribute('tabIndex')).toBe(false);
    });

    it('dialog has role="dialog" and aria-modal="true"', () => {
        const { container } = render(
            <EuropaModal open title="Test">
                Content
            </EuropaModal>,
        );
        const dialog = container.querySelector('.europa-modal');
        expect(dialog).not.toBeNull();
        expect(dialog?.getAttribute('role')).toBe('dialog');
        expect(dialog?.getAttribute('aria-modal')).toBe('true');
    });

    it('aria-labelledby references the title element', () => {
        const { container } = render(
            <EuropaModal open title="Confirm Action">
                Content
            </EuropaModal>,
        );
        const dialog = container.querySelector('.europa-modal');
        const labelledBy = dialog?.getAttribute('aria-labelledby');
        expect(labelledBy).not.toBeNull();
        const titleEl = document.querySelector(`#${labelledBy ?? ''}`);
        expect(titleEl).not.toBeNull();
        expect(titleEl?.textContent).toBe('Confirm Action');
    });
});
