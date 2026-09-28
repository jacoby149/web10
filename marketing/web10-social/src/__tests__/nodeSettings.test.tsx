import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// ── The admin gate (useNodeAdmin → checkNodeAdmin) ──────────────────────────
const checkNodeAdmin = vi.fn();
vi.mock('@/data/ads-catalog', () => ({
  checkNodeAdmin: (...a: unknown[]) => checkNodeAdmin(...a),
  getNodeConfig: vi.fn().mockResolvedValue({
    moderation_enabled: true,
    auto_moderate: true,
    sensitive_words: ['slur'],
    auto_hide_users: [],
  }),
}));

// ── The moderation data layer ────────────────────────────────────────────────
const readModerationFlags = vi.fn();
const setUserAutoHidden = vi.fn();
const saveModerationConfig = vi.fn();
const hidePostFromBoard = vi.fn();
const unhidePostFromBoard = vi.fn();
const readUserPostsForModeration = vi.fn();
vi.mock('@/data/moderation', async () => {
  const actual = await vi.importActual<typeof import('@/data/moderation')>('@/data/moderation');
  return {
    ...actual,
    readModerationFlags: (...a: unknown[]) => readModerationFlags(...a),
    setUserAutoHidden: (...a: unknown[]) => setUserAutoHidden(...a),
    saveModerationConfig: (...a: unknown[]) => saveModerationConfig(...a),
    hidePostFromBoard: (...a: unknown[]) => hidePostFromBoard(...a),
    unhidePostFromBoard: (...a: unknown[]) => unhidePostFromBoard(...a),
    readUserPostsForModeration: (...a: unknown[]) => readUserPostsForModeration(...a),
  };
});

// ── The people search (People tab) ──────────────────────────────────────────
const fetchPeoplePage = vi.fn();
vi.mock('@/data', async () => {
  const actual = await vi.importActual<typeof import('@/data')>('@/data');
  return {
    ...actual,
    fetchPeoplePage: (...a: unknown[]) => fetchPeoplePage(...a),
  };
});

// ── The post + profile reads (Link tab) ─────────────────────────────────────
const readPostById = vi.fn();
vi.mock('@/data/posts', async () => {
  const actual = await vi.importActual<typeof import('@/data/posts')>('@/data/posts');
  return { ...actual, readPostById: (...a: unknown[]) => readPostById(...a) };
});
const lookupUserProfile = vi.fn();
vi.mock('@/data/profile', async () => {
  const actual = await vi.importActual<typeof import('@/data/profile')>('@/data/profile');
  return { ...actual, lookupUserProfile: (...a: unknown[]) => lookupUserProfile(...a) };
});

import NodeSettingsScreen from '@/components/NodeSettings/NodeSettingsScreen';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NodeSettingsScreen />
    </MemoryRouter>,
  );
}

const PERSON = {
  username: 'badguy',
  provider: 'web10.app',
  display_name: 'Bad Guy',
  followers_count: 5,
  mutuals: 0,
  is_following: false,
  avatar_url: undefined,
  banner_url: undefined,
};

const POST = { _id: 'post-1', text: 'escorts for hire', created_at: '2026-01-01T00:00:00Z' };

beforeEach(() => {
  vi.clearAllMocks();
  checkNodeAdmin.mockResolvedValue(true);
  readModerationFlags.mockResolvedValue([
    { username: 'badguy', flag_count: 2, last_flagged: '2026-01-01', matched_words: ['word'] },
  ]);
  setUserAutoHidden.mockResolvedValue(['badguy']);
  saveModerationConfig.mockResolvedValue(undefined);
  hidePostFromBoard.mockResolvedValue(undefined);
  unhidePostFromBoard.mockResolvedValue(undefined);
  fetchPeoplePage.mockResolvedValue({ people: [PERSON], hasMore: false });
  readUserPostsForModeration.mockResolvedValue({ posts: [POST], face: { username: 'badguy', provider: 'web10.app', display_name: 'Bad Guy' } });
  readPostById.mockResolvedValue(POST);
  lookupUserProfile.mockResolvedValue({ username: 'badguy', provider: 'web10.app', display_name: 'Bad Guy' });
});

describe('NodeSettingsScreen — the admin gate', () => {
  it('shows the "not the node owner" state for a non-admin', async () => {
    checkNodeAdmin.mockResolvedValue(false);
    renderAt('/node-settings');
    expect(await screen.findByTestId('node-settings-not-admin')).toBeInTheDocument();
    // The tabs are never rendered for a non-admin.
    expect(screen.queryByTestId('node-settings-tabs')).not.toBeInTheDocument();
  });

  it('renders the tabs for a node admin', async () => {
    renderAt('/node-settings');
    expect(await screen.findByTestId('node-settings-tabs')).toBeInTheDocument();
    // Moderation is the default tab (resolves once the node config loads).
    expect(await screen.findByTestId('moderation-tab')).toBeInTheDocument();
  });
});

