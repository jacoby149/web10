import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import TopBar from '@/components/shared/TopBar';

const photo = 'https://media.example/avatar.png?fixture=1';
const profile = (author_key: string, avatar_ref?: string, updated_at = '2026-11-26') => ({ author_key, body: { avatar_ref }, updated_at });
const makeInterface = (username = 'alice', provider = 'node.example') => ({
  mode: 'contracts', isAuthenticated: () => true, ownAccountRead: () => () => true,
  setMode: vi.fn(), logout: vi.fn(),
  v3: {
    state: { apiOrigin: `https://${provider}`, token: 'session-token' },
    readToken: () => ({ username, provider }),
    listMedia: vi.fn(async () => [{ doc_id: 'ref', author_key: username, body: { object_key: `${username}/picture.png`, mime_type: 'image/png' } }]),
    getMediaReadUrl: vi.fn(async () => ({ read_url: photo })),
  },
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('reads the current account’s public Social profile without credentials, then resolves only its avatar ref', async () => {
  const fetch = vi.fn(async () => Response.json([profile('mallory', 'other', '2026-12-01'), profile('alice', 'old', '2026-11-25'), profile('alice', 'ref')]));
  vi.stubGlobal('fetch', fetch);
  const I = makeInterface();
  render(<TopBar I={I} />);
  const avatar = await screen.findByTestId('topbar-avatar');
  expect(avatar).toHaveAttribute('src', photo);
  expect(avatar).toHaveAttribute('referrerpolicy', 'no-referrer');
  expect(fetch).toHaveBeenCalledWith(new URL('https://node.example/v3/read'), expect.objectContaining({
    method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service: 'profile', groups: ['node.example/groups/users/alice/followers'] }),
  }));
  expect(I.v3.listMedia).toHaveBeenCalledExactlyOnceWith({ doc_ids: ['ref'], limit: 1 });
  expect(I.v3.getMediaReadUrl).toHaveBeenCalledExactlyOnceWith('alice/picture.png');
  fireEvent.error(avatar);
  expect(screen.queryByTestId('topbar-avatar')).not.toBeInTheDocument();
  expect(screen.getByTestId('topbar-account')).toHaveAccessibleName('alice');
});

it.each([
  ['denied', () => new Response(null, { status: 403 })],
  ['no current avatar', () => Response.json([profile('alice', 'old', '2026-11-25'), profile('alice')])],
  ['different author', () => Response.json([profile('mallory', 'ref')])],
])('does not fetch media for a %s profile', async (_label, response) => {
  const I = makeInterface();
  const fetch = vi.fn(async () => response());
  vi.stubGlobal('fetch', fetch);
  await act(async () => { render(<TopBar I={I} />); });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(I.v3.listMedia).not.toHaveBeenCalled();
  expect(screen.getByTestId('topbar-account')).toHaveAccessibleName('alice');
  expect(screen.queryByTestId('topbar-avatar')).not.toBeInTheDocument();
});

it('does not carry over an in-flight avatar after a same-username node switch', async () => {
  let finish!: (value: { read_url: string }) => void;
  const first = makeInterface();
  first.v3.getMediaReadUrl.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const fetch = vi.fn().mockResolvedValueOnce(Response.json([profile('alice', 'ref')])).mockResolvedValueOnce(Response.json([]));
  vi.stubGlobal('fetch', fetch);
  const { rerender } = render(<TopBar I={first} />);
  await waitFor(() => expect(first.v3.getMediaReadUrl).toHaveBeenCalledTimes(1));
  const second = makeInterface('alice', 'second.example');
  rerender(<TopBar I={second} />);
  await act(async () => finish({ read_url: photo }));
  expect(fetch).toHaveBeenLastCalledWith(new URL('https://second.example/v3/read'), expect.anything());
  expect(screen.queryByTestId('topbar-avatar')).not.toBeInTheDocument();
  expect(second.v3.listMedia).not.toHaveBeenCalled();
});

it('keeps Settings and Log out keyboard-reachable in the account disclosure', () => {
  const I = { ...makeInterface(), v3: { readToken: () => ({ username: 'alice' }) } };
  render(<TopBar I={I} />);
  const account = screen.getByTestId('topbar-account');
  fireEvent.click(account);
  expect(account).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(account).toHaveFocus();
  expect(account).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(account);
  fireEvent.click(screen.getByTestId('account-settings'));
  expect(I.setMode).toHaveBeenCalledExactlyOnceWith('settings');
  fireEvent.click(account);
  fireEvent.click(screen.getByTestId('account-logout'));
  expect(I.logout).toHaveBeenCalledTimes(1);
});
