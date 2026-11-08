import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import App from '../App';
import { contactHandoff } from '../lib/contactHandoff';

const v3 = vi.hoisted(() => ({ state: { token: null, apiOrigin: 'https://api.node-a.example' },
  readToken: () => null, setToken: vi.fn(), scrubToken: vi.fn(), getProfile: vi.fn(async () => ({})) }));
vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('web10-npm', () => ({
  createV3Client: () => v3,
  wapiInit: () => ({ readToken: () => null, scrubToken: vi.fn(), isSignedIn: () => false }),
  wapiAuthInit: () => ({ contractListen: vi.fn() }),
}));
vi.mock('../components/Contracts/ContractPage', () => ({ default: () => <div>Signed in destination</div> }));

it('finishes the actual App email-link/password-reset navigation instead of reopening recovery', async () => {
  window.history.replaceState(null, '', '/?mode=forgot');
  contactHandoff.recovery = 'synthetic-email-link';
  contactHandoff.node = 'api.node-a.example';
  const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/ready')
    ? { configured: true } : url.endsWith('/link')
      ? { contact: 'person@example.com', accounts: [{ username: 'alice' }], verify_token: 'synthetic-proof' }
      : { token: 'synthetic-new-token' } }));
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  const confirm = await screen.findByTestId('recovery-confirm-link');
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/link'))).toBe(false);
  fireEvent.click(confirm);
  fireEvent.click(await screen.findByText('alice', { exact: true }));
  fireEvent.change(screen.getByTestId('recovery-new-password'), { target: { value: 'synthetic-new-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset password & sign in' }));
  expect(await screen.findByText('Signed in destination')).toBeVisible();
  expect(screen.queryByTestId('recovery-form')).not.toBeInTheDocument();
  expect(window.location.search).not.toContain('forgot');
  await waitFor(() => expect(v3.setToken).toHaveBeenCalledWith('synthetic-new-token'));
  vi.unstubAllGlobals();
});
