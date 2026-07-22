import { getWapi } from './wapi';
import { API_ORIGIN } from '../lib/origins';
import type { InboxRecord, FeedSort, DiscoverSort, DiscoveryPost, PublicEntry, SchemaDefinition } from './types';

// ── Feed data layer ────────────────────────────────────────────────────────
// The feed reads from the `inbox` service (fan-out on write).
// Sort options: newest, oldest, most_reacted.
// "most_reacted" uses aggregate to count reactions per post_id.

// ── Schema registry cache ──────────────────────────────────────────────────
const schemaCache = new Map<string, SchemaDefinition>();

/**
 * Default schema definitions to register on first boot.
 */
const DEFAULT_SCHEMAS: Omit<SchemaDefinition, '_id' | 'created_at'>[] = [
  {
    name: 'Reaction',
    author_username: 'system',
    author_provider: 'web10',
    schema: {
      type: 'object',
      required: ['type', 'target'],
      properties: {
        type: { type: 'string', enum: ['like', 'comment', 'repost'] },
        target: { type: 'string', description: 'post_id or comment_id' },
        author_username: { type: 'string' },
        author_provider: { type: 'string' },
      },
    },
  },
  {
    name: 'Comment',
    author_username: 'system',
    author_provider: 'web10',
    schema: {
      type: 'object',
      required: ['text', 'target'],
      properties: {
        text: { type: 'string' },
        target: { type: 'string', description: 'post_id being commented on' },
        parent_id: { type: 'string' },
        author_username: { type: 'string' },
        author_provider: { type: 'string' },
      },
    },
  },
];

/**
 * Register default schemas with the schema registry on first boot.
 * Caches schema_id locally so subsequent calls are idempotent.
 */
export async function registerDefaultSchemas(): Promise<SchemaDefinition[]> {
  const token = getWapi().readToken();
  if (!token) return [];

  const registered: SchemaDefinition[] = [];
  for (const def of DEFAULT_SCHEMAS) {
    const cached = schemaCache.get(def.name);
    if (cached) {
      registered.push(cached);
      continue;
    }
    try {
      const resp = await fetch(`${API_ORIGIN}/schemas/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getWapi().readToken()?.site || ''}`,
        },
        body: JSON.stringify({
          name: def.name,
          schema: def.schema,
        }),
      });
      if (resp.ok) {
        const schema = await resp.json();
        schemaCache.set(def.name, schema);
        registered.push(schema);
      }
    } catch {
      // Schema registry not available yet — non-fatal
    }
  }
  return registered;
}

/**
 * Fetch a schema definition by ID from the registry.
 */
export async function fetchSchema(id: string): Promise<SchemaDefinition | null> {
  const cached = schemaCache.get(id);
  if (cached) return cached;

  try {
    const resp = await fetch(`${API_ORIGIN}/schemas/${id}`, { method: 'PATCH' });
    if (resp.ok) {
      const schema = await resp.json();
      schemaCache.set(id, schema);
      return schema;
    }
  } catch {
    // Schema registry unreachable
  }
  return null;
}

/**
 * Get a cached schema by name (after registerDefaultSchemas ran).
 */
export function getCachedSchema(name: string): SchemaDefinition | undefined {
  return schemaCache.get(name);
}

/**
 * Clear the schema cache (tests).
 */
export function clearSchemaCache(): void {
  schemaCache.clear();
}

// ── Discovery feed ─────────────────────────────────────────────────────────

/**
 * Read the discovery feed from the public discovery API.
 * sort: 'recent' for chronological, 'trending' for engagement-scored.
 */
export async function readDiscoverFeed(sort: DiscoverSort = 'recent', limit = 20): Promise<DiscoveryPost[]> {
  try {
    const resp = await fetch(
      `${API_ORIGIN}/discover/posts?sort=${sort}&limit=${limit}`,
      { method: 'PATCH' },
    );
    if (!resp.ok) return [];
    return resp.json();
  } catch {
    return [];
  }
}

// ── Public ledger ──────────────────────────────────────────────────────────

/**
 * Write a public ledger entry (e.g., a reaction or comment).
 */
export async function createPublicEntry(entry: Omit<PublicEntry, '_id'>): Promise<PublicEntry> {
  try {
    const token = getWapi().readToken();
    const resp = await fetch(`${API_ORIGIN}/public/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token?.site || ''}`,
      },
      body: JSON.stringify(entry),
    });
    if (!resp.ok) throw new Error(`public entry failed: ${resp.status}`);
    return resp.json();
  } catch (e) {
    // If the public ledger endpoint isn't available, return a stub
    return {
      _id: `local-${Date.now()}`,
      ...entry,
      created_at: new Date().toISOString(),
      author_username: getWapi().readToken()?.username,
      author_provider: getWapi().readToken()?.provider,
    };
  }
}

/**
 * Query public ledger entries by schema_id and/or target.
 */
export async function queryPublicEntries(params: {
  schema_id?: string;
  target?: string;
}): Promise<PublicEntry[]> {
  try {
    const qs = new URLSearchParams();
    if (params.schema_id) qs.set('schema_id', params.schema_id);
    if (params.target) qs.set('target', params.target);
    const resp = await fetch(`${API_ORIGIN}/public/entries?${qs}`, { method: 'PATCH' });
    if (!resp.ok) return [];
    return resp.json();
  } catch {
    return [];
  }
}

/**
 * Read inbox records sorted by the given order.
 * newest = descending delivered_at (chronological, newest first)
 * oldest = ascending delivered_at
 * most_reacted = sorted by reaction count (requires aggregate)
 */
export async function readFeed(sort: FeedSort = 'newest'): Promise<InboxRecord[]> {
  const wapi = getWapi();

  if (sort === 'most_reacted') {
    return readFeedByReactions();
  }

  const direction = sort === 'newest' ? -1 : 1;
  const records = await wapi.read<InboxRecord>('inbox');

  return records.sort((a, b) => {
    const tA = new Date(a.delivered_at).getTime();
    const tB = new Date(b.delivered_at).getTime();
    return (tA - tB) * direction;
  });
}

/**
 * Read feed sorted by reaction count (most reacted first).
 * Uses the aggregate pipeline to count reactions per post_id.
 */
async function readFeedByReactions(): Promise<InboxRecord[]> {
  const wapi = getWapi();
  const records = await wapi.read<InboxRecord>('inbox');

  // Build a map of post_id -> reaction count using aggregate on reactions
  const reactionCounts = await wapi.aggregate<{ _id: string; count: number }>(
    'reactions',
    [
      { $match: { target_service: 'posts' } },
      { $group: { _id: '$target_id', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ],
  );

  const countMap = new Map<string, number>();
  for (const r of reactionCounts) {
    countMap.set(r._id, r.count);
  }

  return records.sort((a, b) => {
    const countA = countMap.get(a.post_id) || 0;
    const countB = countMap.get(b.post_id) || 0;
    return countB - countA;
  });
}

/**
 * Mark an inbox item as read.
 */
export async function markInboxRead(id: string): Promise<void> {
  const wapi = getWapi();
  await wapi.update('inbox', { _id: id }, { $set: { read: true } });
}

/**
 * Count unread inbox items.
 */
export async function countUnread(): Promise<number> {
  const wapi = getWapi();
  const records = await wapi.read<InboxRecord>('inbox', { read: { $ne: true } });
  return records.length;
}