import { getV3Client } from './v3';
import { followersGroupId } from './groups';
import { fromV3DocToProfile, type ProfileRecord } from './types';

// ── Profile data layer (v3) ──────────────────────────────────────────────────
// Profile is a document in the `profile` collection. One record per user.

/**
 * Read the current user's profile record.
 */
export async function readProfile(): Promise<ProfileRecord | null> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return null;

  // Try reading from profile collection
  try {
    const docs = await w.read('profile', {
      groups: [followersGroupId(token.username)],
    });
    if (docs.length > 0) {
      return fromV3DocToProfile(docs[0]);
    }
  } catch {
    // Fall through to getProfile
  }

  // Fallback: use getProfile (returns V3User with basic info)
  const user = await w.getProfile();
  return {
    display_name: user.username,
    bio: undefined,
    website: undefined,
    location: undefined,
  };
}

/**
 * Create or update the current user's profile.
 */
export async function saveProfile(profile: Partial<ProfileRecord>): Promise<ProfileRecord> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');

  const body: Record<string, unknown> = {
    display_name: profile.display_name,
    avatar_ref: profile.avatar_ref,
    banner_ref: profile.banner_ref,
    bio: profile.bio,
    website: profile.website,
    location: profile.location,
  };

  // Try to update existing
  if (profile._id) {
    const doc = await w.update(profile._id, body);
    return fromV3DocToProfile(doc);
  }

  // Create new
  const groups = [followersGroupId(token.username)];
  const doc = await w.create('profile', body, { groups });
  return fromV3DocToProfile(doc);
}

/**
 * Read another user's profile record.
 */
export async function readUserProfile(username: string): Promise<ProfileRecord | null> {
  const w = getV3Client();
  try {
    const docs = await w.read('profile', {
      groups: [followersGroupId(username)],
    });
    if (docs.length > 0) {
      return fromV3DocToProfile(docs[0]);
    }
  } catch {
    // User has no profile
  }
  return null;
}

/**
 * Get the current user's profile from the auth endpoint.
 */
export async function getAuthProfile() {
  const w = getV3Client();
  return w.getProfile();
}