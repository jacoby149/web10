import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock the ads-catalog data layer (the seam the surface talks to).
const checkNodeAdmin = vi.fn();
const readMyCatalog = vi.fn();
const readNodeAds = vi.fn();
const getNodeConfig = vi.fn();
const saveNodeAdPercentage = vi.fn();
const saveNodeAdOverwrite = vi.fn();
const updateAd = vi.fn();
const updateNodeAd = vi.fn();
const convertAdScope = vi.fn();
const createNodeAd = vi.fn();
vi.mock('@/data/ads-catalog', () => ({
  checkNodeAdmin: (...a: unknown[]) => checkNodeAdmin(...a),
  readMyCatalog: (...a: unknown[]) => readMyCatalog(...a),
  readNodeAds: (...a: unknown[]) => readNodeAds(...a),
  getNodeConfig: (...a: unknown[]) => getNodeConfig(...a),
  saveNodeAdPercentage: (...a: unknown[]) => saveNodeAdPercentage(...a),
  saveNodeAdOverwrite: (...a: unknown[]) => saveNodeAdOverwrite(...a),
  updateAd: (...a: unknown[]) => updateAd(...a),
  updateNodeAd: (...a: unknown[]) => updateNodeAd(...a),
  convertAdScope: (...a: unknown[]) => convertAdScope(...a),
  createNodeAd: (...a: unknown[]) => createNodeAd(...a),
  buildOfferBody: vi.fn(),
  buildNodeAdBody: vi.fn(),
  splitCatalog: vi.fn(),
  splitNodeAds: vi.fn(),
  // Faithful to the real implementation: a node ad is a doc tagged `node_ad`.
  isNodeAd: (doc: { tags?: string[] }) => (doc?.tags || []).includes('node_ad'),
  parseAd: vi.fn(),
  parseAlbum: vi.fn(),
  readMyAds: vi.fn(),
  ensureFollowersGroup: vi.fn(),
}));

// Mock the creator-analytics data layer (the D86 dashboard read).
const readCreatorAnalytics = vi.fn();
const readPostAnalytics = vi.fn();
const enrichTopPosts = vi.fn();
vi.mock('@/data/creator-analytics', () => ({
  readCreatorAnalytics: (...a: unknown[]) => readCreatorAnalytics(...a),
  readPostAnalytics: (...a: unknown[]) => readPostAnalytics(...a),
  enrichTopPosts: (...a: unknown[]) => enrichTopPosts(...a),
}));

import MonetizationScreen from '@/components/Monetization/MonetizationScreen';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MonetizationScreen />
    </MemoryRouter>,
  );
}

const EMPTY_CATALOG = { ads: [], albums: [], posts: [] };

// The empty creator-analytics shape (no views in the window).
const EMPTY_ANALYTICS = {
  daily: [],
  bySurface: [],
  topPosts: [],
  totals: { impressions: 0, reach: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  readMyCatalog.mockResolvedValue(EMPTY_CATALOG);
  readNodeAds.mockResolvedValue([]);
  getNodeConfig.mockResolvedValue({ node_ad_percentage: 10 });
  saveNodeAdPercentage.mockResolvedValue(undefined);
  readCreatorAnalytics.mockResolvedValue(EMPTY_ANALYTICS);
  readPostAnalytics.mockResolvedValue(EMPTY_ANALYTICS);
  enrichTopPosts.mockResolvedValue([]);
});

describe('MonetizationScreen', () => {
  it('renders the Ads section by default for a non-admin (the tab row is always present)', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    renderAt('/monetize');
    expect(await screen.findByTestId('creator-monetization')).toBeInTheDocument();
    // The node inventory is admin-only — never rendered for a non-admin.
    expect(screen.queryByTestId('node-ad-controls')).not.toBeInTheDocument();
    expect(screen.getByTestId('monetization-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('monetization-tab-ads')).toBeInTheDocument();
    expect(screen.getByTestId('monetization-tab-products')).toBeInTheDocument();
    expect(screen.getByTestId('monetization-tab-analytics')).toBeInTheDocument();
    expect(screen.queryByTestId('monetization-tab-node')).not.toBeInTheDocument();
  });

  it('renders the Ads section by default for a node admin too (node controls folded in, no Node tab)', async () => {
    checkNodeAdmin.mockResolvedValue(true);
    renderAt('/monetize');
    expect(await screen.findByTestId('creator-monetization')).toBeInTheDocument();
    // The node admin's node-ad inventory is folded into the Ads tab (the
    // separate Node tab is retired) — the node controls (density + overwrite)
    // render in the Ads tab.
    expect(await screen.findByTestId('node-ad-controls')).toBeInTheDocument();
    // There is NO Node tab in the row (three tabs: Ads | Products | Analytics).
    expect(screen.queryByTestId('monetization-tab-node')).not.toBeInTheDocument();
    expect(screen.getByTestId('monetization-tab-ads')).toBeInTheDocument();
    expect(screen.getByTestId('monetization-tab-products')).toBeInTheDocument();
    expect(screen.getByTestId('monetization-tab-analytics')).toBeInTheDocument();
  });

  it('a stale ?tab=node deep link lands on the Ads tab (the Node tab is retired)', async () => {
    checkNodeAdmin.mockResolvedValue(true);
    renderAt('/monetize?tab=node');
    // The node inventory now lives in the Ads tab — the stale ?tab=node lands
    // there (with the node controls), not a separate Node section.
    expect(await screen.findByTestId('creator-monetization')).toBeInTheDocument();
    expect(await screen.findByTestId('node-ad-controls')).toBeInTheDocument();
    expect(screen.queryByTestId('monetization-tab-node')).not.toBeInTheDocument();
  });

  it('falls back to Ads when a non-admin is deep-linked to ?tab=node', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    renderAt('/monetize?tab=node');
    // The node inventory is admin-only; a non-admin on ?tab=node lands on the
    // Ads tab with no node controls.
    expect(await screen.findByTestId('creator-monetization')).toBeInTheDocument();
    expect(screen.queryByTestId('node-ad-controls')).not.toBeInTheDocument();
  });

  it('renders the affiliate onboarding in the Ads section', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    renderAt('/monetize');
    expect(await screen.findByTestId('affiliate-programs-card')).toBeInTheDocument();
    // The ad catalog card is present.
    expect(screen.getByTestId('ads-catalog-card')).toBeInTheDocument();
  });

  it('switches to the Products section (the URL holds the section)', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    renderAt('/monetize');
    expect(await screen.findByTestId('monetization-tab-products')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('monetization-tab-products'));
    expect(await screen.findByTestId('products-section')).toBeInTheDocument();
    expect(screen.queryByTestId('creator-monetization')).not.toBeInTheDocument();
  });

  it('switches to the Analytics section (the URL holds the section)', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    renderAt('/monetize');
    expect(await screen.findByTestId('monetization-tab-analytics')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('monetization-tab-analytics'));
    expect(await screen.findByTestId('analytics-section')).toBeInTheDocument();
    expect(screen.queryByTestId('creator-monetization')).not.toBeInTheDocument();
  });
});

