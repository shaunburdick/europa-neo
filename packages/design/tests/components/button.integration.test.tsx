/**
 * Integration tests for EuropaButton React component (spec 014, FR-013).
 *
 * These tests verify form-level behaviors that go beyond unit-level
 * rendering: form submission, disabled submission, and form reset.
 * They run in the happy-dom node suite and assert the behaviors that
 * React's form association relies on.
 *
 * Basic click/attribute/children tests live in button.test.tsx and
 * are not duplicated here.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaButton } from '../../src/components/generic/button.js';

describe('EuropaButton (integration)', () => {
    it('form submission: type="submit" triggers form onSubmit', () => {
        let submitted = false;
        render(
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    submitted = true;
                }}
            >
                <EuropaButton type="submit">Save</EuropaButton>
            </form>,
        );
        fireEvent.click(screen.getByText('Save'));
        expect(submitted).toBe(true);
    });

    it('disabled submit button does not submit form', () => {
        let submitted = false;
        render(
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    submitted = true;
                }}
            >
                <EuropaButton type="submit" disabled>
                    Save
                </EuropaButton>
            </form>,
        );
        fireEvent.click(screen.getByText('Save'));
        expect(submitted).toBe(false);
    });

    it('reset button triggers form onReset', () => {
        let resetCount = 0;
        render(
            <form
                onReset={() => {
                    resetCount += 1;
                }}
            >
                <EuropaButton type="reset">Reset</EuropaButton>
            </form>,
        );
        fireEvent.click(screen.getByText('Reset'));
        expect(resetCount).toBe(1);
    });
});
