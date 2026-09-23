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
 * Ensure the current user has a public profile face (the D0 directory's
 * precondition). A user's face is a `profile` doc in their followers group,
 * and the public people directory (D0) only lists users who have a readable
 * face — so an account that never opened its profile screen is ABSENT from
 * the directory, even though its followers group is public-by-default
 * (3.149.0). This closes that gap: on sign-in the app seeds a minimal public
 * face (display_name = the username) when none exists, so every account is
 * discoverable from birth.
 *
 * Idempotent + non-clobbering: it reads first and only WRITES when there is
 * no profile doc at all. It never overwrites a face the user has already
 * edited (display_name / bio / avatar / banner) — a present doc is left
 * untouched. Runs client-side (D60: the app owns the face; the node stays
 * generic). A failure is a benign degrade (the face is re-seeded on the next
 * sign-in) — it never blocks the session.
 */
export async function ensureProfile(): Promise<void> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return;

  // Ensure the home group exists + is public (the `anyone` read grant) before
  // writing — the same guarantee saveProfile relies on.
  const groupId = await ensureFollowers(token.username, token.provider);

  // A face already exists → leave it alone (never clobber user edits).
  try {
    const docs = await w.read('profile', { groups: [groupId] });
    if (docs.length > 0) {
      LOG('ensureProfile — face already exists, no-op');
      return;
    }
  } catch (e) {
    // No readable face (or no group yet) — fall through to create.
    LOG('ensureProfile — no readable face yet:', String(e));
  }

  // Seed a minimal public face. display_name = the username so the card has a
  // name even before the user edits anything.
  LOG('ensureProfile — seeding default face for', token.username);
  const doc = await w.create('profile', { display_name: token.username }, { groups: [groupId] });
  LOG('ensureProfile — created face:', doc.doc_id);
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

/**
 * Set the current user's profile public/private (D58 point 7). Public (the
 * default) = the followers group's `anyone` grant reads `profile` — the face
 * (avatar / banner / bio / display name) is readable by everyone, including
 * anon. Private = the grant is removed — only the owner + members can read the
 * face.
 *
 * This is the app expressing publicness through the node's GENERIC group
 * primitives (a reserved `anyone` read-grant row) — no bespoke node surface
 * (D60: the protocol stays universal; "profile visibility" is a web10-social
 * concept mapped onto the universal role-grant mechanism). Requires a token
 * (only the owner can change their own profile).
 */
export async function setProfilePublic(isPublic: boolean): Promise<{ username: string; public: boolean }> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');
  const groupId = followersGroupId(token.username, token.provider);
  LOG('setProfilePublic —', isPublic, 'on', groupId);
  const members = await w.getGroupMembers(groupId);
  const hasAnyone = members.some((m) => m.member_key === 'anyone');
  if (isPublic && !hasAnyone) {
    await w.addGroupMember(groupId, 'anyone', 'reader');
  } else if (!isPublic && hasAnyone) {
    await w.removeGroupMember(groupId, 'anyone');
  }
  LOG('setProfilePublic — done:', isPublic);
  return { username: token.username, public: isPublic };
}
