import { getWapi } from './wapi';
import type { ProfileRecord } from './types';

// ── Profile data layer ─────────────────────────────────────────────────────
// One record per user in the `profile` service.
// Falls back to legacy `identity` service for users who haven't migrated yet.

/**
 * Read the current user's profile record.
 * Returns null if no profile exists yet.
 * Adapts legacy identity records to the new profile format on first read.
 */
export async function readProfile(): Promise<ProfileRecord | null> {
  const wapi = getWapi();
  let records = await wapi.read<ProfileRecord>('profile');
  if (records[0]) return records[0];

  // Fallback: check legacy identity service
  try {
    const legacy = await wapi.read<Record<string, unknown>>('identity');
    if (legacy[0]) {
      const old = legacy[0];
      const adapted: ProfileRecord = {
        display_name: (old.name as string) || undefined,
        bio: (old.bio as string) || undefined,
        updated_at: new Date().toISOString(),
      };
      if (old.pic && typeof old.pic === 'string') {
        adapted.avatar_ref = old.pic;
      }
      // Write adapted record to new profile service so we don't re-adapt
      await wapi.create<ProfileRecord>('profile', adapted as Record<string, unknown>);
      return adapted;
    }
  } catch {
    // identity service may not exist, that's fine
  }

  return null;
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
  if (records[0]) return records[0];

  // Fallback: check legacy identity service for the target user
  try {
    const legacy = await wapi.read<Record<string, unknown>>('identity', {}, username, provider);
    if (legacy[0]) {
      const old = legacy[0];
      return {
        display_name: (old.name as string) || undefined,
        bio: (old.bio as string) || undefined,
      } as ProfileRecord;
    }
  } catch {
    // identity service may not exist
  }

  return null;
}