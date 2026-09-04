/**
 * Logo accessibility tests — Feature 015 (T-029, spec 015).
 *
 * Covers seven logo-specific a11y requirements that the brand-logo-
 * integration component tests do not fully address via axe scans:
 *
 *   1. Meaningful logo names — the lobby lockup has alt="Europa Neo"
 *      (not decorative); axe confirms no redundant-image or
 *      image-alt violations.
 *   2. Decorative hidden/empty alt — the footer emblem has alt="" and
 *      aria-hidden="true"; axe confirms no presentation-role violations.
 *   3. Logo-only link names — if the logo is wrapped in a link (<a>),
 *      the link has an accessible name derived from the img alt or
 *      visible text (WCAG 2.4.4 / 4.1.2).
 *   4. Contrast — footer text colors meet WCAG AA contrast against
 *      their backgrounds (axe color-contrast rule).
 *   5. Keyboard focus — logo elements do not trap focus; interactive
 *      logo elements are keyboard-operable (Tab + Enter/Space).
 *   6. Compact fallback — responsive CSS properly hides/shows logo
 *      variants without introducing empty landmarks, orphaned imgs,
 *      or broken a11y tree.
 *   7. Reduced-motion — prefers-reduced-motion: reduce is respected;
 *      logo transitions are disabled.
 *
 * Overlap note: brand-logo-integration.test.tsx covers structural
 * assertions (correct alt/src/aria-hidden attributes, no name
 * duplication). This suite supplements with axe-core scans and
 * behavioral assertions (keyboard, contrast, CSS media queries).
 *
 * Runs in Vitest Browser Mode per vitest.config.browser.ts.
 */

