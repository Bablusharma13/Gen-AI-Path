import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** True after hydration on the client; false during SSR and the hydration render. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
