import { useSyncExternalStore } from 'react';

const never = () => () => {};

/**
 * False while React is hydrating the pre-rendered HTML (and while that HTML is being rendered at
 * build time), true on every other render: later renders of the same component, screens opened by
 * client navigation, and always on iOS and Android.
 *
 * The first client render has to produce exactly the pre-rendered HTML or React discards it (error
 * #418), so anything the build can't know (saved state, the window size, the clock) must wait for
 * this. A module-level "has hydrated" flag is not enough: the page hydrates in pieces (the shell
 * first, each route inside its own Suspense boundary later), and a flag flipped by the first piece
 * would let the later ones render client-only values against the HTML. React answers per component.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(never, () => true, () => false);
}
