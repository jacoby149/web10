import startup from '../../public/theme-init.js?raw';
import html from '../../index.html?raw';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createThemeStore, getThemeStore, THEME_KEY } from '@/lib/theme';
import { Appearance } from '@/components/Settings/Appearance';
import { ThemeMark } from '@/components/shared/ThemeMark';

let dark = false;
let deviceListeners: Set<() => void>;
let stores: ReturnType<typeof createThemeStore>[];
function device(value: boolean) { dark = value; deviceListeners.forEach(listener => listener()); }
function store() { const next = createThemeStore(); stores.push(next); return next; }
function storage(value: string | null, key: string | null = THEME_KEY) {
  if (key === null) localStorage.clear();
  else if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
  window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage, newValue: value }));
}

beforeEach(() => {
  dark = false;
  stores = [];
  deviceListeners = new Set();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
  document.head.innerHTML = '<meta name="theme-color" content="initial">';
  vi.spyOn(window, 'matchMedia').mockImplementation((media) => ({
    media, get matches() { return dark; },
    addEventListener: (_: string, listener: () => void) => deviceListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => deviceListeners.delete(listener),
  }) as unknown as MediaQueryList);
});
afterEach(() => {
  cleanup();
  stores.forEach(next => next.destroy());
  vi.restoreAllMocks();
});

describe('appearance startup and runtime', () => {
  it.each([null, 'system', 'light', 'dark', 'invalid'])('resolves %s identically before React and at runtime', saved => {
    for (const prefersDark of [false, true]) {
      dark = prefersDark;
      if (saved === null) localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, saved);
      window.eval(startup);
      const expected = saved === 'light' || saved === 'dark' ? saved : prefersDark ? 'dark' : 'light';
      expect(document.documentElement.dataset.theme).toBe(expected);
      expect(document.documentElement.style.colorScheme).toBe(expected);
      expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', expected === 'dark' ? '#09090b' : '#fafafa');
      expect(store().getSnapshot().resolved).toBe(expected);
      expect(document.documentElement.classList.contains('dark')).toBe(expected === 'dark');
    }
  });

  it('runs a blocking startup script before the app module', () => {
    expect(html.indexOf('src="/theme-init.js"')).toBeLessThan(html.indexOf('</head>'));
    expect(html).toContain('<script src="/theme-init.js"></script>');
  });

  it('follows live device changes only in System, and resumes when reselected', () => {
    const next = store();
    const changed = vi.fn();
    const unsubscribe = next.subscribe(changed);
    device(true);
    expect(next.getSnapshot()).toMatchObject({ preference: 'system', resolved: 'dark' });
    next.setPreference('light');
    device(false); device(true);
    expect(next.getSnapshot()).toMatchObject({ preference: 'light', resolved: 'light' });
    next.setPreference('system');
    expect(next.getSnapshot().resolved).toBe('dark');
    expect(changed).toHaveBeenCalledTimes(3);
    unsubscribe();
    next.setPreference('dark');
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('remembers overrides on a fresh runtime, and accepts tab writes/removal/clear', () => {
    const next = store();
    next.setPreference('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(store().getSnapshot().resolved).toBe('dark');
    storage('light');
    expect(next.getSnapshot().resolved).toBe('light');
    storage('dark', 'unrelated');
    expect(next.getSnapshot().resolved).toBe('light');
    storage(null);
    expect(next.getSnapshot().preference).toBe('system');
    storage('dark'); storage('invalid');
    expect(next.getSnapshot().preference).toBe('system');
    storage('dark'); storage(null, null);
    expect(next.getSnapshot().preference).toBe('system');
  });

  it('ignores session-storage events', () => {
    const next = store();
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, storageArea: sessionStorage, newValue: 'dark' }));
    expect(next.getSnapshot().preference).toBe('system');
  });

  it('uses CSS background tokens for live browser chrome', () => {
    document.documentElement.style.setProperty('--color-background', '#fafafa');
    const next = store();
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#fafafa');
    document.documentElement.style.setProperty('--color-background', '#09090b');
    next.setPreference('dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#09090b');
  });

  it('survives denied storage at startup and runtime, preserving the in-memory override', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => window.eval(startup)).not.toThrow();
    const next = store();
    expect(next.getSnapshot()).toMatchObject({ preference: 'system', persistent: false });
    next.setPreference('dark');
    device(false);
    expect(next.getSnapshot()).toEqual({ preference: 'dark', resolved: 'dark', persistent: false });
  });

  it('degrades to light without matchMedia and still supports overrides', () => {
    vi.stubGlobal('matchMedia', undefined);
    try {
      expect(() => window.eval(startup)).not.toThrow();
      const next = store();
      expect(next.getSnapshot().resolved).toBe('light');
      next.setPreference('dark');
      expect(next.getSnapshot().resolved).toBe('dark');
    } finally { vi.unstubAllGlobals(); }
  });

  it('removes device and storage listeners on disposal', () => {
    const next = store();
    expect(deviceListeners.size).toBe(1);
    next.destroy();
    expect(deviceListeners.size).toBe(0);
    storage('dark');
    expect(next.getSnapshot().preference).toBe('system');
  });
});

it('uses transparent white/dark key assets, never a black backing tile', () => {
  const { container } = render(<ThemeMark className="h-6 w-6" />);
  expect(container.querySelector('[data-brand-variant="white"]')).toHaveAttribute('src', '/keys-mark.png');
  expect(container.querySelector('[data-brand-variant="dark"]')).toHaveAttribute('src', '/keys-mark-dark.png');
  expect(container.innerHTML).not.toMatch(/bg-brand-tile|filter:/);
});

it('exposes labelled radio choices, immediate status and a visible storage failure', () => {
  const next = getThemeStore();
  stores.push(next);
  render(<Appearance />);
  expect(screen.getByRole('group', { name: 'Color theme' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
  expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  expect(screen.getByRole('status')).toHaveTextContent('Dark mode');
  act(() => device(true));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
  expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
  expect(screen.getByRole('alert')).toHaveTextContent('may not be remembered');
});