describe('Affiliate Programs card — collapsible (hidden by default once you have ads)', () => {
  const AD = {
    doc: { doc_id: 'ad-1', tags: ['ad'] },
    text: 'Everything I use, linked.',
    offer: { kind: 'affiliate', partner: 'Amazon', link: 'https://amzn.to/abc', cta: 'Get it', disclosure: '' },
    status: 'active' as const,
    media_refs: undefined,
    format: 'inline' as const,
    albums: [] as string[],
  };

  it('is collapsed by default for a creator who has ads', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({ ads: [AD], albums: [], posts: [] });
    renderAt('/monetize');
    // The toggle (the card header) is always present.
    const toggle = await screen.findByTestId('affiliate-programs-toggle');
    // Wait for the catalog to load (the ad row proves the data is in), so the
    // smart default has decided.
    await screen.findByTestId('ads-row-ad-1');
    // A creator with ads gets the card collapsed (the onboarding is noise).
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('affiliate-programs-body')).not.toBeInTheDocument();
  });

  it('is expanded by default for a fresh creator (no ads yet)', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue(EMPTY_CATALOG);
    renderAt('/monetize');
    // No ads → the "START HERE" onboarding is open by default.
    const body = await screen.findByTestId('affiliate-programs-body');
    expect(body).toBeInTheDocument();
    expect(screen.getByTestId('affiliate-programs-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles open/closed and remembers the choice in localStorage', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({ ads: [AD], albums: [], posts: [] });
    renderAt('/monetize');
    const toggle = await screen.findByTestId('affiliate-programs-toggle');
    await screen.findByTestId('ads-row-ad-1'); // let the smart default decide
    // Collapsed by default (has ads).
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('affiliate-programs-body')).not.toBeInTheDocument();
    // Open it.
    fireEvent.click(toggle);
    expect(screen.getByTestId('affiliate-programs-body')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(localStorage.getItem('w10-affiliate-programs-open')).toBe('open');
    // Close it again.
    fireEvent.click(toggle);
    expect(screen.queryByTestId('affiliate-programs-body')).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(localStorage.getItem('w10-affiliate-programs-open')).toBe('closed');
  });

  it('is keyboard operable (Enter / Space toggle the card)', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({ ads: [AD], albums: [], posts: [] });
    renderAt('/monetize');
    const toggle = await screen.findByTestId('affiliate-programs-toggle');
    await screen.findByTestId('ads-row-ad-1');
    expect(screen.queryByTestId('affiliate-programs-body')).not.toBeInTheDocument();
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(screen.getByTestId('affiliate-programs-body')).toBeInTheDocument();
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(screen.queryByTestId('affiliate-programs-body')).not.toBeInTheDocument();
  });

  it('an explicit stored choice overrides the smart default', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    // A fresh creator (no ads) but explicitly closed → stays closed (the smart
    // default would be "open" for no ads, but the stored choice wins).
    localStorage.setItem('w10-affiliate-programs-open', 'closed');
    readMyCatalog.mockResolvedValue(EMPTY_CATALOG);
    renderAt('/monetize');
    // Wait for the catalog to load (the empty state proves the data is in), so
    // the decision effect has run.
    await screen.findByTestId('ads-empty');
    expect(screen.queryByTestId('affiliate-programs-body')).not.toBeInTheDocument();
    expect(screen.getByTestId('affiliate-programs-toggle')).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('MonetizationScreen — the in-page tab row', () => {
  it('a node admin has three tabs (no Node tab — the inventory is in the Ads tab)', async () => {
    checkNodeAdmin.mockResolvedValue(true);
    getNodeConfig.mockResolvedValue({ node_ad_percentage: 10, node_ad_overwrite: false });
    renderAt('/monetize');
    // The tab row is three tabs for everyone (Ads | Products | Analytics) —
    // there is no Node tab (the node inventory is folded into the Ads tab).
    expect(screen.getByTestId('monetization-tab-ads')).toBeInTheDocument();
    expect(screen.getByTestId('monetization-tab-products')).toBeInTheDocument();
    expect(screen.getByTestId('monetization-tab-analytics')).toBeInTheDocument();
    expect(screen.queryByTestId('monetization-tab-node')).not.toBeInTheDocument();
    // The node controls (density + overwrite) are in the Ads tab.
    expect(await screen.findByTestId('node-ad-controls')).toBeInTheDocument();
  });

  it('a non-admin never sees the Node tab (the row is present, three tabs)', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    renderAt('/monetize');
    expect(await screen.findByTestId('creator-monetization')).toBeInTheDocument();
    // The tab row is present for everyone (Ads | Products | Analytics); there
    // is no Node tab at all (the node inventory is folded into the Ads tab).
    expect(screen.getByTestId('monetization-tabs')).toBeInTheDocument();
    expect(screen.queryByTestId('monetization-tab-node')).not.toBeInTheDocument();
  });
});

