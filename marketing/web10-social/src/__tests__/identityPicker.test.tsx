import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as data from '@/data';

import { lucideMock } from './helpers/lucideMock';
import { typeInComposer } from './helpers/tiptap';
vi.mock('lucide-react', () => lucideMock);

vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    createPost: vi.fn().mockResolvedValue({ _id: 'p1' }),
    createRepost: vi.fn().mockResolvedValue({ _id: 'rp1' }),
    readMyAds: vi.fn().mockResolvedValue({ ads: [], albums: [] }),
    readProfile: vi.fn().mockResolvedValue({ display_name: 'Test User', avatar_ref: undefined }),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    fanOutToFollowers: vi.fn().mockResolvedValue(undefined),
    uploadMedia: vi.fn(),
    getGroupsManages: vi.fn().mockResolvedValue([
      { group_id: 'test.localhost/groups/users/testuser/mygroup', my_role: 'owner' },
      { group_id: 'test.localhost/groups/users/other/othergroup', my_role: 'moderator' },
    ]),
    readGroupIdentity: vi.fn().mockImplementation(async (groupId: string) => {
      if (groupId.includes('mygroup')) return { name: 'My Group' };
      if (groupId.includes('othergroup')) return { name: 'Other Group' };
      return {};
    }),
    getDiscoverGroupId: vi.fn().mockReturnValue('test.localhost/groups/web10/discover'),
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

describe('PostComposer — identity picker (group-as-author, A4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the identity picker button when the caller manages groups', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    await waitFor(() => {
      expect(screen.getByTestId('identity-picker-button')).toBeInTheDocument();
    });
    // Default label is "You"
    expect(screen.getByTestId('identity-picker-button')).toHaveTextContent('You');
  });

  it('opens the picker menu on click and shows "You" + managed groups', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    const button = await screen.findByTestId('identity-picker-button');
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByTestId('identity-picker-menu')).toBeInTheDocument();
    });
    // "You" option
    expect(screen.getByTestId('identity-option-you')).toBeInTheDocument();
    expect(screen.getByTestId('identity-option-you')).toHaveTextContent('Test User');
    // Group options
    const groupOptions = screen.getAllByTestId('identity-option-group');
    expect(groupOptions).toHaveLength(2);
    expect(groupOptions[0]).toHaveTextContent('My Group');
    expect(groupOptions[1]).toHaveTextContent('Other Group');
  });

  it('swaps the composer header when a group is selected', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    const button = await screen.findByTestId('identity-picker-button');
    fireEvent.click(button);
    const groupOption = (await screen.findAllByTestId('identity-option-group'))[0];
    fireEvent.click(groupOption);
    // Header now shows the group name
    await waitFor(() => {
      expect(screen.getByTestId('composer-author-name')).toHaveTextContent('My Group');
    });
    // Handle shows "Group"
    expect(screen.getByTestId('composer-author-handle')).toHaveTextContent('Group');
    // Button label updates
    expect(screen.getByTestId('identity-picker-button')).toHaveTextContent('My Group');
  });

  it('passes authorAs to createPost when a group is selected', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    const button = await screen.findByTestId('identity-picker-button');
    fireEvent.click(button);
    const groupOption = (await screen.findAllByTestId('identity-option-group'))[0];
    fireEvent.click(groupOption);
    // Type some text (await — flushes the re-render that enables submit).
    await typeInComposer('Hello from the group');
    // Submit
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => {
      expect(data.createPost).toHaveBeenCalled();
    });
    const call = (data.createPost as ReturnType<typeof vi.fn>).mock.calls[0];
    // 4th arg is authorAs
    expect(call[3]).toBe('test.localhost/groups/users/testuser/mygroup');
    // 2nd arg is targetGroups (discover group)
    expect(call[1]).toContain('test.localhost/groups/web10/discover');
  });

  it('does not show the picker in edit mode', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    const editPost: data.PostRecord = {
      _id: 'edit-1',
      text: 'Existing post',
      created_at: '2026-09-17T10:00:00Z',
      author_username: 'testuser',
    };
    render(<PostComposer editingPost={editPost} />);
    // Wait for the picker data to load (it won't show, but the effect runs)
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('identity-picker-button')).not.toBeInTheDocument();
  });

  it('does not show the picker in repost mode', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    const original: data.PostRecord = {
      _id: 'orig-1',
      text: 'Original',
      created_at: '2026-09-17T10:00:00Z',
      author_username: 'alice',
    };
    render(<PostComposer repostingTo={original} onRepostCancel={() => {}} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('identity-picker-button')).not.toBeInTheDocument();
  });

  it('does not show the picker when the caller manages no groups', async () => {
    vi.mocked(data.getGroupsManages).mockResolvedValueOnce([]);
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('identity-picker-button')).not.toBeInTheDocument();
  });
});
