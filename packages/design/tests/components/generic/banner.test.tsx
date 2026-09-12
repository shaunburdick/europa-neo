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

    it('appends a custom className when provided', () => {
        const { container } = render(<EuropaBanner className="custom-banner">Extra</EuropaBanner>);
        const banner = container.querySelector('.europa-banner');
        expect(banner).toHaveClass('europa-banner', 'europa-banner--status', 'custom-banner');
    });

    it('does not append extra class segment when className is absent', () => {
        const { container } = render(<EuropaBanner>No extra</EuropaBanner>);
        const banner = container.querySelector('.europa-banner');
        // className should be 'europa-banner europa-banner--status' with no trailing space
        expect(banner?.className).toBe('europa-banner europa-banner--status');
    });
});