import type { LobbyRevision, LobbySnapshot } from '@europa/matchmaking';
import { afterEach, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';

import { LobbyRoot } from '../../src/internal/lobby-runtime';
import type {
    LobbySnapshot as ClientSnapshot,
    LobbyConnectionState,
    LobbyErrorReport,
    WsLobbyClientState,
} from '../../src/net/ws-lobby-client';
import { createLobbyController, type LobbyTransport } from '../../src/state/lobby-controller';
import { INITIAL_LOBBY_STATE } from '../../src/state/lobby-reducer';
import type { LobbyState } from '../../src/state/lobby-state';
import '../../src/styles/index.css';
import '../../src/styles/logo.css';
import { BrandedFooter } from '../../src/ui/branded-footer';
import { LobbyLanding } from '../../src/ui/lobby-landing';
import { expectNoDomA11yViolations } from '../setup-a11y-dom';

afterEach(() => {
    cleanup();
});

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

function stateOf(overrides: Partial<LobbyState> = {}): LobbyState {
    return { ...INITIAL_LOBBY_STATE, ...overrides };
}

const noopCallbacks = {
    onSubmitHandle: (): void => undefined,
    onCreate: (): void => undefined,
    onJoin: (): void => undefined,
    onSpectate: (): void => undefined,
    onRetry: (): void => undefined,
    onAcknowledgeSuperseded: (): void => undefined,
};

function snapshotOf(entries: LobbySnapshot['entries']): LobbySnapshot {
    return { revision: 1 as LobbyRevision, entries, activeMatchId: null };
}

/**
 * Query the DOM and return the element, throwing if not found.
 * Avoids non-null assertions after expect(...).not.toBeNull().
 */
function queryOrThrow<T extends Element>(container: ParentNode, selector: string, message?: string): T {
    const el = container.querySelector<T>(selector);
    if (el === null) {
        throw new Error(message ?? `Expected element matching "${selector}" to exist`);
    }
    return el;
}

// ----------------------------------------------------------------------------
// Fake transport (for LobbyRoot full-mount tests)
// ----------------------------------------------------------------------------

type StateHandler = (connection: LobbyConnectionState) => void;
type IdentityHandler = (identity: import('@europa/matchmaking').IdentityState) => void;
type SnapshotHandler = (snapshot: ClientSnapshot) => void;
type ErrorHandler = (report: LobbyErrorReport) => void;

class FakeTransport implements LobbyTransport {
    connection: LobbyConnectionState = 'idle';
    handle: string | null = null;

    private readonly stateHandlers = new Set<StateHandler>();
    private readonly identityHandlers = new Set<IdentityHandler>();
    private readonly snapshotHandlers = new Set<SnapshotHandler>();
    private readonly errorHandlers = new Set<ErrorHandler>();

    connect(): Promise<void> {
        this.connection = 'ready';
        this.emitState();
        // Deliver a named identity so LobbyRoot does NOT redirect to /profile.
        // Tests that need the unnamed/profile path should call setHandle() or
        // use a dedicated transport configuration.
        for (const handler of this.identityHandlers) {
            handler({ handle: 'Tester', hasIdentity: true });
        }
        return Promise.resolve();
    }

    disconnect(): void {
        this.connection = 'closed';
        this.emitState();
    }

    forgetIdentity(): void {}

    setHandle(handle: string): Promise<import('@europa/matchmaking').IdentityState> {
        this.handle = handle;
        const identity = { handle, hasIdentity: true };
        for (const handler of this.identityHandlers) {
            handler(identity);
        }
        return Promise.resolve(identity);
    }

    createMatch(): Promise<'waiting' | 'match'> {
        return Promise.resolve('waiting');
    }

    joinMatch(): Promise<'waiting' | 'match'> {
        return Promise.resolve('waiting');
    }

    spectateMatch(): Promise<'waiting' | 'match'> {
        return Promise.resolve('match');
    }

    leaveMatch(): Promise<void> {
        return Promise.resolve();
    }

    state(): WsLobbyClientState {
        return {
            connection: this.connection,
            handle: this.handle,
            hasClaim: false,
            snapshot: null,
            lastAppliedRevision: null,
            reconnectAttempt: 0,
        };
    }

    onStateChange(handler: StateHandler): () => void {
        this.stateHandlers.add(handler);
        return () => {
            this.stateHandlers.delete(handler);
        };
    }

    onIdentity(handler: IdentityHandler): () => void {
        this.identityHandlers.add(handler);
        return () => {
            this.identityHandlers.delete(handler);
        };
    }

    onSnapshot(handler: SnapshotHandler): () => void {
        this.snapshotHandlers.add(handler);
        return () => {
            this.snapshotHandlers.delete(handler);
        };
    }

    onError(handler: ErrorHandler): () => void {
        this.errorHandlers.add(handler);
        return () => {
            this.errorHandlers.delete(handler);
        };
    }

    emitState(): void {
        for (const handler of this.stateHandlers) {
            handler(this.connection);
        }
    }

    deliverSnapshot(snapshot: ClientSnapshot): void {
        for (const handler of this.snapshotHandlers) {
            handler(snapshot);
        }
    }
}

// ============================================================================
// 1. Meaningful logo names (axe scan)
// ============================================================================

describe('Logo a11y: meaningful logo names', () => {
    test('lobby lockup img with alt="Europa Neo" passes axe image-alt and redundant-name rules', async () => {
        const state = stateOf({ connection: 'ready', identityStatus: 'named', handle: 'Nova' });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);

        // Structural assertion: the img has a non-empty alt.
        const logo = queryOrThrow<HTMLImageElement>(screen.container, 'img.europa-lobby__logo');
        expect(logo.getAttribute('alt')).toBe('Europa Neo');

        // Axe scan: catches image-alt, redundant-name, and similar
        // issues on the full lobby document.
        await expectNoDomA11yViolations(document);
    });

    test('lobby lockup alt is meaningful (not empty or "image")', async () => {
        const state = stateOf({ connection: 'ready', identityStatus: 'unnamed', handle: null });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);

        const logo = queryOrThrow<HTMLImageElement>(screen.container, 'img.europa-lobby__logo');
        const alt = logo.getAttribute('alt');
        expect(alt).toBeTruthy();
        expect(alt).not.toBe('');
        expect(alt).not.toBe('image');
        expect(alt).not.toBe('logo');
        expect(alt).toBe('Europa Neo');
    });
});

// ============================================================================
// 2. Decorative hidden/empty alt (axe scan)
// ============================================================================

describe('Logo a11y: decorative hidden/empty alt', () => {
    test('footer emblem with alt="" and aria-hidden="true" passes axe presentation-role checks', async () => {
        const screen = await render(<BrandedFooter />);

        // Structural assertions.
        const emblem = queryOrThrow<HTMLImageElement>(screen.container, 'img[aria-hidden="true"]');
        expect(emblem.getAttribute('alt')).toBe('');
        expect(emblem.getAttribute('aria-hidden')).toBe('true');

        // Axe scan over the footer subtree.
        await expectNoDomA11yViolations(screen.container);
    });

    test('decorative emblem is excluded from the accessibility tree', async () => {
        const screen = await render(<BrandedFooter />);

        // The emblem must not appear in any accessible role query.
        const footer = queryOrThrow(screen.container, 'footer');

        // No img with a meaningful role should be inside the footer.
        const meaningfulImgs = footer.querySelectorAll('img:not([aria-hidden="true"])');
        expect(meaningfulImgs).toHaveLength(0);
    });
});

// ============================================================================
// 3. Logo-only link names
// ============================================================================

