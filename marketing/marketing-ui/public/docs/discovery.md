# Discovery — the public layer on web10

## Problem

web10's data model is per-user collections (`mongodump alice` = full life,
portable). This gives sovereignty but makes discovery impossible: you need to
know a username to query their data. A new user with no follows sees nothing.

Additionally, there is no shared public interaction layer. Reactions,
endorsements, ratings, and custom events have no home — every app builds its
own silo.

## Decisions (D27, D28)

**D27** — Posts are plaintext, discoverable by design. E2E encryption is DMs
only. Discovery surfaces only what a user's terms already allow anon to read.

**D28** — A schema-registry public ledger gives any app a flexible, validated
way to publish structured public interactions. Schema IDs are
`provider.uuid6` — globally unique across federated nodes.

---

## 1. The discovery index

A flat system-level collection `web10.discovery_posts` mirrors public posts.
It is a **pointer**, not a copy:

```json
{
  "username": "alice",
  "service": "public_posts",
  "post_id": "ObjectId(...)",
  "text": "first 280 characters of the post...",
  "tags": ["webdev", "music"],
  "media_count": 2,
  "created_at": "2026-07-20T...",
  "updated_at": "2026-07-20T..."
}
```

The full post stays in `alice`'s collection. Discovery is the table of
contents. Clicking through reads the full post via the normal CRUD endpoint
(which checks terms).

### Why separate collections for visibility

Instead of a per-record `visibility` field, the social app routes posts into
separate collections by visibility:

```
alice/public_posts   → terms: anon whitelisted    → discovery indexes here
alice/private_posts  → terms: anon blocked        → discovery ignores this
alice/friends_posts  → terms: specific users only → discovery ignores this
```

**Why this, not per-record visibility:**

- **Bulk control**: "Make all my posts private" = change 1 terms record.
  Instant. Not updating 10,000 records.
- **Per-app permissions**: each collection is a separate service with its own
  terms. App A can read `public_posts`, App B can read both `public_posts`
  AND `private_posts`. The existing terms model already supports this.
- **No API filtering needed**: the CRUD endpoint returns everything in the
  service. Terms control who can read the service. Done.
- **Discovery is simple**: the index only reads from services where anon is
  whitelisted.

**The social app abstracts this away from the user:**

```js
function createPost(text, visibility = "public") {
  const service = visibility === "public" ? "public_posts" : "private_posts";
  return wapi.create(username, service, { text, created_at: now() });
}
```

The user sees a toggle. The app handles the routing.

### Index write path (on post create/update)

```
1. Background task fires after post create/update
2. Read the author's terms record for the service
3. Does terms whitelist anon reads?
   (get_approved("anon", PROVIDER, author, service, "read"))
   - NO  → skip, don't index
   - YES → upsert into web10.discovery_posts
4. The indexed record is a projection: username, service, post_id, text[:280],
   tags, media_count, created_at, updated_at. No full body.
```

> **`background_index_post` swallows exceptions — mind the silent failure.**
> The only writer to the index catches and logs (never raises) so a bad post
> can't fail a user's write. The cost: if the index path is broken, posts
> *silently* never appear and the feed is empty with no error surfaced to the
> caller. This is exactly how the `db["web10"]` handle bug (see §9) hid for so
> long. The `except` now logs; if the feed is empty, check the node logs for
> `discovery index upsert failed`.

### Index delete path (on post delete or terms change)

```
1. Post deleted → remove matching {username, service, post_id} from index
2. Terms change (anon revoked) → remove all posts for that user+service
3. Terms change (anon granted) → backfill all existing posts into index
```

### Why abuse is impossible

- A user cannot directly write to the index. They write to their own collection
  via CRUD. The background task is the only writer.
- The background task checks terms before indexing. If terms don't allow anon,
  the post never enters discovery.
- The indexed record is a projection. A user can't smuggle extra fields.
- If a user changes terms to revoke anon, their posts vanish from discovery
  instantly.
- The index is in the `web10` system database. User CRUD cannot target it —
  `db.create(user, service, data)` always writes to `db[f"{user}"]`, never to
  `web10`.

---

## 2. The public ledger

A shared, system-level collection `web10.public` for cross-user interactions.
Any authenticated user can write entries. Anon can read. No terms dance — it's
public by definition.

