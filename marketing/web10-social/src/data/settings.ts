import { getWapi } from './wapi';

// Settings persist as an ordinary `settings` service record (owner-only).
// This is the data layer for the Settings tab — conventions addition, no API change.
// Bite A (shell): static content only, no settings record yet.
// Bite B (posting defaults): read/write the settings record.

const SERVICE = 'settings';

export interface AppSettings {
  defaultVisibility?: 'public' | 'private';
}

const defaultSettings: AppSettings = {
  defaultVisibility: 'public',
};

let cachedSettings: AppSettings | null = null;

export async function readSettings(): Promise<AppSettings> {
  if (cachedSettings) return cachedSettings;
  const wapi = getWapi();
  const records = await wapi.read<Record<string, unknown>>(SERVICE);
  const record = records[0];
  if (!record) return defaultSettings;
  const body = record.body as Record<string, unknown> | undefined;
  cachedSettings = {
    defaultVisibility: (body?.defaultVisibility as AppSettings['defaultVisibility']) || defaultSettings.defaultVisibility,
  };
  return cachedSettings;
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const wapi = getWapi();
  const records = await wapi.read<Record<string, unknown>>(SERVICE);
  const body = records[0]?.body as Record<string, unknown> | undefined;
  const current = body || {};
  const merged = { ...current, ...settings };

  if (records.length > 0) {
    await wapi.update(SERVICE, { _id: records[0]._id }, { $set: { body: merged } });
  } else {
    await wapi.create(SERVICE, { body: merged });
  }

  cachedSettings = { ...defaultSettings, ...merged };
  return cachedSettings;
}

export function clearSettingsCache() {
  cachedSettings = null;
}
