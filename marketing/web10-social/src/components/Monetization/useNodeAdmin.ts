import { useEffect, useState } from 'react';
import { checkNodeAdmin } from '@/data/ads-catalog';

/**
 * Node-admin detection (D75). Calls `POST /am_admin` once per session and
 * caches the result. `true` only when the current user is the node admin —
 * that gates the "Node Monetization" nav icon + the Node section of the
 * Monetization surface. `false` on no token / failure (the Node surface stays
 * hidden). The check is debounced + cached so it doesn't re-fire on every
 * render.
 */
export function useNodeAdmin(): { isAdmin: boolean; loading: boolean } {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    // Debounce: collapse the burst into one call.
    const timer = setTimeout(() => {
      checkNodeAdmin()
        .then((admin) => {
          if (!cancelled) setIsAdmin(admin);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return { isAdmin, loading };
}