### Schema registry

Entries in the public ledger reference a **schema** that defines their payload
shape. Schemas are registered by any app developer and stored in
`web10.schemas`.

**Schema ID format:** `provider.uuid6`

```
api.web10.app.0194a2b0-1c8e-4f5d-8a3e-9c7b2d1e0f4a
```

UUID6 is time-ordered and globally unique. Combined with the provider, no two
nodes can collide on a schema ID.

### Schema CRUD

```
web10.schemas:
  {
    "_id": "api.web10.app.0194a2b0-...",
    "title": "Reaction",
    "author": "social-app",
    "provider": "api.web10.app",
    "payload": {
      "type": "object",
      "properties": { "emoji": { "type": "string" } },
      "required": ["emoji"]
    },
    "version": 1,
    "created_at": "2026-07-20T...",
    "updated_at": "2026-07-20T..."
  }
```

**Permissions:**

| Action | Who |
|--------|-----|
| Create | Any authenticated user |
| Read | Anyone (anon) |
| Update | Schema author only (API enforces `token.username == schema.author`) |
| Delete | Schema author only |

**Versioning:** When an author updates a schema, `version` increments. Existing
public ledger entries keep their reference to the schema ID. The API validates
new entries against the current version. Old entries are not re-validated.

### Public ledger entry

```json
{
  "schema_id": "api.web10.app.0194a2b0-...",
  "author": "bob",
  "target": {
    "user": "alice",
    "service": "public_posts",
    "id": "ObjectId(...)"
  },
  "payload": { "emoji": "🔥" },
  "created_at": "2026-07-20T10:30:00Z"
}
```

**Required fields:** `schema_id`, `author`, `target`, `payload`, `created_at`.

**Validation on write:**
1. Look up the schema by `schema_id` in `web10.schemas`
2. Validate `payload` against `schema.payload` (JSON Schema)
3. Reject if invalid

**Why this is flexible:**

- App dev registers a schema → gets a UUID → publishes it in their docs
- Any app can use any schema by referencing its UUID
- New interaction types don't need API changes — just register a schema
- The social app caches schemas locally: `schema_id → schema definition`
- Schemas can be anything: reactions, ratings, endorsements, reviews,
  milestones, custom events

**Example schemas:**

```js
// Reaction (social app)
{ title: "Reaction", payload: { emoji: "string", required: ["emoji"] } }

// Rating (review app)
{ title: "Rating", payload: { value: "number", max: "number", required: ["value"] } }

// Endorsement (professional network)
{ title: "Endorsement", payload: { skill: "string", text: "string", required: ["skill"] } }

// Custom event (any app)
{ title: "Milestone", payload: { type: "string", value: "number", required: ["type", "value"] } }
```

### Public ledger permissions

```
web10.public terms:
  whitelist: [
    { "username": ".*", "provider": ".*", "read": true },
    { "username": ".*", "provider": ".*", "create": true }
  ]
```

Anon can read. Any authenticated user can create. Update/delete of individual
entries is **author-only** (enforced by the API: `token.username == entry.author`).

### Engagement aggregation

The discovery index stores cached engagement counts, computed from public
ledger entries:

```json
{
  "username": "alice",
  "service": "public_posts",
  "post_id": "ObjectId(...)",
  "engagement": {
    "api.web10.app.0194a2b0-...": { "count": 2400, "schema_title": "Reaction" },
    "api.web10.app.0194a2b1-...": { "count": 186, "schema_title": "Comment" }
  }
}
```

On public ledger entry create/delete, the background task updates the
engagement cache for the target post. Schema IDs are the keys — any schema
can contribute to engagement.

---

## 3. Endpoints

All discovery endpoints are **system-level** (no `{user}` in the path). They
accept a token but do not require authentication — an anon token is valid.

### Schema endpoints

#### `POST /schemas/register`

Register a new schema. Returns the schema with its UUID6 ID.

**Request body:**
```json
{
  "token": "...",
  "title": "Reaction",
  "payload": {
    "type": "object",
    "properties": { "emoji": { "type": "string" } },
    "required": ["emoji"]
  }
}
```