describe('AdForm — the personal / node scope (node admin)', () => {
  it('the node admin sees the scope toggle on a new ad; a non-admin does not', async () => {
    checkNodeAdmin.mockResolvedValue(true);
    readMyCatalog.mockResolvedValue({ ads: [], albums: [], posts: [] });
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-new-ad'));
    await screen.findByTestId('ad-new-form');
    // The scope toggle appears once the async admin check resolves.
    expect(await screen.findByTestId('ad-scope-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('ad-scope-personal')).toBeInTheDocument();
    expect(screen.getByTestId('ad-scope-node')).toBeInTheDocument();
  });

  it('a non-admin has no scope toggle (personal only)', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({ ads: [], albums: [], posts: [] });
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-new-ad'));
    await screen.findByTestId('ad-new-form');
    expect(screen.queryByTestId('ad-scope-toggle')).not.toBeInTheDocument();
  });

  it('creating a node ad (scope = node) writes to the discover group via createNodeAd', async () => {
    checkNodeAdmin.mockResolvedValue(true);
    readMyCatalog.mockResolvedValue({ ads: [], albums: [], posts: [] });
    createNodeAd.mockResolvedValue({ doc_id: 'node-new' });
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-new-ad'));
    await screen.findByTestId('ad-new-form');
    // Fill the required link, pick the node scope (appears once the admin
    // check resolves), and save.
    fireEvent.change(screen.getByTestId('ad-link'), { target: { value: 'https://workflowco.com?ref=node' } });
    fireEvent.click(await screen.findByTestId('ad-scope-node'));
    fireEvent.click(screen.getByTestId('ad-save'));
    await waitFor(() => expect(createNodeAd).toHaveBeenCalled());
    // The personal path (ensureFollowersGroup / createAd) is NOT taken for a node ad.
    expect(createNodeAd).toHaveBeenCalledWith(
      expect.objectContaining({ link: 'https://workflowco.com?ref=node' }),
      'Untitled ad',
      'active',
      [],
      'inline',
      null, // no product section (a pure ad)
    );
  });
});

describe('AdForm (create + edit, ad-improvements.md)', () => {
  const AD_ITEM = {
    doc: { doc_id: 'ad-1', tags: ['ad'] },
    text: 'Everything I use, linked.',
    offer: { kind: 'affiliate', partner: 'Amazon', link: 'https://amzn.to/abc', cta: 'Get it', disclosure: 'I may earn.' },
    status: 'active' as const,
    media_refs: undefined,
    format: 'inline' as const,
    albums: [] as string[],
  };

  beforeEach(() => {
    updateAd.mockResolvedValue({ doc_id: 'ad-1' });
  });

  it('the New Ad form shows the format toggle (inline / post)', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({ ads: [], albums: [], posts: [] });
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-new-ad'));
    expect(await screen.findByTestId('ad-new-form')).toBeInTheDocument();
    // The format toggle is present with both options.
    expect(screen.getByTestId('ad-format-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('ad-format-inline')).toBeInTheDocument();
    expect(screen.getByTestId('ad-format-post')).toBeInTheDocument();
  });

  it('the CTA suggestion chips fill the CTA field', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({ ads: [], albums: [], posts: [] });
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-new-ad'));
    await screen.findByTestId('ad-new-form');
    fireEvent.click(screen.getByTestId('ad-cta-suggest-check-it-out'));
    expect(screen.getByTestId('ad-cta')).toHaveValue('Check it out');
  });

  it('the Edit button opens the edit form pre-filled with the ad', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({ ads: [AD_ITEM], albums: [], posts: [] });
    renderAt('/monetize');
    // The ad row is present with its Edit button.
    const editBtn = await screen.findByTestId('ads-edit-ad-1');
    fireEvent.click(editBtn);
    // The edit form opens (not the new form), pre-filled with the ad's copy.
    expect(await screen.findByTestId('ad-edit-form')).toBeInTheDocument();
    expect(screen.getByTestId('ad-text')).toHaveValue('Everything I use, linked.');
  });

  it('saving an edit calls updateAd with the same doc_id', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({ ads: [AD_ITEM], albums: [], posts: [] });
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-edit-ad-1'));
    await screen.findByTestId('ad-edit-form');
    // Change the copy + pick the post format, then save.
    fireEvent.change(screen.getByTestId('ad-text'), { target: { value: 'Updated copy' } });
    fireEvent.click(screen.getByTestId('ad-format-post'));
    fireEvent.click(screen.getByTestId('ad-save'));
    await waitFor(() => expect(updateAd).toHaveBeenCalled());
    const call = (updateAd as any).mock.calls[0];
    expect(call[0].doc.doc_id).toBe('ad-1'); // same doc_id (pins survive)
    expect(call[1].link).toBe('https://amzn.to/abc'); // offer preserved
    expect(call[6]).toBe('post'); // format passed through
  });

  it('editing an ad swaps its row to the inline form in place (no scroll-to-top)', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({ ads: [AD_ITEM], albums: [], posts: [] });
    renderAt('/monetize');
    // The row is present before editing.
    expect(await screen.findByTestId('ads-row-ad-1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ads-edit-ad-1'));
    // The form opens IN PLACE — the row is replaced by the editing wrapper,
    // so the 30th ad's editor sits at the 30th ad, not at the top of the list.
    expect(await screen.findByTestId('ads-editing-ad-1')).toBeInTheDocument();
    expect(screen.getByTestId('ad-edit-form')).toBeInTheDocument();
    // The original row is gone (swapped for the inline form).
    expect(screen.queryByTestId('ads-row-ad-1')).not.toBeInTheDocument();
  });

  it('cancelling the inline edit restores the ad row', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({ ads: [AD_ITEM], albums: [], posts: [] });
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-edit-ad-1'));
    await screen.findByTestId('ad-edit-form');
    // Cancel → the row comes back, the form is gone.
    fireEvent.click(screen.getByTestId('ad-cancel'));
    expect(await screen.findByTestId('ads-row-ad-1')).toBeInTheDocument();
    expect(screen.queryByTestId('ad-edit-form')).not.toBeInTheDocument();
  });
});

