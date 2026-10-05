// The shared face resolver — ONE place that turns a face's media refs into
// presigned URLs, for BOTH apps and BOTH face kinds (people + groups).
//
// Why this exists (the "stop the whack-a-mole" consolidation): the face media
// (avatar + banner) was resolved in ~7 separate spots, each with its own copy
// of the same logic — the author-scoped face-prepare SQL, the hyphenated
// `web10-social-group-identity` service name, the "latest doc wins" rule, and
// the row reduction. Every time one detail broke (oldest-vs-latest doc, the
// hyphenated service not compiling, owner-scoping), only the surfaces on that
// copy broke, and the rest needed their own fix. This is the single source:
// if a face breaks, it is fixed HERE, once, and every surface follows.
//
// The mechanism is the query engine's AUTHOR-SCOPED face-prepare (D73): a
// `POST /v3/query` with `prepare.face` mints the face URL bound to the row's
// `author_key` (the media owner) — not the viewer — so it works for any reader,
// anon included. The owner-scoped media endpoints (`/v3/media/list`,
// `/v3/media/read-url`) can't do this (they're scoped to the reader's own
// `author_key`), which is the root of the "people/groups show a gradient +
// initial" bugs.
//
// The package stays wapi-free + origin-free: the SQL builders and the row
// reduction are pure, and the QUERY TRANSPORT is injected by the caller (the
// social app passes its wapi `w.query`, the marketing site passes a `fetch`).
// The transport is the only app-specific seam.

/** The D60 group-identity service (the group's face). Hyphenated — the SQL
 *  builder backtick-quotes it (a bare name would not parse through the engine). */
export const GROUP_IDENTITY_SERVICE = 'web10-social-group-identity';

/** A face's resolved media + the rich fields the cards display. */
export interface FaceUrls {
  avatar_url?: string;
  banner_url?: string;
  /** The rich display name (the identity/profile body's `name`). */
  name?: string;
  /** The draft/published state (the identity body's `status`; absent on profiles). */
  status?: string;
}

/** The face-prepare spec for one media field (author-scoped presign, D73). */
export function facePrepare(mediaField: string, urlField: string): {
  bodyField: string;
  mediaField: string;
  urlField: string;
} {
  return { bodyField: 'body', mediaField, urlField };
}

/**
 * The people face query: the `profile` rows for a set of authors, latest per
 * author. `profile` is one-doc-per-user (updated in place), so the `QUALIFY`
 * is a no-op here — it is kept so the query shape is identical to the group
 * query (one code path, both face kinds).
 */
export function peopleFaceSql(authorKeys: string[]): string {
  const inList = authorKeys.map((a) => `'${a.replace(/'/g, "''")}'`).join(', ');
  return (
    `SELECT author_key AS author_key, body AS body FROM profile ` +
    `WHERE author_key IN (${inList}) ` +
    `QUALIFY row_number() OVER (PARTITION BY author_key ORDER BY created_at DESC) = 1`
  );
}

/**
 * The group face query: the identity rows, latest per group. The identity is a
 * replace-on-write doc stream (a new doc per save), so `QUALIFY` picks the
 * latest — the "latest doc wins" rule (the 3.210.0 bug was reading the oldest).
 * The service name is backtick-quoted (hyphenated).
 */
export const GROUP_FACE_SQL =
  `SELECT group_id AS group_id, author_key AS author_key, body AS body ` +
  `FROM \`${GROUP_IDENTITY_SERVICE}\` ` +
  `QUALIFY row_number() OVER (PARTITION BY group_id ORDER BY created_at DESC) = 1`;

/**
 * Reduce face-prepare rows into a per-key face map. `keyField` is the row
 * column that identifies the entity (`author_key` for people, `group_id` for
 * groups). Each row carries the entity's `body` (the identity/profile doc) +
 * the minted `avatar_url` / `banner_url`; the rich `name` + `status` are read
 * off the body. Merging two row sets (avatar + banner) for the same key just
 * fills in both URLs.
 */
export function reduceFaceRows(
  rows: Record<string, unknown>[],
  keyField: string,
): Map<string, FaceUrls> {
  const out = new Map<string, FaceUrls>();
  for (const row of rows) {
    const key = String(row[keyField] ?? '');
    if (!key) continue;
    const entry = out.get(key) ?? {};
    const body = row.body;
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      if (typeof b.name === 'string') entry.name = b.name;
      if (typeof b.status === 'string') entry.status = b.status;
    }
    if (typeof row.avatar_url === 'string') entry.avatar_url = row.avatar_url;
    if (typeof row.banner_url === 'string') entry.banner_url = row.banner_url;
    out.set(key, entry);
  }
  return out;
}

/**
 * The face-prepare transport: run one face query and return its rows. The
 * caller supplies the app's query path (wapi `w.query` or a `fetch` to
 * `/v3/query`). A transport error is the caller's to surface; `resolveFaceMedia`
 * degrades it to an empty result (faceless fallback), never a throw.
 */
export type FaceQueryTransport = (
  sql: string,
  groups: string[],
  prepare: { face: { bodyField: string; mediaField: string; urlField: string } },
) => Promise<Record<string, unknown>[]>;

/**
 * Resolve face media (avatar + banner) for a set of entities in TWO batched
 * face-prepare reads (one per field), scoped to `groups` (the I3 gate: only
 * readable faces return). Returns a per-key face map (keyed by `keyField`).
 * A face the reader can't read (a private profile / non-public group) is
 * absent → that card keeps the gradient fallback. A transport failure degrades
 * to an empty map (faceless cards), never a throw.
 */
export async function resolveFaceMedia(
  transport: FaceQueryTransport,
  sql: string,
  groups: string[],
  keyField: string,
): Promise<Map<string, FaceUrls>> {
  if (groups.length === 0) return new Map();
  const [avatarRes, bannerRes] = await Promise.all([
    transport(sql, groups, { face: facePrepare('avatar_ref', 'avatar_url') }).catch(() => []),
    transport(sql, groups, { face: facePrepare('banner_ref', 'banner_url') }).catch(() => []),
  ]);
  return reduceFaceRows([...avatarRes, ...bannerRes], keyField);
}
