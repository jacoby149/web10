import { getV3Client } from './v3';
import { followersGroupId } from './groups';
import { peopleFaceSql } from '@web10/discover/face';

export interface MentionPerson {
  username: string;
  displayName: string;
  avatarUrl?: string;
}

/** Search the readable directory, without the global-search first-50 pool cap. */
export async function searchMentionPeople(query: string, signal: AbortSignal, onProgress: (people: MentionPerson[]) => void): Promise<MentionPerson[]> {
  const w = getV3Client();
  const provider = w.readToken()?.provider;
  if (!provider) return [];
  const q = query.toLowerCase();
  const people: MentionPerson[] = [];
  const seen = new Set<string>();
  console.log('[mentions] directory search start');
  for (let offset = 0; !signal.aborted; offset += 100) {
    const page = await w.listPeopleDirectory({ limit: 100, offset });
    if (signal.aborted) return [];
    let added = 0;
    for (const user of page.users) {
      if (seen.has(user.username)) continue;
      seen.add(user.username); added++;
      const profile = user.profile as Record<string, unknown> | undefined;
      const name = typeof profile?.display_name === 'string' ? profile.display_name : user.username;
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(user.username)) continue;
      if (!q || user.username.toLowerCase().includes(q) || name.toLowerCase().includes(q)) {
        people.push({ username: user.username, displayName: name });
      }
    }
    if (people.length >= 6 || page.users.length < 100 || !added) break;
  }
  if (signal.aborted) return [];
  const rank = (p: MentionPerson) => p.username.toLowerCase() === q ? 0 : p.username.toLowerCase().startsWith(q) ? 1 : 2;
  const rows = people.sort((a, b) => rank(a) - rank(b)).slice(0, 6);
  onProgress(rows);
  console.log('[mentions] directory results ready:', rows.length);
  if (!rows.length) return rows;
  // Optional avatar batch never holds names/handles behind media resolution.
  try {
    const faces = await w.query(peopleFaceSql(rows.map(p => p.username)), {
      groups: rows.map(p => followersGroupId(p.username, provider)),
      prepare: { face: { bodyField: 'body', mediaField: 'avatar_ref', urlField: 'avatar_url' } },
    });
    if (signal.aborted) return rows;
    const urls = new Map(faces.rows.map(row => [row.author_key, row.avatar_url]));
    const enriched = rows.map(person => ({ ...person, avatarUrl: typeof urls.get(person.username) === 'string' ? urls.get(person.username) as string : undefined }));
    onProgress(enriched);
    console.log('[mentions] optional avatars settled');
    return enriched;
  } catch {
    console.warn('[mentions] optional avatars unavailable; keeping directory results');
    return rows;
  }
}
