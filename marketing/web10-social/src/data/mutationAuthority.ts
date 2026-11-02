import { useEffect, useState } from 'react';
import { getV3Client } from './v3';
import { matchesActingAuthor } from './actingIdentity';

export interface MutationAuthority { canEdit: boolean; canDelete: boolean }
const denied: MutationAuthority = { canEdit: false, canDelete: false };

/** Affordances only. The node independently checks the live grant on every write. */
export async function readMutationAuthority(author: string | undefined, service: string): Promise<MutationAuthority> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token || !author) return denied;
  if (!author.includes('/groups/')) {
    const own = matchesActingAuthor(author, token.username, null);
    return { canEdit: own, canDelete: own };
  }
  try {
    const group = await w.getGroup(author);
    const role = group.roles?.find((role) => role.name === group.my_role);
    const permissions = role?.permissions as Record<string, string[]> | undefined;
    const allows = (op: string) => !!(permissions?.[service]?.includes(op) || permissions?.['*']?.includes(op));
    console.log('[social-mutation] authority resolved', { service });
    return { canEdit: allows('updateOwn'), canDelete: allows('deleteOwn') };
  } catch (error) {
    console.error('[social-mutation] authority read failed, denying controls', error);
    return denied;
  }
}

export function useMutationAuthority(author: string | undefined, service: string, refresh?: unknown): MutationAuthority {
  const token = getV3Client().readToken();
  const account = token ? `${token.provider}:${token.username}` : '';
  const key = `${account}:${author}:${service}`;
  const [resolved, setResolved] = useState<{ key: string; authority: MutationAuthority }>();
  useEffect(() => {
    let active = true;
    let generation = 0;
    const load = () => {
      const request = ++generation;
      setResolved(undefined);
      void readMutationAuthority(author, service).then((authority) => {
        if (active && request === generation) setResolved({ key, authority });
      });
    };
    load();
    window.addEventListener('focus', load);
    return () => { active = false; window.removeEventListener('focus', load); };
  }, [key, author, service, refresh]);
  if (token && !author?.includes('/groups/')) {
    const own = matchesActingAuthor(author, token.username, null);
    return { canEdit: own, canDelete: own };
  }
  return resolved?.key === key ? resolved.authority : denied;
}