describe('AdForm — the scope conversion (node admin, edit mode)', () => {
  const REGULAR_AD = {
    doc: { doc_id: 'ad-1', tags: ['ad'] },
    text: 'Everything I use, linked.',
    offer: { kind: 'affiliate', partner: 'Amazon', link: 'https://amzn.to/abc', cta: 'Get it', disclosure: '' },
    status: 'active' as const,
    media_refs: undefined,
    format: 'inline' as const,
    albums: [] as string[],
  };
  const NODE_AD = {
    doc: { doc_id: 'node-1', tags: ['ad', 'node_ad'] },
    text: 'Try the new workflow tool.',
    offer: { kind: 'direct', partner: '', link: 'https://workflowco.com?ref=node', cta: 'Learn more', disclosure: 'Sponsored' },
    status: 'active' as const,
    media_refs: undefined,
    format: 'inline' as const,
    albums: [] as string[],
  };

  beforeEach(() => {
    checkNodeAdmin.mockResolvedValue(true);
    getNodeConfig.mockResolvedValue({ node_ad_percentage: 10, node_ad_overwrite: false });
    convertAdScope.mockResolvedValue({ doc_id: 'x' });
    updateAd.mockResolvedValue({ doc_id: 'ad-1' });
    updateNodeAd.mockResolvedValue({ doc_id: 'node-1' });
  });

  it('the scope toggle is present in EDIT mode for a node admin (seeded to the ad\'s current scope)', async () => {
    readMyCatalog.mockResolvedValue({ ads: [REGULAR_AD], albums: [], posts: [] });
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-edit-ad-1'));
    await screen.findByTestId('ad-edit-form');
    // A regular ad seeds the toggle to "Personal" (appears once the async
    // admin check resolves).
    const toggle = await screen.findByTestId('ad-scope-toggle');
    expect(toggle).toBeInTheDocument();
    expect(screen.getByTestId('ad-scope-personal')).toBeInTheDocument();
    expect(screen.getByTestId('ad-scope-node')).toBeInTheDocument();
    // No conversion hint yet (the scope hasn't changed).
    expect(screen.queryByTestId('ad-scope-converting')).not.toBeInTheDocument();
  });

  it('a non-admin has no scope toggle in edit mode (personal only)', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({ ads: [REGULAR_AD], albums: [], posts: [] });
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-edit-ad-1'));
    await screen.findByTestId('ad-edit-form');
    expect(screen.queryByTestId('ad-scope-toggle')).not.toBeInTheDocument();
  });

  it('converting a regular ad → node calls convertAdScope (target node), not updateAd', async () => {
    readMyCatalog.mockResolvedValue({ ads: [REGULAR_AD], albums: [], posts: [] });
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-edit-ad-1'));
    await screen.findByTestId('ad-edit-form');
    // The scope toggle appears once the async admin check resolves. Switch to
    // node → the conversion hint appears → save converts.
    fireEvent.click(await screen.findByTestId('ad-scope-node'));
    expect(screen.getByTestId('ad-scope-converting')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ad-save'));
    await waitFor(() => expect(convertAdScope).toHaveBeenCalled());
    const call = (convertAdScope as any).mock.calls[0];
    expect(call[0].doc.doc_id).toBe('ad-1'); // same doc_id
    expect(call[1]).toBe('node'); // target scope
    expect(updateAd).not.toHaveBeenCalled();
  });

  it('converting a node ad → personal calls convertAdScope (target personal), not updateNodeAd', async () => {
    readMyCatalog.mockResolvedValue({ ads: [], albums: [], posts: [] });
    readNodeAds.mockResolvedValue([NODE_AD]);
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-edit-node-1'));
    await screen.findByTestId('ad-edit-form');
    // A node ad seeds the toggle to "Node". Switch to personal → save converts.
    fireEvent.click(await screen.findByTestId('ad-scope-personal'));
    expect(screen.getByTestId('ad-scope-converting')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ad-save'));
    await waitFor(() => expect(convertAdScope).toHaveBeenCalled());
    const call = (convertAdScope as any).mock.calls[0];
    expect(call[0].doc.doc_id).toBe('node-1'); // same doc_id
    expect(call[1]).toBe('personal'); // target scope
    expect(updateNodeAd).not.toHaveBeenCalled();
  });

  it('editing a regular ad with the SAME scope (personal) is a normal update, not a conversion', async () => {
    readMyCatalog.mockResolvedValue({ ads: [REGULAR_AD], albums: [], posts: [] });
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-edit-ad-1'));
    await screen.findByTestId('ad-edit-form');
    // Keep the scope personal (the default) + save → a normal update.
    fireEvent.click(screen.getByTestId('ad-save'));
    await waitFor(() => expect(updateAd).toHaveBeenCalled());
    expect(convertAdScope).not.toHaveBeenCalled();
  });
});

describe('AdForm — the product picker (D89)', () => {
  const PRODUCT = {
    doc: { doc_id: 'prod-1', tags: ['product'] },
    product: {
      name: 'The good coffee grinder',
      price: 30,
      commission: 10,
      commission_is_percent: true,
      link: 'https://amzn.to/grinder?tag=me',
      partner: 'Amazon',
      kind: 'affiliate',
    },
  };
  const AD_ITEM = {
    doc: { doc_id: 'ad-1', tags: ['ad'] },
    text: 'Everything I use, linked.',
    offer: { kind: 'affiliate', partner: 'Amazon', link: 'https://amzn.to/abc', cta: 'Get it', disclosure: 'I may earn.' },
    status: 'active' as const,
    media_refs: undefined,
    format: 'inline' as const,
    albums: [] as string[],
    product_id: 'prod-1',
  };

  beforeEach(() => {
    updateAd.mockResolvedValue({ doc_id: 'ad-1' });
  });

  it('the product picker is present with the products as options', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({ ads: [], products: [PRODUCT], albums: [], posts: [] });
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-new-ad'));
    await screen.findByTestId('ad-new-form');
    // The product picker is present with the "No product" default + the product.
    const select = screen.getByTestId('ad-product-picker-select');
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('');
    expect(screen.getByRole('option', { name: /The good coffee grinder/ })).toBeInTheDocument();
  });

  it('selecting a product auto-fills the offer link + partner + kind (the snapshot)', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({ ads: [], products: [PRODUCT], albums: [], posts: [] });
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-new-ad'));
    await screen.findByTestId('ad-new-form');
    // Select the product → the offer's link + partner + kind are auto-filled.
    fireEvent.change(screen.getByTestId('ad-product-picker-select'), { target: { value: 'prod-1' } });
    expect(screen.getByTestId('ad-link')).toHaveValue('https://amzn.to/grinder?tag=me');
    expect(screen.getByTestId('ad-partner')).toHaveValue('Amazon');
    expect(screen.getByTestId('ad-kind')).toHaveValue('affiliate');
    // The product summary (the projection) appears.
    expect(screen.getByTestId('ad-product-summary')).toBeInTheDocument();
  });

  it('saving an ad with a product passes the product_id to updateAd', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({ ads: [AD_ITEM], products: [PRODUCT], albums: [], posts: [] });
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-edit-ad-1'));
    await screen.findByTestId('ad-edit-form');
    // The edit form pre-fills the product picker with the ad's product_id.
    expect(screen.getByTestId('ad-product-picker-select')).toHaveValue('prod-1');
    fireEvent.click(screen.getByTestId('ad-save'));
    await waitFor(() => expect(updateAd).toHaveBeenCalled());
    const call = (updateAd as any).mock.calls[0];
    // The product_id is the 10th arg (index 9).
    expect(call[9]).toBe('prod-1');
  });
});

