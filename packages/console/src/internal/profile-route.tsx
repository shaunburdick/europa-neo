/**
 * Profile route component — TanStack Router migration (issue #75).
 *
 * Thin wrapper connecting the typed `returnTo` search param from
 * TanStack Router's `validateSearch` to the existing {@link ProfileView}
 * component (feature 015, T005).
 *
 * Responsibilities:
 *   - Read `returnTo` from the route's validated search params via
 *     `useSearch`.
 *   - Access the lobby controller and state via `useLobbyLayout()`.
 *   - Project the minimal lobby-state subset that `ProfileView` requires.
 *   - Delegate handle submission to `controller.setHandle`.
 *
 * This component does NOT own any state or side-effects beyond what
 * `ProfileView` and the lobby controller already manage.
 *
 * @module
 */

import { useSearch } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useSyncExternalStore } from 'react';

import { ProfileView } from '../ui/profile-view';
import { useLobbyLayout } from './lobby-layout';

/**
 * TanStack Router route ID for the `/profile` route.
 *
 * Used by `useSearch({ from: PROFILE_ROUTE_ID })` to retrieve the
 * typed search params validated by `profileSearchParams`.
 */
const PROFILE_ROUTE_ID = '/profile' as const;

/**
 * Profile route component wired to TanStack Router.
 *
 * Reads the validated `returnTo` search param and renders the existing
 * {@link ProfileView} with lobby state and controller bindings.
 */
export function ProfileRoute(): JSX.Element {
    const { controller } = useLobbyLayout();
    const state = useSyncExternalStore(controller.store.subscribe, controller.store.getState);

    // Typed search params — the route tree's `validateSearch: profileSearchParams`
    // ensures `returnTo` is already safety-validated (relative-pathname-only).
    const search = useSearch({ from: PROFILE_ROUTE_ID });
    const returnTo: string | null = search.returnTo ?? null;

    return (
        <ProfileView
            identityStatus={state.identityStatus}
            handle={state.handle}
            connection={{ status: state.connection }}
            actionStatus={state.actions.setHandle}
            onSubmitHandle={(raw: string) => {
                void controller.setHandle(raw);
            }}
            returnTo={returnTo}
        />
    );
}
