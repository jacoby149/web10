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
vi.mock('@/data/ads-catalog', () => ({
  checkNodeAdmin: (...a: unknown[]) => checkNodeAdmin(...a),
  readMyCatalog: (...a: unknown[]) => readMyCatalog(...a),
  readNodeAds: (...a: unknown[]) => readNodeAds(...a),
  getNodeConfig: (...a: unknown[]) => getNodeConfig(...a),
  saveNodeAdPercentage: (...a: unknown[]) => saveNodeAdPercentage(...a),
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
    // The Node tab is hidden from a non-admin.
    expect(screen.queryByTestId('monetization-tab-node')).not.toBeInTheDocument();
    expect(screen.getByTestId('monetization-tab-creator')).toBeInTheDocument();
  });

  it('shows the Node tab for a node admin', async () => {
    checkNodeAdmin.mockResolvedValue(true);
    renderAt('/monetize');
    expect(await screen.findByTestId('monetization-tab-node')).toBeInTheDocument();
    // Default tab is still Creator.
    expect(screen.getByTestId('creator-monetization')).toBeInTheDocument();
  });

  it('switches to the Node section when the admin taps the Node tab', async () => {
    checkNodeAdmin.mockResolvedValue(true);
    renderAt('/monetize');
    const nodeTab = await screen.findByTestId('monetization-tab-node');
    fireEvent.click(nodeTab);
    expect(await screen.findByTestId('node-monetization')).toBeInTheDocument();
    // The density control (the node-ad percentage slider) is present.
    expect(screen.getByTestId('node-ads-density')).toBeInTheDocument();
  });

  it('lands on the Node section when deep-linked to ?tab=node as an admin', async () => {
    checkNodeAdmin.mockResolvedValue(true);
    renderAt('/monetize?tab=node');
    expect(await screen.findByTestId('node-monetization')).toBeInTheDocument();
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
