import { getV3Client } from './v3';
import { type AppSettings } from './types';

// ── Settings data layer (v3) ─────────────────────────────────────────────────
// Settings persist as a document in the `settings` collection.

const defaultSettings: AppSettings = {
  defaultVisibility: 'public',
};

let cachedSettings: AppSettings | null = null;

export async function readSettings(): Promise<AppSettings> {
  if (cachedSettings) return cachedSettings;
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return defaultSettings;

  try {
    const docs = await w.read('settings', {
      groups: [`web10.app/groups/${token.username}/followers`],
    });
    if (docs.length > 0) {
      const body = docs[0].body as Record<string, unknown>;
      cachedSettings = {
        defaultVisibility: (body.defaultVisibility as AppSettings['defaultVisibility']) || defaultSettings.defaultVisibility,
      };
      return cachedSettings;
    }
  } catch {
    // No settings record yet
  }
  return defaultSettings;
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');

  const current = await readSettings();
  const merged = { ...current, ...settings };

  const body: Record<string, unknown> = {
    defaultVisibility: merged.defaultVisibility,
  };

  try {
    // Try to read existing settings doc
    const docs = await w.read('settings', {
      groups: [`web10.app/groups/${token.username}/followers`],
    });
    if (docs.length > 0 && docs[0].doc_id) {
      await w.update(docs[0].doc_id, body);
    } else {
      await w.create('settings', body, {
        groups: [`web10.app/groups/${token.username}/followers`],
      });
    }
  } catch {
    // Create if doesn't exist
    await w.create('settings', body, {
      groups: [`web10.app/groups/${token.username}/followers`],
    });
  }

  cachedSettings = merged;
  return cachedSettings;
}

export function clearSettingsCache() {
  cachedSettings = null;
}