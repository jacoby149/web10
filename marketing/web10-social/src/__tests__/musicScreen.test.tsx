import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import * as data from '@/data';

// Mock lucide-react icons (any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock the data layer — the Music feed (the render-time gate output) + the
// views read + the profile read the screen runs to populate author faces.
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readMusicPage: vi.fn().mockResolvedValue({ tracks: [], hasMore: false }),
    readViewCounts: vi.fn().mockResolvedValue({}),
    readUserProfile: vi.fn().mockResolvedValue(null),
  };
});

// The shared discover package (formatCount).
vi.mock('@web10/discover', () => ({
  formatCount: (n: number) => n.toLocaleString(),
}));

import MusicScreen from '@/components/Music/MusicScreen';
import type { MusicTrack } from '@/data';

function track(over: { id: string; author: string; title?: string; mime?: string; duration?: number; thumb?: string }) {
  return {
    post: {
      _id: over.id,
      author_username: over.author,
      title: over.title,
      text: '',
      created_at: '2026-07-18T00:00:00Z',
    },
    media: {
      _id: `m-${over.id}`,
      url: `https://cdn/${over.id}.mp3`,
      mime_type: over.mime || 'audio/mpeg',
      duration_seconds: over.duration ?? 180,
      thumbnail_url: over.thumb,
    },
  } as MusicTrack;
}

function renderScreen(tracks: MusicTrack[] = []) {
  (data.readMusicPage as ReturnType<typeof vi.fn>).mockResolvedValue({ tracks, hasMore: false });
  return render(
    <MemoryRouter initialEntries={['/music']}>
      <MusicScreen />
    </MemoryRouter>,
  );
}

describe('MusicScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a wall of track cards with title, author, and duration', async () => {
    renderScreen([
      track({ id: 't1', author: 'alice', title: 'Midnight Drive', duration: 245 }),
      track({ id: 't2', author: 'bob', title: 'Sunset Loop' }),
    ]);

    await waitFor(() => {
      expect(screen.getAllByTestId('music-track-card')).toHaveLength(2);
    });

    // Titles render.
    expect(screen.getByText('Midnight Drive')).toBeInTheDocument();
    expect(screen.getByText('Sunset Loop')).toBeInTheDocument();

    // Authors render (@handle).
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(screen.getByText('@bob')).toBeInTheDocument();

    // Duration renders (4:05 for 245s, 3:00 for 180s default).
    expect(screen.getByText('4:05')).toBeInTheDocument();
    expect(screen.getByText('3:00')).toBeInTheDocument();
  });

  it('shows the default musical-note fallback when a track has no album art', async () => {
    // No thumbnail_url → the fallback gradient + note icon renders (not an img).
    renderScreen([track({ id: 't1', author: 'alice', title: 'No Art' })]);

    await waitFor(() => {
      expect(screen.getAllByTestId('music-track-card')).toHaveLength(1);
    });

    // The card should NOT contain an <img> for the cover (no thumbnail_url).
    const card = screen.getByTestId('music-track-card');
    expect(card.querySelector('img[alt="Album art"]')).toBeNull();
  });

  it('shows the uploaded album art when a track has a thumbnail', async () => {
    renderScreen([
      track({ id: 't1', author: 'alice', title: 'With Art', thumb: 'https://cdn/art.jpg' }),
    ]);

    await waitFor(() => {
      expect(screen.getAllByTestId('music-track-card')).toHaveLength(1);
    });

    const card = screen.getByTestId('music-track-card');
    const img = card.querySelector('img[alt="With Art"]');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://cdn/art.jpg');
  });

  it('shows the empty state when there are no tracks', async () => {
    renderScreen([]);

    await waitFor(() => {
      expect(screen.getByText(/No music yet/)).toBeInTheDocument();
    });
  });

  it('filters tracks by ?q= search query', async () => {
    (data.readMusicPage as ReturnType<typeof vi.fn>).mockResolvedValue({
      tracks: [
        track({ id: 't1', author: 'alice', title: 'Midnight Drive' }),
        track({ id: 't2', author: 'bob', title: 'Sunset Loop' }),
      ],
      hasMore: false,
    });

    render(
      <MemoryRouter initialEntries={['/music?q=midnight']}>
        <MusicScreen />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('music-track-card')).toHaveLength(1);
    });

    expect(screen.getByText('Midnight Drive')).toBeInTheDocument();
    expect(screen.queryByText('Sunset Loop')).toBeNull();
    // The query chip shows.
    expect(screen.getByText('midnight')).toBeInTheDocument();
  });
});
