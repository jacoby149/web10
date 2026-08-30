# Discoverable Groups: The Group Directory

A group is **discoverable** when it is listed in the public, anon-browsable group directory. Discoverability is an owner choice about **visibility** — it is a `discoverable` boolean on the group's contract, and it is a *separate* decision from whether a reader can see the group's posts.

**Groups are NOT discoverable by default.** A new group is *not* listed in the directory unless its owner explicitly opts it in (`discoverable = true`). This is the operator's amendment to D53: app-backend groups (notes, messages, DMs, private circles) are infrastructure the apps create on the user's behalf, not communities meant to be browsed, so they stay out of the directory by default. The node-default discover group is explicitly `discoverable: false` (it's a board, not a directory entry). The node stays readable-by-design (D41) — the *detail* (by-ID read) is still open to any principal (unlisted-model, `detail.md`) — but the *browse* surface (the directory) is opt-in.

This doc is about the **directory** (the list) and the `discoverable` flag. The **detail** (reading a specific group by ID) is a separate, flexible surface — see `detail.md`. The two share the flag only in that the directory *filters on it*; the detail ignores it.

## The Two Controls

```
listed in directory   ⟺  group_contracts.discoverable == true
reader can read posts ⟺  reader's effective role grants readAll on posts  — access.md
```

| `discoverable` | public read grant | Directory | Detail (as a bystander) |
|---|---|---|---|
| `false` | none | not listed | reachable by ID; metadata only, "join to view" |
| `false` | `anyone` | not listed | reachable by ID; metadata + posts (the discover board) |
| `true` | `anyone` | listed | metadata + posts (the common "public group") |
| `true` | none | listed | metadata only, "join to view" |

`discoverable` is the **blasting** flag (advertised in the directory or not). The **public read grant** (a role on the `anyone` / `authenticated` principal class, `access.md`) is the **read** switch (can a non-member see the posts). They are orthogonal — the discover group (`discoverable: false` + `anyone` read grant) is the proof: publicly readable, but not listed.

## How a Group Gets Listed

Groups are **NOT discoverable by default** — a new group (any join policy) is *not* listed in the directory the moment it's created. Listing is an **opt-in**: the owner sets `discoverable = true` (through the existing group-update path — no dedicated opt-in endpoint). In the authenticator that is a "List in directory" toggle (off by default).

There is no longer a separate `invite_only` special-case: *all* groups default to `discoverable = false`, so private groups (DMs, circles) are out by the same default. The discover group is also explicitly `discoverable = false` — `ensure_discover_group()` grants the `anyone` principal a read role (a public board) but the board is not a directory entry.

The "List in directory" toggle (in the authenticator's group management) controls **`discoverable` only** — the blasting flag. It does *not* touch the public read grant: content readability is a separate action (the owner grants the `anyone` / `authenticated` principal a read role, `access.md`). Keeping the two controls separate in the UI matches the two-controls model — one switch for "is it advertised," one for "can a bystander read it."

## The Directory Is Minimal

The directory is a **canonical, minimal list** — the smallest thing that lets an app render a browse surface. It is *not* a rich data structure. Per group it returns:

| Field | Source |
|---|---|
| `group_id` | `group_contracts` |
| name | `group_identity` record, else derived from the slug |
| owner | the username in the group_id |
| join policy | `group_contracts.join_policy` |
| member count | `count(group_members)` |
| tags | `group_identity.tags` (topic — for client-side filtering) |
| permission summary | `group_contracts.roles` (a short digest) |

That's it. **No banner, no description, no posts in the minimal list.** Those live in `group_identity` (below) and the detail, and apps pull them in as they want. Tags *are* included so an app can filter the list by topic client-side (the zero-extra-call search path).

**Why minimal:** the node provides the canonical list; apps are stateless frontends that compose the API. A rich, node-baked directory would freeze the card shape and duplicate the identity data. Minimal keeps the node dumb and lets "apps go crazy enriching the minimal thing."

### It's a view, not a table

The directory is a **view** over data that already exists — no dedicated `group_directory` table:

```
directory  =  group_contracts (WHERE discoverable = 1)
           ⋈  group_members  (member count)
           ⋈  group_identity  (name + tags, when present — else slug)
```

The apps-store precedent (a dedicated `apps` table) does **not** transfer: apps are *external* entities with a node-side lifecycle (register, approve, visit-count), so the node keeps a store record of things it doesn't own. Groups are *core internal* entities that already have their structures (`group_contracts`, `group_members`, `group_identity`). A `group_directory` table would duplicate the name/banner that belongs in `group_identity` — two sources of truth, guaranteed drift.

## Group Identity: the `group_identity` table

The rich display metadata for a group — name, description, banner, avatar, website, **tags** — lives in the **`group_identity` table** (one row per group, append-only, latest wins). It is the **single home** for group display metadata: the directory, the group detail, and every app read it from here.

```json
{
  "name": "Jazz Collectors",
  "description": "Vinyl-first jazz community",
  "banner_ref": "…", "avatar_ref": "…", "website": "…",
  "tags": ["jazz", "vinyl", "collecting"]
}
```

- **A table, not a documents collection.** The identity is *public* display metadata (the directory shows the name to anon), so it must be readable by any principal — including anon. The `documents` table is I3-gated (a read returns docs only for an `author_key` the reader owns or a group they're in), which would block anon from reading a group's name. A dedicated public table sidesteps that: it's group-keyed metadata, not user content. This is the same reason the `apps` table exists (public store records, not I3-gated docs).
- **Append-only**: an update is a new row, latest wins (the house dedup-then-filter pattern).
- **Managed by the owner / `page-curator` role** — the role that exists for exactly this. The write path is a normal owner action (a fast-follow; this bite builds the read path).

`tags` is how a group's **topic** is expressed.

## Topic Search

`tags` live in `group_identity`. For topic search, the directory response **includes each group's tags**, so an app can filter the list client-side (the minimal, zero-extra-call path). A server-side `?tag=` filter on the directory is a possible fast-follow that shortcuts the client-side filter — it does not change the model. (The earlier "apps `.query` the identity collection" framing assumed a documents collection; because the identity is a public table, the practical search path is the directory's tags.)

## The Endpoint Surface

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /v3/groups/directory` | none (anon) | the minimal list of `discoverable = true` groups (fields above, incl. tags). Paginated. **Metadata only — no posts.** |
| group detail (by ID) | token optional | the flexible, principal-based read — see `detail.md`. Unlisted-model: reachable for any existing group; posts gated by the reader's membership. |

Both are **pure reads** — a directory view writes nothing.

## Security Invariants

- **I3 holds.** The directory exposes *metadata only*, and only for `discoverable` groups. The detail returns *posts* only when the *reader* is a member — the same membership gate that enforces I3 for every other read. `discoverable` never gates content.
- **The directory is the only existence surface.** A non-discoverable group is absent from the list. (Its detail is still reachable by ID — the unlisted model, `detail.md` — but the directory, the public browse surface, shows only what's blasted.)
- **Listing is revocable.** Setting `discoverable = false` delists immediately. Removing the `anyone` / `authenticated` read grant stops bystander readability immediately. Each control revokes its own concern.

## Relationship to the Discover Group

The discover group (`web10.app/groups/web10/discover`) is publicly readable but **not** discoverable: `discoverable: false` + an `anyone` read grant. It is the public board, not a directory entry. The boolean is what lets the board stay out of the list without a special-case UI hack.

## Summary

A group is listed in the directory when `discoverable = true` — an **opt-in** (the default is `false` for every group, including the discover group). The directory is a **minimal, canonical view** over `group_contracts` + `group_members` + `group_identity` (no dedicated directory table). Rich display metadata — including **tags** for topic — lives in the public `group_identity` table; the directory includes each group's tags so apps can filter by topic client-side (a server-side `?tag=` filter is a possible fast-follow). The **detail** is a separate, flexible, principal-based read (unlisted-model) — see `detail.md`. `discoverable` is a blasting flag; the public read grant (a role on the `anyone` / `authenticated` principal, `access.md`) is the read switch; the two are orthogonal.

**Backfill (one-time):** groups created under the earlier discoverable-by-default rule (D53, before the amendment) carry `discoverable = 1`. A one-time, sentinel-gated boot migration delists them (appends a `discoverable = 0` row per live group) so the directory reflects the opt-in model. It runs exactly once (a `node_config` sentinel marks completion) and only ever moves groups *out* of the directory — it never breaks content access (membership is untouched).

For the detail (the by-ID read), see `detail.md`. For the generic group model, see `overview.md`. For the discover group contract, see `social-contracts.md` §1. For the group-identity role, see `identity.md`.
