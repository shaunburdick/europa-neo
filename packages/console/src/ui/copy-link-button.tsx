/**
 * Copy-link button — issue #34 (T-034-01).
 *
 * A reusable "Copy link" affordance for the match waiting/live UI
 * (FR-028). Writes the canonical `/match/<matchId>` URL to the
 * clipboard and shows a brief confirmation. Two visual treatments:
 *
 *   - **prominent**: full button with icon + "Copy link" text —
 *     intended for private matches where the link is the only entry
 *     path and must be unmissable;
 *   - **subtle**: icon-only button with `aria-label` — for public
 *     matches where the lobby listing is also an entry path.
 *
 * Clipboard fallback (D6): uses `navigator.clipboard.writeText()`
 * first; on failure (insecure context, permissions denied), renders
 * the URL as selectable text in a temporary element so the user can
 * copy it manually. The action MUST NOT silently fail (FR-028 edge
 * case).
 *
 * Accessibility: keyboard-accessible `<button>` with `aria-label`,
 * Enter/Space activation, and optional `onCopyResult` callback for
 * live-region integration (WCAG 2.2 AA, FR-028 / FR-016).
 */

import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/** Match visibility — drives the visual treatment. */
export type MatchVisibility = 'public' | 'private';

/** Visual variant of the copy-link button. */
export type CopyLinkVariant = 'prominent' | 'subtle';

/** Result of a copy attempt, passed to the optional callback. */
export interface CopyLinkResult {
    /** Whether the clipboard write succeeded. */
    readonly ok: boolean;
    /** The URL that was (or should be) copied. */
    readonly url: string;
}

/** Props for {@link CopyLinkButton}. */
export interface CopyLinkButtonProps {
    /** The match ID used to construct the canonical URL. */
    readonly matchId: string;
    /** Match visibility — drives variant default and aria-label phrasing. */
    readonly visibility: MatchVisibility;
    /** Visual treatment. Defaults to `'subtle'` for public, `'prominent'` for private. */
    readonly variant?: CopyLinkVariant | undefined;
    /** Optional callback for live-region integration (announce success/failure). */
    readonly onCopyResult?: ((result: CopyLinkResult) => void) | undefined;
}

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

/** How long the "Copied!" confirmation is shown (ms). */
const CONFIRMATION_DURATION_MS = 2_000;

// ----------------------------------------------------------------------------
// Clipboard helper
// ----------------------------------------------------------------------------

/**
 * Construct the canonical shareable match URL from the current origin.
 *
 * Uses `window.location.origin` at call time so the URL is always
 * correct for the current browser context (D1 from the plan). For
 * self-hosted setups behind a reverse proxy, the browser's origin is
 * already the correct public origin.
 *
 * @param matchId The match identifier.
 * @returns The full absolute `/match/<matchId>` URL.
 */
function buildShareableUrl(matchId: string): string {
    return `${window.location.origin}/match/${encodeURIComponent(matchId)}`;
}

/**
 * Attempt to copy the shareable URL to the clipboard.
 *
 * Uses `navigator.clipboard.writeText()` first. On failure, falls
 * back to selecting text from a temporary hidden input (D6).
 *
 * @param url The URL to copy.
 * @returns `{ ok: true }` on clipboard success, `{ ok: false, url }` on
 *          failure (the caller should show the URL as a fallback).
 */
async function copyToClipboard(url: string): Promise<{ readonly ok: boolean; readonly url: string }> {
    try {
        await navigator.clipboard.writeText(url);
        return { ok: true, url };
    } catch {
        return { ok: false, url };
    }
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

/**
 * A "Copy link" button for the match waiting/live UI.
 *
 * Renders a `<button>` that copies the canonical `/match/<matchId>`
 * URL to the clipboard and shows a brief "Copied!" confirmation.
 *
 * @example
 * ```tsx
 * <CopyLinkButton
 *     matchId="abc-123"
 *     visibility="private"
 *     variant="prominent"
 *     onCopyResult={(r) => announcer.announce(r.ok ? 'Link copied.' : 'Copy failed.', 'polite')}
 * />
 * ```
 */
export function CopyLinkButton({ matchId, visibility, variant, onCopyResult }: CopyLinkButtonProps): JSX.Element {
    const resolvedVariant: CopyLinkVariant = variant ?? (visibility === 'private' ? 'prominent' : 'subtle');

    const [copied, setCopied] = useState(false);
    const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cleanup timeout on unmount.
    useEffect(() => {
        return () => {
            if (timeoutRef.current !== null) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const handleClick = useCallback(async () => {
        const url = buildShareableUrl(matchId);
        const result = await copyToClipboard(url);

        if (result.ok) {
            setCopied(true);
            setFallbackUrl(null);
            if (timeoutRef.current !== null) {
                clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout(() => {
                setCopied(false);
                timeoutRef.current = null;
            }, CONFIRMATION_DURATION_MS);
        } else {
            // Clipboard failed — show the URL as selectable fallback text.
            setFallbackUrl(result.url);
            setCopied(false);
        }

        onCopyResult?.({ ok: result.ok, url: result.url });
    }, [matchId, onCopyResult]);

    const ariaLabel =
        resolvedVariant === 'subtle'
            ? `Copy match link for ${matchId.slice(0, 8)}…`
            : `Copy link for match ${matchId.slice(0, 8)}…`;

    if (resolvedVariant === 'prominent') {
        return (
            <div className="europa-copy-link" data-europa-copy-link="prominent">
                <button
                    type="button"
                    className="europa-lobby__button europa-focus-ring europa-copy-link__button"
                    aria-label={ariaLabel}
                    onClick={handleClick}
                    data-europa-copy-link-button="true"
                >
                    {copied ? '✓ Copied!' : '🔗 Copy link'}
                </button>
                {fallbackUrl !== null ? (
                    <div className="europa-copy-link__fallback" role="status" aria-live="polite">
                        <span className="europa-copy-link__fallback-label">Copy this link:</span>
                        <input
                            type="text"
                            className="europa-copy-link__fallback-input europa-focus-ring"
                            value={fallbackUrl}
                            readOnly
                            onFocus={(e) => {
                                e.currentTarget.select();
                            }}
                            aria-label="Shareable match link"
                        />
                    </div>
                ) : null}
            </div>
        );
    }

    // Subtle variant: icon-only with aria-label.
    return (
        <div className="europa-copy-link" data-europa-copy-link="subtle">
            <button
                type="button"
                className="europa-lobby__button europa-focus-ring europa-copy-link__button europa-copy-link__button--subtle"
                aria-label={ariaLabel}
                onClick={handleClick}
                data-europa-copy-link-button="true"
            >
                {copied ? '✓' : '🔗'}
            </button>
            {copied ? (
                <span className="europa-copy-link__confirm" role="status" aria-live="polite">
                    Copied!
                </span>
            ) : null}
            {fallbackUrl !== null ? (
                <div className="europa-copy-link__fallback" role="status" aria-live="polite">
                    <span className="europa-copy-link__fallback-label">Copy this link:</span>
                    <input
                        type="text"
                        className="europa-copy-link__fallback-input europa-focus-ring"
                        value={fallbackUrl}
                        readOnly
                        onFocus={(e) => {
                            e.currentTarget.select();
                        }}
                        aria-label="Shareable match link"
                    />
                </div>
            ) : null}
        </div>
    );
}
