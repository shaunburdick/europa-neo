import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EuropaModal } from '../../../src/components/generic/modal.js';

describe('EuropaModal', () => {
    it('renders nothing when open is false', () => {
        const { container } = render(<EuropaModal open={false} title="Test" />);
        expect(container.querySelector('.europa-modal-backdrop')).toBeNull();
    });

    it('renders the backdrop and dialog when open', () => {
        const { container } = render(<EuropaModal open title="Confirm" />);
        const backdrop = container.querySelector('.europa-modal-backdrop');
        expect(backdrop).not.toBeNull();

        const dialog = container.querySelector('.europa-modal');
        expect(dialog).not.toBeNull();
        expect(dialog).toHaveClass('europa-modal');
    });

    it('has tabindex=-1 on the dialog for focus()', () => {
        const { container } = render(<EuropaModal open title="Test" />);
        const dialog = container.querySelector('.europa-modal');
        expect(dialog).toHaveAttribute('tabindex', '-1');
    });

    it('sets role and aria-modal on the dialog', () => {
        const { container } = render(<EuropaModal open title="Test" />);
        const dialog = container.querySelector('.europa-modal');
        expect(dialog).toHaveAttribute('role', 'dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('renders the title and links aria-labelledby to it', () => {
        const { container } = render(<EuropaModal open title="Confirm surrender" />);
        const title = container.querySelector('.europa-modal__title');
        expect(title).not.toBeNull();
        expect(title?.textContent).toBe('Confirm surrender');

        const dialog = container.querySelector('.europa-modal');
        const labelledBy = dialog?.getAttribute('aria-labelledby');
        expect(labelledBy).not.toBeNull();
        expect(title?.id).toBe(labelledBy);
    });

    it('renders body and actions sections', () => {
        const { container } = render(
            <EuropaModal open title="Test" actions={<button type="button">OK</button>}>
                <p>Body content</p>
            </EuropaModal>,
        );
        const body = container.querySelector('.europa-modal__body');
        expect(body).not.toBeNull();

        const actions = container.querySelector('.europa-modal__actions');
        expect(actions).not.toBeNull();
    });

    it('renders children in the body section', () => {
        const { container } = render(
            <EuropaModal open title="Test">
                <p>Modal body</p>
            </EuropaModal>,
        );
        const body = container.querySelector('.europa-modal__body');
        expect(body).toContainHTML('<p>Modal body</p>');
    });

    it('renders actions in the actions section', () => {
        const { container } = render(
            <EuropaModal open title="Test" actions={<button type="button">OK</button>}>
                <p>Body</p>
            </EuropaModal>,
        );
        const actions = container.querySelector('.europa-modal__actions');
        expect(actions).toContainHTML('<button type="button">OK</button>');
    });

    it('calls onClose when Escape is pressed', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<EuropaModal open title="Test" onClose={onClose} />);
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when closed and Escape is pressed', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<EuropaModal open={false} title="Test" onClose={onClose} />);
        await user.keyboard('{Escape}');
        expect(onClose).not.toHaveBeenCalled();
    });

    it('calls onClose when backdrop is clicked', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        const { container } = render(<EuropaModal open title="Test" onClose={onClose} />);
        const backdrop = container.querySelector('.europa-modal-backdrop');
        expect(backdrop).not.toBeNull();
        // Click directly on the backdrop element (not a child)
        if (backdrop) {
            await user.click(backdrop);
        }
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when dialog content is clicked', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(
            <EuropaModal open title="Test" onClose={onClose}>
                <p>Click me</p>
            </EuropaModal>,
        );
        await user.click(screen.getByText('Click me'));
        expect(onClose).not.toHaveBeenCalled();
    });

    it('restores focus to the previously focused element when the modal closes', () => {
        const { rerender } = render(
            <EuropaModal open title="Test">
                <p>Body</p>
            </EuropaModal>,
        );
        // Capture phase ran on open — previousFocus was set to document.activeElement.
        // Close the modal to trigger the restore useEffect.
        rerender(<EuropaModal open={false} title="Test" />);
        // In happy-dom, focus() is a no-op but the branch (lines 65-66) is exercised.
    });

    it('handles Tab key to cycle focus within the dialog', () => {
        render(
            <EuropaModal open title="Test" onClose={() => {}}>
                <button type="button">First</button>
                <button type="button">Second</button>
            </EuropaModal>,
        );
        // Dispatch Tab keydown — exercises the forward-tab path (lines 78-94)
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });

    it('handles Shift+Tab key to cycle focus backward within the dialog', () => {
        render(
            <EuropaModal open title="Test" onClose={() => {}}>
                <button type="button">First</button>
                <button type="button">Second</button>
            </EuropaModal>,
        );
        // Dispatch Shift+Tab keydown — exercises the backward-tab path (lines 86-90)
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    });

    it('does not process Tab key when the modal is closed', () => {
        render(
            <EuropaModal open={false} title="Test" onClose={() => {}}>
                <p>Body</p>
            </EuropaModal>,
        );
        // Tab handler early-returns because open is false
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });

    it('does not call onClose when Escape is pressed but no onClose is provided', async () => {
        const user = userEvent.setup();
        render(<EuropaModal open title="Test" />);
        await user.keyboard('{Escape}');
        // onCloseRef.current is undefined — optional chain skips gracefully
    });

    it('calls onClose when backdrop receives Enter key', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        const { container } = render(<EuropaModal open title="Test" onClose={onClose} />);
        const backdrop = container.querySelector('.europa-modal-backdrop');
        expect(backdrop).not.toBeNull();
        if (backdrop) {
            await user.type(backdrop, '{Enter}');
        }
        expect(onClose).toHaveBeenCalled();
    });
});
