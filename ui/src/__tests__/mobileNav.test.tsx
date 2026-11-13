import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
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
      ['App permissions', 'contracts'], ['Group permissions', 'groups'], ['Requests', 'requests'],
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
    expect(screen.getByRole('button', { current: 'page' })).toHaveAccessibleName('App permissions');
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
  it('retains the social capsule normals byte-for-byte', () => {
    // SHA-256 of social's glassLensMap output at merged-dev 19603a79b.
    // Pin the original bytes, not a cross-app source import: ui's standalone
    // Docker build deliberately does not contain the social application.
    const references = [
      [351, 72, 'cc3bda0c32981666c015d1825d7cb068b024159fcfa1f9b0cf77e29933aaa6ae'],
      [726, 72, '16cc6c44220d76c989f2f0b9feeeb81c365e4c665df79d3372c226c02e33416c'],
    ] as const;
    for (const [width, height, digest] of references) {
      expect(createHash('sha256').update(glassLensMap(width, height)).digest('hex')).toBe(digest);
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
