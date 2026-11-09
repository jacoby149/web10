# ClickHouse Schema

The data model. Every table, every index, every pattern.

**v3 is ClickHouse-only.** FerretDB and Postgres have been removed from the stack. Every operation — auth, CRUD, groups, contracts, media, accounts — goes through ClickHouse. No MongoDB. No DocumentDB. One database, one query engine, one deployment.

## Schema Architecture

```mermaid
erDiagram
    documents {
        String doc_id PK
        String author_key PK
        String collection_name
        String body
        String ref_value
        "Array(String)" tags
        "DateTime64" created_at
        "DateTime64" updated_at
        "UInt8" deleted
    }
    doc_groups {
        String doc_id PK
        String group_id PK
        "DateTime64" created_at
        "DateTime64" updated_at
        "UInt8" deleted
    }
    group_contracts {
        String group_id PK
        String roles
        String join_policy
        "DateTime64" created_at
        "DateTime64" updated_at
        "UInt8" deleted
    }
    group_members {
        String group_id PK
        String member_key PK
        String role
        "DateTime64" joined_at
        "DateTime64" updated_at
        "UInt8" deleted
    }
    group_join_requests {
        String group_id PK
        String requester_key PK
        String status
        "DateTime64" requested_at
        "DateTime64" resolved_at
        "DateTime64" updated_at
        "UInt8" deleted
    }
    group_hidden_docs {
        String group_id PK
        String doc_id PK
        String moderator_key
        "DateTime64" hidden_at
        "DateTime64" updated_at
        "UInt8" deleted
    }
    app_contracts {
        String user_key PK
        String allowed_origin PK
        String permissions
        "DateTime64" created_at
        "DateTime64" updated_at
        "UInt8" deleted
    }
    user_blacklist {
        String user_key PK
        String blocked_key PK
        "DateTime64" created_at
    }
    group_blacklist {
        String user_key PK
        String group_id PK
        String blocked_key PK
        "DateTime64" created_at
    }
    user_group_sharing {
        String user_key PK
        String group_id PK
        "UInt8" sharing_enabled
        "DateTime64" created_at
        "DateTime64" updated_at
        "UInt8" deleted
    }
    users {
        String username PK
        String password_hash
        String phone
        "UInt8" phone_verified
        String email
        "UInt8" email_verified
    }
    apps {
        String url PK
        String name
        String description
        String icon_url
        String screenshots
        "UInt64" visits
        "UInt8" approved
        String review_state
    }
    app_visits {
        String app_url PK
        String username PK
        "DateTime64" seen_at PK
    }
    app_ratings {
        String target_app_id PK
        String author PK
        "UInt8" rating
        String comment
        String provider
    }

    documents ||--o{ doc_groups : "attached to"
    doc_groups }o--|| group_contracts : "maps to"
    group_contracts ||--o{ group_members : "has"
    group_contracts ||--o{ group_join_requests : "receives"
    group_contracts ||--o{ group_hidden_docs : "moderates"
    documents }o--|| user_blacklist : "author blocked by"
    documents }o--|| group_blacklist : "author blocked in group"
    documents }o--|| group_hidden_docs : "hidden from group"
    app_ratings }o--|| apps : "rates"
    users ||--o{ app_ratings : "authors"
    app_visits }o--|| apps : "usage of"
    users ||--o{ app_visits : "used"
```

One table for content. One table for visibility. Five tables for groups. One table for app trust. Two tables for blocking. One table for sharing control. One table for accounts. Three tables for the app store. **14 tables.** Everything else is a query.

## Documents

Everything structured. One table. JSON body for schema flexibility. `ref_value` is the universal link — any document can point to any other.

```sql
CREATE TABLE documents (
    doc_id String,
    author_key String,
    collection_name String,
    body String,
    ref_value String DEFAULT '',
    tags Array(String),
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0,
    ad_mode String DEFAULT 'none',
    ad_target String DEFAULT ''
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (author_key, doc_id);
```

**Primary key:** `(author_key, doc_id)` — fast lookups by author and by document ID.

