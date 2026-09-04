import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaContainer } from '../../../src/components/generic/container.js';

describe('EuropaContainer', () => {
    it('renders children with the europa-container class', () => {
        render(
            <EuropaContainer>
                <h2>Lobby</h2>
            </EuropaContainer>,
        );
        const div = screen.getByText('Lobby').closest('.europa-container');
        expect(div).not.toBeNull();
    });

    it('renders a div element', () => {
        const { container } = render(
            <EuropaContainer>
                <span>Test</span>
            </EuropaContainer>,
        );
        const div = container.querySelector('.europa-container');
        expect(div).toBeInstanceOf(HTMLDivElement);
    });

    it('renders nothing when no children provided', () => {
        const { container } = render(<EuropaContainer />);
        const div = container.querySelector('.europa-container');
        expect(div).not.toBeNull();
        expect(div?.childNodes.length).toBe(0);
    });
});
