import { getV3Client } from './v3';
import { followersGroupId, ensureFollowers } from './groups';
import { type AppSettings } from './types';
import { type KnobState } from '@/lib/powerMean';
export type { AppSettings } from './types';

// ── Settings data layer (v3) ─────────────────────────────────────────────────
// Settings persist as a document in the `settings` collection, attached to
// the user's OWN followers group — the one group the user owns. The owner
// role holds every permission (services `*`); the member role is scoped to
// `posts`, so followers can read the profile/posts but not the settings doc.
//
// The group ID comes from groups.ts (followersGroupId — the deterministic ID
// the API derives: {provider}/groups/users/{username}/followers, provider
// from the token). A hardcoded provider prefix (or a missing `users/`
// segment) points at a group the API can never create, so every write would
// land in a phantom group and the next read 403s.

const LOG = (...args: unknown[]) => console.log('[settings]', ...args);
const LOG_ERR = (...args: unknown[]) => console.error('[settings]', ...args);

const defaultSettings: AppSettings = {
  defaultVisibility: 'public',
  // Real-time (P2P) is on by default — instant delivery + online presence out
  // of the box. A user opts OUT via the settings toggle.
  p2pEnabled: true,
};

const KNOB_KEYS: (keyof KnobState)[] = ['recency', 'likes', 'comments', 'halfLife', 'character'];

/** Validate a persisted knob state — every detent must be an integer 0..5,
 *  else null (the caller falls back to the default). The settings doc is
 *  user-owned data; a hand-edited or future-shaped body must not crash the
 *  feed. */
export function sanitizeFeedKnobs(raw: unknown): KnobState | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const state = {} as KnobState;
  for (const key of KNOB_KEYS) {
    const n = obj[key];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 5) return null;
    state[key] = n;
  }
  return state;
}

let cachedSettings: AppSettings | null = null;

export async function readSettings(): Promise<AppSettings> {
  if (cachedSettings) {
    LOG('readSettings — cache hit:', JSON.stringify(cachedSettings));
    return cachedSettings;
  }
  const w = getV3Client();
  const token = w.readToken();
  if (!token) {
    LOG('readSettings — no token, returning defaults');
    return defaultSettings;
  }

  const groupId = followersGroupId(token.username, token.provider);
  try {
    const docs = await w.read('settings', { groups: [groupId] });
    LOG('readSettings — got', docs.length, 'doc(s) from', groupId);
    if (docs.length > 0) {
      // Reads are created_at DESC — docs[0] is the latest settings doc.
      const body = docs[0].body as Record<string, unknown>;
      // feedKnobs stays undefined when absent/invalid — the screen falls
      // back to its own default (the Newest preset: the feed is
      // chronological until the user tunes it).
      const feedKnobs = sanitizeFeedKnobs(body.feedKnobs);
      cachedSettings = {
        defaultVisibility: (body.defaultVisibility as AppSettings['defaultVisibility']) || defaultSettings.defaultVisibility,
        // Absent field (a doc written before the toggle existed) → default on.
        p2pEnabled: body.p2pEnabled === undefined ? defaultSettings.p2pEnabled : Boolean(body.p2pEnabled),
        ...(feedKnobs ? { feedKnobs } : {}),
      };
      LOG('readSettings — resolved:', JSON.stringify(cachedSettings));
      return cachedSettings;
    }
  } catch (e) {
    // No settings record yet (or no followers group yet) — defaults.
    LOG('readSettings — no settings record yet:', groupId, String(e));
  }
  return defaultSettings;
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');

  const current = await readSettings();
  const merged = { ...current, ...settings };
  LOG('saveSettings — merging', JSON.stringify(settings), 'into', JSON.stringify(current), '→', JSON.stringify(merged));

  const body: Record<string, unknown> = {
    defaultVisibility: merged.defaultVisibility,
    p2pEnabled: merged.p2pEnabled ?? defaultSettings.p2pEnabled,
  };
  // Persist the feed tuning when present (a visibility-only save must not
  // clobber a previously saved knob state — merged carries it forward).
  if (merged.feedKnobs) {
    body.feedKnobs = merged.feedKnobs;
  }

  // The settings doc is only readable while attached to a group the user is
  // a member of — ensure the home group exists before writing (a write to a
  // missing group would 200 but be unreadable: the read path 403s).
  // ensureFollowers (groups.ts) creates it with the canonical shape: name
  // `followers` (the API derives {provider}/groups/users/{creator}/followers),
  // open join, owner = the bare username.
  const groupId = await ensureFollowers(token.username, token.provider);
  LOG('saveSettings — followers group ready:', groupId);

  try {
    // Try to read existing settings doc
    const docs = await w.read('settings', { groups: [groupId] });
    if (docs.length > 0 && docs[0].doc_id) {
      LOG('saveSettings — updating existing doc:', docs[0].doc_id, JSON.stringify(body));
      await w.update(docs[0].doc_id, body);
      LOG('saveSettings — updated');
    } else {
      LOG('saveSettings — creating new doc in', groupId, JSON.stringify(body));
      await w.create('settings', body, { groups: [groupId] });
      LOG('saveSettings — created');
    }
  } catch (e) {
    LOG_ERR('saveSettings — read/update path failed, falling back to create:', e);
    await w.create('settings', body, { groups: [groupId] });
    LOG('saveSettings — created (fallback)');
  }

  cachedSettings = merged;
  return cachedSettings;
}

export function clearSettingsCache() {
  cachedSettings = null;
}