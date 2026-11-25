import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);
import type { DiscoverPost, MediaItem } from '@web10/discover';

// The shared DiscoverCard's photo selection (grainy-feed report, 25.11.2026).
// The composer uploads two objects per image: the ORIGINAL (read_url → `url`)
// and a client-side 480px tile rendition (`thumbnail_url`). The card is the
// full-bleed reading surface — it must render the original. The thumbnailing
// contract (media/thumbnailing.md): an image doc's representative is its
// read_url; the small rendition is for tile grids, video posters, audio covers.
const imageMedia: MediaItem = {
  url: 'https://cdn.example/original.jpg?sig=x',
  mime_type: 'image/jpeg',
  width: 3000,
  height: 4000,
  thumbnail_url: 'https://cdn.example/thumb-480.webp?sig=y',
  created_at: new Date().toISOString(),
};

const post: DiscoverPost = {
  id: 'p-img',
  author: 'photo_creator',
  author_username: 'photo_creator',
  text: 'A photo',
  created_at: new Date().toISOString(),
  media: [imageMedia],
};

describe('DiscoverCard — the photo renders the original, not the 480px tile rendition', () => {
  it('single image: the card frame carries the original url', async () => {
    const { DiscoverCard } = await import('@web10/discover');
    render(<DiscoverCard post={post} remote testId="dc" />);
    const frame = await screen.findByTestId('discover-media-image');
    const img = frame.querySelector('img') as HTMLImageElement;
    await waitFor(() => {
      expect(img.src).toBe('https://cdn.example/original.jpg?sig=x');
    });
    expect(img.src).not.toContain('thumb-480');
  });

  it('degraded legacy media (no original, only the rendition) still renders the thumbnail', async () => {
    const { DiscoverCard } = await import('@web10/discover');
    // No usable original (degraded legacy media) → the rendition stays the
    // honest fallback.
    const legacy: DiscoverPost = {
      ...post,
      media: [{ ...imageMedia, url: '' }],
    };
    render(<DiscoverCard post={legacy} remote testId="dc-legacy" />);
    const frame = await screen.findByTestId('discover-media-image');
    const img = frame.querySelector('img') as HTMLImageElement;
    await waitFor(() => {
      expect(img.src).toBe('https://cdn.example/thumb-480.webp?sig=y');
    });
  });
});
