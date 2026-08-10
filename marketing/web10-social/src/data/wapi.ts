// ── wapi.ts shim (v3) ────────────────────────────────────────────────────────
// The old wapi.ts is gone. Components that still import from '@/data/wapi'
// should be updated to use the v3 data layer directly. This shim provides
// backward compat during the migration.

import { getV3Client } from './v3';

/** @deprecated use getV3Client() */
export function getWapi() {
  return getV3Client();
}

/** @deprecated no-op, v3 doesn't need reset */
export function resetWapi(): void {}

/** @deprecated no-op, v3 doesn't use presigned read cache */
export function clearReadUrlCache(): void {}

/** @deprecated no-op, v3 doesn't use object key derivation */
export function deriveObjectKey(_url: string): string {
  return '';
}

// ── Reactions backward compat ────────────────────────────────────────────────

/** @deprecated use ref_value directly */
export function buildReactionTarget(
  targetId: string,
  _postAuthor?: string,
  _postService?: string,
): string {
  return targetId;
}

// ── Feed backward compat ─────────────────────────────────────────────────────

/** @deprecated no-op, v3 doesn't use schema registry */
export async function registerDefaultSchemas(): Promise<unknown[]> {
  return [];
}

/** @deprecated no-op, v3 doesn't use schema cache */
export function clearSchemaCache(): void {}

/** @deprecated no-op, v3 doesn't use schema cache */
export function getCachedSchema(_name: string): unknown {
  return undefined;
}

/** @deprecated no-op, v3 doesn't use public ledger */
export async function createPublicEntry(_entry: unknown): Promise<unknown> {
  return {};
}

/** @deprecated no-op, v3 doesn't use public ledger */
export async function queryPublicEntries(_params: unknown): Promise<unknown[]> {
  return [];
}

/** @deprecated no-op, v3 doesn't use public ledger */
export async function deletePublicEntry(_entryId: string): Promise<void> {}

/** @deprecated no-op, v3 doesn't use inbox */
export async function markInboxRead(_id: string): Promise<void> {}

/** @deprecated no-op, v3 doesn't use inbox */
export async function countUnread(): Promise<number> {
  return 0;
}

/** @deprecated use readDiscoverFeed */
export { readDiscoverFeed, fetchSuggestedUsers } from './feed';

/** @deprecated no-op, v3 doesn't use repost ledger */
export async function recordRepost(
  _targetId: string,
  _postAuthor: string,
  _postService: string,
): Promise<void> {}