describe('AnalyticsSection — the portfolio + what-if (ads-october deferred)', () => {
  const PRODUCT_ADS = {
    ads: [
      {
        doc: { doc_id: 'ad-1', tags: ['ad'] },
        text: 'The grinder',
        offer: { kind: 'affiliate', partner: 'Amazon', link: 'https://amzn.to/abc', cta: 'Get it', disclosure: '' },
        status: 'active' as const,
        format: 'inline' as const,
        albums: [] as string[],
        product: { target: 'product' as const, name: 'The good coffee grinder', price: 30, commission: 10, commission_is_percent: true, actuals: 22 },
      },
      {
        doc: { doc_id: 'ad-2', tags: ['ad'] },
        text: 'The headphones',
        offer: { kind: 'affiliate', partner: 'Amazon', link: 'https://amzn.to/def', cta: 'Get it', disclosure: '' },
        status: 'active' as const,
        format: 'inline' as const,
        albums: [] as string[],
        product: { target: 'product' as const, name: 'The studio headphones', price: 149, commission: 15, commission_is_percent: true, actuals: 88 },
      },
    ],
    albums: [],
    posts: [],
  };

  it('the portfolio summarizes the catalog (count + projected total + total actuals)', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue(PRODUCT_ADS);
    renderAt('/monetize?tab=analytics');
    const portfolio = await screen.findByTestId('analytics-portfolio');
    expect(portfolio).toBeInTheDocument();
    // 2 products; projected total = $30 (grinder) + $223.50 (headphones) per 100k
    // each = $253.50 → $254 (rounded to cents, then whole dollars); total actuals
    // = $22 + $88 = $110.
    expect(portfolio).toHaveTextContent('Products');
    expect(portfolio).toHaveTextContent('2');
    expect(portfolio).toHaveTextContent('$254');
    expect(portfolio).toHaveTextContent('$110'); // 22 + 88
  });

  it('the what-if slider updates the projection live', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue(PRODUCT_ADS);
    renderAt('/monetize?tab=analytics');
    const slider = await screen.findByTestId('analytics-whatif-slider-ad-1');
    // Default 100k → the grinder projects $30.
    const row = screen.getByTestId('analytics-row-ad-1');
    expect(row).toHaveTextContent('$30.0');
    // Drag to 500k → $150 (linear in impressions).
    fireEvent.change(slider, { target: { value: '500000' } });
    expect(row).toHaveTextContent('$150');
  });
});

describe('AnalyticsSection — Reach charts + Potential Calculator (funnel)', () => {
  it('shows the Reach charts and Calculator even with no product ads (empty catalog)', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue(EMPTY_CATALOG);
    readCreatorAnalytics.mockResolvedValue(EMPTY_ANALYTICS);
    renderAt('/monetize?tab=analytics');
    // The reach hero (totals + time-series) is always present.
    expect(await screen.findByTestId('analytics-reach')).toBeInTheDocument();
    // The surface breakdown + top posts are always present.
    expect(screen.getByTestId('analytics-by-surface')).toBeInTheDocument();
    expect(screen.getByTestId('analytics-top-posts')).toBeInTheDocument();
    // The window toggle (7d / 30d / 90d) is present.
    expect(screen.getByTestId('analytics-window-toggle')).toBeInTheDocument();
    // Calculator is always present.
    expect(screen.getByTestId('analytics-calculator')).toBeInTheDocument();
    // No product ads → no portfolio or performance cards.
    expect(screen.queryByTestId('analytics-portfolio')).not.toBeInTheDocument();
    // The CTA to add a product is visible.
    expect(screen.getByTestId('analytics-calc-cta')).toBeInTheDocument();
  });

  it('shows real impression + reach totals from the D86 creator analytics', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue(EMPTY_CATALOG);
    readCreatorAnalytics.mockResolvedValue({
      daily: [{ day: '2026-10-10', impressions: 5000, reach: 1200 }],
      bySurface: [{ surface: 'feed', impressions: 5000, reach: 1200 }],
      topPosts: [{ doc_id: 'p1', impressions: 5000, reach: 1200, avgWatchPct: null }],
      totals: { impressions: 5000, reach: 1200 },
    });
    renderAt('/monetize?tab=analytics');
    // The real formatCount renders 5000 as "5k" and 1200 as "1.2k".
    expect(await screen.findByTestId('analytics-total-impressions')).toHaveTextContent('5k');
    expect(screen.getByTestId('analytics-total-reach')).toHaveTextContent('1.2k');
    // The surface breakdown shows the surface + its count.
    expect(screen.getByTestId('analytics-by-surface')).toHaveTextContent('feed');
    // The top posts list shows the post.
    expect(screen.getByTestId('analytics-top-posts')).toBeInTheDocument();
  });

  it('the window toggle switches the selected window', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue(EMPTY_CATALOG);
    readCreatorAnalytics.mockResolvedValue(EMPTY_ANALYTICS);
    renderAt('/monetize?tab=analytics');
    // 30d is the default (pressed).
    const w30 = await screen.findByTestId('analytics-window-30');
    expect(w30).toHaveAttribute('aria-pressed', 'true');
    // Switch to 7d — the toggle updates in place (no blank flash, so it stays
    // in the DOM while the new window's data loads).
    fireEvent.click(screen.getByTestId('analytics-window-7'));
    expect(screen.getByTestId('analytics-window-7')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('analytics-window-30')).toHaveAttribute('aria-pressed', 'false');
    // The read is (re-)run for the new window.
    await waitFor(() => expect(readCreatorAnalytics).toHaveBeenCalledWith(7));
  });

  it('calculator updates projected earnings when price/commission change', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue(EMPTY_CATALOG);
    readCreatorAnalytics.mockResolvedValue(EMPTY_ANALYTICS);
    renderAt('/monetize?tab=analytics');
    const result = await screen.findByTestId('analytics-calc-result');
    // Default: 100k impressions, $30 price, 10% commission → 100000×0.01×0.01×$3 = $30
    expect(result).toHaveTextContent('$30.0');
    // Change price to $60 → $60
    fireEvent.change(screen.getByTestId('analytics-calc-price'), { target: { value: '60' } });
    expect(result).toHaveTextContent('$60.0');
    // Change commission to 20% (price is now $60) → 100000×0.01×0.01×$12 = $120
    fireEvent.change(screen.getByTestId('analytics-calc-commission'), { target: { value: '20' } });
    expect(result).toHaveTextContent('$120');
  });

  it('calculator slider changes the impression base', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue(EMPTY_CATALOG);
    readCreatorAnalytics.mockResolvedValue(EMPTY_ANALYTICS);
    renderAt('/monetize?tab=analytics');
    const result = await screen.findByTestId('analytics-calc-result');
    // Default 100k → $30.0
    expect(result).toHaveTextContent('$30.0');
    // Drag to 500k → $150
    fireEvent.change(screen.getByTestId('analytics-calc-impressions-slider'), { target: { value: '500000' } });
    expect(result).toHaveTextContent('$150');
  });

  it('seeds calculator impressions from real D86 data when available', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue(EMPTY_CATALOG);
    readCreatorAnalytics.mockResolvedValue({
      daily: [],
      bySurface: [],
      topPosts: [],
      totals: { impressions: 250000, reach: 50000 },
    });
    renderAt('/monetize?tab=analytics');
    const slider = await screen.findByTestId('analytics-calc-impressions-slider');
    expect(slider).toHaveValue('250000');
  });
});

