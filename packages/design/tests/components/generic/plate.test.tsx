import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaPlate } from '../../../src/components/generic/plate.js';

describe('EuropaPlate', () => {
    it('renders children with the europa-plate class', () => {
        render(
            <EuropaPlate>
                <h3>Section title</h3>
                <p>Body content goes here.</p>
            </EuropaPlate>,
        );
        const div = screen.getByText('Section title').closest('.europa-plate');
        expect(div).not.toBeNull();
    });

    it('renders a div element', () => {
        const { container } = render(
            <EuropaPlate>
                <span>Test</span>
            </EuropaPlate>,
        );
        const div = container.querySelector('.europa-plate');
        expect(div).toBeInstanceOf(HTMLDivElement);
    });

    it('renders nothing when no children provided', () => {
        const { container } = render(<EuropaPlate />);
        const div = container.querySelector('.europa-plate');
        expect(div).not.toBeNull();
        expect(div?.childNodes.length).toBe(0);
    });
});
