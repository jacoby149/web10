import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ActingIdentitySwitcher from '@/components/Social/ActingIdentitySwitcher';

const mocks = vi.hoisted(() => ({
  getMyGroups: vi.fn(), getGroup: vi.fn(), readGroupIdentity: vi.fn(), select: vi.fn(),
}));
vi.mock('@/data/v3', () => ({ getV3Client: () => ({
  readToken: () => ({ provider: 'test', username: 'alice' }),
  getMyGroups: mocks.getMyGroups, getGroup: mocks.getGroup,
}) }));
vi.mock('@/data/groups', () => ({ readGroupIdentity: mocks.readGroupIdentity }));
vi.mock('@/data/actingIdentity', () => ({ useActingAuthor: () => undefined, selectActingAuthor: mocks.select }));

describe('ActingIdentitySwitcher partial loading', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
});
