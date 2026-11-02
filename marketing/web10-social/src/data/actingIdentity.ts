import { useSyncExternalStore } from 'react';
import { getV3Client } from './v3';

const listeners = new Set<() => void>();
function storageKey() {
  const token = getV3Client().readToken();
  return token ? `social:acting:${token.provider}:${token.username}` : null;
}

/** A tab-local choice, never a token or proof of authorization. */
export function getActingAuthor(): string | undefined {
  const key = storageKey();
  if (!key) return undefined;
  try { return sessionStorage.getItem(key) || undefined; } catch { return undefined; }
}

export function selectActingAuthor(author?: string) {
  const key = storageKey();
  if (!key) return;
  if (author) sessionStorage.setItem(key, author);
  else sessionStorage.removeItem(key);
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
  if (!groups.length) throw new Error('This identity has no posting destinations. Add it to a group first.');
  return groups.map((group) => group.group_id);
}
