import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaPage } from '../../../src/components/generic/page.js';

describe('EuropaPage', () => {
    it('renders children with the europa-page class', () => {
        render(
            <EuropaPage>
                <h1>Match lobby</h1>
            </EuropaPage>,
        );
        const div = screen.getByText('Match lobby').closest('.europa-page');
        expect(div).not.toBeNull();
    });

    it('renders a div element', () => {
        const { container } = render(
            <EuropaPage>
                <span>Test</span>
            </EuropaPage>,
        );
        const div = container.querySelector('.europa-page');
        expect(div).toBeInstanceOf(HTMLDivElement);
    });

    it('renders nothing when no children provided', () => {
        const { container } = render(<EuropaPage />);
        const div = container.querySelector('.europa-page');
        expect(div).not.toBeNull();
        expect(div?.childNodes.length).toBe(0);
    });
});
