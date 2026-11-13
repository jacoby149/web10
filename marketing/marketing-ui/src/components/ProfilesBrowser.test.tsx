import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { ProfilesBrowser } from './ProfilesBrowser';

vi.mock('@/lib/analytics', () => ({ trackFunnel: vi.fn() }));
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('People directory sorting and server controls', () => {
  it('passes independent sorts into directory paging and settles unreadable group faces', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('users/directory')) {
        const body = JSON.parse(String(init?.body));
        return Response.json({ users: [{ username: body.sort === 'newest' ? 'new-account' : 'popular-account', follower_count: 2, profile: {} }], sort: body.sort });
      }
      if (url.pathname.endsWith('groups/directory')) return Response.json({ groups: [{ group_id: 'home/groups/film', name: 'Film Club', owner: 'curator', member_count: 2, join_policy: 'open' }], sort: url.searchParams.get('sort') });
      return Response.json({ rows: [] });
    });
    vi.stubGlobal('fetch', fetcher);
    render(<MemoryRouter initialEntries={['/trending/people?q=film']}><ProfilesBrowser query="" /></MemoryRouter>);
    await screen.findByText('@popular-account');
    fireEvent.click(screen.getByRole('radio', { name: 'Newest' }));
    await screen.findByText('@new-account');
    fireEvent.click(screen.getByRole('tab', { name: 'Groups', exact: true }));
    fireEvent.click(screen.getByRole('radio', { name: 'Newest' }));
    await screen.findByText('Film Club');
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => String(url).includes('sort=newest'))).toBe(true));
    // One avatar + banner attempt is enough even when neither returns a face.
    const faceCalls = () => fetcher.mock.calls.filter(([url]) => String(url).includes('/query')).length;
    await waitFor(() => expect(faceCalls()).toBe(2));
    fireEvent.click(screen.getByRole('button', { name: 'Advanced', exact: true }));
    expect(screen.getByTestId('server-mixer')).toBeInTheDocument();
    expect(faceCalls()).toBe(2);
    expect(screen.queryByTestId('knob-rack')).not.toBeInTheDocument();
    const profileCalls = fetcher.mock.calls.filter(([url]) => String(url).includes('users/directory'));
    expect(profileCalls.map(([, init]) => JSON.parse(String(init?.body)).sort)).toEqual(['popular', 'newest']);
    expect(profileCalls.every(([, init]) => init?.credentials === 'omit')).toBe(true);
  });
});
