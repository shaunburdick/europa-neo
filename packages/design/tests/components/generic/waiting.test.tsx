import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaWaiting } from '../../../src/components/generic/waiting.js';

describe('EuropaWaiting', () => {
    it('renders the waiting structure with plate, pulse, and text', () => {
        const { container } = render(<EuropaWaiting message="Waiting for opponent…" />);
        const root = container.querySelector('.europa-waiting');
        expect(root).not.toBeNull();

        const plate = root?.querySelector('.europa-waiting__plate');
        expect(plate).not.toBeNull();

        const pulse = plate?.querySelector('.europa-waiting__pulse');
        expect(pulse).not.toBeNull();

        const text = plate?.querySelector('.europa-waiting__text');
        expect(text).not.toBeNull();
        expect(text?.textContent).toBe('Waiting for opponent…');
    });

    it('marks the pulse as decorative with aria-hidden', () => {
        const { container } = render(<EuropaWaiting message="Loading…" />);
        const pulse = container.querySelector('.europa-waiting__pulse');
        expect(pulse).toHaveAttribute('aria-hidden', 'true');
    });

    it('renders the message prop as text content', () => {
        const { container } = render(<EuropaWaiting message="Connecting…" />);
        const text = container.querySelector('.europa-waiting__text');
        expect(text?.textContent).toBe('Connecting…');
    });

    it('adds the reduced-motion modifier class when reducedMotion is true', () => {
        const { container } = render(<EuropaWaiting message="Test" reducedMotion />);
        const root = container.querySelector('.europa-waiting');
        expect(root).toHaveClass('europa-waiting--reduced');
    });

    it('omits the reduced-motion modifier class by default', () => {
        const { container } = render(<EuropaWaiting message="Test" />);
        const root = container.querySelector('.europa-waiting');
        expect(root).not.toHaveClass('europa-waiting--reduced');
    });

    it('renders no slot element (message is prop-driven)', () => {
        const { container } = render(<EuropaWaiting message="Test" />);
        const slot = container.querySelector('slot');
        expect(slot).toBeNull();
    });
});