describe('NodeAdControls — the overwrite knob (in the Ads tab, node admin)', () => {
  it('shows the overwrite toggle for a node admin (in the Ads tab)', async () => {
    checkNodeAdmin.mockResolvedValue(true);
    getNodeConfig.mockResolvedValue({ node_ad_percentage: 10, node_ad_overwrite: false });
    renderAt('/monetize');
    // The node controls (density + overwrite) live in the Ads tab for the admin.
    expect(await screen.findByTestId('node-ad-controls')).toBeInTheDocument();
    expect(screen.getByTestId('node-ads-overwrite')).toBeInTheDocument();
    const toggle = screen.getByTestId('node-ads-overwrite-toggle');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('toggling overwrite saves the setting', async () => {
    checkNodeAdmin.mockResolvedValue(true);
    getNodeConfig.mockResolvedValue({ node_ad_percentage: 10, node_ad_overwrite: false });
    saveNodeAdOverwrite.mockResolvedValue(undefined);
    renderAt('/monetize');
    const toggle = await screen.findByTestId('node-ads-overwrite-toggle');
    // The toggle is disabled until the config loads (pctLoaded) — wait for it.
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(saveNodeAdOverwrite).toHaveBeenCalledWith(true));
  });
});

describe('Unified ad list — the node ad (in the Ads tab, node admin)', () => {
  const NODE_AD_ITEM = {
    doc: { doc_id: 'node-1', tags: ['ad', 'node_ad'] },
    text: 'Sick of Youtube? Try exporting to web10!',
    offer: { kind: 'direct', partner: '', link: 'https://web10.app/export', cta: 'Learn more', disclosure: 'Sponsored' },
    status: 'active' as const,
    media_refs: undefined,
    format: 'inline' as const,
    albums: [] as string[],
  };

  beforeEach(() => {
    checkNodeAdmin.mockResolvedValue(true);
    getNodeConfig.mockResolvedValue({ node_ad_percentage: 10, node_ad_overwrite: false });
    readNodeAds.mockResolvedValue([NODE_AD_ITEM]);
    updateNodeAd.mockResolvedValue({ doc_id: 'node-1' });
  });

  it('the node ad appears in the unified Ads list with a NODE badge', async () => {
    renderAt('/monetize');
    // The node ad is in the Ads tab's unified list (the operator's inventory is
    // folded in, not a separate Node tab).
    const row = await screen.findByTestId('ads-row-node-1');
    expect(row).toBeInTheDocument();
    // The NODE badge distinguishes it from a regular ad.
    expect(row).toHaveTextContent('NODE');
    // A node ad has no Pin control (it attaches at the density, not by pinning).
    expect(screen.queryByTestId('ads-pin-node-1')).not.toBeInTheDocument();
  });

  it('the node ad row has an Edit button that opens the edit form pre-filled', async () => {
    renderAt('/monetize');
    const editBtn = await screen.findByTestId('ads-edit-node-1');
    fireEvent.click(editBtn);
    // The edit form opens (the shared AdForm), pre-filled with the ad's copy.
    expect(await screen.findByTestId('ad-edit-form')).toBeInTheDocument();
    expect(screen.getByTestId('ad-text')).toHaveValue('Sick of Youtube? Try exporting to web10!');
    expect(screen.getByTestId('ad-link')).toHaveValue('https://web10.app/export');
  });

  it('saving a node ad edit calls updateNodeAd with the same doc_id', async () => {
    renderAt('/monetize');
    fireEvent.click(await screen.findByTestId('ads-edit-node-1'));
    await screen.findByTestId('ad-edit-form');
    // Change the copy + pick the post format, then save.
    fireEvent.change(screen.getByTestId('ad-text'), { target: { value: 'Updated node ad copy' } });
    fireEvent.click(screen.getByTestId('ad-format-post'));
    fireEvent.click(screen.getByTestId('ad-save'));
    await waitFor(() => expect(updateNodeAd).toHaveBeenCalled());
    const call = (updateNodeAd as any).mock.calls[0];
    expect(call[0].doc.doc_id).toBe('node-1'); // same doc_id (the attach picks up the new version)
    expect(call[1].link).toBe('https://web10.app/export'); // offer preserved
    expect(call[5]).toBe('post'); // format passed through
  });
});

describe('Unified ad list — the scope filter (All | Regular | Node, node admin)', () => {
  const REGULAR_AD = {
    doc: { doc_id: 'ad-1', tags: ['ad'] },
    text: 'Everything I use, linked.',
    offer: { kind: 'affiliate', partner: 'Amazon', link: 'https://amzn.to/abc', cta: 'Get it', disclosure: '' },
    status: 'active' as const,
    media_refs: undefined,
    format: 'inline' as const,
    albums: [] as string[],
  };
  const NODE_AD = {
    doc: { doc_id: 'node-1', tags: ['ad', 'node_ad'] },
    text: 'Try the new workflow tool.',
    offer: { kind: 'direct', partner: '', link: 'https://workflowco.com?ref=node', cta: 'Learn more', disclosure: 'Sponsored' },
    status: 'active' as const,
    media_refs: undefined,
    format: 'inline' as const,
    albums: [] as string[],
  };

  beforeEach(() => {
    checkNodeAdmin.mockResolvedValue(true);
    getNodeConfig.mockResolvedValue({ node_ad_percentage: 10, node_ad_overwrite: false });
    readMyCatalog.mockResolvedValue({ ads: [REGULAR_AD], albums: [], posts: [] });
    readNodeAds.mockResolvedValue([NODE_AD]);
  });

  it('the node admin sees the scope filter with both ads in the unified list (All)', async () => {
    renderAt('/monetize');
    // The scope filter is present (admin only) with All | Regular | Node.
    expect(await screen.findByTestId('ads-scope-filter')).toBeInTheDocument();
    expect(screen.getByTestId('ads-scope-all')).toBeInTheDocument();
    expect(screen.getByTestId('ads-scope-regular')).toBeInTheDocument();
    expect(screen.getByTestId('ads-scope-node')).toBeInTheDocument();
    // All (default) → both the regular ad and the node ad are in the list.
    // `findByTestId` (async) — the node ad loads in parallel with the catalog;
    // a synchronous check races the render (flaky in CI).
    expect(await screen.findByTestId('ads-row-ad-1')).toBeInTheDocument();
    expect(await screen.findByTestId('ads-row-node-1')).toBeInTheDocument();
  });

  it('the Node scope shows only the node ad; Regular shows only the regular ad', async () => {
    renderAt('/monetize');
    await screen.findByTestId('ads-scope-filter');
    // Node scope → only the node ad.
    fireEvent.click(screen.getByTestId('ads-scope-node'));
    expect(await screen.findByTestId('ads-row-node-1')).toBeInTheDocument();
    expect(screen.queryByTestId('ads-row-ad-1')).not.toBeInTheDocument();
    // Regular scope → only the regular ad.
    fireEvent.click(screen.getByTestId('ads-scope-regular'));
    expect(await screen.findByTestId('ads-row-ad-1')).toBeInTheDocument();
    expect(screen.queryByTestId('ads-row-node-1')).not.toBeInTheDocument();
  });

  it('a non-admin has no scope filter (one list, their own ads)', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({ ads: [REGULAR_AD], albums: [], posts: [] });
    renderAt('/monetize');
    expect(await screen.findByTestId('creator-monetization')).toBeInTheDocument();
    expect(screen.queryByTestId('ads-scope-filter')).not.toBeInTheDocument();
  });
});

