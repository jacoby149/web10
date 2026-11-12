import startup from '../../public/theme-init.js?raw';
import html from '../../index.html?raw';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createThemeStore, getThemeStore, THEME_KEY } from '@/lib/theme';
import AppearancePage, { Appearance } from '@/components/Settings/Appearance';
import Branding from '@/components/shared/Branding';

let dark = false;
let listeners: Set<() => void>;
let stores: ReturnType<typeof createThemeStore>[];
const device = (value: boolean) => { dark = value; listeners.forEach(listener => listener()); };
const store = () => { const next = createThemeStore(); stores.push(next); return next; };
function storage(value: string | null, key: string | null = THEME_KEY) {
  if (key === null) localStorage.clear();
  else if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
  window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage, newValue: value }));
}
beforeEach(() => {
  dark = false; stores = []; listeners = new Set(); localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
  document.head.innerHTML = '<meta name="theme-color" content="initial">';
  vi.stubGlobal('matchMedia', (media: string) => ({
    media, get matches() { return dark; },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
});
afterEach(() => { cleanup(); stores.forEach(next => next.destroy()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([null, 'system', 'light', 'dark', 'invalid'])('resolves %s identically at startup and runtime', saved => {
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

it('runs blocking initialization in head, before the app', () => {
  expect(html).toContain('<script src="/theme-init.js"></script>');
  expect(html.indexOf('src="/theme-init.js"')).toBeLessThan(html.indexOf('</head>'));
});
it('follows live device changes only in System and resumes on reselection', () => {
  const next = store(); const changed = vi.fn(); next.subscribe(changed);
  device(true);
  expect(next.getSnapshot()).toMatchObject({ preference: 'system', resolved: 'dark' });
  next.setPreference('light'); device(false); device(true);
  expect(next.getSnapshot().resolved).toBe('light');
  next.setPreference('system');
  expect(next.getSnapshot().resolved).toBe('dark');
  expect(changed).toHaveBeenCalledTimes(3);
});
it('remembers only this origin preference and synchronizes writes, removal and clear', () => {
  const next = store(); next.setPreference('dark');
  expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  expect(store().getSnapshot().resolved).toBe('dark');
  storage('light'); expect(next.getSnapshot().resolved).toBe('light');
  storage('dark', 'web10-social:theme'); expect(next.getSnapshot().resolved).toBe('light');
  storage(null); expect(next.getSnapshot().preference).toBe('system');
  storage('dark'); storage('invalid'); expect(next.getSnapshot().preference).toBe('system');
  storage('dark'); storage(null, null); expect(next.getSnapshot().preference).toBe('system');
});
it('ignores session-storage events', () => {
  const next = store();
  window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, storageArea: sessionStorage, newValue: 'dark' }));
  expect(next.getSnapshot().preference).toBe('system');
});
it('applies actual background tokens to browser chrome', () => {
  document.documentElement.style.setProperty('--color-background', '#fafafa');
  const next = store();
  expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#fafafa');
  document.documentElement.style.setProperty('--color-background', '#09090b'); next.setPreference('dark');
  expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#09090b');
});
it('survives denied storage and keeps an in-memory override', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  expect(() => window.eval(startup)).not.toThrow();
  const next = store(); next.setPreference('dark'); device(false);
  expect(next.getSnapshot()).toEqual({ preference: 'dark', resolved: 'dark', persistent: false });
});
it('keeps overrides usable without matchMedia', () => {
  vi.stubGlobal('matchMedia', undefined);
  expect(() => window.eval(startup)).not.toThrow();
  const next = store(); expect(next.getSnapshot().resolved).toBe('light');
  next.setPreference('dark'); expect(next.getSnapshot().resolved).toBe('dark');
});
it('removes runtime listeners on disposal', () => {
  const next = store(); expect(listeners.size).toBe(1);
  next.destroy(); expect(listeners.size).toBe(0);
  storage('dark'); expect(next.getSnapshot().preference).toBe('system');
});

it('offers labelled choices, live status, theme-aware white-label artwork and storage failure', () => {
  const next = getThemeStore(); stores.push(next);
  const I = { config: { REACT_APP_LOGO_LIGHT: '/light.png', REACT_APP_LOGO_DARK: '/dark.png' } };
  render(<><Appearance /><Branding I={I} /></>);
  expect(screen.getByRole('group', { name: 'Color theme' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  expect(screen.getByTestId('brand-logo')).toHaveAttribute('src', '/light.png');
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
  expect(screen.getByRole('status')).toHaveTextContent('Dark mode');
  expect(screen.getByTestId('brand-logo')).toHaveAttribute('src', '/dark.png');
  act(() => device(true));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
  expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
  expect(screen.getByRole('alert')).toHaveTextContent('may not be remembered');
  cleanup();
  render(<AppearancePage I={{ ...I, isAuthenticated: () => false }} />);
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/');
});