**ReplacingMergeTree:** updates are inserts with higher `updated_at`. The engine keeps the latest version.

**Tombstones:** deletes are inserts with `deleted = 1`. Queries filter `WHERE deleted = 0`. (No TTL — the `documents` table keeps data until explicitly deleted; the node is the user's data lake.)

**`ref_value`:** the universal link. Comments, reactions, replies, quotes, bookmarks, votes — all just documents with a `ref`.

**`ad_mode` + `ad_target`:** the v3 ad preference (`../social/ads-dissemination.md`). `ad_mode` is `none` (the default — no ad) or `pinned` (the doc carries a specific ad); `ad_target` is the pinned ad's `doc_id`. The read serves a pinned doc with its ad inline, I3-checked. Pre-existing volumes get the columns via the boot self-heal (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`), which is why document inserts are positional and append the values last.

**`collection_name`:** low cardinality. Distinguishes posts, reactions, comments, outbox, profile — all in the same table.

**`tags`:** freeform labels. Fast filtering with `has(tags, 'jazz')`.

## Document versioning + per-service layout (target — D109, unimplemented)

Status as of 09.11.2026: committed direction (D109), not built. No runtime,
schema, deployment or migration change ships with this section; the table
above remains the production truth until IX2 feasibility evidence lands.

### Why the current shape is the bottleneck

`documents` is sort-keyed `(author_key, doc_id)` and versioned by
`updated_at` — right for the ownership question (I3: does this token own
this document), wrong for the read questions the node actually gets:

- **Latest reads are ranked scans.** "The current version of document X" is
  `row_number() OVER (PARTITION BY author_key, doc_id ORDER BY updated_at
  DESC)` — the profile join in every feed query pays it per row.
  Timestamps are millisecond wall clocks and can tie: two writes to one
  document in the same millisecond are a merge-time coin flip, and the
  "deletion wins timestamp ties" convention exists to paper over it.
- **Time-ordered reads scan the whole history.** A date-bounded
  K=1,000-group feed filters `created_at` after the sort key can no longer
  help; the physical read is the entire history, then JSON-layer filtering.
  The 09.11 projection experiment measured exactly this: on old-heavy
  clustered input a time-ordered shadow layout cut the physical read 381 MB
  → 5.3 MB (~70×) and query memory ~1.1 GB → ~19 MB; on mixed/dense blocks
  the win vanished; on all-recent input candidate work cost more than it
  saved.
- **Engagement joins are full-table JSON passes.** Reactions and comments
  live in the same table with the same shape; every feed's like/comment
  counts are `countIf(JSONExtractString(...))` over the whole service.

### The target

Two independent changes, one direction:

1. **Integer `version`, server-assigned per `(author_key, doc_id)`,
   strictly increasing from 1.** The engine becomes
   `ReplacingMergeTree(version)`, ordered `(author_key, doc_id, version)`.
   `created_at` (already on the envelope, retained through tombstones) and
   `updated_at` (wall-clock "last touched") stay. What becomes exact:
   last-write-wins (no millisecond coin flip), "latest" (a `max(version)` +
   primary-key point read — no window function), tombstones (an ordered
   version; the tie convention retires), and updates gain a CAS surface
   (the client asserts the version it read; the server rejects stale).
2. **Per-service physical tables.** The app's own `collection_name` label
   routes its documents to that service's table; the sort key is chosen for
   how that type is read (default: author-leading time order — feed shapes;
   `ref_value`-leading — engagement count shapes). The query compiler
   rewrites `FROM documents WHERE collection_name = 'x'` to the service
   table transparently; app SQL and the SDK are unchanged. D60 holds: the
   node hardcodes no app concept — the routing key is the string the app
   already wrote, and any read-order hint is app-declared at service
   registration, node-applied physically. Access semantics are untouched:
   `doc_groups`/`group_contracts` attach to documents, not to the physical
   table, and I3 re-asserts per service table by construction
   (`author_key` leads the sort key).

Considered and rejected: a node release version stamp (5.x.x) on every row
— derivable, stale under rolling deploys, local trivia on foreign rows,
lexicographically unsortable. See D109.

### Migration outline (design, not authorization)

- **Stage 1 — `documents_v2`:** the same single table, `version` in the PK,
  backfilled by ranking each document's existing history under a
  documented, receipt-pinned deterministic total order (deletion-wins-ties
  generalized). The old table stays read-only as the parity oracle until
  per-document max-version-row hashes match.
- **Stage 2 — the split:** copy `documents_v2` into service tables; flip
  the compiler routing; keep `documents_v2` read-only as the oracle;
  parity receipts; then drop.
- Each stage is its own claim, its own receipts, and its own ≤500-line gate
  where it touches `api/`. Neither stage is authorized by this section. No
  production migration, deployment, matched-hardware run, timeout
  relaxation or paid execution without explicit operator approval.

### Evidence and provenance

The 09.11.2026 experiment (disposable ClickHouse 24.8, frozen 1M-author
derivative, K=1,000 feed) ran on branch `jacoby149/hello-chat-v3` (PR
1464), which the operator deemed failed as a merge vehicle; the receipts
remain there and must be cited with that provenance — they are not merged
evidence: `research/experiments/costfn/DATE-RESULTS.md` (projection
numbers, strict traffic 4/4 at the 10 s deadline, cloud SSH-block) and
`MATCHED-DATES.md` (the matched A/B/C design — A: all-time without
pruning, B: date-filtered without pruning, C: date-filtered with pruning —
paused before the million-author run). The acceptance metric for IX2
feasibility is **bytes read per K=1,000 feed request** on the same frozen
input, before/after — hardware-independent by construction.
Fleet-capacity claims additionally require matched silicon; the two claims
are never conflated.

## Doc Groups

Document-to-group mapping. Groups define who can see the document.

```sql
CREATE TABLE doc_groups (
    doc_id String,
    group_id String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (doc_id, group_id);
```

**Primary key:** `(doc_id, group_id)`. No `permission` column — roles define access, not per-attachment permissions.

## Group Contracts

People + policy. Service-scoped roles.

```sql
CREATE TABLE group_contracts (
    group_id String,
    roles String,              -- JSON: roles with services + permissions
    join_policy String,        -- 'open', 'request', 'invite_only'
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY group_id;
```

## Group Members

Active members. One role per member per group.

```sql
CREATE TABLE group_members (
    group_id String,
    member_key String,
    role String,
    joined_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (group_id, member_key);
```

**Primary key:** `(group_id, member_key)`. Promoting a member is a new insert with higher `updated_at` and the new role name.

## Group Join Requests

Pending join requests for "request" join policy.

```sql
CREATE TABLE group_join_requests (
    group_id String,
    requester_key String,
    status String,             -- 'pending', 'approved', 'denied', 'invited', 'declined'
    role String DEFAULT '',    -- role offered on an invite (empty for plain join requests)
    requested_at DateTime64(3),
    resolved_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (group_id, requester_key);
```

## Group Hidden Docs

Moderation. A moderator with `hideAll` hides a document from the group's discover. The document stays in the author's collection and other groups. Reversible.

```sql
CREATE TABLE group_hidden_docs (
    group_id String,
    doc_id String,
    moderator_key String,
    hidden_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (group_id, doc_id);
```

The read query excludes hidden documents:
```sql
AND (doc_id, group_id) NOT IN (
  SELECT doc_id, group_id FROM group_hidden_docs WHERE deleted = 0
)
```

## App Contracts

App Trust. One contract per app. Per-service permissions. CORS. Browser-enforced.

Services are infinite — any string in `collection_name` is a valid service. `posts`, `playlists`, `comments`, `notes`, `reactions` — no schema migration, no approval. ClickHouse doesn't care. The `app_contracts` table stores a JSON permissions object mapping service names to operations. The API checks the JSON at query time. Infinite services, finite apps, one sieve of joins.

```sql
CREATE TABLE app_contracts (
    user_key String,
    allowed_origin String,
    permissions String,        -- JSON: { "posts": ["readAll", "create"], "playlists": ["readAll"] }
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_key, allowed_origin);
```

## User Group Sharing

Per-user, per-group toggle. "Pause sharing without leaving."

```sql
CREATE TABLE user_group_sharing (
    user_key String,
    group_id String,
    sharing_enabled UInt8,     -- 1 = sharing, 0 = blocked
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_key, group_id);
```

## Users

Account data. Every user on the node.

```sql
CREATE TABLE users (
    username String,
    password_hash String,
    phone String DEFAULT '',
    phone_verified UInt8 DEFAULT 0,
    email String DEFAULT '',
    email_verified UInt8 DEFAULT 0,
    domain String DEFAULT '',
    domain_verified UInt8 DEFAULT 0,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY username;
```

**Primary key:** `username` — unique, fast lookup.

**Domain:** the claimed DNS alias (`domain` + `domain_verified`) — the
account-level analog of `phone`; see `../identity/domain-identity.md`.

**Tombstones:** account deletion is `deleted = 1`. Queries filter `WHERE deleted = 0`.

**Phone/Email:** stored unverified by default. Verification codes sent via Twilio/email. `phone_verified` / `email_verified` set to 1 on code confirmation.

## Node Config

The node's operator configuration (D48) — admins list, provider
identity, setup state, JWT key records. A key/value table:
`config_id='node'` holds the node config JSON; `config_id='jwt:<kid>'`
holds JWT signing key records.

```sql
CREATE TABLE node_config (
    config_id String,
    body String,
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY config_id;
```

**Primary key:** `config_id` — one logical row per key.

**Versions:** saves APPEND a new row (never UPDATE — the OLAP pattern);
reads dedup to the latest row per `config_id` (the house
dedup-then-filter pattern). `deleted` is reserved for the tombstone
convention; config is currently never deleted.

**Admins:** the config's `admins` list is the source of truth for
`check_admin`, unioned with `settings.DEFAULT_ADMINS` (the lockout-proof
baseline — the node is usable before setup saves a list). See
`../setup/node-config.md`.

## Apps

Registered apps in the provider app store. The **stable registration
record** — a row is appended on first registration or a real metadata
change only, never per ping (D49). The url is stored in canonical form
(lowercase host, no `www.`, exactly one trailing slash, no query/fragment).

```sql
CREATE TABLE apps (
    url String,
    name String DEFAULT '',
    description String DEFAULT '',
    icon_url String DEFAULT '',
    screenshots String DEFAULT '',
    visits UInt64 DEFAULT 0,
    approved UInt8 DEFAULT 0,
    review_state String DEFAULT 'pending',
    metadata_version UInt32 DEFAULT 1,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY url;
```

**Primary key:** `url` — the app's full URL, path included (a path is an
app, D47), in canonical form.

