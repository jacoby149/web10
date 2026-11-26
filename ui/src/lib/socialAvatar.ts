import type { V3Client, V3Document } from 'web10-npm';

type AvatarClient = Pick<V3Client, 'state' | 'listMedia' | 'getMediaReadUrl'>;

function imageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    if (url.username || url.password) return;
    if (url.protocol === 'https:' || (url.protocol === 'http:' && location.protocol === 'http:')) return url.href;
  } catch { /* malformed legacy URL */ }
}

export async function readSocialAvatar(
  client: AvatarClient, username: string, provider: string | undefined, owns: () => boolean, signal: AbortSignal,
) {
  // Public profile discovery needs no Hub app grant. Deliberately send no
  // token or cookies; the node still enforces the group's public read policy.
  const api = new URL(client.state.apiOrigin);
  // Social's legacy local provider marker resolves to the configured node.
  const node = !provider || provider === 'web10' ? api.host : provider;
  const group = `${node}/groups/users/${username}/followers`;
  console.log('[auth-ui] public avatar profile read started');
  const response = await fetch(new URL('/v3/read', api), {
    method: 'POST', credentials: 'omit', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service: 'profile', groups: [group] }),
  });
  if (!response.ok) return;
  const docs: V3Document[] = await response.json();
  if (!owns() || !Array.isArray(docs)) return;
  const latest = docs.reduce<V3Document | undefined>((winner, doc) =>
    doc?.author_key === username && (!winner || (doc.updated_at ?? '') > (winner.updated_at ?? '')) ? doc : winner,
  undefined);
  const ref = latest?.body?.avatar_ref;
  console.log('[auth-ui] public avatar profile read finished', { hasAvatar: typeof ref === 'string' && !!ref });
  if (typeof ref !== 'string' || !ref) return;

  // Media lookup and signing are the existing owner-only SDK operations.
  const docsByRef = await client.listMedia({ doc_ids: [ref], limit: 1 });
  if (!owns()) return;
  const media = docsByRef.find(doc => doc.doc_id === ref && doc.author_key === username)?.body;
  if (!media || (typeof media.mime_type === 'string' && !media.mime_type.startsWith('image/'))) return;
  if (typeof media.object_key === 'string' && media.object_key) {
    const { read_url } = await client.getMediaReadUrl(media.object_key);
    if (owns()) console.log('[auth-ui] avatar media resolved');
    return owns() ? imageUrl(read_url) : undefined;
  }
  return imageUrl(media.url);
}
