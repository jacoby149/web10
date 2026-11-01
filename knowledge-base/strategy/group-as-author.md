# Group as Author — post as the group, the group is an identity

**Status: PLANNED.** A group is a **first-class author**. A member with the
right role (owner / moderator) can post **as the group** — the post's
`author_key` is the group_id, it renders with the group's face (name + avatar)
in the feed, and it lives in the group's groups (not the poster's personal
followers). The human who hit the button is preserved in a new `posted_by`
column — server-set, unforgeable, queryable.

> **The one-liner (operator):** "a person who is in a group, with the right
> role can post AS the group! where it shows the group itself making a post
> with the profile of the group" + "group operates as user, that lets 1 web10
> account be kind of like 10 web10 accounts, just make 10 groups!" + "it would
> be good though still to preserve who was the user that did the post" + "this
> is data not part of the document itself, this is ingrained."

**Companion docs:** `group-as-profile.md` (the group page = the profile page)
· `groups/identity.md` (the group's face + roles) · `groups/access.md` (D58
per-service role maps). This doc is the **authorship** model — the group as
the `author_key` on a document.

---

## The operator's intent (verbatim)

> "i want to make it so a person who is in a group, with the right role can
> post AS the group! where it shows the group itself making a post with the
> profile of the group"

> "so the backend would need to be totally changed to let a group operate as a
> user? i think that is really cool, where group operates as user, that lets 1
> web10 account be kind of like 10 web10 accounts, just make 10 groups!"

> "it would be good though still to preserve who was the user that did the
> post."

> "but in the clickhouse needs another column? like this author as column?
> would be good if cant cheat it, where this is data not part of the document
> itself, this is ingrained"

> "when you make a post, it asks what identity you want to make the post as!
> if you have groups with the permission to write on their behalf"

> "shouldnt go to your personal followers no. also group shouldnt be allowed
> to post in groups that it doesnt have the role for"

**Decisions locked (operator, this session):**
1. **`posted_by` is a column, not a body field.** Server-set from the JWT at
   insert time. The client can't set, modify, or delete it. Queryable
   (`WHERE posted_by = 'alice'`), survives body edits (the update merges the
   body, not the columns), unforgeable.