**`review_state`:** `pending`, `approved`, `pending_on_change`, `rejected`.

**`screenshots`:** JSON array of screenshot URLs.

**`visits`:** retired as a store metric (D49) — the store's numbers are
realtime queries over `app_visits`. Kept on the row for the admin view;
not a counter the store shows.

## App Visits

The app usage log (D49). One row per **counted** ping: a real,
token-verified web10 user used the app. Ingest is gated server-side — a
row is inserted only if the `(app_url, username)` pair has no prior row
or its latest `seen_at` is more than 3 hours old ("if >3h, insert").
Anon pings (no token, or a token that fails signature verification — I2)
never reach this table. The store's metrics are realtime queries over
these rows: `visits` = `count()`, `users_Nd` = distinct usernames with a
row in the trailing window. No maintained counters — nothing to race,
lose, or pile on.

```sql
CREATE TABLE app_visits (
    app_url String,
    username String,
    seen_at DateTime64(3)
) ENGINE = MergeTree
ORDER BY (app_url, username, seen_at)
TTL toDateTime(seen_at) + INTERVAL 2 YEAR;
```

**Primary key:** `(app_url, username, seen_at)` — append-only event log,
no tombstones. The `ORDER BY` puts each (app, user)'s rows in time
order, so the ingest gate's `max(seen_at)` lookup is a primary-key
suffix scan. The TTL is the compaction: rows older than 2 years (the
longest metric window is 1y) drop out on merge.

