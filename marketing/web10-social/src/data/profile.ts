import { getV3Client } from './v3';
import { followersGroupId, ensureFollowers } from './groups';
import { resolveMediaRefs } from './posts';
import { fromV3DocToProfile, type ProfileRecord } from './types';

// ── Profile data layer (v3) ──────────────────────────────────────────────────
// Profile is a document in the `profile` collection. One record per user.
//
// The profile doc is attached to the user's OWN followers group — the one
// group the user owns. The group ID comes from groups.ts (followersGroupId —
// the deterministic ID the API derives: {provider}/groups/users/{username}/
// followers, provider from the token). A write to a group that doesn't exist
// 200s (attach doesn't validate) but the next read 403s (not a member), so
// saveProfile ensures the group exists first — the same fix settings.ts got
// in 3.25.3 (a profile save without it lands in a phantom group and the
// edit silently "doesn't persist").

const LOG = (...args: unknown[]) => console.log('[profile]', ...args);
const LOG_ERR = (...args: unknown[]) => console.error('[profile]', ...args);

/**
 * Read the current user's profile record.
 */
export async function readProfile(): Promise<ProfileRecord | null> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return null;

  const groupId = followersGroupId(token.username, token.provider);
  // Try reading from profile collection
  try {
    const docs = await w.read('profile', {
      groups: [groupId],
    });
    LOG('readProfile — got', docs.length, 'doc(s) from', groupId);
    if (docs.length > 0) {
      return fromV3DocToProfile(docs[0]);
    }
  } catch (e) {
    // No profile doc yet (or no followers group yet) — fall through to getProfile
    LOG('readProfile — no profile doc yet:', groupId, String(e));
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

  // The profile doc is only readable while attached to a group the user is
  // a member of — ensure the home group exists before writing (a write to a
  // missing group would 200 but be unreadable: the read path 403s).
  const groupId = await ensureFollowers(token.username, token.provider);
  LOG('saveProfile — followers group ready:', groupId);

  // Try to update existing
  if (profile._id) {
    const doc = await w.update(profile._id, body);
    LOG('saveProfile — updated doc:', profile._id);
    return fromV3DocToProfile(doc);
  }

  // Create new
  LOG('saveProfile — creating new doc in', groupId);
  const doc = await w.create('profile', body, { groups: [groupId] });
  LOG('saveProfile — created doc:', doc.doc_id);
  return fromV3DocToProfile(doc);
}

/**
 * Read another user's profile record.
 */
export async function readUserProfile(username: string, provider?: string): Promise<ProfileRecord | null> {
  const w = getV3Client();
  try {
    const docs = await w.read('profile', {
      groups: [followersGroupId(username, provider)],
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

/**
 * A user's public "face" — the minimum a recipient-preview needs to confirm
 * "this is the account I'm about to message": name, handle, bio, and
 * presigned avatar/banner URLs.
 */
export interface UserFace {
  username: string;
  provider: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
}

/**
 * Look up a user's public face by username (the DM composer's "who am I
 * messaging" preview). Reads the user's profile doc and resolves their
 * avatar/banner refs to presigned URLs (the same cross-user `public_media`
 * path the profile screen uses). Returns `null` when the account has no
 * readable profile — either the username doesn't exist or the account has
 * never set a profile; callers treat both as "no preview" and never block
 * the send on it.
 */
export async function lookupUserProfile(
  username: string,
  provider?: string,
): Promise<UserFace | null> {
  const w = getV3Client();
  const token = w.readToken();
  const prov = provider || token?.provider || 'web10';
  const profile = await readUserProfile(username, prov).catch((e) => {
    LOG('lookupUserProfile — profile read failed for', username, ':', e);
    return null;
  });
  if (!profile) return null;

  const face: UserFace = {
    username,
    provider: prov,
    display_name: profile.display_name,
    bio: profile.bio,
  };

  const refs = [profile.avatar_ref, profile.banner_ref].filter(Boolean) as string[];
  if (refs.length) {
    try {
      const media = await resolveMediaRefs(refs, { username, provider: prov }, 'public_media');
      for (const m of media) {
        if (m._id === profile.avatar_ref) face.avatar_url = m.url;
        else if (m._id === profile.banner_ref) face.banner_url = m.url;
      }
    } catch (e) {
      LOG('lookupUserProfile — media resolution failed (degraded) for', username, ':', e);
    }
  }
  LOG('lookupUserProfile —', username, '→', face.display_name || '(no display name)', 'avatar:', !!face.avatar_url);
  return face;
}