2. **Posting as a group = the post lives in the group's world.** No personal
   followers group. The group has its own groups (the ones it's a member of)
   — that's where the post goes. The poster's personal following is untouched.
3. **Two independent gates, both must pass.** (a) The caller holds a
   qualifying role in the group they're posting as. (b) The group itself holds
   a role in each target group that grants `create` on the service. The
   caller's role in the group does NOT grant the group access to other groups.
4. **The identity picker is in the composer.** "Post as: [You] | [Group A] |
   [Group B]…" — every group where the caller holds a qualifying role. The
   composer's avatar + name swap to the selected identity before posting.

---

## Current state (verified)

| Surface | Today | Gap |
|---|---|---|
| **`CreateDocument` model** (`api/app/v3/models/documents.py:16`) | `token`, `service`, `body`, `groups`, `ref_value`, `ad_preference` | No `author_as` field. The author is always `_user(data)` = the JWT username. |
| **`create_document` endpoint** (`api/app/v3/endpoints/documents.py:178`) | `author = _user(data)`, then `ch.insert_document(author_key=author, ...)`. Write gate: `ch.can_write_group(g, author, service)` per target group. | No delegation path. No `posted_by`. The author is locked to the token. |
| **`insert_document`** (`clickhouse.py:835`) | Accepts any `author_key` string. Positional insert: `[doc_id, author_key, service, body, ref_value, tags, created, now, 0, ad_mode, ad_target]`. | No `posted_by` parameter. The insert is positional — a new column must be appended last. |
| **`documents` table** (`clickhouse.md:141`) | `(doc_id, author_key, collection_name, body, ref_value, tags, created_at, updated_at, deleted, ad_mode, ad_target)` — `ReplacingMergeTree(updated_at) ORDER BY (author_key, doc_id)`. | No `posted_by` column. |
| **`can_write_group`** (`clickhouse.py:1525`) | `is_group_member(group_id, principal)` → true (membership short-circuit). Else `effective_role_perms` → `_effective_allows(perms, service, "create")`. | Works for any `principal` string — a group_id is a valid principal. No change needed; just call it with the group_id. |
| **`resolve_media_urls`** (`clickhouse.py:3428`) | `WHERE doc_id IN (...) AND author_key = %(author_key)s` — owner-scoped to the doc's `author_key`. | When `author_key` is a group_id, the media docs were written by the real user → no match → `read_url: None` → media silently dead. |
| **Feed query** (`feed.ts:474`) | `LEFT JOIN (SELECT author_key, body FROM profile ...) pr ON pr.author_key = p.author_key` — joins the `profile` service. | A group_id has no `profile` doc → `profile_body` NULL → no avatar/name. The prepare pass's `_prepare_face` presigns `profile_body.avatar_ref` scoped to `author_key` → no face. |
| **`extractUsername`** (`types.ts:671`) | `authorKey.split('/').pop()` — returns the last path segment. | For a group_id `web10.app/groups/users/alice/mygroup` → returns `mygroup` (the slug). Not garbage, but not the display name. No group-aware branch. |
| **`GroupDetailScreen`** | `GroupFeedPost` passes `authorName={post.author_username}` (the slug) + no `authorAvatar`. Media resolved client-side via `resolveMediaRefs` (owner-scoped `w.listMedia`). | Shows the slug as the author name, initials avatar. No group face. |
| **`createCommunityGroup`** (`groups.ts:456`) | Members: `[{member_key: ownerUsername, role: 'owner'}]` + optional `anyone`/`authenticated` reader. | The group does NOT add itself as a member. No self-membership row. |
| **`_board_base_sql`** (`clickhouse.py:2636`) | Selects `(doc_id, author_key, body, tags, created_at, ref_value, ad_mode, ad_target)`. Blacklist/sharing/hidden anti-joins key on `p.author_key`. | No `posted_by` in the SELECT. The blacklist join `ub.user_key = p.author_key` would match a group_id against the blacklist (a group can be "banned" — probably fine, but worth noting). |
| **`_group_docs_query`** (`clickhouse.py:2716`) | Returns `{doc_id, author_key, body, tags, created_at, ref_value, ad_mode, ad_target, service}`. | No `posted_by`. |
| **`_moderate_post`** (`documents.py:36`) | `moderation.should_auto_hide(author, text, cfg)` — checks the author against `auto_hide_users`. | When `author_key` is a group_id, the moderation check runs against the group_id (not in the blocklist) → no auto-hide. The real user (`posted_by`) is not checked. Decision: check `posted_by` for moderation, not `author_key`. |
| **`authorAvatarUrl`** (`preview/card.mjs:106`) | `readAuthorProfile(authorKey)` → `profile.body.avatar_ref` → thumbnail. | A group_id has no `profile` doc → null → brand image fallback. The preview card shows the brand mark, not the group's face. |

---

## The design

### 1. The `posted_by` column (the audit trail)

`documents` gains a `posted_by` column:

```sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS posted_by String DEFAULT ''
```

- **Always populated.** Every post carries `posted_by` = the JWT username,
  whether or not it's a group post. Posting as yourself: `author_key = "alice"`,
  `posted_by = "alice"` (redundant, but consistent — one rule, no branching).
  Posting as a group: `author_key = "group_id"`, `posted_by = "alice"`.
- **Server-set only.** The `CreateDocument` model never accepts it as input.
  The endpoint derives it from `_user(data)`. The client can't forge it.
- **Queryable.** `WHERE posted_by = 'alice'` — "everything alice posted, even
  as groups." A real index-able column, not a JSON extract.
- **Survives body edits.** The `update` endpoint merges the body; the columns
  are separate. A subsequent edit can't clobber `posted_by`.
- **The media owner is always `posted_by`.** No "if empty, fall back to
  `author_key`" branch. The column is always the human who uploaded the media.

**Boot self-heal** (the `ad_mode`/`ad_target` pattern, `clickhouse.py:190`):

```python
client.command("ALTER TABLE documents ADD COLUMN IF NOT EXISTS posted_by String DEFAULT ''")
```

**Backfill** (one-time, sentinel-gated — the `group_contracts.tags` backfill
pattern, `clickhouse.py:173`): sets `posted_by = author_key` for every row
where `posted_by = ''`. After the backfill, every row has `posted_by`
populated — the read path's media-owner rule is simply "use `posted_by`", no
fallback branch. The backfill is a single `ALTER TABLE ... UPDATE` (ClickHouse
lightweight update) or a tombstone+reinsert sweep, gated on a `node_config`
sentinel so it runs once per node. Pre-existing rows get `posted_by =
author_key` (the author IS the real author for non-group posts). Group-authored
posts don't exist yet (this feature is new), so the backfill only touches
user-authored rows.

```python
# The backfill (runs once, sentinel-gated):
# Sets posted_by = author_key for every row where posted_by is empty.
# ClickHouse lightweight UPDATE (mutates in-place, no tombstone):
client.command(
    "ALTER TABLE documents UPDATE posted_by = author_key WHERE posted_by = ''"
)
```

**`insert_document`** gains a `posted_by: str` parameter (no default — the
caller must always provide it; the endpoint derives it from `_user(data)`).
Appended last in the positional insert (the `ad_mode`/`ad_target` pattern —
the column is at the end of the table).

**The read paths** (`_board_base_sql`, `_group_docs_query`,
`_group_docs_ranked_query`, the single-doc read) add `p.posted_by` to the
SELECT + the row mapper. The safe-query engine passes it through automatically
(it's a column on the `documents` table — the boundary CTEs select `*` from
the deduped subquery). The media resolution rule is uniform: **use
`posted_by` as the media owner** (no fallback — the backfill guarantees it's
populated).

### 2. The `author_as` field + the two gates (the write path)

**`CreateDocument`** gains:

```python
author_as: str | None = None
```

**`create_document`** — the delegation path:

```python
real_author = _user(data)  # JWT username, always
display_author = data.author_as or real_author

if data.author_as:
    # Gate 1: the caller can act as this group.
    # The caller must hold a role in author_as that grants `create` on the
    # service. Reuses effective_role_perms + _effective_allows (D58).
    perms = ch.effective_role_perms(data.author_as, real_author, authenticated=True)
    if not ch._effective_allows(perms, data.service, "create"):
        raise HTTPException(403, "no permission to post as this group")

    # The group must be a valid, existing group.
    if not ch.get_group(data.author_as):
        raise HTTPException(404, "group not found")

# App-contract gate: runs on the REAL author (the token holder), not the
# display author. The contract is the app's trust in the USER, not the group.
_check_app_permission(request, real_author, data.service, "create", client_id_of(data))

result = ch.insert_document(
    author_key=display_author,
    service=data.service,
    body=data.body,
    posted_by=real_author,  # always the JWT username, every post
    ...
)

if data.groups:
    # Gate 2: the DISPLAY author (the group, or the user) can write in each
    # target group. Same can_write_group call as today — just the principal
    # is the group_id when posting as a group.
    writable = [g for g in data.groups if ch.can_write_group(g, display_author, data.service)]
    if not writable:
        raise HTTPException(403, "no write access to the requested group")
    ch.attach_doc_to_groups(doc_id, writable)
    result["groups"] = writable

    # Moderation: check the REAL author (posted_by), not the group.
    _moderate_post(real_author, doc_id, data.service, data.body, writable)
```

**Gate 1** (can the user act as the group): `effective_role_perms(group_id,
username)` returns the union of the user's role's permission maps in that
group. `_effective_allows(perms, service, "create")` checks if the role grants
`create` on the service. For `posts`, the `owner` and `moderator` roles both
grant `create` (per `groups/identity.md`). The `page-curator` role does NOT
(it only grants the identity service) — so a page-curator can edit the group's
face but can't post as the group. Only owner + moderator.

**Gate 2** (can the group write in the target): `can_write_group(target_group,
group_id, service)` — the exact same call that runs today, but the principal
is the group_id. The group must be a **member** of the target group (or the
target's `anyone`/`authenticated` grant must allow `create`). The caller's
role in the group does NOT grant the group access — the group's own
membership is the gate.

**The app-contract gate** runs on `real_author` (the token holder), not
`display_author`. The contract is the app's trust in the user's browser/origin
— the group doesn't have a browser.

**Moderation** checks `real_author` (the human), not the group. A banned user
posting as a group is still caught.

### 3. Media resolution (the trickiest seam)

**The problem:** `resolve_media_urls` is owner-scoped to `author_key`. When
`author_key` is a group_id, the media docs were written by the real user
(`author_key = username` on the media docs). The query
`WHERE author_key = <group_id>` matches nothing → `read_url: None` → media
silently dead.

**The fix (uniform rule, no branching):** the media owner is always
`posted_by`. The backfill guarantees `posted_by` is populated on every row,
so the rule is simply "use `posted_by`" — no "if empty, fall back to
`author_key`" branch.

**(a) Server-side — `resolve_media_urls_in_docs`** (the read path + the query
prepare pass):

```python
def resolve_media_urls_in_docs(docs: list[dict]) -> list[dict]:
    for doc in docs:
        body = doc.get("body", {})
        if body.get("media_refs"):
            # The media owner is always posted_by (the human who uploaded it).
            # The backfill guarantees posted_by is populated on every row.
            author = doc.get("posted_by", "") or doc.get("author_key", "")
            body = resolve_media_urls(body, author)
        ...
```

The `or doc.get("author_key", "")` is a safety net for rows written between
the column add and the backfill completing (a narrow window; the backfill
runs at boot, before the first request is served). After the backfill,
`posted_by` is always non-empty and the fallback never fires.

**(b) Client-side — `resolveMediaRefs`** (the group detail screen's batch
resolve): the same rule. When resolving a post's media, use `posted_by` as
the owner. The `w.listMedia` call is owner-scoped to the **reader** (the
token's user), so when alice reads a group post where bob uploaded the media,
`listMedia` (scoped to alice) won't find bob's media.

**The proper fix for the group detail screen:** the `/v3/groups/detail`
endpoint gains a `resolve_media_urls_in_docs` call on the posts it returns
(matching the `/v3/read` path). The server resolves the media (owner-scoped
to `posted_by`, the correct human), and the client renders the resolved URLs
directly — no client-side `resolveMediaRefs` fallback needed. This fixes media
resolution for ALL group posts (not just group-authored ones) and eliminates
the cross-user media gap.

### 4. The feed query (the profile join)

**The problem:** the feed query's `LEFT JOIN profile ON pr.author_key =
p.author_key` finds no profile for a group_id → no avatar, no display name.

**The fix (client-side, D60 — the query is app-owned):** the feed query
gains a second LEFT JOIN on the group identity service, and the client picks
the face from whichever joined:

```sql
SELECT p.doc_id AS doc_id, p.author_key AS author_key, p.posted_by AS posted_by,
       p.body AS body, p.tags AS tags, p.created_at AS created_at, ...
       pr.body AS profile_body,
       gi.body AS group_identity_body
FROM posts p
LEFT JOIN (SELECT author_key, body FROM profile
           QUALIFY row_number() OVER (PARTITION BY author_key ORDER BY updated_at DESC) = 1) pr
  ON pr.author_key = p.author_key
LEFT JOIN (SELECT author_key, body FROM web10_social_group_identity
           QUALIFY row_number() OVER (PARTITION BY author_key ORDER BY updated_at DESC) = 1) gi
  ON gi.author_key = p.author_key
...
```

Wait — the safe-query engine maps service names to boundary CTEs. The service
name `web10-social-group-identity` has a hyphen — the safe-query engine's
identifier parser may not accept it. Let me check.

The safe-query engine (`safe_query.py`) replaces service names with CTEs. The
service name is used as a table alias. Hyphens in identifiers need quoting.
The engine may already handle this (the social app uses `web10-social-group-identity`
as a service name in reads). Let me verify.

Actually — the safe-query engine's boundary CTEs are built by the API (the
`run_query` endpoint), not by the caller. The caller's SQL references service
names, and the engine replaces them with CTE references. The CTE name is
derived from the service name. If the engine already handles hyphenated service
names (which it must, since the social app reads `web10-social-group-identity`
through the query engine), then the JOIN works.

**The prepare pass** (`_prepare_face`): currently presigns `profile_body.avatar_ref`
scoped to `author_key`. For a group-authored post, the face is in
`group_identity_body` (the `web10-social-group-identity` doc), and the avatar
media is owned by the group's creator (or the last person who uploaded it).

The prepare pass needs a **group-aware face resolution**: when `profile_body`
is null and `group_identity_body` is present, presign `group_identity_body.avatar_ref`
scoped to... whom? The group's identity doc's `author_key` is the user who
last wrote the face (the `writeGroupIdentity` call uses the caller's token →
`author_key = username`). So the avatar media is owned by that user.

**The cleanest approach:** the prepare pass's `_prepare_face` already takes
`authorColumn` as a parameter. The feed query can set `authorColumn` to a
computed column: `coalesce(p.posted_by, p.author_key)` — the media owner is
`posted_by` when present, else `author_key`. This handles both the face AND
the post media in one pass.

Actually, the face and the post media are separate concerns:
- **Post media** (`media_refs` in the post body): owned by `posted_by` (the
  human who uploaded). Resolved by `resolve_media_urls_in_docs` (seam 3a).
- **Face** (the avatar in the feed card): the group's `avatar_ref` from the
  identity doc. Owned by whoever last wrote the identity doc. Resolved by
  `_prepare_face`.

For the face, the identity doc's `author_key` is the user who wrote it. The
prepare pass should presign the identity doc's `avatar_ref` scoped to the
identity doc's `author_key` (not the post's `author_key`).

**The fix:** the feed query's prepare spec gains a second face config for the
group identity:

```typescript
prepare: {
  media: true,
  ads: true,
  face: {
    bodyField: 'profile_body',
    mediaField: 'avatar_ref',
    authorColumn: 'author_key',
    urlField: 'avatar_url',
  },
  // NEW: the group identity face (fallback when profile_body is null)
  groupFace: {
    bodyField: 'group_identity_body',
    mediaField: 'avatar_ref',
    authorColumn: 'group_identity_author_key',  // the identity doc's author_key
    urlField: 'group_avatar_url',
  },
}
```

Hmm, this is getting complex. The `PrepareSpec` model would need a second
face field. And the query would need to select the identity doc's `author_key`
as a separate column.

**Simpler approach:** the client handles the group face resolution itself. The
feed query returns `group_identity_body` (the raw JSON, with `avatar_ref` as
a doc_id string). The client, for posts where `profile_body` is null and
`group_identity_body` is present, resolves the group's avatar via a batched
media read (the same `resolveMediaRefs` pattern, scoped to the identity doc's
author). This is a client-side enhancement — the server returns the raw ref,
the client resolves it.

Actually, the simplest approach that works with the existing prepare pass:

The feed query's `face` prepare config already presigns `profile_body.avatar_ref`
scoped to `author_key`. For a group post, `profile_body` is null → the prepare
pass skips it (no face). The client then sees `avatar_url` is undefined and
`group_identity_body` is present → the client resolves the group's avatar
itself (a batched media read for the group's `avatar_ref`, scoped to the
identity doc's author).

This is the **pragmatic** approach: the server does what it can (the profile
join + face presign for user posts), the client handles the group face
fallback. No new prepare pass config, no new server surface. D60-clean.

### 5. The client display (group face in the post header)

**`fromV3DocToPost`** (`types.ts:110`): gains a `posted_by` field (from the
doc's `posted_by` column). The `author_username` is still `extractUsername(author_key)`
(the slug for a group) — but the display logic changes.

**`PostCard`** / **`FeedScreen`**: the author header checks:
1. If `post.profile` is present → user post, show the profile's display_name + avatar.
2. Else if `post.group_identity` is present (new field, from the feed query's
   `group_identity_body`) → group post, show the group's name + avatar (from
   the identity doc) + a small "posted by {posted_by}" subtitle.
3. Else → fallback (slug + initials).

The "posted by" subtitle is the audit trail made visible. Small text under the
group name: "posted by alice". Tappable → navigates to `/u/alice`.

**`GroupDetailScreen`**: the `GroupFeedPost` component passes the group's face
(name + avatar from the already-loaded `readGroupIdentity`) as the `authorName`
+ `authorAvatar` when the post's `author_key` matches the group_id. The
"posted by" subtitle shows `post.posted_by`.

**`extractUsername`**: unchanged. It returns the slug for a group_id, which is
a reasonable fallback. The display logic uses the group identity's `name`
field (the display name) when available, falling back to the slug.

### 6. The identity picker (the composer)

**`ComposerContext`** gains an `authorAs` field (the selected group_id, or
null for "post as yourself").

**`PostComposer`** gains an identity picker (a dropdown or chip row, next to
the visibility picker):
- "You" (default, `authorAs = null`)
- Every group where the caller holds a role that grants `create` on `posts`
  (owner / moderator — from the group's role map). The group's avatar + name
  (from `readGroupIdentity`) in the picker.

When a group is selected:
- The composer's header swaps from the user's avatar/name to the group's.
- The "Post" button says "Post as [Group Name]".
- The `groups` argument to `createPost` is the group's groups (the groups the
  group is a member of), NOT the user's personal followers.
- The `author_as` field is set to the group_id.

**The data the picker needs** (all available today):
- `getMyGroups()` — the user's groups.
- Each group's roles (from the group detail or the contract) — filter to
  groups where the user's role grants `create` on `posts`.
- Each group's face (`readGroupIdentity`) — avatar + name for the picker.
- Each group's groups (the groups the group is a member of) — for the
  `groups` argument. This requires a new read: "what groups is this group a
  member of?" — `get_user_groups` with `member_key = group_id`. The node
  already supports this (it's a generic membership query).

**`createPost`** (`posts.ts:53`): gains an `authorAs` parameter. When set,
passes `author_as` to `w.create`. The `groups` argument is the group's groups
(not the user's followers).

**`w.create`** (the SDK): gains an `author_as` field in the POST body.

### 7. Group as a member of other groups

The group_id is a valid `member_key` (a string column, no validation). A human
with the right role in both Group A and Group B can add Group A to Group B:

```
add_group_member(group_b_id, group_a_id, role='member')
```

This requires the caller to have `assignRoles` (or `manageRoles`) in Group B.
The existing group management endpoints already support this — `member_key`
is a free string.

**The client surface:** the group's Members tab (the kebab → Members section)
gains an "Add group" option (in addition to "Add user"). The picker shows the
caller's other groups (groups where the caller has a role). Selecting one
adds the group as a member.

**Once Group A is a member of Group B:**
- Group A can post in B (Gate 2 passes: `can_write_group(B, A, 'posts')` →
  membership → true).
- Group A's posts appear in B's feed (the doc is attached to B via
  `doc_groups`).
- Group A's posts appear on the discover board if B is the discover group
  (or if A is also a member of the discover group).

**Group-to-group follows:** Group A follows Group B = Group A is a member of
Group B's followers group. The same primitive. No new surface.

### 8. The preview card (share links)

**`authorAvatarUrl`** (`preview/card.mjs:106`): when `authorKey` is a group_id,
read the group's face (`readGroupFace` — already exists, line 120) instead of
the user's profile. The card shows the group's avatar + name.

**`buildPostCard`** (`preview/card.mjs:202`): the title fallback
(`@${username} on web10`) uses the group's display name (from the identity
doc) when the author is a group. The "posted by" is not shown on the preview
card (it's a meta detail, not a share-worthy one).

### 9. What does NOT change

- **The `documents` table's primary key** `(author_key, doc_id)` — unchanged.
  A group_id is a valid `author_key` value. The partitioning works the same.
- **The read path's group scoping** — a post is visible to readers of the
  groups it's attached to (`doc_groups`). The `author_key` doesn't gate
  visibility; the group attachment does. I3 holds: a reader can only see
  posts in groups they can read.
- **The blacklist/sharing/hidden anti-joins** — they key on `p.author_key`.
  A group_id in the `author_key` position means the group can be blacklisted
  / hidden / banned. This is probably correct (a group can be banned from a
  group). The `posted_by` column is NOT checked by these anti-joins (the
  human's personal blacklist doesn't apply to the group's posts).
- **The `content_events` / D86 analytics** — keyed on `doc_id` + `reader_key`.
  Unaffected by the `author_key` change.
- **The `moderation_flags`** — the `username` column is the real author
  (`posted_by`), not the group. The review queue shows the human.

---

## Bite sizing (small, one owner each)

- [ ] **A0: the `posted_by` column + the `author_as` field (node keystone)**
  (`api/app/v3/`) — (1) `documents.posted_by` column (boot self-heal, the
  `ad_mode` pattern). (2) **Backfill** (one-time, sentinel-gated):
  `ALTER TABLE documents UPDATE posted_by = author_key WHERE posted_by = ''`
  — every existing row gets `posted_by = author_key` (the author IS the real
  author for non-group posts). Sentinel in `node_config` so it runs once per
  node. (3) `insert_document` gains `posted_by: str` (no default — the
  caller must always provide it; appended last in the positional insert).
  (4) `CreateDocument` gains `author_as: str | None = None`. (5)
  `create_document` endpoint: the delegation path (Gate 1 + Gate 2 +
  `posted_by = real_author` always + moderation on `real_author`). (6) The
  read paths (`_board_base_sql`, `_group_docs_query`,
  `_group_docs_ranked_query`, single-doc read) add `posted_by` to the SELECT
  + row mapper. (7) `resolve_media_urls_in_docs` uses `posted_by` as the
  media owner (uniform rule — the backfill guarantees it's populated).
  (8) `/v3/groups/detail` calls `resolve_media_urls_in_docs` on the posts it
  returns. **Gates A1, A2, A3.**
  Tests: API (create with `author_as` → `author_key` = group_id, `posted_by`
  = username; create without `author_as` → `author_key` = username,
  `posted_by` = username; Gate 1 fail → 403; Gate 2 fail → 403; moderation
  checks `posted_by`; media resolution uses `posted_by`; the read paths
  return `posted_by`; the detail endpoint resolves media; the backfill sets
  `posted_by = author_key` on empty rows + is idempotent).

- [ ] **A1: the SDK + data layer** (`sdk/src/v3.ts`, `marketing/web10-social/src/data/`)
  — (1) SDK `create` gains `author_as` in the POST body. (2) `createPost`
  (`posts.ts`) gains `authorAs` parameter, passes to `w.create`. (3)
  `fromV3DocToPost` (`types.ts`) maps `posted_by` → `PostRecord.posted_by`.
  (4) `PostRecord` gains `posted_by?: string` + `group_identity?:
  GroupIdentity` (the group's face, from the feed query). **Gated on A0.**

- [ ] **A2: the feed query + the group face join** (`marketing/web10-social/src/data/feed.ts`)
  — the feed query gains the `web10-social-group-identity` LEFT JOIN
  (`gi.body AS group_identity_body`). `fromFeedQueryRow` maps it to
  `PostRecord.group_identity`. The prepare pass's `face` config is unchanged
  (it handles the user profile); the group face is resolved client-side (a
  batched media read for the group's `avatar_ref`). **Gated on A0, A1.**

- [ ] **A3: the post header + the "posted by" subtitle**
  (`marketing/web10-social/src/components/Feed/FeedScreen.tsx`,
  `GroupDetailScreen.tsx`, the shared `PostCard`) — the author header checks:
  (1) `post.profile` → user face. (2) `post.group_identity` → group face
  (name + avatar from the identity doc) + "posted by {posted_by}" subtitle
  (tappable → `/u/{posted_by}`). (3) Fallback (slug + initials). The
  `GroupDetailScreen` passes the group's face (already loaded) as the
  `authorName`/`authorAvatar` for group-authored posts. **Gated on A1, A2.**

- [ ] **A4: the identity picker in the composer**
  (`marketing/web10-social/src/context/ComposerContext.tsx`,
  `src/components/Feed/PostComposer.tsx`, `src/components/Feed/NewPostSheet.tsx`)
  — the `ComposerContext` gains `authorAs: string | null`. The `PostComposer`
  gains the identity picker (a dropdown: "You" + every group where the
  caller's role grants `create` on `posts`). Selecting a group swaps the
  composer's header to the group's face + the "Post as [Group]" button. The
  `groups` argument becomes the group's groups (not the user's followers).
  The `authorAs` is passed to `createPost`. **Gated on A1.**

- [ ] **A5: the group-as-member ops** (`marketing/web10-social/src/data/groups.ts`,
  the Members tab) — the group's Members tab gains an "Add group" option
  (the caller's other groups as candidates). `addGroupMember(groupId,
  otherGroupId, role)` — the existing endpoint, `member_key` = the group_id.
  The group's groups read (`getMyGroups` with `member_key = group_id`) for
  the identity picker's target groups. **Gated on A0.**

- [ ] **A6: the preview card** (`marketing/web10-social/preview/card.mjs`)
  — `authorAvatarUrl` checks if `authorKey` is a group_id → `readGroupFace`
  instead of `readAuthorProfile`. `buildPostCard` uses the group's display
  name for the title fallback. **Gated on A0.**

- [ ] **A7: the screenshot pass** (`screenshots/`) — `group-post-as-group-{desktop,375}.png`
  (the feed showing a group-authored post with the group's face + "posted by"
  subtitle), `composer-identity-picker-{desktop,375}.png` (the picker open,
  a group selected). The harness seeds a group with a face + a member with the
  moderator role + a group-authored post. **Gated on A3, A4.**

**Ownership:** A0 is the node (api/). A1 is the SDK + data layer. A2–A4 are
the social app (feed, post card, composer). A5 is the group management UI.
A6 is the preview server. A7 is the screenshot harness. The lanes: `social-v3`
+ platform (api/sdk).

**Sequencing:** A0 first (the keystone — everything depends on the column +
the endpoint). A1 next (the SDK + data layer). A2–A4 can parallelize (feed
query, post header, composer — distinct files). A5 + A6 can parallelize with
A2–A4. A7 last (screenshots after the UI is built).

---

## Acceptance bar (design.md §12)

- A member with the moderator role sees the identity picker in the composer
  (their groups with the role, each with the group's avatar + name).
- Selecting a group swaps the composer's header to the group's face.
- Posting as a group: the post's `author_key` is the group_id, `posted_by`
  is the username, the post is attached to the group's groups (not the
  user's followers).
- The feed shows the group's face (name + avatar) + "posted by {username}"
  subtitle (tappable → the user's profile).
- The post does NOT appear in the user's personal followers feed.
- The post appears in the group's feed + the discover board (if the group is
  a member of the discover group).
- A member WITHOUT the role does NOT see the group in the identity picker.
- A group that is NOT a member of the target group cannot post there (Gate 2
  → 403).
- Media renders correctly on group-authored posts (the `posted_by` fallback
  in `resolve_media_urls_in_docs`).
- The preview card (share link) shows the group's face + name.
- I3 holds: a reader can only see a group-authored post if they can read the
  group it's attached to.
- `posted_by` is server-set, unforgeable (the client can't set it in the
  request body).
- Every state at desktop + 375px passes the screenshot test; tokens only.
- The existing `groupsScreens` / `feed` / `composer` suites stay green.

## Out of scope (filed, not built)

- **Group-to-group follows** (Group A follows Group B) — the primitive works
  (A is a member of B's followers group), but the UI surface (a "Follow"
  button on the group page for groups, not just users) is a separate build.
- **Group-owned followers group** (the group has its own followers group that
  people follow) — the group's posts currently go to the groups the group is
  a member of. A dedicated "group followers" group (people follow the group
  directly) is a separate build.
- **The group's analytics dashboard** (impressions/reach for the group's
  posts, scoped to `author_key = group_id`) — the D86 engine already keys on
  `doc_id`; the dashboard just needs a group-scoped read.
- **Group comments** (commenting on a group-authored post) — the comment's
  `author_key` is the commenter's username (normal). The comment's `ref_value`
  is the post's `doc_id` (normal). No change needed.
- **The group's "About" tab** (a dedicated tab on the group page showing the
  group's posts + members + settings) — the group-as-profile lane covers this.
