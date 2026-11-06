import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Docs from './Docs';
import terms from '../../public/docs/terms.md?raw';

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
    expect(screen.getByTestId('audience-card-monetizers')).toHaveAttribute('href', '/docs/monetization');
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

  it('lists the Monetization front door first in the For Monetizers section', async () => {
    renderDocs('/docs');
    await screen.findByRole('heading', { name: /who are you\?/i });
    const link = screen.getByRole('link', { name: 'Monetization' });
    expect(link).toHaveAttribute('href', '/docs/monetization');
    // The front door precedes the section's detail docs in the sidebar.
    const section = screen.getByRole('heading', { name: /for monetizers/i }).closest('div')!;
    const links = Array.from(section.querySelectorAll('a')).map(a => a.getAttribute('href'));
    expect(links[0]).toBe('/docs/monetization');
  });

  it('lists the Interoperability doc under For Developers', async () => {
    renderDocs('/docs');
    await screen.findByRole('heading', { name: /who are you\?/i });
    const link = screen.getByRole('link', { name: 'Interoperability' });
    expect(link).toHaveAttribute('href', '/docs/interop');
    const section = screen.getByRole('heading', { name: /for developers/i }).closest('div')!;
    expect(Array.from(section.querySelectorAll('a')).map(a => a.getAttribute('href'))).toContain('/docs/interop');
  });

  it('lists Privacy Policy next to Terms under For Users and loads its real markdown', async () => {
    const { default: privacy } = await import('../../public/docs/privacy.md?raw');
    vi.mocked(fetch).mockResolvedValue(mdResponse(privacy) as Response);
    renderDocs('/docs/privacy');
    expect(await screen.findByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/docs/privacy.md');
    const section = screen.getByRole('heading', { name: 'For Users' }).closest('div')!;
    const links = Array.from(section.querySelectorAll('a')).map(a => a.getAttribute('href'));
    expect(links.slice(-2)).toEqual(['/docs/terms', '/docs/privacy']);
    expect(section.querySelector('a[href="/docs/terms"]')).toHaveTextContent('Terms of Service');
    expect(screen.getByRole('article', { name: 'Privacy Policy' })).toHaveTextContent('jacob@web10.app');
    expect(privacy).not.toContain('copyright@web10.com');
    expect(privacy).toContain('Copyright and takedown requests: [jacob@web10.app](mailto:jacob@web10.app)');
  });

  it('renders the hosted-only server ads clause without a numeric split or exclusive-creator promise', async () => {
    vi.mocked(fetch).mockResolvedValue(mdResponse(terms) as Response);
    renderDocs('/docs/terms');
    const heading = await screen.findByRole('heading', { name: 'Server ads' });
    expect(heading.nextElementSibling).toHaveTextContent('While your media is hosted on this node');
    expect(heading.nextElementSibling).toHaveTextContent('when you do, the node loses the right to run ads against it');
    expect(heading.nextElementSibling).toHaveTextContent('Nothing here gives the node any rights to your posts themselves');
    expect(terms.indexOf('## Server ads')).toBeGreaterThan(terms.indexOf('## Telemetry'));
    expect(terms.indexOf('## Server ads')).toBeLessThan(terms.indexOf('## Copyright & DMCA'));
    expect(terms).not.toMatch(/\d\s*%|\bpercent(?:age)?\b|\brevenue split\b/i);
    expect(terms.match(/creator's and the node's/g)).toHaveLength(2);
    expect(terms).not.toContain('copyright@web10.com');
    expect(terms).toContain('**Email our designated agent** at **`jacob@web10.app`**');
  });

  it('lists the Snake and Marketplace interoperability demos in the Demo Apps section', async () => {
    renderDocs('/docs');
    await screen.findByRole('heading', { name: /who are you\?/i });
    const snake = screen.getByRole('link', { name: /snake \(interoperability\)/i });
    expect(snake).toHaveAttribute('href', '/docs/snake/');
    const marketplace = screen.getByRole('link', { name: /marketplace \(interoperability\)/i });
    expect(marketplace).toHaveAttribute('href', '/docs/marketplace/');
  });
});
