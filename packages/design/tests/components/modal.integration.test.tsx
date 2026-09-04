/**
 * Integration tests for EuropaModal React component (spec 014, FR-011 / FR-028).
 *
 * These tests verify cross-cutting modal behaviors that go beyond
 * structural rendering: open/close toggling, Escape key handling,
 * backdrop click, focus trap structure, and accessibility attributes.
 * They run in the happy-dom node suite.
 *
 * Focus-trap integration (Tab/Shift+Tab cycling, focus restore) requires
 * real browser focus management and is covered by the browser-mode suite.
 * The happy-dom environment supports `document.addEventListener` and
 * synthetic `KeyboardEvent` dispatch, so Escape and structural a11y
 * assertions work here.
 *
 * Covered behaviors:
 * - Renders when open=true, not when open=false.
 * - Escape key calls onClose.
 * - Escape does not call onClose when modal is closed.
 * - Backdrop click calls onClose.
 * - Click inside dialog does NOT call onClose.
 * - Dialog has correct a11y attributes (role, aria-modal, aria-labelledby).
 * - Renders actions slot content.
 * - Title is rendered and linked via aria-labelledby.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EuropaModal } from '../../src/components/generic/modal.js';

describe('EuropaModal (integration)', () => {
    it('renders when open=true, not when open=false', () => {
        const { rerender, container } = render(
            <EuropaModal open title="Test">
                Content
            </EuropaModal>,
        );
        expect(container.querySelector('.europa-modal')).not.toBeNull();

        rerender(
            <EuropaModal open={false} title="Test">
                Content
            </EuropaModal>,
        );
        expect(container.querySelector('.europa-modal')).toBeNull();
    });

    it('Escape key calls onClose', () => {
        const onClose = vi.fn();
        render(
            <EuropaModal open title="Test" onClose={onClose}>
                Content
            </EuropaModal>,
        );
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Escape does not call onClose when modal is closed', () => {
        const onClose = vi.fn();
        render(
            <EuropaModal open={false} title="Test" onClose={onClose}>
                Content
            </EuropaModal>,
        );
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('backdrop click calls onClose', () => {
        const onClose = vi.fn();
        const { container } = render(
            <EuropaModal open title="Test" onClose={onClose}>
                Content
            </EuropaModal>,
        );
        const backdrop = container.querySelector('.europa-modal-backdrop');
        if (backdrop) {
            fireEvent.click(backdrop);
        }
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('click inside dialog does NOT call onClose', () => {
        const onClose = vi.fn();
        render(
            <EuropaModal open title="Test" onClose={onClose}>
                <p>Click me</p>
            </EuropaModal>,
        );
        fireEvent.click(screen.getByRole('dialog'));
        expect(onClose).not.toHaveBeenCalled();
    });

    it('dialog has correct a11y attributes', () => {
        render(
            <EuropaModal open title="Confirm">
                Are you sure?
            </EuropaModal>,
        );
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('renders actions slot content', () => {
        render(
            <EuropaModal open title="Test" actions={<button type="button">OK</button>}>
                Content
            </EuropaModal>,
        );
        expect(screen.getByText('OK')).not.toBeNull();
    });

    it('title is rendered and linked via aria-labelledby', () => {
        render(
            <EuropaModal open title="Confirm surrender">
                Body
            </EuropaModal>,
        );
        const dialog = screen.getByRole('dialog');
        const labelledBy = dialog.getAttribute('aria-labelledby');
        expect(labelledBy).not.toBeNull();

        const titleEl = labelledBy ? document.getElementById(labelledBy) : null;
        expect(titleEl).not.toBeNull();
        expect(titleEl?.textContent).toBe('Confirm surrender');
    });

    it('dialog has tabindex=-1 for focus()', () => {
        render(
            <EuropaModal open title="Test">
                Content
            </EuropaModal>,
        );
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('tabindex', '-1');
    });

    it('renders body content', () => {
        render(
            <EuropaModal open title="Test">
                <p>Modal body text</p>
            </EuropaModal>,
        );
        const body = document.querySelector('.europa-modal__body');
        expect(body).not.toBeNull();
        expect(body?.textContent).toContain('Modal body text');
    });
});
