import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Docs from './Docs';

const mdResponse = (body: string) => ({
  ok: true,
  status: 200,
  text: () => Promise.resolve(body),
});

// Mirror the app's docs routes: /docs (the landing) and /docs/:page.
function renderDocs(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/docs" element={<Docs />} />
        <Route path="/docs/:page" element={<Docs />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Docs — the "who are you?" landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mdResponse('# web10\n\n> What you make is yours.')));
  });

  it('asks who the reader is on the /docs landing', async () => {
    renderDocs('/docs');
    expect(await screen.findByRole('heading', { name: /who are you\?/i })).toBeInTheDocument();
    expect(screen.getByTestId('audience-card-users')).toBeInTheDocument();
    expect(screen.getByTestId('audience-card-developers')).toBeInTheDocument();
    expect(screen.getByTestId('audience-card-operators')).toBeInTheDocument();
    expect(screen.getByTestId('audience-card-monetizers')).toBeInTheDocument();
  });

  it('routes each audience to its section\u2019s first doc', async () => {
    renderDocs('/docs');
    expect(await screen.findByTestId('audience-card-users')).toHaveAttribute('href', '/docs/getting-started');
    expect(screen.getByTestId('audience-card-developers')).toHaveAttribute('href', '/docs/protocol-spec');
    expect(screen.getByTestId('audience-card-operators')).toHaveAttribute('href', '/docs/start-a-node');
    expect(screen.getByTestId('audience-card-monetizers')).toHaveAttribute('href', '/docs/ads');
  });

  it('speaks to the reader in the audience model\u2019s words', async () => {
    renderDocs('/docs');
    await screen.findByRole('heading', { name: /who are you\?/i });
    expect(screen.getByText(/I follow creators, I post, I manage my data\./i)).toBeInTheDocument();
    expect(screen.getByText(/writing code that reads and writes a user's data/i)).toBeInTheDocument();
    expect(screen.getByText(/I run my own node, or I'm a creator on one\./i)).toBeInTheDocument();
    expect(screen.getByText(/I have an audience and I want to make money on it\./i)).toBeInTheDocument();
  });

  it('does not ask on a doc sub-page', async () => {
    renderDocs('/docs/sdk');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: /who are you\?/i })).not.toBeInTheDocument();
  });

  it('groups the sidebar by audience', async () => {
    renderDocs('/docs');
    await screen.findByRole('heading', { name: /who are you\?/i });
    expect(screen.getByRole('heading', { name: /for users/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /for developers/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /for node operators \/ influencers/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /for monetizers/i })).toBeInTheDocument();
  });
});
