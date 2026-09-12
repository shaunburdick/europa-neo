/**
 * Tests for the {@link EuropaBadge} React component (spec 014, FR-009 / FR-010).
 *
 * The component renders a `<span class="europa-badge">` with projected
 * children and an optional `className` modifier.
 *
 * Covered:
 * - Default rendering with `europa-badge` class only.
 * - Custom `className` appended via the ternary branch.
 * - Children projection.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaBadge } from '../../../src/components/generic/badge.js';

describe('EuropaBadge', () => {
    it('renders the europa-badge base class by default', () => {
        render(<EuropaBadge>Label</EuropaBadge>);
        const badge = screen.getByText('Label');
        expect(badge).toHaveClass('europa-badge');
    });

    it('appends a custom className when provided', () => {
        render(<EuropaBadge className="europa-badge--success">Done</EuropaBadge>);
        const badge = screen.getByText('Done');
        expect(badge).toHaveClass('europa-badge', 'europa-badge--success');
        expect(badge.className).toBe('europa-badge europa-badge--success');
    });

    it('omits extra class segments when className is absent', () => {
        render(<EuropaBadge>Plain</EuropaBadge>);
        const badge = screen.getByText('Plain');
        expect(badge.className).toBe('europa-badge');
    });

    it('renders children inside the badge', () => {
        render(<EuropaBadge>Hello</EuropaBadge>);
        expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    it('renders as a span element', () => {
        const { container } = render(<EuropaBadge>Tag</EuropaBadge>);
        const badge = container.querySelector('span');
        expect(badge).not.toBeNull();
    });
});