## App Ratings

Star ratings for apps. One per (author, target_app). A review is a rating
with words — `comment` is optional text (D52).

```sql
CREATE TABLE app_ratings (
    author String,
    target_app_id String,
    rating UInt8,
    comment String DEFAULT '',
    provider String,
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (target_app_id, author);
```

**Primary key:** `(target_app_id, author)` — one rating per user per app. Upsert on update.

## Bug Reports

User-submitted bug reports with optional base64-encoded screenshots. Separate from user data — append-only, no tombstones needed.

```sql
CREATE TABLE bug_reports (
    report_id String,
    username String DEFAULT '',
    email String DEFAULT '',
    description String,
    page_url String DEFAULT '',
    app_version String DEFAULT '',
    device_info String DEFAULT '',
    browser_info String DEFAULT '',
    error_message String DEFAULT '',
    stack_trace String DEFAULT '',
    screenshots String DEFAULT '',
    created_at DateTime64(3),
    updated_at DateTime64(3),
    deleted UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY report_id;
```

**Primary key:** `report_id` — unique per report.

**`screenshots`:** JSON array of base64-encoded image strings, each with `data:image/png;base64,...` or `data:image/jpeg;base64,...` prefix. Stored inline — no separate blob store needed.

**`username`:** optional — reports can be submitted anonymously. When authenticated, the username is auto-populated.

