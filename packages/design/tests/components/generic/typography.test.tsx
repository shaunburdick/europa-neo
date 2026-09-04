import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaTypography } from '../../../src/components/generic/typography.js';

describe('EuropaTypography', () => {
    it('renders a <p> with the body modifier by default', () => {
        render(<EuropaTypography>Some prose.</EuropaTypography>);
        const el = screen.getByText('Some prose.');
        expect(el.tagName).toBe('P');
        expect(el).toHaveClass('europa-typography', 'europa-typography--body');
    });

    it('renders an <h2> with the heading modifier', () => {
        render(<EuropaTypography variant="heading">Combat</EuropaTypography>);
        const el = screen.getByText('Combat');
        expect(el.tagName).toBe('H2');
        expect(el).toHaveClass('europa-typography', 'europa-typography--heading');
    });

    it('renders an <h3> with the subheading modifier', () => {
        render(<EuropaTypography variant="subheading">Details</EuropaTypography>);
        const el = screen.getByText('Details');
        expect(el.tagName).toBe('H3');
        expect(el).toHaveClass('europa-typography', 'europa-typography--subheading');
    });

    it('renders a <span> with the label modifier', () => {
        render(<EuropaTypography variant="label">Status</EuropaTypography>);
        const el = screen.getByText('Status');
        expect(el.tagName).toBe('SPAN');
        expect(el).toHaveClass('europa-typography', 'europa-typography--label');
    });

    it('renders a <span> with the caption modifier', () => {
        render(<EuropaTypography variant="caption">Note</EuropaTypography>);
        const el = screen.getByText('Note');
        expect(el.tagName).toBe('SPAN');
        expect(el).toHaveClass('europa-typography', 'europa-typography--caption');
    });
});
