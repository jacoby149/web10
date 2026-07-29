// Screenshot-harness mock of `@/data/settings`.
// Aliased in place of the real data/settings.ts by screenshots/vite.config.ts
// so the Settings screen renders with seeded content and no backend.
export type AppSettings = { defaultVisibility?: 'public' | 'private' };

const defaultSettings: AppSettings = { defaultVisibility: 'public' };

let cachedSettings: AppSettings | null = { ...defaultSettings };

export async function readSettings(): Promise<AppSettings> {
  return cachedSettings || defaultSettings;
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  cachedSettings = { ...defaultSettings, ...partial };
  return cachedSettings;
}

export function clearSettingsCache() {
  cachedSettings = null;
}
