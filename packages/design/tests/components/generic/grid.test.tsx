import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaGrid } from '../../../src/components/generic/grid.js';

describe('EuropaGrid', () => {
    it('renders children with the europa-grid class', () => {
        const { container } = render(
            <EuropaGrid>
                <p>Grid content</p>
            </EuropaGrid>,
        );
        const div = container.querySelector('.europa-grid');
        expect(div).not.toBeNull();
        expect(div).toContainHTML('<p>Grid content</p>');
    });

    it('applies europa-grid--sidebar modifier when variant is sidebar', () => {
        const { container } = render(
            <EuropaGrid variant="sidebar">
                <p>Sidebar</p>
            </EuropaGrid>,
        );
        const div = container.querySelector('.europa-grid');
        expect(div).toHaveClass('europa-grid', 'europa-grid--sidebar');
        expect(div).not.toHaveClass('europa-grid--wrap');
    });

    it('applies europa-grid--wrap modifier when variant is wrap', () => {
        const { container } = render(
            <EuropaGrid variant="wrap">
                <p>Wrapped</p>
            </EuropaGrid>,
        );
        const div = container.querySelector('.europa-grid');
        expect(div).toHaveClass('europa-grid', 'europa-grid--wrap');
        expect(div).not.toHaveClass('europa-grid--sidebar');
    });

    it('does not apply a modifier class when variant is absent', () => {
        const { container } = render(
            <EuropaGrid>
                <p>Plain</p>
            </EuropaGrid>,
        );
        const div = container.querySelector('.europa-grid');
        expect(div).toHaveClass('europa-grid');
        expect(div).not.toHaveClass('europa-grid--sidebar');
        expect(div).not.toHaveClass('europa-grid--wrap');
    });
});
