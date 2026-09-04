/**
 * App — main layout component for the Unified Design System Dev Page.
 *
 * Wires together the sidebar navigation, hash-based routing, and all
 * section components (foundations, generic components, game primitives).
 *
 * On mount and hash changes, scrolls the active section into view with
 * smooth scrolling for a polished navigation experience.
 *
 * Layout: a sticky sidebar on the left + a scrollable content area on the
 * right. On mobile, the sidebar collapses into a hamburger drawer (handled
 * by the Sidebar component itself).
 *
 * All styling inherits from shell.css using `var(--europa-*)` tokens —
 * zero hardcoded hex/rgb literals.
 *
 * @see dev/components/Sidebar.tsx — navigation sidebar
 * @see dev/hooks/useHashRoute.ts — hash fragment tracking
 * @see dev/lib/sections.ts — section registry
 * @see dev/styles/shell.css — `.dev-layout`, `.dev-content`, `.dev-divider`
 */

import type React from 'react';
import { useEffect, useRef } from 'react';
import { useHashRoute } from '../hooks/useHashRoute';
import { BadgeDemo } from './components/BadgeDemo';
import { BannerDemo } from './components/BannerDemo';
import { ButtonDemo } from './components/ButtonDemo';
import { CardDemo } from './components/CardDemo';
import { ChipDemo } from './components/ChipDemo';
import { CityMarkerDemo } from './components/CityMarkerDemo';
import { ContainerDemo } from './components/ContainerDemo';
import { ElevationSwatchDemo } from './components/ElevationSwatchDemo';
import { FogOverlayDemo } from './components/FogOverlayDemo';
import { GridDemo } from './components/GridDemo';
import { ModalDemo } from './components/ModalDemo';
// -- Generic Components ------------------------------------------------------
import { PageDemo } from './components/PageDemo';
import { PipeSlopeDemo } from './components/PipeSlopeDemo';
import { PlateDemo } from './components/PlateDemo';
import { PlayerBadgeDemo } from './components/PlayerBadgeDemo';
import { ReserveIndicatorDemo } from './components/ReserveIndicatorDemo';
import { StackDemo } from './components/StackDemo';
import { TokenColorReference } from './components/TokenColorReference';
// -- Game Primitives ---------------------------------------------------------
import { TroopChipDemo } from './components/TroopChipDemo';
import { TypographyComponentDemo } from './components/TypographyComponentDemo';
import { WaitingDemo } from './components/WaitingDemo';
import { A11yPairings } from './foundations/A11yPairings';
// -- Foundations -------------------------------------------------------------
import { ColorSwatches } from './foundations/ColorSwatches';
import { SpacingBorders } from './foundations/SpacingBorders';
import { TokenReference } from './foundations/TokenTable';
import { TypographyScale } from './foundations/TypographyScale';
import { Sidebar } from './Sidebar';

// ---------------------------------------------------------------------------
// Section count: 5 foundations + 13 generic components + 8 game primitives
//                 = 26 section components total
// ---------------------------------------------------------------------------

/**
 * Main application layout for the design system dev page.
 *
 * Renders a sticky sidebar alongside a scrollable content area containing
 * all section components. Uses the `useHashRoute` hook to track the active
 * hash and scroll the corresponding section into view on navigation.
 *
 * @returns The complete dev page layout with sidebar + content.
 */
export function App(): React.ReactElement {
    const hash = useHashRoute();
    const contentRef = useRef<HTMLDivElement>(null);

    // Scroll to active section on hash change (including initial mount).
    useEffect(() => {
        if (hash) {
            const el = document.getElementById(hash);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }, [hash]);

    return (
        <div className="dev-layout">
            <Sidebar />
            <main className="dev-content" ref={contentRef}>
                {/* -- Foundations ---------------------------------------- */}
                <ColorSwatches />
                <TypographyScale />
                <SpacingBorders />
                <A11yPairings />
                <TokenReference />

                <hr className="dev-divider" />

                {/* -- Generic Components --------------------------------- */}
                <PageDemo />
                <CardDemo />
                <PlateDemo />
                <StackDemo />
                <ContainerDemo />
                <BadgeDemo />
                <GridDemo />
                <BannerDemo />
                <ChipDemo />
                <TypographyComponentDemo />
                <WaitingDemo />
                <ButtonDemo />
                <ModalDemo />

                <hr className="dev-divider" />

                {/* -- Game Primitives ------------------------------------ */}
                <TroopChipDemo />
                <CityMarkerDemo />
                <PipeSlopeDemo />
                <ElevationSwatchDemo />
                <PlayerBadgeDemo />
                <FogOverlayDemo />
                <ReserveIndicatorDemo />
                <TokenColorReference />
            </main>
        </div>
    );
}
