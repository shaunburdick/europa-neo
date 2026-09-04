import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EuropaButton } from '../../../src/components/generic/button.js';

describe('EuropaButton', () => {
    it('renders with the europa-button base class', () => {
        const { container } = render(<EuropaButton>Deploy now</EuropaButton>);
        const button = container.querySelector('.europa-button');
        expect(button).not.toBeNull();
        expect(button).toBeInstanceOf(HTMLButtonElement);
    });

    it('applies variant modifier class', () => {
        const { container } = render(<EuropaButton variant="primary">Primary btn</EuropaButton>);
        const button = container.querySelector('.europa-button');
        expect(button).toHaveClass('europa-button', 'europa-button--primary');
    });

    it('applies size modifier class', () => {
        const { container } = render(<EuropaButton size="sm">Small btn</EuropaButton>);
        const button = container.querySelector('.europa-button');
        expect(button).toHaveClass('europa-button', 'europa-button--sm');
    });

    it('applies both variant and size modifier classes', () => {
        const { container } = render(
            <EuropaButton variant="secondary" size="lg">
                Large secondary
            </EuropaButton>,
        );
        const button = container.querySelector('.europa-button');
        expect(button).toHaveClass('europa-button', 'europa-button--secondary', 'europa-button--lg');
    });

    it('forwards disabled to the native button', () => {
        render(<EuropaButton disabled>Disabled btn</EuropaButton>);
        const button = screen.getByRole('button', { name: 'Disabled btn' });
        expect(button).toBeDisabled();
    });

    it('does not disable when disabled is absent', () => {
        render(<EuropaButton>Enabled btn</EuropaButton>);
        const button = screen.getByRole('button', { name: 'Enabled btn' });
        expect(button).not.toBeDisabled();
    });

    it('defaults type to button', () => {
        render(<EuropaButton>Click me</EuropaButton>);
        const button = screen.getByRole('button', { name: 'Click me' });
        expect(button).toHaveAttribute('type', 'button');
    });

    it('forwards type="submit"', () => {
        render(<EuropaButton type="submit">Submit me</EuropaButton>);
        const button = screen.getByRole('button', { name: 'Submit me' });
        expect(button).toHaveAttribute('type', 'submit');
    });

    it('forwards aria-label', () => {
        render(<EuropaButton aria-label="Deploy the fleet">Deploy al</EuropaButton>);
        const button = screen.getByRole('button', { name: 'Deploy the fleet' });
        expect(button).toHaveAttribute('aria-label', 'Deploy the fleet');
    });

    it('renders children as button text', () => {
        render(<EuropaButton>Fleet deployer</EuropaButton>);
        const button = screen.getByRole('button', { name: 'Fleet deployer' });
        expect(button).toHaveTextContent('Fleet deployer');
    });

    it('calls onClick when clicked', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<EuropaButton onClick={onClick}>Click target</EuropaButton>);
        await user.click(screen.getByRole('button', { name: 'Click target' }));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when disabled', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(
            <EuropaButton disabled onClick={onClick}>
                No click
            </EuropaButton>,
        );
        await user.click(screen.getByRole('button', { name: 'No click' }));
        expect(onClick).not.toHaveBeenCalled();
    });

    it('spreads additional HTML attributes', () => {
        render(
            <EuropaButton data-testid="custom" id="my-btn">
                Spread test
            </EuropaButton>,
        );
        const button = screen.getByRole('button', { name: 'Spread test' });
        expect(button).toHaveAttribute('data-testid', 'custom');
        expect(button).toHaveAttribute('id', 'my-btn');
    });
});
