import { getV3Client } from './v3';
import { followersGroupId } from './groups';
import type { AdRecord } from './types';
import { fromV3DocToAd } from './types';

// ── Ad data layer (v3, D55) ─────────────────────────────────────────────────
// The creator's ads are `posts` docs tagged `ad` in their followers group;
// albums are `posts` docs tagged `ad_album`. The catalog read is the owner's
// own posts, filtered client-side (a creator's own posts are a small, bounded
// set). One read over the followers group, split into ads + albums.

export interface AdAlbum {
  _id?: string;
  name?: string;
}

export interface MyAdsResult {
  ads: AdRecord[];
  albums: AdAlbum[];
}

/**
 * Read the creator's ads + albums (for the composer's "Pin an ad" picker).
 * Returns empty on no token / read failure (the picker shows its empty state).
 */
export async function readMyAds(): Promise<MyAdsResult> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return { ads: [], albums: [] };
  const docs = await w.read('posts', { groups: [followersGroupId(token.username)] });
  const ads: AdRecord[] = [];
  const albums: AdAlbum[] = [];
  for (const d of docs) {
    const tags = d.tags || [];
    if (tags.includes('ad_album')) {
      albums.push({ _id: d.doc_id, name: (d.body as Record<string, unknown>).name as string });
    } else if (tags.includes('ad')) {
      ads.push(fromV3DocToAd(d));
    }
  }
  return { ads, albums };
}
