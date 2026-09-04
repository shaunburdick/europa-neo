import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaBadge } from '../../../src/components/generic/badge.js';

describe('EuropaBadge', () => {
    it('renders children with the europa-badge class', () => {
        render(<EuropaBadge>Your match</EuropaBadge>);
        const span = screen.getByText('Your match');
        expect(span).toHaveClass('europa-badge');
    });

    it('renders a span element', () => {
        const { container } = render(<EuropaBadge>Test</EuropaBadge>);
        const span = container.querySelector('span.europa-badge');
        expect(span).toBeInstanceOf(HTMLSpanElement);
    });

    it('renders nothing when no children provided', () => {
        const { container } = render(<EuropaBadge />);
        const span = container.querySelector('span.europa-badge');
        expect(span).not.toBeNull();
        expect(span?.textContent).toBe('');
    });
});
