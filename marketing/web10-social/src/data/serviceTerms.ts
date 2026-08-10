// Service Information Records (sirs) the social app registers with the
// node's Service Manager on signup/login (contractOnReady). Extracted to a pure
// builder so the owner-only-vs-anon-read invariants can be unit-tested
// without booting the adapter (which needs a real wapiInit + window).
//
// SECURITY MODEL (decisions.md D30, I3): each post tier is its OWN
// collection — `staging_posts` (owner-only, awaiting triage),
// `private_posts` (owner-only, deliberately private), `public_posts`
// (anon-read, discovery-indexed). A sir with no `whitelist` makes the
// node's default-deny bite: is_permitted returns False unless the
// requester's token is the owner's own. Adding a `whitelist` here opens
// anon-read per-action — only `public_posts` and the legacy `posts` carry
// that, by design.

export interface SirWhitelistEntry {
  provider: string;
  username: string;
  read?: boolean;
  create?: boolean;
}

export interface Sir {
  service: string;
  cross_origins: string[];
  whitelist?: SirWhitelistEntry[];
  // Legacy/loose form (only used by `bulletin`); kept here for type fidelity.
  provider?: string;
  username?: string;
  read?: boolean;
}

/**
 * Build the social app's canonical sirs list for the given cross-origin
 * set. The list is the single source of truth — `Web10SocialAdapter`
 * passes the result straight to `contractOnReady`.
 */
export function buildSocialServiceSirs(crossOrigins: string[]): Sir[] {
  return [
    {
      service: 'identity',
      cross_origins: crossOrigins,
      whitelist: [{ provider: '.*', username: '.*', read: true }],
    },
    {
      service: 'bulletin',
      cross_origins: crossOrigins,
      provider: '.*',
      username: '.*',
      read: true,
    },
    {
      service: 'contact-addresses',
      cross_origins: crossOrigins,
    },
    {
      service: 'message-inbox',
      cross_origins: crossOrigins,
      whitelist: [{ provider: '.*', username: '.*', create: true }],
    },
    {
      service: 'message-outbox',
      cross_origins: crossOrigins,
    },
    {
      service: 'posts',
      cross_origins: crossOrigins,
      whitelist: [{ provider: '.*', username: '.*', read: true }],
    },
    // ── Phase 5.5 / D30: public / private post split ──────────────────
    {
      service: 'public_posts',
      cross_origins: crossOrigins,
      whitelist: [{ provider: '.*', username: '.*', read: true }], // anon-read for discovery
    },
    {
      service: 'private_posts',
      cross_origins: crossOrigins,
      // no whitelist — owner-only (anon + foreign users denied by default)
    },
    // ── D19 Phase A: staging_posts (owner-only). marketing-api parsers
    // write imports to `staging_posts`, not the legacy anon-readable
    // `posts`, so importing your history no longer auto-publishes it.
    // The record is hidden until the staging UI (Phase C) publishes it
    // (a move to public_posts or private_posts). No whitelist means the
    // node's default-deny holds; the sir only pre-authorizes the social
    // app's origin to operate on its owner's own staging collection.
    {
      service: 'staging_posts',
      cross_origins: crossOrigins,
    },
    {
      service: 'crm-contacts',
      cross_origins: crossOrigins,
    },
    {
      service: 'crm-notes',
      cross_origins: crossOrigins,
    },
    {
      service: 'mail',
      cross_origins: crossOrigins,
      whitelist: [{ username: '.*', provider: '.*', create: true }],
    },
    // ── D4: conventions-schema services ──────────────────────────────
    {
      service: 'profile',
      cross_origins: crossOrigins,
      whitelist: [{ provider: '.*', username: '.*', read: true }],
    },
    {
      service: 'contacts',
      cross_origins: crossOrigins,
    },
    {
      service: 'inbox',
      cross_origins: crossOrigins,
      whitelist: [{ provider: '.*', username: '.*', create: true }],
    },
    {
      service: 'comments',
      cross_origins: crossOrigins,
      whitelist: [{ provider: '.*', username: '.*', read: true }], // D32: comments are public
    },
    {
      service: 'reactions',
      cross_origins: crossOrigins,
    },
    {
      service: 'media',
      cross_origins: crossOrigins,
    },
    // ── D35: public_media — anon-readable mirror of media for public
    // content. Public-post attachments and avatar/banner confirm into
    // `public_media` so non-owners can presign reads. DM/private-post
    // media stays in `media` (owner-only). The anon-read whitelist
    // matches `public_posts` / `profile` so any viewer (including
    // unauthenticated) can presign against it once terms are active.
    {
      service: 'public_media',
      cross_origins: crossOrigins,
      whitelist: [{ provider: '.*', username: '.*', read: true }], // anon-read for public content
    },
    {
      service: 'follows',
      cross_origins: crossOrigins,
    },
    {
      service: 'dms',
      cross_origins: crossOrigins,
    },
  ];
}