describe('NodeSettingsScreen — the Moderation tab', () => {
  it('renders the blocklist words from the node config', async () => {
    renderAt('/node-settings');
    expect(await screen.findByTestId('moderation-word-slur')).toBeInTheDocument();
  });

  it('renders the review queue with a Keep-hiding action', async () => {
    renderAt('/node-settings');
    expect(await screen.findByTestId('moderation-flag-badguy')).toBeInTheDocument();
    expect(screen.getByTestId('moderation-flag-toggle-badguy')).toBeInTheDocument();
  });

  it('adds a word to the blocklist', async () => {
    renderAt('/node-settings');
    const input = await screen.findByTestId('moderation-word-input');
    fireEvent.change(input, { target: { value: 'newword' } });
    fireEvent.click(screen.getByTestId('moderation-word-add'));
    await waitFor(() => expect(saveModerationConfig).toHaveBeenCalledWith(
      expect.objectContaining({ sensitive_words: ['slur', 'newword'] }),
    ));
  });

  it('toggles a flagged user to "Keep hiding" (adds to auto_hide_users)', async () => {
    renderAt('/node-settings');
    fireEvent.click(await screen.findByTestId('moderation-flag-toggle-badguy'));
    await waitFor(() => expect(setUserAutoHidden).toHaveBeenCalledWith('badguy', true));
  });
});

describe('NodeSettingsScreen — the People tab', () => {
  it('lists the node people from the D0 read', async () => {
    renderAt('/node-settings?tab=people');
    expect(await screen.findByTestId('person-row-badguy')).toBeInTheDocument();
    expect(fetchPeoplePage).toHaveBeenCalled();
  });

  it('filters the list by the search query', async () => {
    renderAt('/node-settings?tab=people');
    const input = await screen.findByTestId('people-search-input');
    fireEvent.change(input, { target: { value: 'nomatch' } });
    await waitFor(() => expect(screen.queryByTestId('person-row-badguy')).not.toBeInTheDocument());
  });

  it('expands a person to show their posts', async () => {
    renderAt('/node-settings?tab=people');
    fireEvent.click(await screen.findByTestId('person-view-badguy'));
    expect(await screen.findByTestId('person-post-post-1')).toBeInTheDocument();
    expect(readUserPostsForModeration).toHaveBeenCalledWith('badguy');
  });

  it('hides a user (adds to auto_hide_users)', async () => {
    renderAt('/node-settings?tab=people');
    fireEvent.click(await screen.findByTestId('person-hide-badguy'));
    await waitFor(() => expect(setUserAutoHidden).toHaveBeenCalledWith('badguy', true));
  });

  it('hides a specific post (board takedown)', async () => {
    renderAt('/node-settings?tab=people');
    fireEvent.click(await screen.findByTestId('person-view-badguy'));
    fireEvent.click(await screen.findByTestId('person-post-hide-post-1'));
    await waitFor(() => expect(hidePostFromBoard).toHaveBeenCalledWith('post-1'));
  });
});

describe('NodeSettingsScreen — the Link tab', () => {
  it('shows a parse error for a non-web10 link', async () => {
    renderAt('/node-settings?tab=link');
    const input = await screen.findByTestId('link-input');
    fireEvent.change(input, { target: { value: 'https://example.com/foo' } });
    fireEvent.click(screen.getByTestId('link-load'));
    expect(await screen.findByTestId('link-parse-error')).toBeInTheDocument();
  });

  it('pulls up a post + its author from a post link', async () => {
    renderAt('/node-settings?tab=link');
    const input = await screen.findByTestId('link-input');
    fireEvent.change(input, { target: { value: 'https://social.web10.app/u/badguy/p/post-1' } });
    fireEvent.click(screen.getByTestId('link-load'));
    expect(await screen.findByTestId('link-post')).toBeInTheDocument();
    expect(screen.getByTestId('link-user')).toBeInTheDocument();
    expect(readPostById).toHaveBeenCalledWith('post-1');
  });

  it('hides the post from a post link', async () => {
    renderAt('/node-settings?tab=link');
    const input = await screen.findByTestId('link-input');
    fireEvent.change(input, { target: { value: '/u/badguy/p/post-1' } });
    fireEvent.click(screen.getByTestId('link-load'));
    fireEvent.click(await screen.findByTestId('link-hide-post'));
    await waitFor(() => expect(hidePostFromBoard).toHaveBeenCalledWith('post-1'));
  });

  it('hides the user from a post link', async () => {
    renderAt('/node-settings?tab=link');
    const input = await screen.findByTestId('link-input');
    fireEvent.change(input, { target: { value: '/u/badguy/p/post-1' } });
    fireEvent.click(screen.getByTestId('link-load'));
    fireEvent.click(await screen.findByTestId('link-hide-user'));
    await waitFor(() => expect(setUserAutoHidden).toHaveBeenCalledWith('badguy', true));
  });

  it('pulls up a user + their posts from a profile link', async () => {
    renderAt('/node-settings?tab=link');
    const input = await screen.findByTestId('link-input');
    fireEvent.change(input, { target: { value: '/u/badguy' } });
    fireEvent.click(screen.getByTestId('link-load'));
    expect(await screen.findByTestId('link-user')).toBeInTheDocument();
    expect(readUserPostsForModeration).toHaveBeenCalledWith('badguy');
  });
});
