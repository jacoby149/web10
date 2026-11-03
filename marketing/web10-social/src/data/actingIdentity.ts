import { useSyncExternalStore } from 'react';
import { getV3Client } from './v3';

const listeners = new Set<() => void>();
function storageKey() {
  const token = getV3Client().readToken();
  return token ? `social:acting:${token.provider}:${token.username}` : null;
}

/** A tab-local snapshot of an account preference, never proof of authorization. */
export function getActingAuthor(): string | undefined {
  const key = storageKey();
  if (!key) return undefined;
  try {
    let author = sessionStorage.getItem(key);
    if (author === null) {
      try { author = localStorage.getItem(key) || ''; } catch { author = ''; }
      // Snapshot personal too: another tab must not replace this tab's choice.
      sessionStorage.setItem(key, author);
    }
    return author || undefined;
  } catch { return undefined; }
}

export function selectActingAuthor(author?: string) {
  const key = storageKey();
  if (!key) return;
  sessionStorage.setItem(key, author || '');
  try { localStorage.setItem(key, author || ''); }
  catch { console.warn('[social-identity] remembered preference unavailable; keeping tab selection'); }
  console.log('[social-identity] selection changed', { group: !!author });
  for (const listener of listeners) listener();
}

export function useActingAuthor() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    getActingAuthor,
    () => undefined,
  );
}

export function matchesActingAuthor(key: string | undefined, username: string, authorAs: string | null | undefined = getActingAuthor()) {
  if (authorAs) return key === authorAs;
  // Shipped personal records may use provider/username. Never collapse a group ID.
  return !!key && !key.includes('/groups/') && key.split('/').pop() === username;
}

export async function actingPostGroups(author: string): Promise<string[]> {
  const groups = await getV3Client().getMyGroups({ author_as: author, service: 'posts' });
  // The delegated lookup checks current create authority even with no memberships.
  return [...new Set([author, ...groups.map((group) => group.group_id)])];
}
