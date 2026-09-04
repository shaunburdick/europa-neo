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
        expect(actions).toContainHTML('<button>OK</button>');
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
});
