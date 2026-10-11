// Screenshot-harness mock for @/data/ads-catalog — seeded, in-memory ad data
// so the Monetization surface renders offline (no backend, no login). The
// types are re-exported from the real module (type-only, erased at runtime).
export type { AdsCatalogData, AdItem, AlbumItem, PostItem, ProductItem } from '../../src/data/ads-catalog';

// The products (D89) — the first-class entities (the master). The affiliate
// link / partner / kind live on the product (the single source of truth).
const PRODUCT_1 = {
  doc: { doc_id: 'prod-1', tags: ['product'] },
  product: {
    name: 'The good coffee grinder',
    price: 30,
    commission: 10,
    commission_is_percent: true,
    link: 'https://amzn.to/grinder?tag=me',
    partner: 'Amazon',
    kind: 'affiliate',
    actuals: 22,
  },
};

const PRODUCT_2 = {
  doc: { doc_id: 'prod-2', tags: ['product'] },
  product: {
    name: 'The studio headphones',
    price: 149,
    commission: 15,
    commission_is_percent: true,
    link: 'https://amzn.to/headphones?tag=me',
    partner: 'Amazon',
    kind: 'affiliate',
    actuals: 88,
  },
};

// The ads (D89) — reference the products by product_id + carry the offer
// snapshot (link + partner + kind, denormalized for the public feed).
const AD_1 = {
  doc: { doc_id: 'ad-1', tags: ['ad'] },
  text: 'Everything I use, linked.',
  offer: { kind: 'affiliate', partner: 'Amazon', link: 'https://amzn.to/grinder?tag=me', cta: 'Get it', disclosure: 'I may earn a commission.' },
  status: 'active' as const,
  media_refs: undefined,
  format: 'inline' as const,
  albums: [] as string[],
  product_id: 'prod-1',
  product: PRODUCT_1.product, // resolved (from the product_id)
};

const AD_2 = {
  doc: { doc_id: 'ad-2', tags: ['ad'] },
  text: 'My new mix — stream it here.',
  offer: { kind: 'none', partner: '', link: 'https://web10.app/mix', cta: 'Check it out', disclosure: '' },
  status: 'active' as const,
  media_refs: undefined,
  format: 'post' as const,
  albums: [] as string[],
  product_id: 'prod-2',
  product: PRODUCT_2.product, // resolved (from the product_id)
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
  return { ads: [AD_1, AD_2], products: [PRODUCT_1, PRODUCT_2], albums: [ALBUM_1], posts: [POST_1] };
}
export async function readUserAds() {
  return { ads: [AD_1, AD_2], products: [PRODUCT_1, PRODUCT_2], albums: [ALBUM_1], posts: [POST_1] };
}
export async function readStorefront() {
  return [PRODUCT_1, PRODUCT_2];
}
export async function readProducts() {
  return [PRODUCT_1, PRODUCT_2];
}
export async function readNodeAds() {
  return [NODE_AD_1];
}
export async function getNodeConfig() {
  return {
    node_ad_percentage: 10,
    node_ad_overwrite: false,
    moderation_enabled: true,
    auto_moderate: true,
    sensitive_words: ['slur', 'hate', 'spam'],
    auto_hide_users: ['badguy'],
  };
}
export async function saveNodeAdPercentage() {}
export async function saveNodeAdOverwrite() {}
export async function updateAd() {
  return { doc_id: 'ad-1' };
}
export async function updateNodeAd() {
  return { doc_id: 'node-1' };
}
export async function createNodeAd() {
  return { doc_id: 'node-new' };
}
export async function createProduct() {
  return { doc_id: 'prod-new' };
}
export async function updateProduct() {
  return { doc_id: 'prod-1' };
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
export function buildProductBody() {
  return {};
}
export async function checkNodeAdmin() {
  return true;
}
