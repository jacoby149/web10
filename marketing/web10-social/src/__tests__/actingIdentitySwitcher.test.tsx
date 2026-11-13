import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ActingIdentitySwitcher from '@/components/Social/ActingIdentitySwitcher';

const mocks = vi.hoisted(() => ({
  getMyGroups: vi.fn(), getGroup: vi.fn(), readGroupIdentity: vi.fn(), select: vi.fn(), query: vi.fn(), selected: undefined as string | undefined,
}));
vi.mock('@/data/v3', () => ({ getV3Client: () => ({
  readToken: () => ({ provider: 'test', username: 'alice' }),
  getMyGroups: mocks.getMyGroups, getGroup: mocks.getGroup, query: mocks.query,
}) }));
vi.mock('@/data/groups', () => ({ readGroupIdentity: mocks.readGroupIdentity }));
vi.mock('@/data/actingIdentity', () => ({ useActingAuthor: () => mocks.selected, selectActingAuthor: mocks.select }));

describe('ActingIdentitySwitcher partial loading', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.selected = undefined;
    sessionStorage.clear();
    mocks.getMyGroups.mockResolvedValue(['good', 'detail-fails', 'face-fails', 'ineligible'].map((group_id) => ({ group_id, my_role: 'writer' })));
    mocks.getGroup.mockImplementation(async (id: string) => {
      if (id === 'detail-fails') throw new Error('detail unavailable');
      return { group_id: id, roles: [{ name: 'writer', permissions: { posts: id === 'ineligible' ? [] : ['create'] } }] };
    });
    mocks.readGroupIdentity.mockImplementation(async (id: string) => {
      if (id === 'face-fails') throw new Error('face unavailable');
      return { name: `Group ${id}` };
    });
    mocks.query.mockResolvedValue({ rows: [] });
  });

  it('opens a profile-first menu without loading groups or changing posting identity', () => {
    const onViewProfile = vi.fn();
    render(<ActingIdentitySwitcher personalName="Alice" onViewProfile={onViewProfile} />);
    fireEvent.keyDown(screen.getByTestId('acting-identity-trigger'), { key: 'ArrowDown' });
    expect(screen.getByRole('menu', { name: 'Profile' })).toBeInTheDocument();
    expect(mocks.getMyGroups).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'View profile' }));
    expect(onViewProfile).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('keeps active group posting visible while profile navigation stays personal', () => {
    mocks.selected = 'good';
    const onViewProfile = vi.fn();
    render(<ActingIdentitySwitcher personalName="Alice" onViewProfile={onViewProfile} />);
    expect(screen.getByText('Acting as')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('acting-identity-trigger'), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'View profile' }));
    expect(onViewProfile).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.selected).toBe('good');
  });

  it('keeps the confirmed identity picker behind an explicit secondary action', async () => {
    render(<ActingIdentitySwitcher personalName="Alice" onViewProfile={vi.fn()} />);
    fireEvent.keyDown(screen.getByTestId('acting-identity-trigger'), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change identity' }));
    await screen.findByRole('button', { name: /^Group good\s*Group$/ });
    fireEvent.click(screen.getByRole('button', { name: /^Group good\s*Group$/ }));
    expect(mocks.select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use identity' }));
    expect(mocks.select).toHaveBeenCalledWith('good');
  });

  it('retains valid choices on detail and face failures and retries missing choices', async () => {
    render(<ActingIdentitySwitcher />);
    fireEvent.click(screen.getByTestId('acting-identity-trigger'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Some identities could not be loaded');
    expect(screen.getByRole('button', { name: /^Group good\s*Group$/ })).toBeInTheDocument();
    expect(screen.queryByText('Group ineligible')).not.toBeInTheDocument();
    mocks.getGroup.mockResolvedValue({ group_id: 'recovered', roles: [{ name: 'writer', permissions: { posts: ['create'] } }] });
    mocks.readGroupIdentity.mockResolvedValue({ name: 'Recovered' });
    mocks.getMyGroups.mockResolvedValue([{ group_id: 'recovered', my_role: 'writer' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Recovered\s*Group$/ }));
    expect(mocks.select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use identity' }));
    expect(mocks.select).toHaveBeenCalledWith('recovered');
  });

  it('keeps personal identity available when the membership list fails', async () => {
    mocks.getMyGroups.mockRejectedValue(new Error('offline'));
    render(<ActingIdentitySwitcher />);
    fireEvent.click(screen.getByTestId('acting-identity-trigger'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Identities could not be loaded');
    expect(screen.getByRole('button', { name: /alice\s*Personal identity/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Use identity' })).toBeDisabled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('guides an empty identity list to group creation without changing identity', async () => {
    mocks.getMyGroups.mockResolvedValue([]);
    const onCreateGroup = vi.fn();
    render(<ActingIdentitySwitcher onCreateGroup={onCreateGroup} />);
    fireEvent.click(screen.getByTestId('acting-identity-trigger'));
    expect(await screen.findByText('Create a new identity!')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Create a group' }));
    expect(onCreateGroup).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not confuse a search with no matches with having no group identities', async () => {
    mocks.getMyGroups.mockResolvedValue([{ group_id: 'good', my_role: 'writer' }]);
    render(<ActingIdentitySwitcher onCreateGroup={vi.fn()} />);
    fireEvent.click(screen.getByTestId('acting-identity-trigger'));
    await screen.findByRole('button', { name: /^Group good\s*Group$/ });
    fireEvent.change(screen.getByLabelText('Search eligible groups'), { target: { value: 'missing' } });
    expect(screen.getByText(/No eligible groups match/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create a group' })).not.toBeInTheDocument();
  });

  it('shows the personal avatar and each group face in the menu', async () => {
    mocks.query.mockResolvedValue({ rows: [{ group_id: 'good', avatar_url: 'https://cdn.example/face-good.jpg' }] });
    render(<ActingIdentitySwitcher personalAvatar="https://cdn.example/face-alice.jpg" personalName="Alice" />);
    fireEvent.click(screen.getByTestId('acting-identity-trigger'));
    await screen.findByRole('button', { name: /^Group good\s*Group$/ });
    expect(mocks.query).toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('img[src="https://cdn.example/face-alice.jpg"]')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Group good\s*Group$/ }).querySelector('img'))
      .toHaveAttribute('src', 'https://cdn.example/face-good.jpg'));
    expect(mocks.query).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ groups: expect.arrayContaining(['good']) }));
  });

  it('keeps the initial fallback when a group face is unavailable', async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    render(<ActingIdentitySwitcher />);
    fireEvent.click(screen.getByTestId('acting-identity-trigger'));
    await screen.findByRole('button', { name: /^Group good\s*Group$/ });
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Group good\s*Group$/ }).querySelector('div')).toHaveTextContent('G');
  });
});
