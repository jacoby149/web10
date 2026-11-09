// Framework-free so each app keeps its own React instance and origin-local key.
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
type ThemeSnapshot = { preference: ThemePreference; resolved: ResolvedTheme; persistent: boolean };
const parse = (value: string | null): ThemePreference => value === 'light' || value === 'dark' ? value : 'system';

export function createAppearanceStore(storageKey: string) {
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const listeners = new Set<() => void>();
  const read = () => {
    try { return { preference: parse(window.localStorage.getItem(storageKey)), persistent: true }; }
    catch { return { preference: 'system' as const, persistent: false }; }
  };
  const resolve = (preference: ThemePreference): ResolvedTheme => preference === 'system' ? (media?.matches ? 'dark' : 'light') : preference;
  const initial = read();
  let snapshot: ThemeSnapshot = { ...initial, resolved: resolve(initial.preference) };
  const apply = () => {
    const root = document.documentElement;
    root.dataset.theme = snapshot.resolved;
    root.classList.toggle('dark', snapshot.resolved === 'dark');
    root.style.colorScheme = snapshot.resolved;
    const background = getComputedStyle(root).getPropertyValue('--color-background').trim();
    if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
    console.log('[theme] applied', JSON.stringify(snapshot));
  };
  const update = (preference: ThemePreference, persistent: boolean) => {
    const resolved = resolve(preference);
    if (snapshot.preference === preference && snapshot.resolved === resolved && snapshot.persistent === persistent) return;
    snapshot = { preference, resolved, persistent };
    apply();
    listeners.forEach(listener => listener());
  };
  const onDevice = () => {
    if (snapshot.preference === 'system') update('system', snapshot.persistent);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey && event.key !== null) return;
    try { if (event.storageArea && event.storageArea !== window.localStorage) return; }
    catch { return; }
    const latest = read();
    update(latest.preference, latest.persistent);
  };
  if (media?.addEventListener) media.addEventListener('change', onDevice);
  else media?.addListener?.(onDevice);
  window.addEventListener('storage', onStorage);
  apply();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setPreference: (preference: ThemePreference) => {
      let persistent = true;
      try { window.localStorage.setItem(storageKey, preference); }
      catch { persistent = false; console.log('[theme] storage unavailable; using in-memory choice'); }
      update(preference, persistent);
    },
    destroy: () => {
      if (media?.removeEventListener) media.removeEventListener('change', onDevice);
      else media?.removeListener?.(onDevice);
      window.removeEventListener('storage', onStorage);
      listeners.clear();
    },
  };
}
