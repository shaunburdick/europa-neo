/**
 * Integration tests for EuropaButton React component (spec 014, FR-013).
 *
 * These tests verify cross-cutting behaviors that go beyond unit-level
 * rendering: click handlers, form submission, disabled state, and
 * attribute forwarding. They run in the happy-dom node suite and assert
 * the behaviors that React's event delegation and form association
 * rely on.
 *
 * Covered behaviors:
 * - Click fires onClick handler.
 * - Form submission: type="submit" triggers form onSubmit.
 * - Disabled button does not fire onClick.
 * - Disabled submit button does not submit form.
 * - Button type defaults to "button".
 * - Forwards additional HTML attributes (aria-label, data-testid, id).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaButton } from '../../src/components/generic/button.js';

describe('EuropaButton (integration)', () => {
    it('click fires onClick handler', () => {
        let clicked = 0;
        render(
            <EuropaButton
                onClick={() => {
                    clicked += 1;
                }}
            >
                Deploy
            </EuropaButton>,
        );
        fireEvent.click(screen.getByText('Deploy'));
        expect(clicked).toBe(1);
    });

    it('form submission: type="submit" triggers form onSubmit', () => {
        let submitted = false;
        render(
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    submitted = true;
                }}
            >
                <EuropaButton type="submit">Save</EuropaButton>
            </form>,
        );
        fireEvent.click(screen.getByText('Save'));
        expect(submitted).toBe(true);
    });

    it('disabled button does not fire onClick', () => {
        let clicked = 0;
        render(
            <EuropaButton
                disabled
                onClick={() => {
                    clicked += 1;
                }}
            >
                Save
            </EuropaButton>,
        );
        fireEvent.click(screen.getByText('Save'));
        expect(clicked).toBe(0);
    });

    it('disabled submit button does not submit form', () => {
        let submitted = false;
        render(
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    submitted = true;
                }}
            >
                <EuropaButton type="submit" disabled>
                    Save
                </EuropaButton>
            </form>,
        );
        fireEvent.click(screen.getByText('Save'));
        expect(submitted).toBe(false);
    });

    it('defaults type to button', () => {
        render(<EuropaButton>Click me</EuropaButton>);
        expect(screen.getByRole('button', { name: 'Click me' })).toHaveAttribute('type', 'button');
    });

    it('forwards aria-label', () => {
        render(<EuropaButton aria-label="Deploy the fleet">Deploy</EuropaButton>);
        expect(screen.getByRole('button', { name: 'Deploy the fleet' })).toHaveAttribute(
            'aria-label',
            'Deploy the fleet',
        );
    });

    it('forwards data-testid and id', () => {
        render(
            <EuropaButton data-testid="custom" id="my-btn">
                Spread
            </EuropaButton>,
        );
        const btn = screen.getByRole('button', { name: 'Spread' });
        expect(btn).toHaveAttribute('data-testid', 'custom');
        expect(btn).toHaveAttribute('id', 'my-btn');
    });

    it('renders children as button text', () => {
        render(<EuropaButton>Fleet deployer</EuropaButton>);
        expect(screen.getByRole('button', { name: 'Fleet deployer' })).toHaveTextContent('Fleet deployer');
    });

    it('multiple rapid clicks fire onClick multiple times', () => {
        let clicked = 0;
        render(
            <EuropaButton
                onClick={() => {
                    clicked += 1;
                }}
            >
                Rapid
            </EuropaButton>,
        );
        const btn = screen.getByText('Rapid');
        fireEvent.click(btn);
        fireEvent.click(btn);
        fireEvent.click(btn);
        expect(clicked).toBe(3);
    });

    it('reset button triggers form onReset', () => {
        let resetCount = 0;
        render(
            <form
                onReset={() => {
                    resetCount += 1;
                }}
            >
                <EuropaButton type="reset">Reset</EuropaButton>
            </form>,
        );
        fireEvent.click(screen.getByText('Reset'));
        expect(resetCount).toBe(1);
    });
});
