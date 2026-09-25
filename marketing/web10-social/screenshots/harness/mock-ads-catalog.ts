// Screenshot-harness mock for @/data/ads-catalog — seeded, in-memory ad data
// so the Monetization surface renders offline (no backend, no login). The
// types are re-exported from the real module (type-only, erased at runtime).
export type { AdsCatalogData, AdItem, AlbumItem, PostItem } from '../../src/data/ads-catalog';

const AD_1 = {
  doc: { doc_id: 'ad-1', tags: ['ad'] },
  text: 'Everything I use, linked.',
  offer: { kind: 'affiliate', partner: 'Amazon', link: 'https://amzn.to/abc', cta: 'Get it', disclosure: 'I may earn a commission.' },
  status: 'active' as const,
  media_refs: undefined,
  format: 'inline' as const,
  albums: [] as string[],
};

const AD_2 = {
  doc: { doc_id: 'ad-2', tags: ['ad'] },
  text: 'My new mix — stream it here.',
  offer: { kind: 'none', partner: '', link: 'https://web10.app/mix', cta: 'Check it out', disclosure: '' },
  status: 'active' as const,
  media_refs: undefined,
  format: 'post' as const,
  albums: [] as string[],
};

const ALBUM_1 = {
  doc: { doc_id: 'album-1', tags: ['ad_album'] },
  name: 'Summer 2026',
  adCount: 1,
};

const POST_1 = {
  doc: { doc_id: 'post-1', tags: [] },
  text: 'A regular post',
  pinnedAdTarget: 'ad-1',
};

const NODE_AD_1 = {
  doc: { doc_id: 'node-1', tags: ['ad', 'node_ad'] },
  text: 'Try the new workflow tool.',
  offer: { kind: 'direct', partner: 'WorkflowCo', link: 'https://workflowco.com?ref=node', cta: 'Learn more', disclosure: 'Sponsored' },
  status: 'active' as const,
  media_refs: undefined,
  format: 'inline' as const,
  albums: [] as string[],
};

export async function readMyCatalog() {
  return { ads: [AD_1, AD_2], albums: [ALBUM_1], posts: [POST_1] };
}
export async function readNodeAds() {
  return [NODE_AD_1];
}
export async function getNodeConfig() {
  return { node_ad_percentage: 10, node_ad_overwrite: false };
}
export async function saveNodeAdPercentage() {}
export async function saveNodeAdOverwrite() {}
export async function updateAd() {
  return { doc_id: 'ad-1' };
}
export async function updateNodeAd() {
  return { doc_id: 'node-1' };
}
export async function ensureFollowersGroup() {
  return 'web10.app/groups/users/testuser/followers';
}
export function buildOfferBody() {
  return {};
}
export function buildNodeAdBody() {
  return {};
}
export async function checkNodeAdmin() {
  return true;
}
