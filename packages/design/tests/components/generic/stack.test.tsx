import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaStack } from '../../../src/components/generic/stack.js';

describe('EuropaStack', () => {
    it('renders children with the europa-stack class', () => {
        render(
            <EuropaStack>
                <p>First item</p>
                <p>Second item</p>
            </EuropaStack>,
        );
        const div = screen.getByText('First item').closest('.europa-stack');
        expect(div).not.toBeNull();
    });

    it('renders a div element', () => {
        const { container } = render(
            <EuropaStack>
                <span>Test</span>
            </EuropaStack>,
        );
        const div = container.querySelector('.europa-stack');
        expect(div).toBeInstanceOf(HTMLDivElement);
    });

    it('renders nothing when no children provided', () => {
        const { container } = render(<EuropaStack />);
        const div = container.querySelector('.europa-stack');
        expect(div).not.toBeNull();
        expect(div?.childNodes.length).toBe(0);
    });
});
