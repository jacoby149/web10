import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { FeedSourcesEditor } from '@/components/Feed/FeedSourcesEditor';

const home = 'https://home.example', other = 'https://other.example';
let search = '';
function Location() { search = useLocation().search; return null; }
function control() {
  return { scope: 'owned-generation', home, credential: 'synthetic-current-credential', sources: [{ origin: home, weight: 100 }],
    approved: new Set([home]), ready: true, busy: false, error: '', save: vi.fn(), approve: vi.fn(), reload: vi.fn(), live: () => true };
}
function show(value = control(), path = '/feed?tune=1') {
  render(<MemoryRouter initialEntries={[path]}><Location /><FeedSourcesEditor control={value as any} onRetry={vi.fn()} /></MemoryRouter>);
  return value;
}
beforeEach(() => { search = ''; });
describe('clean rack / explicit Edit servers mode', () => {
  it('hides management chrome until editing and preserves faders when Done is clicked', () => {
    show();
    expect(screen.queryByLabelText('Server API URL')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove home/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit servers' }));
    expect(new URLSearchParams(search).get('editServers')).toBe('1');
    expect(screen.getByLabelText('Server API URL')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByLabelText('Server API URL')).not.toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Fetch weight for home.example' })).toHaveValue('100');
  });
  it('restores edit mode by URL and adds only an exact explicitly trusted origin', () => {
    const c = show(control(), '/feed?tune=1&editServers=1');
    fireEvent.change(screen.getByLabelText('Server API URL'), { target: { value: other } });
    fireEvent.click(screen.getByRole('button', { name: 'Add & connect server' }));
    expect(c.save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Confirm that you trust');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Add & connect server' }));
    expect(c.save).toHaveBeenCalledWith([{ origin: home, weight: 100 }, { origin: other, weight: 100 }], other);
    expect(search).not.toContain(c.credential);
  });
  it('requires confirmation before removal and does not change follows', () => {
    const c = show(control(), '/feed?editServers=1');
    fireEvent.click(screen.getByRole('button', { name: 'Remove home.example' }));
    expect(c.save).not.toHaveBeenCalled();
    expect(new URLSearchParams(search).get('removeServer')).toBe(home);
    expect(screen.getByText(/Your creator follows stay unchanged/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }));
    expect(c.save).toHaveBeenCalledWith([]);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(new URLSearchParams(search).get('tune')).toBe('1');
  });
  it('does not turn a restored catalog entry into credential approval', () => {
    const c = control(); c.sources.push({ origin: other, weight: 100 });
    show(c, '/feed?editServers=1');
    expect(screen.getByRole('slider', { name: 'Fetch weight for other.example' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Review connection' }));
    expect(c.approve).not.toHaveBeenCalled();
    expect(screen.getByText(/Trust https:\/\/other.example with your current scoped/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve connection' }));
    expect(c.approve).toHaveBeenCalledWith(other);
  });
});