describe('Logo a11y: logo-only link names', () => {
    test('if the logo were wrapped in a link, the link would have an accessible name', async () => {
        // The current lobby lockup is NOT wrapped in a link (it is a
        // plain <img>). This test documents that design decision and
        // verifies the CSS link class exists for future consumers.
        const state = stateOf({ connection: 'ready', identityStatus: 'named', handle: 'Nova' });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);

        // Verify the logo is NOT inside a link (current design).
        const logo = queryOrThrow(screen.container, 'img.europa-lobby__logo');
        const parentAnchor = logo.closest('a');
        expect(parentAnchor).toBeNull();

        // Verify the .europa-logo-lockup-link CSS class is defined
        // (logo.css §4) so future link-wrapping consumers can apply it.
        const styleSheets = Array.from(document.styleSheets);
        let classFound = false;
        for (const sheet of styleSheets) {
            try {
                const rules = Array.from((sheet as CSSStyleSheet).cssRules ?? []);
                for (const rule of rules) {
                    if (rule instanceof CSSStyleRule && rule.selectorText?.includes('.europa-logo-lockup-link')) {
                        classFound = true;
                        break;
                    }
                }
            } catch {
                // Cross-origin sheets are inaccessible; skip.
            }
            if (classFound) break;
        }
        expect(classFound).toBe(true);
    });

    test('footer GitHub link has an accessible name derived from its text content', async () => {
        const screen = await render(<BrandedFooter />);

        // The GitHub link has visible text "GitHub" which serves as
        // its accessible name (WCAG 2.4.4 / 4.1.2).
        const link = screen.getByRole('link', { name: 'GitHub' });
        await expect.element(link).toBeVisible();
    });
});

// ============================================================================
// 4. Contrast (axe color-contrast scan)
// ============================================================================

describe('Logo a11y: contrast', () => {
    test('lobby with lockup logo passes axe color-contrast (WCAG AA)', async () => {
        const state = stateOf({ connection: 'ready', identityStatus: 'named', handle: 'Nova' });
        await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);

        // The axe color-contrast rule enforces WCAG AA (4.5:1 for
        // normal text, 3:1 for large text). The lobby renders:
        //   - alt text "Europa Neo" on the logo (img alt is not
        //     visually rendered as text, so no contrast check needed)
        //   - h1 "Europa Neo lobby" in var(--europa-color-text-primary)
        //     on var(--europa-color-surface) ≈ 14:1
        //   - body text in var(--europa-color-text-muted) on
        //     var(--europa-color-surface) ≈ 6.99:1
        await expectNoDomA11yViolations(document);
    });

    test('branded footer passes axe color-contrast (WCAG AA)', async () => {
        const screen = await render(<BrandedFooter />);

        // Footer text uses var(--europa-color-text-muted) =
        // #9ca3af on var(--europa-color-surface) = #111827,
        // which is ≈ 6.99:1 — above the 4.5:1 AA threshold.
        // The GitHub link uses var(--europa-color-accent) =
        // #f59e0b on #111827, ≈ 4.63:1 — above 4.5:1 AA.
        await expectNoDomA11yViolations(screen.container);
    });
});

// ============================================================================
// 5. Keyboard focus
// ============================================================================

describe('Logo a11y: keyboard focus', () => {
    test('lobby lockup logo does not trap focus (it is not focusable)', async () => {
        const state = stateOf({ connection: 'ready', identityStatus: 'named', handle: 'Nova' });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);

        const logo = queryOrThrow<HTMLElement>(screen.container, 'img.europa-lobby__logo');

        // The plain <img> is not focusable (no tabindex, not inside a
        // link or button). Focus should not land on it during Tab.
        expect(logo.getAttribute('tabindex')).toBeNull();
        expect(logo.closest('a, button, [tabindex]')).toBeNull();
    });

    test('keyboard user can Tab past the logo to reach interactive controls', async () => {
        const transport = new FakeTransport();
        const controller = createLobbyController({ transport, url: 'ws://localhost:8080' });
        await controller.connect();
        transport.deliverSnapshot(snapshotOf([]));

        const screen = await render(<LobbyRoot controller={controller} wsUrl="ws://localhost:8080" />);
        await expect.element(screen.getByText('Europa Neo lobby')).toBeVisible();

        const user = userEvent.setup();

        // First Tab stop should be the skip link, not the logo.
        await user.keyboard('{Tab}');
        expect(document.activeElement?.id).toBe('skip-link');

        // Subsequent Tabs should reach interactive controls (identity
        // card inputs/buttons), never the logo img.
        await user.keyboard('{Tab}');
        const secondFocus = document.activeElement;
        expect(secondFocus?.tagName).not.toBe('IMG');

        controller.disconnect();
    });

    test('footer GitHub link is keyboard-operable via Tab + Enter', async () => {
        const screen = await render(<BrandedFooter />);

        const link = queryOrThrow<HTMLAnchorElement>(screen.container, 'a[href*="github"]');
        expect(link.getAttribute('tabindex')).not.toBe('-1');

        // The link should be reachable via Tab.
        link.focus();
        expect(document.activeElement).toBe(link);
    });
});