**Response:**
```json
{
  "_id": "api.web10.app.0194a2b0-1c8e-4f5d-8a3e-9c7b2d1e0f4a",
  "title": "Reaction",
  "author": "social-app",
  "provider": "api.web10.app",
  "payload": { ... },
  "version": 1,
  "created_at": "2026-07-20T..."
}
```

#### `PATCH /schemas/{schema_id}`

Fetch a schema by ID. (Anon OK.)

**Response:** The schema record.

#### `PUT /schemas/{schema_id}`

Update a schema. Author only.

**Request body:** Token + fields to update (`$set`).

**Response:** Updated schema with incremented version.

#### `DELETE /schemas/{schema_id}`

Delete a schema. Author only. Existing public ledger entries keep their
reference but are no longer validated on new writes.

### Public ledger endpoints

#### `POST /public/entries`

Create a public ledger entry. Validates payload against the referenced schema.

**Request body:**
```json
{
  "token": "...",
  "schema_id": "api.web10.app.0194a2b0-...",
  "target": { "user": "alice", "service": "public_posts", "id": "..." },
  "payload": { "emoji": "🔥" }
}
```

**Response:**
```json
{
  "_id": "ObjectId(...)",
  "schema_id": "api.web10.app.0194a2b0-...",
  "author": "bob",
  "target": { ... },
  "payload": { "emoji": "🔥" },
  "created_at": "2026-07-20T10:30:00Z"
}
```

#### `PATCH /public/entries`

Query public ledger entries. (Anon OK.)

**Query params:**
- `schema_id`: filter by schema
- `target_user`: filter by target user
- `target_service`: filter by target service
- `target_id`: filter by target record ID
- `author`: filter by author
- `limit`: int, default 20, max 100
- `skip`: int, default 0

**Response:** Array of public ledger entries.

#### `PUT /public/entries/{entry_id}`

Update a public ledger entry. Author only.

#### `DELETE /public/entries/{entry_id}`

Delete a public ledger entry. Author only.

### Discovery endpoints

Discovery is a **public read**. The canonical call is a **bodyless `PATCH`**
with parameters in the URL query string — no token and no request body are
required (this is what the social feed sends, e.g.
`PATCH /discover/posts?sort=recent&limit=20`). A JSON body is *optional*: if
present, values under its `query` object override the URL params (for richer
clients). The verb is `PATCH` (not `GET`) only so the optional body is
well-formed under the shared `Token` model; it is idempotent and read-only.

> **Gotcha, do not regress:** the endpoints must NOT make the body required.
> They once did (`token: Token` with no default), so the feed's bodyless
> `PATCH` returned `422 body required`, which `web10-social`'s `feed.ts`
> swallowed into a permanently empty feed. The handler signatures take the
> params as function args (URL query) with `token: Token | None = None`.
> Regression tests live in `api/tests/test_discovery.py`
> (`test_posts_bodyless_patch` and friends).

#### `PATCH /discover/posts` — For You feed

Returns public posts sorted by engagement or recency.

**Query params:**
- `sort`: `recent` (default) | `trending` (by engagement score)
- `limit`: int, default 50, max 200
- `skip`: int, default 0

**Request body:** optional Token; `query.sort`/`query.limit`/`query.skip`
override the URL params. No body is fine.

**Response:**
```json
[
  {
    "username": "alice",
    "service": "public_posts",
    "post_id": "ObjectId(...)",
    "text": "Just shipped the new studio dashboard...",
    "tags": ["webdev"],
    "media_count": 1,
    "created_at": "2026-07-20T10:30:00Z",
    "engagement": {
      "api.web10.app.0194a2b0-...": { "count": 2400, "schema_title": "Reaction" },
      "api.web10.app.0194a2b1-...": { "count": 186, "schema_title": "Comment" }
    }
  }
]
```

#### `PATCH /discover/users` — Suggested accounts

Returns users who whitelist anon reads on their public posts, sorted by
activity or follower count.

**Query params:**
- `sort`: `active` (default, most posts in last 7 days) | `followers`
- `limit`: int, default 20, max 100
- `skip`: int, default 0

**Request body:** Token (can be null for anon).

**Response:**
```json
[
  {
    "username": "alice",
    "display_name": "Alice Chen",
    "bio": "Creator, developer",
    "avatar_ref": "ObjectId(...)",
    "follower_count": 12400,
    "post_count_7d": 14
  }
]
```