## Blacklists

Two levels of blocking.

```sql
CREATE TABLE user_blacklist (
    user_key String,
    blocked_key String,
    created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (user_key, blocked_key);

CREATE TABLE group_blacklist (
    user_key String,
    group_id String,
    blocked_key String,
    created_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY (user_key, group_id, blocked_key);
```

## Logs (Signal Router)

Unified log store. Every request, SDK event, and E2E test capture lands here. One table, one query, full incident timeline.

```sql
CREATE TABLE logs (
    ts DateTime64(6),
    service LowCardinality(String) DEFAULT 'api',
    level LowCardinality(String) DEFAULT 'info',
    method LowCardinality(String) DEFAULT '',
    path LowCardinality(String) DEFAULT '',
    status UInt16 DEFAULT 0,
    latency_ms UInt32 DEFAULT 0,
    user_key String DEFAULT '',
    origin String DEFAULT '',
    message String DEFAULT '',
    request_body String DEFAULT '',
    response_body String DEFAULT '',
    meta String DEFAULT ''
) ENGINE = MergeTree
PARTITION BY toYYYYMMDD(ts)
ORDER BY (ts)
TTL ts + INTERVAL 30 DAY;
```

**Not tombstoned.** Append-only. TTL handles cleanup. No `deleted` column, no ReplacingMergeTree.

### Sources

| `service` | Source | How |
|---|---|---|
| `api` | API middleware (`app/middleware.py`) | When downstream yields a response: allowlisted method, server route template (not raw URL), status, latency and severity; body/meta/user_key/origin columns empty ([logging boundary](../security/logging.md)) |
| `sdk` | Browser SDK via `POST /v3/logs` | Console logs tee'd from the demo app. Tagged with `user_key` + `origin` |
| `e2e` | Playwright runner via `POST /v3/logs` | Captured browser console + network logs after each test. Tagged with `test_name` in `meta` |

### The `POST /v3/logs` endpoint

Lightweight, no auth. Accepts a batch of log entries:

```json
{
  "service": "sdk",
  "user_key": "api.localhost/alice",
  "origin": "http://marketing.localhost",
  "entries": [
    { "level": "error", "message": "[notes-demo] readNotes FAILED: 403", "meta": "{\"status\":403}" },
    { "level": "info", "message": "[notes-demo] showFixAccess — showing fix button" }
  ]
}
```

### Debugging queries