describe('AnalyticsSection — Tier 2 per-post drill-down', () => {
  const TOP_POSTS = [
    { doc_id: 'p1', impressions: 5000, reach: 1200, avgWatchPct: null },
    { doc_id: 'p2', impressions: 3000, reach: 800, avgWatchPct: 0.72 },
  ];
  const TOP_POST_DETAILS = [
    {
      doc_id: 'p1', impressions: 5000, reach: 1200, avgWatchPct: null,
      label: 'Behind the scenes: studio setup', thumbnailUrl: null,
      isAd: false, contentType: 'post' as const, adFormat: 'inline' as const,
    },
    {
      doc_id: 'p2', impressions: 3000, reach: 800, avgWatchPct: 0.72,
      label: 'Full breakdown: my editing workflow', thumbnailUrl: null,
      isAd: false, contentType: 'video' as const, adFormat: 'inline' as const,
    },
  ];
  const POST_ANALYTICS = {
    daily: [
      { day: '2026-10-10', impressions: 2000, reach: 500 },
      { day: '2026-10-11', impressions: 1500, reach: 400 },
      { day: '2026-10-12', impressions: 1500, reach: 300 },
    ],
    bySurface: [
      { surface: 'feed', impressions: 3000, reach: 700 },
      { surface: 'discover', impressions: 2000, reach: 500 },
    ],
    topPosts: [],
    totals: { impressions: 5000, reach: 1200 },
  };

  beforeEach(() => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue(EMPTY_CATALOG);
    readCreatorAnalytics.mockResolvedValue({
      daily: [],
      bySurface: [],
      topPosts: TOP_POSTS,
      totals: { impressions: 8000, reach: 2000 },
    });
    enrichTopPosts.mockResolvedValue(TOP_POST_DETAILS);
    readPostAnalytics.mockResolvedValue(POST_ANALYTICS);
  });

  it('clicking a Top Posts row drills into the per-post detail panel', async () => {
    renderAt('/monetize?tab=analytics');
    // The Top Posts list renders with the enriched details.
    const row = await screen.findByTestId('analytics-top-post-0');
    expect(row).toBeInTheDocument();
    expect(row).toHaveTextContent('Behind the scenes: studio setup');

    // Click the row → the per-post panel loads.
    fireEvent.click(row);
    expect(await screen.findByTestId('post-analytics-panel')).toBeInTheDocument();
    expect(screen.getByTestId('post-analytics-title')).toHaveTextContent('Behind the scenes: studio setup');
    // The post's own totals are shown.
    expect(screen.getByTestId('post-analytics-impressions')).toHaveTextContent('5k');
    expect(screen.getByTestId('post-analytics-reach')).toHaveTextContent('1.2k');
    // The surface breakdown is present.
    expect(screen.getByTestId('post-analytics-surfaces')).toBeInTheDocument();
    // The back button is present.
    expect(screen.getByTestId('post-analytics-back')).toBeInTheDocument();
  });

  it('the back button returns to the Tier 1 dashboard', async () => {
    renderAt('/monetize?tab=analytics');
    const row = await screen.findByTestId('analytics-top-post-0');
    fireEvent.click(row);
    await screen.findByTestId('post-analytics-panel');

    // Click back → the Tier 1 dashboard returns.
    fireEvent.click(screen.getByTestId('post-analytics-back'));
    expect(await screen.findByTestId('analytics-reach')).toBeInTheDocument();
    expect(screen.queryByTestId('post-analytics-panel')).not.toBeInTheDocument();
  });

  it('a deep link (?post=<doc_id>) renders the per-post panel directly', async () => {
    renderAt('/monetize?tab=analytics&post=p2');
    // The panel renders with p2's data.
    expect(await screen.findByTestId('post-analytics-panel')).toBeInTheDocument();
    expect(screen.getByTestId('post-analytics-title')).toHaveTextContent('Full breakdown: my editing workflow');
    // The watch % stat shows for video posts.
    expect(screen.getByTestId('post-analytics-watch-pct')).toHaveTextContent('72%');
  });

  it('the per-post panel shows the average watch % for video/short posts', async () => {
    renderAt('/monetize?tab=analytics&post=p2');
    expect(await screen.findByTestId('post-analytics-watch')).toBeInTheDocument();
    expect(screen.getByTestId('post-analytics-watch-pct')).toHaveTextContent('72%');
  });

  it('the per-post panel does NOT show the watch % for plain posts', async () => {
    renderAt('/monetize?tab=analytics&post=p1');
    await screen.findByTestId('post-analytics-panel');
    expect(screen.queryByTestId('post-analytics-watch')).not.toBeInTheDocument();
  });

  it('the per-post panel shows the projection when the post has a product ad', async () => {
    // p1 is a product ad with a $30 price, 10% commission.
    readMyCatalog.mockResolvedValue({
      ads: [{
        doc: { doc_id: 'p1', tags: ['ad'] },
        text: 'Ad for the grinder',
        offer: { kind: 'affiliate' as const, partner: 'Amazon', link: 'https://amzn.to/x', cta: 'Get it', disclosure: '' },
        status: 'active' as const,
        format: 'inline' as const,
        albums: [] as string[],
        product: { target: 'product' as const, name: 'Grinder', price: 30, commission: 10, commission_is_percent: true },
      }],
      albums: [],
      posts: [],
    });
    renderAt('/monetize?tab=analytics&post=p1');
    expect(await screen.findByTestId('post-analytics-projection')).toBeInTheDocument();
    // 5000 impressions × 0.01 CTR × 0.01 conv × $3 = $1.50
    expect(screen.getByTestId('post-analytics-projection-value')).toHaveTextContent('$1.5');
  });

  it('the per-post panel does NOT show the projection for a post with no product ad', async () => {
    renderAt('/monetize?tab=analytics&post=p1');
    await screen.findByTestId('post-analytics-panel');
    expect(screen.queryByTestId('post-analytics-projection')).not.toBeInTheDocument();
  });
});

