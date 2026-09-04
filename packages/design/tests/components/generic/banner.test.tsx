import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaBanner } from '../../../src/components/generic/banner.js';

describe('EuropaBanner', () => {
    it('renders with status role and polite aria-live by default', () => {
        const { container } = render(<EuropaBanner>Update available</EuropaBanner>);
        const banner = container.querySelector('[role="status"]');
        expect(banner).toHaveAttribute('aria-live', 'polite');
        expect(banner).toHaveClass('europa-banner', 'europa-banner--status');
    });

    it('renders children inside the banner', () => {
        render(<EuropaBanner>Reconnecting…</EuropaBanner>);
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
    });

    it('renders with alert role and assertive aria-live when variant is alert', () => {
        const { container } = render(<EuropaBanner variant="alert">Critical error</EuropaBanner>);
        const banner = container.querySelector('[role="alert"]');
        expect(banner).toHaveAttribute('aria-live', 'assertive');
        expect(banner).toHaveClass('europa-banner', 'europa-banner--alert');
    });

    it('does not include alert class when variant is status', () => {
        const { container } = render(<EuropaBanner variant="status">Info</EuropaBanner>);
        const banner = container.querySelector('[role="status"]');
        expect(banner).not.toHaveClass('europa-banner--alert');
    });
});