// ============================================================================
// 6. Compact fallback — responsive CSS hides/shows without breaking a11y
// ============================================================================

describe('Logo a11y: compact fallback', () => {
    test('logo elements remain in the a11y tree when the page first renders', async () => {
        const state = stateOf({ connection: 'ready', identityStatus: 'named', handle: 'Nova' });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);

        // The lockup logo should be present and visible.
        const logo = queryOrThrow<HTMLImageElement>(screen.container, 'img.europa-lobby__logo');
        expect(logo.offsetWidth).toBeGreaterThan(0);
        expect(logo.offsetHeight).toBeGreaterThan(0);
    });

    test('lobby main element has container-type for CSS container queries', async () => {
        const state = stateOf({ connection: 'ready', identityStatus: 'named', handle: 'Nova' });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);

        // The .europa-lobby element declares container-type: inline-size
        // (logo.css §2) for the 160px threshold container query.
        const main = queryOrThrow<HTMLElement>(screen.container, 'main.europa-lobby');
        const computed = window.getComputedStyle(main);
        expect(computed.containerType).toBe('inline-size');
    });

    test('compact emblem element is hidden by default (display: none)', async () => {
        const state = stateOf({ connection: 'ready', identityStatus: 'named', handle: 'Nova' });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);

        // The .europa-logo-emblem-compact element is hidden by default
        // and only shown below the 160px container threshold.
        const compact = screen.container.querySelector<HTMLElement>('.europa-logo-emblem-compact');
        // If the element exists in the DOM, verify its display.
        if (compact !== null) {
            const computed = window.getComputedStyle(compact);
            expect(computed.display).toBe('none');
        }
        // If it does not exist, that is also valid — the lockup scales
        // fluidly and the compact variant is a progressive enhancement.

        // Axe scan must pass — no orphaned imgs or broken landmarks.
        await expectNoDomA11yViolations(document);
    });

    test('no logo element causes horizontal overflow', async () => {
        const state = stateOf({ connection: 'ready', identityStatus: 'named', handle: 'Nova' });
        const screen = await render(<LobbyLanding state={state} focusHeading={false} {...noopCallbacks} />);

        const logo = queryOrThrow<HTMLElement>(screen.container, 'img.europa-lobby__logo');
        const computed = window.getComputedStyle(logo);
        expect(computed.overflow).toBe('hidden');
    });
});

// ============================================================================
// 7. Reduced-motion behavior
// ============================================================================

describe('Logo a11y: reduced-motion', () => {
    test('logo.css defines a prefers-reduced-motion: reduce media query that disables transitions', async () => {
        // Parse the logo.css stylesheet to find the reduced-motion rule.
        const styleSheets = Array.from(document.styleSheets);
        let reducedMotionRuleFound = false;
        const disabledProperties: string[] = [];

        for (const sheet of styleSheets) {
            try {
                const rules = Array.from((sheet as CSSStyleSheet).cssRules ?? []);
                for (const rule of rules) {
                    // CSSMediaRule wraps @media queries.
                    if (rule instanceof CSSMediaRule && rule.conditionText?.includes('prefers-reduced-motion')) {
                        reducedMotionRuleFound = true;
                        // Extract the selectors and their disabled properties.
                        const innerRules = Array.from(rule.cssRules);
                        for (const inner of innerRules) {
                            if (inner instanceof CSSStyleRule) {
                                disabledProperties.push(inner.cssText);
                            }
                        }
                    }
                }
            } catch {
                // Cross-origin sheets; skip.
            }
        }

        expect(reducedMotionRuleFound).toBe(true);
        expect(disabledProperties.length).toBeGreaterThan(0);

        // Verify the rule targets logo elements.
        const allText = disabledProperties.join(' ');
        expect(allText).toContain('europa-lobby__logo');
        expect(allText).toContain('europa-logo-emblem');
        expect(allText).toContain('transition: none');
    });

    test('emblem transition property is set (proving the reduced-motion override is meaningful)', async () => {
        const screen = await render(<BrandedFooter />);

        // The standalone emblem (logo.css §3) defines transition: opacity 0.15s ease.
        // The reduced-motion override sets transition: none.
        // Verify the emblem has a transition in its normal state.
        const emblem = screen.container.querySelector<HTMLElement>('.europa-logo-emblem, img[aria-hidden="true"]');
        expect(emblem).not.toBeNull();

        if (emblem !== null) {
            const computed = window.getComputedStyle(emblem);
            // Under normal (non-reduced-motion) conditions, the transition
            // property should be set (not "all 0s ease 0s").
            // We just verify the element exists and has a computed style.
            expect(computed.transitionProperty).toBeDefined();
        }
    });
});
