import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MobileNav from '@/components/shared/MobileNav';
import { glassLensMap, supportsGlassRefraction } from '@/lib/glassLens';

afterEach(cleanup);

const makeInterface = (overrides = {}) => ({
  isAuthenticated: () => true, isAdmin: true, mode: 'contracts', setMode: vi.fn(), ...overrides,
});

describe('console mobile dock', () => {
  it('keeps all six admin destinations and their accessible names', () => {
    const I = makeInterface();
    render(<MobileNav I={I} />);
    const nav = screen.getByRole('navigation', { name: 'Console navigation' });
    expect(within(nav).getAllByRole('button')).toHaveLength(6);
    for (const [name, mode] of [
      ['App Contracts', 'contracts'], ['Group Contracts', 'groups'], ['Requests', 'requests'],
      ['Config', 'config'], ['Analytics', 'analytics'], ['Settings', 'settings'],
    ]) {
      fireEvent.click(within(nav).getByRole('button', { name }));
      expect(I.setMode).toHaveBeenLastCalledWith(mode);
    }
    expect(within(nav).getByText('Apps')).toBeVisible();
    expect(within(nav).getByText('Groups')).toBeVisible();
  });

  it('exposes exactly the current selection and updates it on rerender', () => {
    const I = makeInterface();
    const { rerender } = render(<MobileNav I={I} />);
    expect(screen.getByRole('button', { current: 'page' })).toHaveAccessibleName('App Contracts');
    rerender(<MobileNav I={{ ...I, mode: 'settings' }} />);
    expect(screen.getByRole('button', { current: 'page' })).toHaveAccessibleName('Settings');
  });

  it('keeps admin destinations out of personal navigation', () => {
    render(<MobileNav I={makeInterface({ isAdmin: false })} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Config' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analytics' })).not.toBeInTheDocument();
  });

  it('mounts no navigation or optics when signed out', () => {
    const { container } = render(<MobileNav I={makeInterface({ isAuthenticated: () => false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps fallback optics decorative, outside the buttons', () => {
    const { container } = render(<MobileNav I={makeInterface()} />);
    const bed = container.querySelector('.auth-dock-bed');
    expect(bed).toHaveAttribute('aria-hidden', 'true');
    expect(bed?.closest('button')).toBeNull();
    expect(screen.queryByTestId('auth-dock-refraction')).not.toBeInTheDocument();
  });
});

describe('local social lens parity', () => {
  it('retains the social capsule normals byte-for-byte', async () => {
    const social = await import('../../../marketing/web10-social/src/components/Social/glassLens');
    for (const [width, height] of [[351, 72], [726, 72]]) {
      expect(glassLensMap(width, height)).toEqual(social.glassLensMap(width, height));
    }
  });

  it.each([
    ['Chrome/144 Safari/537', true], ['Chromium/144', true], ['Chrome/144 Edg/144', true],
    ['Version/19 Safari/605', false], ['CriOS/144 Safari/605', false],
    ['EdgiOS/144', false], ['Firefox/144', false], ['FxiOS/144', false], ['', false],
  ])('keeps the experimental engine gate for %s', (ua, enabled) => {
    expect(supportsGlassRefraction(ua)).toBe(enabled);
  });
});
