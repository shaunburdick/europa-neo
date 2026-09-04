import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaChip } from '../../../src/components/generic/chip.js';

describe('EuropaChip', () => {
    it('renders the count as text content', () => {
        const { container } = render(<EuropaChip count={12} />);
        const chip = container.querySelector('span.europa-chip');
        expect(chip).not.toBeNull();
        expect(chip?.textContent).toContain('12');
    });

    it('renders a span element', () => {
        const { container } = render(<EuropaChip count={5} />);
        const span = container.querySelector('span.europa-chip');
        expect(span).toBeInstanceOf(HTMLSpanElement);
    });

    it('renders count and children together', () => {
        const { container } = render(<EuropaChip count={5}>troops</EuropaChip>);
        const chip = container.querySelector('span.europa-chip');
        expect(chip?.textContent).toBe('5troops');
    });

    it('renders children without count', () => {
        const { container } = render(<EuropaChip>label</EuropaChip>);
        const chip = container.querySelector('span.europa-chip');
        expect(chip?.textContent).toBe('label');
    });

    it('handles string count values', () => {
        const { container } = render(<EuropaChip count="many" />);
        const chip = container.querySelector('span.europa-chip');
        expect(chip?.textContent).toBe('many');
    });
});