describe('AnalyticsSection — Tier 2b per-ad drill-down', () => {
  const AD_TOP_POSTS = [
    { doc_id: 'ad-1', impressions: 5000, reach: 1200, avgWatchPct: null },
  ];
  const AD_TOP_DETAILS = [
    {
      doc_id: 'ad-1', impressions: 5000, reach: 1200, avgWatchPct: null,
      label: 'Sponsored: Nova Lens Pro', thumbnailUrl: null,
      isAd: true, contentType: 'post' as const, adFormat: 'inline' as const,
    },
  ];
  const AD_ANALYTICS = {
    daily: [
      { day: '2026-10-10', impressions: 2000, reach: 500 },
      { day: '2026-10-11', impressions: 1500, reach: 400 },
      { day: '2026-10-12', impressions: 1500, reach: 300 },
    ],
    bySurface: [
      { surface: 'feed', impressions: 3000, reach: 700 },
      { surface: 'discover', impressions: 2000, reach: 500 },
    ],
    topPosts: [],
    totals: { impressions: 5000, reach: 1200 },
  };

  beforeEach(() => {
    checkNodeAdmin.mockResolvedValue(false);
    readMyCatalog.mockResolvedValue({
      ads: [{
        doc: { doc_id: 'ad-1', tags: ['ad'] },
        text: 'Sponsored: Nova Lens Pro',
        offer: { kind: 'affiliate' as const, partner: 'Amazon', link: 'https://amzn.to/x', cta: 'Get it', disclosure: '' },
        status: 'active' as const,
        format: 'inline' as const,
        albums: [] as string[],
        product: { target: 'product' as const, name: 'Nova Lens Pro', price: 49, commission: 10, commission_is_percent: true },
      }],
      products: [],
      albums: [],
      posts: [
        { doc: { doc_id: 'p1' }, text: 'My review post', pinnedAdTarget: 'ad-1' },
        { doc: { doc_id: 'p2' }, text: 'Another post', pinnedAdTarget: '' },
      ],
    });
    readCreatorAnalytics.mockResolvedValue({
      daily: [],
      bySurface: [],
      topPosts: AD_TOP_POSTS,
      totals: { impressions: 5000, reach: 1200 },
    });
    enrichTopPosts.mockResolvedValue(AD_TOP_DETAILS);
    readPostAnalytics.mockResolvedValue(AD_ANALYTICS);
  });

  it('clicking an ad row in the Top Posts list drills into the per-ad panel', async () => {
    renderAt('/monetize?tab=analytics');
    // Switch to the Ads tab.
    fireEvent.click(await screen.findByTestId('analytics-top-tab-ads'));
    // The ad row is visible.
    const row = await screen.findByTestId('analytics-top-post-0');
    expect(row).toHaveTextContent('Sponsored: Nova Lens Pro');
    // Click → the per-ad panel loads.
    fireEvent.click(row);
    expect(await screen.findByTestId('ad-analytics-panel')).toBeInTheDocument();
    expect(screen.getByTestId('ad-analytics-title')).toHaveTextContent('Sponsored: Nova Lens Pro');
    expect(screen.getByTestId('ad-analytics-impressions')).toHaveTextContent('5k');
    expect(screen.getByTestId('ad-analytics-reach')).toHaveTextContent('1.2k');
    expect(screen.getByTestId('ad-analytics-back')).toBeInTheDocument();
  });

  it('a deep link (?ad=<doc_id>) renders the per-ad panel directly', async () => {
    renderAt('/monetize?tab=analytics&ad=ad-1');
    expect(await screen.findByTestId('ad-analytics-panel')).toBeInTheDocument();
    expect(screen.getByTestId('ad-analytics-title')).toHaveTextContent('Sponsored: Nova Lens Pro');
  });

  it('the per-ad panel shows the attached posts (reverse lookup)', async () => {
    renderAt('/monetize?tab=analytics&ad=ad-1');
    expect(await screen.findByTestId('ad-analytics-attached')).toBeInTheDocument();
    expect(screen.getByTestId('ad-analytics-attached')).toHaveTextContent('My review post');
  });

  it('the per-ad panel shows the product + projection when the ad has a product', async () => {
    renderAt('/monetize?tab=analytics&ad=ad-1');
    expect(await screen.findByTestId('ad-analytics-product')).toBeInTheDocument();
    expect(screen.getByTestId('ad-analytics-product')).toHaveTextContent('Nova Lens Pro');
    // 5000 impressions × 0.01 CTR × 0.01 conv × $4.90 (10% of $49) = $2.45
    expect(screen.getByTestId('ad-analytics-projection-value')).toBeInTheDocument();
  });

  it('the back button returns to the Tier 1 dashboard', async () => {
    renderAt('/monetize?tab=analytics&ad=ad-1');
    await screen.findByTestId('ad-analytics-panel');
    fireEvent.click(screen.getByTestId('ad-analytics-back'));
    expect(await screen.findByTestId('analytics-reach')).toBeInTheDocument();
    expect(screen.queryByTestId('ad-analytics-panel')).not.toBeInTheDocument();
  });
});
