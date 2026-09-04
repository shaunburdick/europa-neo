import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaCard } from '../../../src/components/generic/card.js';

describe('EuropaCard', () => {
    it('renders children with the europa-card class', () => {
        render(
            <EuropaCard>
                <p>Content</p>
            </EuropaCard>,
        );
        const div = screen.getByText('Content').closest('.europa-card');
        expect(div).not.toBeNull();
    });

    it('renders a div element', () => {
        const { container } = render(
            <EuropaCard>
                <span>Test</span>
            </EuropaCard>,
        );
        const div = container.querySelector('.europa-card');
        expect(div).toBeInstanceOf(HTMLDivElement);
    });

    it('renders nothing when no children provided', () => {
        const { container } = render(<EuropaCard />);
        const div = container.querySelector('.europa-card');
        expect(div).not.toBeNull();
        expect(div?.childNodes.length).toBe(0);
    });
});
