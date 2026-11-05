import { getV3Client, type V3Document } from './v3';
import { mentionedUsernames } from './mentions';
import type { Notification, NotificationType } from './notifications';

export type MentionNotificationType = 'post_mention' | 'comment_mention' | 'mention_reply';
export function isMentionNotification(type: NotificationType): type is MentionNotificationType {
  return type === 'post_mention' || type === 'comment_mention' || type === 'mention_reply';
}

function actor(doc: V3Document): string {
  return doc.author_key.includes('/groups/') ? doc.author_key : doc.author_key.split('/').pop() || '';
}

function event(doc: V3Document, type: MentionNotificationType, me: string): Notification | null {
  if (!doc.doc_id || !doc.author_key || actor(doc) === me || doc.posted_by === me) return null;
  return {
    id: `${type}:${doc.doc_id}`,
    type,
    from: actor(doc),
    ref_doc_id: doc.doc_id,
    created_at: doc.created_at,
    read: false,
  };
}

/** The index only selects candidates; the current readable text owns the tag. */
export async function readMentionNotifications(groups: string[], me: string): Promise<Notification[]> {
  const w = getV3Client();
  const safe = me.replace(/'/g, "''");
  const tagged = (alias: string) => `has(JSONExtract(${alias}.body, 'mention_usernames', 'Array(String)'), '${safe}')`;
  const columns = 'c.doc_id AS doc_id, c.author_key AS author_key, c.posted_by AS posted_by, c.body AS body, c.created_at AS created_at, c.ref_value AS ref_value';
  const reads: Array<[MentionNotificationType, string]> = [
    ['post_mention', `SELECT DISTINCT ${columns} FROM posts c WHERE ${tagged('c')} ORDER BY c.created_at DESC LIMIT 100`],
    ['comment_mention', `SELECT DISTINCT ${columns} FROM comments c WHERE ${tagged('c')} ORDER BY c.created_at DESC LIMIT 100`],
    ['mention_reply', `SELECT DISTINCT ${columns}, p.body AS parent_body FROM comments c JOIN comments p ON c.ref_value = p.doc_id WHERE ${tagged('p')} AND JSONExtractString(c.body, 'post_id') = JSONExtractString(p.body, 'post_id') ORDER BY c.created_at DESC LIMIT 100`],
  ];
  const batches = await Promise.all(reads.map(async ([type, sql]) => {
    console.log('[notifications] mention read starting:', type, 'groups:', groups.length);
    try {
      const result = await w.query(sql, { groups });
      const out: Notification[] = [];
      const seen = new Set<string>();
      for (const row of result.rows) {
        const doc = { ...row, body: typeof row.body === 'string' ? JSON.parse(row.body) : row.body } as unknown as V3Document;
        const body = type === 'mention_reply'
          ? (typeof row.parent_body === 'string' ? JSON.parse(row.parent_body) : row.parent_body)
          : doc.body;
        if (!mentionedUsernames(body?.text).includes(me)) continue;
        const item = event(doc, type, me);
        if (item && !seen.has(item.id)) { out.push(item); seen.add(item.id); }
      }
      console.log('[notifications] mention read complete:', type, 'events:', out.length);
      return out;
    } catch (error) {
      console.warn('[notifications] mention read unavailable:', type, error);
      return [];
    }
  }));
  return batches.flat();
}

/** Validate new live nudges against current CRUD, never the peer's supplied actor. */
export async function resolveMentionNotification(type: MentionNotificationType, id: string, me: string): Promise<Notification | null> {
  const w = getV3Client();
  try {
    const doc = await w.readById(id, type === 'post_mention' ? 'posts' : 'comments');
    let source = doc;
    if (type === 'mention_reply') {
      if (!doc.ref_value) return null;
      source = await w.readById(doc.ref_value, 'comments');
      if (source.body.post_id !== doc.body.post_id) return null;
    }
    if (!mentionedUsernames(source.body.text as string | undefined).includes(me)) return null;
    return event(doc, type, me);
  } catch {
    console.log('[notifications] mention source unavailable; ignoring nudge');
    return null;
  }
}

/** Resolve under live read authority. A tag is never a grant to the post. */
export async function resolveMentionHref(n: Notification): Promise<string | null> {
  if (!isMentionNotification(n.type) || !n.ref_doc_id) return null;
  const w = getV3Client();
  const token = w.readToken();
  const me = token?.username;
  if (!me || !await resolveMentionNotification(n.type, n.ref_doc_id, me)) return null;
  try {
    const source = await w.readById(n.ref_doc_id, n.type === 'post_mention' ? 'posts' : 'comments');
    const post = n.type === 'post_mention' ? source : await w.readById(String(source.body.post_id || ''), 'posts');
    const owner = post.author_key.includes('/groups/')
      ? `/groups/${encodeURIComponent(post.author_key)}`
      : `/u/${encodeURIComponent(actor(post))}`;
    const current = getV3Client().readToken();
    if (current?.username !== me || current?.provider !== token?.provider) return null;
    return `${owner}/p/${encodeURIComponent(post.doc_id)}${n.type === 'post_mention' ? '' : `?comment=${encodeURIComponent(source.doc_id)}`}`;
  } catch { return null; }
}
