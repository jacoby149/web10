import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as data from '@/data';

import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    createPost: vi.fn().mockResolvedValue({ _id: 'p1' }),
    readMyAds: vi.fn().mockResolvedValue({ ads: [], albums: [] }),
    readProfile: vi.fn().mockResolvedValue(null),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    fanOutToFollowers: vi.fn().mockResolvedValue(undefined),
    uploadMedia: vi.fn(),
  };
});

vi.mock('@/data/settings', () => ({
  readSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
  }),
  resetWapi: vi.fn(),
}));

const AD = {
  _id: 'ad-1',
  text: 'Everything I use, linked.',
  offer: {
    kind: 'affiliate',
    partner: 'Amazon',
    link: 'https://amzn.to/abc',
    cta: 'Get it',
    disclosure: 'I may earn a commission.',
  },
  status: 'active' as const,
  author_username: 'alice',
  variant: 'creator' as const,
  albums: [] as string[],
};

const NODE_AD = {
  _id: 'node-1',
  text: 'Try the new workflow tool.',
  offer: {
    kind: 'direct',
    partner: 'WorkflowCo',
    link: 'https://workflowco.com?ref=node',
    cta: 'Learn more',
    disclosure: 'Sponsored by this node.',
  },
  status: 'active' as const,
  author_username: 'nodeops',
  variant: 'node' as const,
};

describe('AdBlock', () => {
  it('renders the creative text + offer + disclosure', async () => {
    const { AdBlock } = await import('@/components/Feed/AdBlock');
    render(<AdBlock ad={AD} />);
    expect(screen.getByTestId('ad-block')).toBeTruthy();
    expect(screen.getByText('Everything I use, linked.')).toBeTruthy();
    expect(screen.getByText('Amazon')).toBeTruthy();
    expect(screen.getByText('Get it')).toBeTruthy();
  });

  it('always shows the disclosure (never hidden), naming who made it', async () => {
    const { AdBlock } = await import('@/components/Feed/AdBlock');
    render(<AdBlock ad={AD} />);
    expect(screen.getByTestId('ad-disclosure')).toBeTruthy();
    expect(screen.getByTestId('ad-disclosure')).toHaveTextContent('I may earn a commission.');
    expect(screen.getByTestId('ad-disclosure')).toHaveTextContent('@alice');
  });

  it('the CTA links to the offer link in a new tab', async () => {
    const { AdBlock } = await import('@/components/Feed/AdBlock');
    render(<AdBlock ad={AD} />);
    const cta = screen.getByTestId('ad-cta');
    expect(cta.getAttribute('href')).toBe('https://amzn.to/abc');
    expect(cta.getAttribute('target')).toBe('_blank');
  });

  it('a creator ad is dressed as an "Ad" naming the web10 account', async () => {
    const { AdBlock } = await import('@/components/Feed/AdBlock');
    render(<AdBlock ad={AD} />);
    expect(screen.getByTestId('ad-block').getAttribute('data-ad-variant')).toBe('creator');
    expect(screen.getByTestId('ad-provenance-badge')).toHaveTextContent('Ad');
    expect(screen.getByTestId('ad-provenance')).toHaveTextContent('@alice');
  });

  it('a node ad is dressed as "Sponsored" naming the node site', async () => {
    const { AdBlock } = await import('@/components/Feed/AdBlock');
    render(<AdBlock ad={NODE_AD} />);
    expect(screen.getByTestId('ad-block').getAttribute('data-ad-variant')).toBe('node');
    expect(screen.getByTestId('ad-provenance-badge')).toHaveTextContent('Sponsored');
    expect(screen.getByTestId('ad-provenance')).toHaveTextContent('nodeops');
    expect(screen.getByTestId('ad-disclosure')).toHaveTextContent('by nodeops');
  });

  it('a creator ad with no author falls back to @creator', async () => {
    const { AdBlock } = await import('@/components/Feed/AdBlock');
    render(<AdBlock ad={{ _id: 'ad-2', text: 'x', offer: { link: 'https://x', cta: 'Go', disclosure: 'd' } }} />);
    expect(screen.getByTestId('ad-provenance')).toHaveTextContent('@creator');
  });
});

describe('PostComposer — pin an ad', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (data.readMyAds as any).mockResolvedValue({ ads: [AD], albums: [] });
  });

  it('opens the picker from the pin button', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    fireEvent.click(await screen.findByTestId('pin-ad-button'));
    expect(await screen.findByTestId('ad-picker')).toBeTruthy();
  });

  it('selecting an ad sets the pinned-ad chip', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    fireEvent.click(await screen.findByTestId('pin-ad-button'));
    fireEvent.click(await screen.findByTestId('ad-picker-item-ad-1'));
    expect(await screen.findByTestId('pinned-ad-chip')).toBeTruthy();
  });

  it('posting with a pinned ad passes ad_preference to createPost', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    // type some text so the post is valid
    const textarea = screen.getByPlaceholderText("What's on your mind?");
    fireEvent.change(textarea, { target: { value: 'my post' } });
    // pin an ad
    fireEvent.click(screen.getByTestId('pin-ad-button'));
    fireEvent.click(await screen.findByTestId('ad-picker-item-ad-1'));
    await screen.findByTestId('pinned-ad-chip');
    // submit
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(data.createPost).toHaveBeenCalled());
    const call = (data.createPost as any).mock.calls[0];
    expect(call[2]).toEqual({ mode: 'pinned', target: 'ad-1' });
  });

  it('posting without a pinned ad omits ad_preference', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    const textarea = screen.getByPlaceholderText("What's on your mind?");
    fireEvent.change(textarea, { target: { value: 'my post' } });
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(data.createPost).toHaveBeenCalled());
    const call = (data.createPost as any).mock.calls[0];
    expect(call[2]).toBeUndefined();
  });
});
