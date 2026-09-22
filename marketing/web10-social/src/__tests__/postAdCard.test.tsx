import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as data from '@/data';

import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    countReactions: vi.fn().mockResolvedValue(3),
    readReactions: vi.fn().mockResolvedValue([]),
    toggleReactionKind: vi.fn().mockResolvedValue('like'),
  };
});

vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
  }),
  resetWapi: vi.fn(),
}));

const POST_AD = {
  _id: 'ad-1',
  text: 'Everything I use, linked.',
  offer: {
    kind: 'none',
    partner: '',
    link: 'https://amzn.to/abc',
    cta: 'Check it out',
    disclosure: 'I may earn a commission.',
  },
  status: 'active' as const,
  author_username: 'alice',
  variant: 'creator' as const,
  format: 'post' as const,
  albums: [] as string[],
};

const NODE_POST_AD = {
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
  format: 'post' as const,
};

describe('PostAdCard (the post-format ad)', () => {
  it('renders the creative text + offer CTA + disclosure like a post', async () => {
    const { PostAdCard } = await import('@/components/Feed/PostAdCard');
    render(<PostAdCard ad={POST_AD} />);
    expect(screen.getByTestId('post-ad-card')).toBeTruthy();
    expect(screen.getByText('Everything I use, linked.')).toBeTruthy();
    expect(screen.getByTestId('post-ad-cta')).toHaveTextContent('Check it out');
    expect(screen.getByTestId('post-ad-disclosure')).toHaveTextContent('I may earn a commission.');
  });

  it('a creator post ad is dressed as an "Ad" naming the web10 account', async () => {
    const { PostAdCard } = await import('@/components/Feed/PostAdCard');
    render(<PostAdCard ad={POST_AD} />);
    expect(screen.getByTestId('post-ad-card').getAttribute('data-ad-variant')).toBe('creator');
    expect(screen.getByTestId('post-ad-badge')).toHaveTextContent('Ad');
    expect(screen.getByTestId('post-ad-author')).toHaveTextContent('@alice');
  });

  it('a node post ad is dressed as "Sponsored" naming the node site', async () => {
    const { PostAdCard } = await import('@/components/Feed/PostAdCard');
    render(<PostAdCard ad={NODE_POST_AD} />);
    expect(screen.getByTestId('post-ad-card').getAttribute('data-ad-variant')).toBe('node');
    expect(screen.getByTestId('post-ad-badge')).toHaveTextContent('Sponsored');
    expect(screen.getByTestId('post-ad-author')).toHaveTextContent('nodeops');
  });

  it('the CTA links to the offer link in a new tab', async () => {
    const { PostAdCard } = await import('@/components/Feed/PostAdCard');
    render(<PostAdCard ad={POST_AD} />);
    const cta = screen.getByTestId('post-ad-cta');
    expect(cta.getAttribute('href')).toBe('https://amzn.to/abc');
    expect(cta.getAttribute('target')).toBe('_blank');
  });

  it('a blank CTA falls back to "Learn more" (not "Get it")', async () => {
    const { PostAdCard } = await import('@/components/Feed/PostAdCard');
    render(<PostAdCard ad={{ ...POST_AD, offer: { ...POST_AD.offer, cta: '' } }} />);
    expect(screen.getByTestId('post-ad-cta')).toHaveTextContent('Learn more');
  });
});

describe('AttachedAd (render per format)', () => {
  it('renders a full PostAdCard for format=post', async () => {
    const { AttachedAd } = await import('@/components/Feed/AttachedAd');
    render(<AttachedAd ad={POST_AD} />);
    expect(screen.getByTestId('post-ad-card')).toBeTruthy();
    expect(screen.queryByTestId('ad-block')).toBeNull();
  });

  it('renders the compact AdBlock for format=inline (default)', async () => {
    const { AttachedAd } = await import('@/components/Feed/AttachedAd');
    render(<AttachedAd ad={{ ...POST_AD, format: 'inline' }} />);
    expect(screen.getByTestId('ad-block')).toBeTruthy();
    expect(screen.queryByTestId('post-ad-card')).toBeNull();
  });
});