#### `PATCH /discover/search` — Content search

Text search across public post content.

**Query params:**
- `q`: search query (required)
- `limit`: int, default 20, max 100
- `skip`: int, default 0

**Request body:** Token (can be null for anon).

**Response:** Same shape as `/discover/posts`.

#### `PATCH /discover/topics` — Trending hashtags

Returns most-used tags in public posts over a time window.

**Query params:**
- `limit`: int, default 20, max 50
- `window`: `24h` (default) | `7d`

**Request body:** Token (can be null for anon).

**Response:**
```json
[
  { "tag": "webdev", "count": 1240 },
  { "tag": "music", "count": 890 }
]
```

#### `PATCH /discover/post/{username}/{service}/{post_id}` — Single post lookup

Returns the full post for a discovery click-through. Checks terms.

**Request body:** Token (can be null for anon).

**Response:** The full post record from the user's collection.

---

## 4. Federation (future)

### Discovery across nodes

```
Node A receives /discover/posts request
  → query local web10.discovery_posts
  → for each federated peer, call peer's /discover/posts
  → merge results, sort by engagement/recency
  → return unified feed
```

Each node returns only its own public posts (terms already enforced locally).

### Schema resolution across nodes

Schema IDs include the provider. When Node A receives a public ledger entry
with `schema_id: api.node-b.web10.app.0194a2b0-...`, it fetches the schema
from Node B's `/schemas/{schema_id}` endpoint and caches it.

### Public ledger federation

Public ledger entries are node-local. Federation aggregates across nodes:

```
Node A receives /public/entries?target_id=...
  → query local web10.public
  → for each federated peer, call peer's /public/entries?target_id=...
  → merge results
```

---

## 5. Migration

- Existing posts in `posts` (single collection) are NOT migrated. New posts
  go to `public_posts` or `private_posts` based on the social app's routing.
- The discovery index grows forward from deployment. Old posts enter discovery
  when they are next updated, or via a one-time backfill script.
- The social app registers its default schemas (Reaction, Rating, etc.) on
  first boot and caches them locally.

---

## 6. What this does NOT do

- Does not change the per-user collection model
- Does not store full post bodies in the index (only projections)
- Does not allow direct writes to the discovery index
- Does not bypass terms (the index only contains what terms allow anon to read)
- Does not handle encrypted content (DMs only, per D27)
- Does not require blockchain, consensus, or append-only semantics
- Does not hardcode interaction types (schemas are developer-defined)

---

## 7. Open questions

- Repost model: is it a new service, a flag on posts, or a public ledger
  entry with a "repost" schema?
- The "For You" algorithm: engagement score formula or just chronological?
- Rate limiting on discovery endpoints: how many requests per anon IP?
- Public ledger entry limits: max payload size? max entries per author per
  target?
- Schema deprecation: when an author deletes a schema, should existing entries
  be flagged as "schema retired"?
- Backfill script for existing posts when the social app splits into
  `public_posts` / `private_posts`

---

## 8. API implementation plan

### New system collections

```
web10.discovery_posts  — the post index (write-protected, background task only)
web10.schemas          — schema registry (CRUD, author-enforced)
web10.public           — public ledger entries (any user can write, author-only update/delete)
```

### New API endpoints (in a new `discover` router)

```
POST   /schemas/register
PATCH  /schemas/{schema_id}        — fetch
PUT    /schemas/{schema_id}        — update (author only)
DELETE /schemas/{schema_id}        — delete (author only)

POST   /public/entries
PATCH  /public/entries             — query
PUT    /public/entries/{entry_id}  — update (author only)
DELETE /public/entries/{entry_id}  — delete (author only)

PATCH  /discover/posts
PATCH  /discover/users
PATCH  /discover/search
PATCH  /discover/topics
PATCH  /discover/post/{username}/{service}/{post_id}
```

### Background tasks (in existing CRUD endpoints)

```
On POST /{user}/{service} (create):
  → enqueue index_upsert(user, service, post)
  → if service is public_posts and anon whitelisted, upsert into discovery_posts

On PUT /{user}/{service} (update):
  → enqueue index_upsert(user, service, post)

On DELETE /{user}/{service}:
  → enqueue index_delete(user, service, post)

On POST /public/entries:
  → validate payload against schema
  → enqueue engagement_update(target_user, target_service, target_id)
```