**Full incident timeline for a user (the one that replaces four `docker exec` calls):**
```sql
SELECT ts, service, level, method, path, status, user_key, origin, message
FROM logs
WHERE user_key = 'api.localhost/alice'
  AND ts > now() - INTERVAL 10 MINUTE
ORDER BY ts;
```

**All 403s in the last hour (contract issues):**
```sql
SELECT ts, user_key, origin, message
FROM logs
WHERE status = 403 AND ts > now() - INTERVAL 1 HOUR
ORDER BY ts DESC;
```

**Join logs with contract state (why was this origin denied?):**
```sql
SELECT l.ts, l.origin, l.message, c.deleted, c.updated_at
FROM logs l
LEFT JOIN (
    SELECT allowed_origin, deleted, updated_at
    FROM (SELECT *, row_number() OVER (PARTITION BY user_key, allowed_origin ORDER BY updated_at DESC) AS rn
          FROM app_contracts WHERE user_key = 'api.localhost/alice')
    WHERE rn = 1
) c ON c.allowed_origin = l.origin
WHERE l.user_key = 'api.localhost/alice' AND l.status = 403
ORDER BY l.ts DESC;
```

**E2E test failures with browser console context:**
```sql
SELECT ts, level, message, meta
FROM logs
WHERE service = 'e2e' AND meta LIKE '%notes-demo%'
  AND ts > now() - INTERVAL 1 HOUR
ORDER BY ts;
```

### Design decisions

- **API inserts directly.** No shipper, no logging driver, no extra container. The API already has a CH connection — one `INSERT` per request is negligible overhead.
- **Fire-and-forget.** The middleware uses `asyncio.create_task` — if CH is down, the log is lost but the request still succeeds. Logging must never break the API.
- **Truncated bodies.** Request/response bodies capped at 4KB. Media uploads go through S3 presigned URLs (not the API body), so this is safe.
- **30-day TTL.** Enough for debugging, not enough to fill the disk. Old logs are gone — that's fine, they were signal, not state.
- **`user_key` is the join key.** Every log row carries the user's key (extracted from the JWT, signature not verified — this is logging, not auth). That's what makes the JOIN queries possible.

## Patterns

| Pattern | How | Why |
|---|---|---|
| **Updates** | `ReplacingMergeTree(updated_at)` — insert new row with higher `updated_at` | Append-only. No race conditions. Engine keeps latest. |
| **Deletes** | Insert with `deleted = 1` and higher `updated_at` | Tombstones. Queries filter `WHERE deleted = 0`. TTL cleans up. |
| **No row = denied** | Missing row in app_contracts = app blocked | Explicit allowlist. Default deny. |
| **No row = enabled** | Missing row in user_group_sharing = sharing on | Opt-out model. Default on. |
| **TTL** | `TTL created_at + INTERVAL 90 DAY` on documents | Physical cleanup. Old data disappears automatically. |
| **Background compaction** | Tables without TTL get a background job | Tombstones take space. Compact on schedule. |

### Critical: Tombstone Read Invariant

**All read paths over tombstoned tables must dedup-then-filter, never filter-then-dedup.**

The tombstone pattern inserts a new row with `deleted = 1` and a higher `updated_at`. To read the "current" state, you must first identify the latest row per key, *then* check if it's deleted. If you filter `WHERE deleted = 0` first, the tombstone row is invisible and the old (still `deleted = 0`) row wins — the delete silently doesn't take effect.

**Correct (dedup-then-filter):**
```sql
SELECT permissions FROM (
    SELECT permissions, deleted,
           row_number() OVER (PARTITION BY user_key, allowed_origin ORDER BY updated_at DESC) AS rn
    FROM app_contracts
    WHERE user_key = %(user_key)s
) WHERE rn = 1 AND deleted = 0
```

**Wrong (filter-then-dedup) — the tombstone is invisible:**
```sql
SELECT permissions FROM app_contracts
WHERE user_key = %(user_key)s AND deleted = 0
ORDER BY updated_at DESC LIMIT 1
```

