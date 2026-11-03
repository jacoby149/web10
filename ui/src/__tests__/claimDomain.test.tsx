import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ClaimDomain from '../components/Settings/ClaimDomain';

const ok = (data: unknown, status = 200) => ({ ok: status === 200, status, json: async () => data }) as Response;
function deferred() { let resolve!: (value: any) => void; let reject!: (value: any) => void; const promise = new Promise<any>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
let generation: number;
function identity(user = 'alice') {
  return { auth: true, accountReadGeneration: generation, v3: { state: { token: `${user}-token`, apiOrigin: 'http://api.localhost:8080' }, readToken: () => ({ provider: 'api.localhost', username: user }) }, ownAccountRead: () => { const g = generation; return () => g === generation; } };
}
beforeEach(() => { generation = 0; vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ username: 'alice', domain: null, verified: false }))); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function mount() { const view = render(<ClaimDomain I={identity()} />); await screen.findByText('No domain connected yet.'); return view; }
function enter() { fireEvent.change(screen.getByLabelText('1. Enter your domain'), { target: { value: ' Example.COM ' } }); }

it('loads the actual account and copies the exact keyless value', async () => {
  await mount();
  expect(fetch).toHaveBeenCalledWith('http://api.localhost:8080/v3/users/alice/domain', undefined);
  fireEvent.click(screen.getByText('Copy TXT value'));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('web10.v=1;provider=api.localhost;user=alice');
  await screen.findByText('TXT value copied.');
});
it('sends authenticated verify and release bodies, with confirmation and reverify', async () => {
  await mount(); enter();
  vi.mocked(fetch).mockResolvedValueOnce(ok({ domain: 'example.com', verified: true, provider: 'api.localhost', user: 'alice' }));
  fireEvent.click(screen.getByText('Verify domain'));
  await screen.findByText('example.com - Verified');
  expect(fetch).toHaveBeenLastCalledWith('http://api.localhost:8080/v3/domains/verify', expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: 'alice-token', domain: 'example.com' }) }));
  expect(screen.getByText('Reverify domain')).toBeEnabled();
  fireEvent.click(screen.getByText('Release domain'));
  expect(fetch).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByText('Cancel'));
  fireEvent.click(screen.getByText('Release domain'));
  vi.mocked(fetch).mockResolvedValueOnce(ok({ domain: 'example.com', released: true }));
  fireEvent.click(screen.getByText('Confirm release'));
  await screen.findByText('No domain connected yet.');
  expect(fetch).toHaveBeenLastCalledWith('http://api.localhost:8080/v3/domains/release', expect.objectContaining({ body: JSON.stringify({ token: 'alice-token', domain: 'example.com' }) }));
  expect(screen.getByText(/Domain released/)).toBeVisible();
});
it.each([ok({ verified: false, error: 'wrong_user' }), ok({ detail: 'wrong_user' }, 400)])('handles verification failure without claiming success', async response => {
  await mount(); enter(); vi.mocked(fetch).mockResolvedValueOnce(response);
  fireEvent.click(screen.getByText('Verify domain'));
  await screen.findByText(/TXT username does not match/);
  expect(screen.queryByText('example.com - Verified')).toBeNull();
});
it('rejects URLs and gives a clipboard fallback', async () => {
  await mount(); fireEvent.change(screen.getByLabelText('1. Enter your domain'), { target: { value: 'https://example.com' } });
  fireEvent.blur(screen.getByLabelText('1. Enter your domain'));
  expect(screen.getByText('Verify domain')).toBeDisabled();
  vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'));
  fireEvent.click(screen.getByText('Copy TXT value'));
  await screen.findByText(/Clipboard unavailable/);
});
for (const operation of ['load', 'verify', 'release', 'clipboard']) {
  for (const fail of [false, true]) {
    it(`isolates stale ${operation} ${fail ? 'failure' : 'success'} across identity generations`, async () => {
      const pending = deferred();
      if (operation === 'load') vi.mocked(fetch).mockReturnValueOnce(pending.promise);
      const view = render(<ClaimDomain I={identity()} />);
      if (operation !== 'load') {
        await screen.findByText('No domain connected yet.'); enter();
        if (operation === 'release') {
          vi.mocked(fetch).mockResolvedValueOnce(ok({ domain: 'example.com', verified: true }));
          fireEvent.click(screen.getByText('Verify domain')); await screen.findByText('example.com - Verified');
          fireEvent.click(screen.getByText('Release domain'));
        }
        if (operation === 'clipboard') { vi.mocked(navigator.clipboard.writeText).mockReturnValueOnce(pending.promise); fireEvent.click(screen.getByText('Copy TXT value')); }
        else { vi.mocked(fetch).mockReturnValueOnce(pending.promise); fireEvent.click(screen.getByText(operation === 'release' ? 'Confirm release' : 'Verify domain')); }
      }
      generation++;
      view.rerender(<ClaimDomain I={identity()} />);
      await screen.findByText('No domain connected yet.');
      await act(async () => { if (fail) pending.reject(new Error('stale')); else pending.resolve(ok({ domain: 'old.example', verified: true, released: true })); });
      expect(screen.queryByText(/old.example/)).toBeNull();
      expect(screen.queryByText(/TXT value copied|Domain released|Could not reach/)).toBeNull();
      expect(screen.getByLabelText('1. Enter your domain')).toHaveValue('');
    });
  }
}
it('ignores delayed JSON after switching accounts and unmount', async () => {
  const pending = deferred(); vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: () => pending.promise } as Response);
  const view = render(<ClaimDomain I={identity()} />);
  await act(async () => {}); generation++; view.rerender(<ClaimDomain I={identity('bob')} />);
  await screen.findByText('No domain connected yet.'); view.unmount();
  await act(async () => { pending.resolve({ domain: 'old.example', verified: true }); });
  expect(fetch).toHaveBeenLastCalledWith('http://api.localhost:8080/v3/users/bob/domain', undefined);
});

it('ignores the first StrictMode load after effect replay', async () => {
  const pending = deferred();
  vi.mocked(fetch).mockReturnValueOnce(pending.promise);
  render(<StrictMode><ClaimDomain I={identity()} /></StrictMode>);
  await screen.findByText('No domain connected yet.');
  await act(async () => { pending.resolve(ok({ domain: 'stale.example', verified: true })); });
  expect(screen.queryByText(/stale.example/)).toBeNull();
});

it.each([
  ['domain_taken', /already claimed/],
  ['release_required', /Release your existing/],
  ['dns_timeout', /DNS lookup timed out/],
  ['multiple_claims', /Multiple web10 TXT/],
])('explains backend error %s and allows retry', async (error, message) => {
  await mount(); enter();
  vi.mocked(fetch).mockResolvedValueOnce(ok({ verified: false, error }, 400));
  fireEvent.click(screen.getByText('Verify domain'));
  await screen.findByText(message);
  expect(screen.getByText('Verify domain')).toBeEnabled();
});
