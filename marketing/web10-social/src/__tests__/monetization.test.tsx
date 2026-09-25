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
vi.mock('@/data/ads-catalog', () => ({
  checkNodeAdmin: (...a: unknown[]) => checkNodeAdmin(...a),
  readMyCatalog: (...a: unknown[]) => readMyCatalog(...a),
  readNodeAds: (...a: unknown[]) => readNodeAds(...a),
  getNodeConfig: (...a: unknown[]) => getNodeConfig(...a),
  saveNodeAdPercentage: (...a: unknown[]) => saveNodeAdPercentage(...a),
  saveNodeAdOverwrite: (...a: unknown[]) => saveNodeAdOverwrite(...a),
  updateAd: (...a: unknown[]) => updateAd(...a),
  updateNodeAd: (...a: unknown[]) => updateNodeAd(...a),
  buildOfferBody: vi.fn(),
  buildNodeAdBody: vi.fn(),
  splitCatalog: vi.fn(),
  splitNodeAds: vi.fn(),
  isNodeAd: vi.fn(),
  parseAd: vi.fn(),
  parseAlbum: vi.fn(),
  readMyAds: vi.fn(),
  ensureFollowersGroup: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  readMyCatalog.mockResolvedValue(EMPTY_CATALOG);
  readNodeAds.mockResolvedValue([]);
  getNodeConfig.mockResolvedValue({ node_ad_percentage: 10 });
  saveNodeAdPercentage.mockResolvedValue(undefined);
});

describe('MonetizationScreen', () => {
  it('renders the Creator section by default for a non-admin', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    renderAt('/monetize');
    expect(await screen.findByTestId('creator-monetization')).toBeInTheDocument();
    // The Node section is never rendered for a non-admin.
    expect(screen.queryByTestId('node-monetization')).not.toBeInTheDocument();
    // There is no in-page tab switcher — the nav is the switcher.
    expect(screen.queryByTestId('monetization-tabs')).not.toBeInTheDocument();
  });

  it('renders the Creator section by default for a node admin too', async () => {
    checkNodeAdmin.mockResolvedValue(true);
    renderAt('/monetize');
    expect(await screen.findByTestId('creator-monetization')).toBeInTheDocument();
    expect(screen.queryByTestId('node-monetization')).not.toBeInTheDocument();
    // No in-page switcher — an admin reaches the Node section via the nav
    // (deep-link to ?tab=node), not a tab on this screen.
    expect(screen.queryByTestId('monetization-tabs')).not.toBeInTheDocument();
  });

  it('lands on the Node section when deep-linked to ?tab=node as an admin', async () => {
    checkNodeAdmin.mockResolvedValue(true);
    renderAt('/monetize?tab=node');
    expect(await screen.findByTestId('node-monetization')).toBeInTheDocument();
    // The density control (the node-ad percentage slider) is present.
    expect(screen.getByTestId('node-ads-density')).toBeInTheDocument();
  });

  it('falls back to Creator when a non-admin is deep-linked to ?tab=node', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    renderAt('/monetize?tab=node');
    // The Node section is never rendered for a non-admin.
    expect(await screen.findByTestId('creator-monetization')).toBeInTheDocument();
    expect(screen.queryByTestId('node-monetization')).not.toBeInTheDocument();
  });

  it('renders the affiliate onboarding in the Creator section', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    renderAt('/monetize');
    expect(await screen.findByTestId('affiliate-programs-card')).toBeInTheDocument();
    // The ad catalog card is present.
    expect(screen.getByTestId('ads-catalog-card')).toBeInTheDocument();
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
});

describe('NodeMonetization — overwrite knob (ad-improvements.md)', () => {
  it('shows the overwrite toggle for a node admin', async () => {
    checkNodeAdmin.mockResolvedValue(true);
    getNodeConfig.mockResolvedValue({ node_ad_percentage: 10, node_ad_overwrite: false });
    renderAt('/monetize?tab=node');
    expect(await screen.findByTestId('node-monetization')).toBeInTheDocument();
    expect(screen.getByTestId('node-ads-overwrite')).toBeInTheDocument();
    const toggle = screen.getByTestId('node-ads-overwrite-toggle');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('toggling overwrite saves the setting', async () => {
    checkNodeAdmin.mockResolvedValue(true);
    getNodeConfig.mockResolvedValue({ node_ad_percentage: 10, node_ad_overwrite: false });
    saveNodeAdOverwrite.mockResolvedValue(undefined);
    renderAt('/monetize?tab=node');
    const toggle = await screen.findByTestId('node-ads-overwrite-toggle');
    // The toggle is disabled until the config loads (pctLoaded) — wait for it.
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(saveNodeAdOverwrite).toHaveBeenCalledWith(true));
  });
});

describe('NodeMonetization — node ad edit (parity with creator ads)', () => {
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

  it('the node ad row has an Edit button that opens the edit form pre-filled', async () => {
    renderAt('/monetize?tab=node');
    const editBtn = await screen.findByTestId('node-ads-edit-node-1');
    fireEvent.click(editBtn);
    // The edit form opens (not the new form), pre-filled with the ad's copy.
    expect(await screen.findByTestId('node-ad-edit-form')).toBeInTheDocument();
    expect(screen.getByTestId('node-ad-text')).toHaveValue('Sick of Youtube? Try exporting to web10!');
    expect(screen.getByTestId('node-ad-link')).toHaveValue('https://web10.app/export');
  });

  it('saving an edit calls updateNodeAd with the same doc_id', async () => {
    renderAt('/monetize?tab=node');
    fireEvent.click(await screen.findByTestId('node-ads-edit-node-1'));
    await screen.findByTestId('node-ad-edit-form');
    // Change the copy + pick the post format, then save.
    fireEvent.change(screen.getByTestId('node-ad-text'), { target: { value: 'Updated node ad copy' } });
    fireEvent.click(screen.getByTestId('node-ad-format-post'));
    fireEvent.click(screen.getByTestId('node-ad-save'));
    await waitFor(() => expect(updateNodeAd).toHaveBeenCalled());
    const call = (updateNodeAd as any).mock.calls[0];
    expect(call[0].doc.doc_id).toBe('node-1'); // same doc_id (the attach picks up the new version)
    expect(call[1].link).toBe('https://web10.app/export'); // offer preserved
    expect(call[5]).toBe('post'); // format passed through
  });

  it('the New Node Ad form keeps the create flow', async () => {
    renderAt('/monetize?tab=node');
    fireEvent.click(await screen.findByTestId('node-ads-new'));
    expect(await screen.findByTestId('node-ad-new-form')).toBeInTheDocument();
    // The CTA suggestion chips are present (parity with the creator's form).
    expect(screen.getByTestId('node-ad-cta-suggest-check-it-out')).toBeInTheDocument();
  });
});
