import { useEffect, useRef, useState } from 'react';

const modes = new Set(['login', 'signup', 'forgot']);
const read = () => new URLSearchParams(window.location.search).get('credential');

// URL-owned entry screens, without changing the interface's auth/consent state.
export function useCredentialEntry(I: Record<string, any>) {
  const current = useRef(I);
  current.current = I;
  const [, refreshRoute] = useState(0);
  // Read the address on every render: App may remove entry-only parameters
  // after successful auth while this consent component stays mounted.
  const routeMode = read();
  useEffect(() => {
    const sync = () => {
      const mode = read();
      refreshRoute(version => version + 1);
      current.current.setStatus?.(null);
      current.current.setMode(modes.has(mode || '') ? mode : 'login');
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  return {
    ...I,
    mode: modes.has(routeMode || '') ? routeMode : I.mode,
    setMode(mode: string) {
      if (modes.has(mode)) {
        const url = new URL(window.location.href);
        url.searchParams.set('credential', mode);
        url.searchParams.delete('signin');
        if (url.href !== window.location.href) window.history.pushState(null, '', url);
        refreshRoute(version => version + 1);
        current.current.setStatus?.(null);
        console.log('[auth-ui] credential presentation changed', { mode });
      }
      current.current.setMode(mode);
    },
  };
}
