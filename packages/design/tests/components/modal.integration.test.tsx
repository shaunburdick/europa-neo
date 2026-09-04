/**
 * Integration tests for EuropaModal React component (spec 014, FR-011 / FR-028).
 *
 * These tests verify cross-cutting modal behaviors that go beyond
 * structural rendering. Basic open/close, Escape, backdrop, a11y,
 * and body rendering tests live in modal.test.tsx and are not
 * duplicated here.
 *
 * Focus-trap integration (Tab/Shift+Tab cycling, focus restore) requires
 * real browser focus management and is covered by the browser-mode suite.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EuropaModal } from '../../src/components/generic/modal.js';

describe('EuropaModal (integration)', () => {
    it('renders actions slot content', () => {
        render(
            <EuropaModal open title="Test" actions={<button type="button">OK</button>}>
                Content
            </EuropaModal>,
        );
        expect(screen.getByText('OK')).not.toBeNull();
    });
});