### Social app changes

```
1. Split posts into public_posts / private_posts services
2. Create default terms for both services on user signup
3. Register default schemas (Reaction, etc.) on first boot
4. Cache schemas locally: schema_id → schema definition
5. Route createPost by visibility toggle
6. Wire feed preview to /discover/posts endpoint
7. Wire reactions to /public/entries endpoint
```

### Marketing-ui changes

```
1. Replace FeedPreview placeholder data with /discover/posts
2. Wire tab switching to sort params (recent, trending)
3. Wire reaction buttons to /public/entries
4. Fetch schema definitions for rendering interaction types
```

---

## 9. Operational notes (backends, dev data, gotchas)

These are the things that made discovery look "broken" in practice even when
the code was right. Read before debugging an empty feed.

### Data backend differs by environment

The discovery index and public ledger are Mongo collections in the `web10`
system database, reached over the Mongo wire protocol (`documentdb.py`). The
*backend* behind that wire protocol is **not the same in every environment**:

| Env | Backend | Data | Set by |
|-----|---------|------|--------|
| **dev** | containerized **FerretDB** (`ghcr.io/ferretdb/ferretdb:2`) | empty by default | `DB_URL` unset → `mongodb://…-ferretdb:27017/` |
| **prod** | the **real host MongoDB** (native, ~200 real users) | live | `DB=deploy` + `DB_URL=mongodb://host.docker.internal:27017/` |
| **tests** | pymongo fully mocked (`conftest.py`) | none | n/a |

Consequences:
- **A fresh dev stack has ~0 users and an empty feed.** `POST /stats` returning
  `users: 2` is dev being empty, not a bug. Seed it (below) before judging the
  feed or trending.
- **The system collections are addressed as `db["web10"][name]`.** `db` is
  `client[settings.DB]` (a Database), so `db["web10"]` is a *Collection* named
  `web10`, and `db["web10"][name]` is the collection `web10.<name>` in that
  same database. CRUD ops (`insert_one`/`find`/`create_index`) work on it, but
  Database-only methods (`list_collection_names`/`create_collection`) do NOT —
  they raise `TypeError` on a Collection. `_ensure_system_collection` therefore
  runs those two through the Database handle (`db`), never `db["web10"]`. This
  was a real bug that 500'd every discovery/ledger/schema request on a live
  node; the fully-mocked pymongo test suite hid it (a `MagicMock` accepts any
  call). **Lesson: the mocked API tests cannot catch DB-handle misuse — verify
  discovery/ledger changes against a real Mongo/FerretDB before trusting them.**
- **FerretDB *does* support `$text` indexes and search** (verified against
  `ferretdb:2`) — the earlier assumption that it didn't was wrong. The one real
  FerretDB quirk found: a `{"$meta": "textScore"}` projection returns only
  `_id` + score (dropping the document fields), so `/discover/search` avoids
  meta projections and orders by `created_at` instead — works identically on
  both backends. Do not reintroduce a `textScore` projection/sort.

### Seeding dev so the feed/trending isn't empty

The feed and trending demo empty on a fresh dev DB. Populate it with the live
personas:

```
python3 persona-orchestration/seed_personas.py --api https://api.dev.web10.app
```

This creates the persona accounts, posts to `public_posts` (so posts enter the
discovery index), cross-follows, and writes reactions/comments to the public
ledger. See `persona-orchestration/README.md`. Seeding only shows up in the
feed once an API build with the discovery-read fix is deployed to that env.

### The empty-feed debugging checklist

1. Is the env's DB actually populated? `POST /stats` — check `users`.
2. Does the read work? `PATCH /discover/posts?sort=recent&limit=5` (**bodyless**)
   should return `200` with a JSON array — not `422` (body-required regression)
   and not `500` (system-collection handle bug — check the node logs for a
   `TypeError` from `list_collection_names`/`create_collection`, see the handle
   note above).
3. Did writes get indexed? A post only enters discovery if the author's terms
   for that service whitelist `anon` (default on `public_posts`), AND the index
   upsert didn't throw — grep the node logs for `discovery index upsert failed`
   (§1).