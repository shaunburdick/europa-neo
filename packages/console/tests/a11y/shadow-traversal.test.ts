/**
 * Shadow-DOM traversal canary for the a11y suite.
 *
 * The suite's zero-violation assertions are only meaningful if axe
 * actually sees **inside** the open shadow roots where all converted
 * `@europa/design` generic components render their internals (button,
 * card, modal, banner, … — see the issue-49 Shadow DOM conversion).
 * axe-core ≥ 4 traverses open shadow roots by default, but that
 * behavior is not configurable, not obvious from the helper, and
 * could change in a future axe-core upgrade — which would make every
 * `expectNoDomA11yViolations` call silently blind to component
 * internals while still passing.
 *
 * This suite pins the guarantee with a canary built on the REAL
 * `<europa-button>`:
 *
 *  1. An unlabeled instance renders a native `<button>` inside its
 *     shadow root with no accessible name — axe MUST report a
 *     `button-name` violation whose target selector pierces the
 *     shadow boundary (multi-segment target: host, then internal
 *     element). If axe ever stops traversing shadow roots, the host
 *     itself has no violation (it is not a button) and this test
 *     fails loudly instead of the suite silently losing coverage.
 *  2. The same component with a light-DOM text label (projected
 *     through the slot) produces ZERO violations — proving the scan
 *     is not merely skipping shadow content globally and that the
 *     accessible-name path through `<slot>` projection resolves.
 *
 * Both runs use the exact tag set enforced by
 * {@link expectNoDomA11yViolations}, exported as {@link AXE_TAGS}.
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import axe from 'axe-core';
import { afterEach, describe, expect, test } from 'vitest';

import { AXE_TAGS } from '../setup-a11y-dom';

afterEach(() => {
    document.body.innerHTML = '';
});

describe('axe shadow-DOM traversal (issue-49 conversion guard)', () => {
    test('an unlabeled europa-button yields a button-name violation INSIDE its shadow root', async () => {
        document.body.innerHTML = '';
        const host = document.createElement('europa-button');
        // No light-DOM children and no aria-label: the internal shadow
        // <button class="europa-button"><slot></slot></button> has no
        // accessible name.
        document.body.appendChild(host);

        const results = await axe.run(document, { runOnly: { type: 'tag', values: [...AXE_TAGS] } });
        const buttonViolation = results.violations.find((violation) => violation.id === 'button-name');

        // LOAD-BEARING: the violation must exist at all. If axe-core stops
        // traversing open shadow roots by default, this fails and whoever
        // upgrades axe knows the a11y suite's coverage model changed.
        expect(buttonViolation, 'axe must see the unnamed button inside the shadow root').toBeDefined();

        // The offending node must be the shadow-internal button, not
        // something in the light DOM: axe reports shadow-piercing targets
        // as a nested array ([["europa-button", "button"]]) — the inner
        // array is the path within the shadow root. A light-DOM-only
        // violation would carry flat string segments (["button"]).
        const shadowNode = buttonViolation?.nodes.find((node) => node.target.some((segment) => Array.isArray(segment)));
        expect(
            shadowNode,
            `expected a shadow-piercing target, got: ${JSON.stringify(buttonViolation?.nodes.map((node) => node.target))}`,
        ).toBeDefined();
    });

    test('the same component with a light-DOM text label scans clean', async () => {
        document.body.innerHTML = '';
        const host = document.createElement('europa-button');
        host.textContent = 'Deploy';
        document.body.appendChild(host);

        const results = await axe.run(document, { runOnly: { type: 'tag', values: [...AXE_TAGS] } });

        expect(results.violations).toEqual([]);
    });
});