This applies to every table with a `deleted` column: `documents`, `doc_groups`, `group_contracts`, `group_members`, `app_contracts`, `provider_service_contracts`, `user_blacklist`, `group_blacklist`, `user_group_sharing`, `service_contracts`, `group_join_requests`, `group_hidden_docs`.

**Timestamp precision:** tombstone inserts must use `now64(6)` (microsecond), not `now()` (second). If the original row and the tombstone share the same `updated_at`, the dedup can't distinguish them and either row may win non-deterministically.

## Indexes

ClickHouse uses primary keys for indexing. No secondary indexes needed for the core patterns:

| Query | Indexed by |
|---|---|
| Read by author | `(author_key, doc_id)` — primary key |
| Read by doc_id | `(author_key, doc_id)` — primary key (or via `read-by-id` with group permission check) |
| Read by collection | `collection_name` — low cardinality, cached |
| Read by tags | `has(tags, 'x')` — array scan, fast |
| Ref count | `ref_value` — subquery on the already-filtered result set |
| Group membership | `(group_id, member_key)` — primary key |
| Doc-to-group | `(doc_id, group_id)` — primary key |

## Data Flow

```mermaid
graph TB
    subgraph Create["CREATE — w.create posts, groups"]
        C1["INSERT documents<br/>doc_id, author, body, ref, tags"]
        C2["INSERT doc_groups<br/>one row per group"]
        C1 --> C2
    end

    subgraph Read["READ — w.read posts, groups"]
        R1["SELECT documents"]
        R2["JOIN doc_groups<br/>WHERE group IN ..."]
        R3["JOIN group_members<br/>WHERE member = :user"]
        R4["WHERE deleted = 0"]
        R5["EXCEPT group_hidden_docs"]
        R6["ORDER BY $sort<br/>LIMIT $limit"]
        R1 --> R2 --> R3 --> R4 --> R5 --> R6
    end

    subgraph Update["UPDATE — w.update posts, groups"]
        U1["Tombstone old documents row"]
        U2["INSERT new documents row<br/>higher updated_at"]
        U3["Tombstone old doc_groups"]
        U4["INSERT new doc_groups"]
        U1 --> U2 --> U3 --> U4
    end

    subgraph Delete["DELETE — w.delete posts"]
        D1["Tombstone documents row"]
        D2["Tombstone doc_groups rows"]
        D1 --> D2
    end

    subgraph Moderate["HIDE — moderator hides doc"]
        M1["INSERT group_hidden_docs<br/>group_id, doc_id, moderator"]
        M1 --> M2["Read query excludes<br/>hidden docs for this group"]
    end

    style Create fill:#e8f5e9,stroke:#2e7d32,color:#000
    style Read fill:#e3f2fd,stroke:#1565c0,color:#000
    style Update fill:#fff3e0,stroke:#e65100,color:#000
    style Delete fill:#ffebee,stroke:#c62828,color:#000
    style Moderate fill:#f3e5f5,stroke:#6a1b9a,color:#000
```

Create: one insert into documents, N inserts into doc_groups. Read: one SELECT with two JOINs, filtered by membership, tombstones, and moderator hides. Update: tombstone old, insert new. Delete: tombstone both. All append-only. `ReplacingMergeTree` keeps the latest version. Background job compacts tombstones on schedule.

## v4 Tables (not in this doc)

Monetization, ads, marketplace, and provider app store tables are in `../web10-v4/db/clickhouse-v4.md`:

- **Monetization:** user_accounts (full), credits_ledger, subscriptions, tips, sponsor_deals, sponsored_products
- **Provider app store:** provider_apps, provider_app_reviews, provider_app_moderation, provider_blocked_origins
- **Ads:** ad_campaigns, ad_targeting, ad_creative, ad_inventory, ad_impressions, ad_clicks, ad_conversions, ad_partners, ad_revenue
- **Marketplace:** marketplace_products, marketplace_orders, marketplace_reviews

## See Also

- `../sdk/contracts.md` — full contract tables (app, provider, group, sharing, blacklists)
- `../sdk/api.md` — SDK surface (CRUD, groups, sort, match)
- `../sdk/implementation.md` — SQL behind every SDK call
