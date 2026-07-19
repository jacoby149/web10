import { getWapi } from './wapi';
import type { ProfileRecord } from './types';

// ── Profile data layer ─────────────────────────────────────────────────────
// One record per user in the `profile` service.

/**
 * Read the current user's profile record.
 * Returns null if no profile exists yet.
 */
export async function readProfile(): Promise<ProfileRecord | null> {
  const wapi = getWapi();
  const records = await wapi.read<ProfileRecord>('profile');
  return records[0] || null;
}

/**
 * Create or update the current user's profile.
 * Upsert semantics: if a record exists, update it; otherwise create.
 */
export async function saveProfile(profile: Partial<ProfileRecord>): Promise<ProfileRecord> {
  const wapi = getWapi();
  const existing = await readProfile();

  const payload = {
    ...profile,
    updated_at: new Date().toISOString(),
  };

  if (existing?._id) {
    return wapi.update<ProfileRecord>('profile', { _id: existing._id }, { $set: payload });
  }

  return wapi.create<ProfileRecord>('profile', payload);
}

/**
 * Read another user's profile record.
 */
export async function readUserProfile(username: string, provider: string): Promise<ProfileRecord | null> {
  const wapi = getWapi();
  const records = await wapi.read<ProfileRecord>('profile', {}, username, provider);
  return records[0] || null;
}