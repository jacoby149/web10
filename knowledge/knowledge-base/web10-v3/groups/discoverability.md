# Discoverable Groups: The Group Directory

A group is **discoverable** when it is listed in the public, anon-browsable group directory. Discoverability is an owner choice about **visibility** — it is a `discoverable` boolean on the group's contract, and it is a *separate* decision from whether a reader can see the group's posts.

**Groups are discoverable by default.** A new group is listed in the directory unless its owner sets `discoverable = false` — or unless the group is `invite_only` (which defaults to `false`, since invite-only groups are inherently private: DMs, private circles). The node-default discover group is explicitly `discoverable: false` (it's a board, not a directory entry). This matches the node-readable-by-design stance (D41) and the public-by-default posts.

This doc is about the **directory** (the list) and the `discoverable` flag. The **detail** (reading a specific group by ID) is a separate, flexible surface — see `detail.md`. The two share the flag only in that the directory *filters on it*; the detail ignores it.

## The Two Controls

```
listed in directory   ⟺  group_contracts.discoverable == true
reader can read posts ⟺  reader ∈ members(group)   (with readAll)   — see detail.md
```

| `discoverable` | `anon` member | Directory | Detail (as anon) |
|---|---|---|---|
| `false` | no | not listed | reachable by ID; metadata only, "join to view" |
| `false` | yes | not listed | reachable by ID; metadata + posts (the discover board) |
| `true` | yes | listed | metadata + posts (the common "public group") |
| `true` | no | listed | metadata only, "join to view" |

`discoverable` is the **blasting** flag (advertised in the directory or not). Membership is the **read** switch (can this reader see the posts). They are orthogonal — the discover group (`discoverable: false` + `anon` member) is the proof: anon-readable, but not listed.

## How a Group Gets Listed

Groups are **discoverable by default** — a new `open` or `request` group is listed in the directory the moment it's created. The owner can delist it by setting `discoverable = false` (through the existing group-update path — no dedicated opt-in endpoint). In the authenticator that is a "List in directory" toggle (on by default).

Two defaults keep private groups out automatically, with no owner action:

- **`invite_only` groups default to `discoverable = false`** — DMs and private circles are inherently private, so they never appear in the directory unless the owner explicitly lists them.
- **The discover group is `discoverable = false`** — `ensure_discover_group()` enrolls `anon` (anon-readable board) but sets `discoverable: false` (not a directory entry).

The "List in directory" toggle is a **convenience for the common case**: turning it on sets `discoverable = true` *and* adds `anon` as a member (default role), so the group is listed and its posts are anon-readable in one action. The advanced case — listed but content-private — is `discoverable = true` *without* adding `anon`.

## The Directory Is Minimal

The directory is a **canonical, minimal list** — the smallest thing that lets an app render a browse surface. It is *not* a rich data structure. Per group it returns:

| Field | Source |
|---|---|
| `group_id` | `group_contracts` |
| name | `group-identity-service` record, else derived from the slug |
| owner | the username in the group_id |
| join policy | `group_contracts.join_policy` |
| member count | `count(group_members)` |
| permission summary | `group_contracts.roles` (a short digest) |

That's it. **No tags, no banner, no description in the minimal list.** Those live in `group-identity-service` (below), and apps pull them in as they want.

**Why minimal:** the node provides the canonical list; apps are stateless frontends that compose the API. A rich, node-baked directory would freeze the card shape and duplicate the identity data. Minimal keeps the node dumb and lets "apps go crazy enriching the minimal thing."

### It's a view, not a table

The directory is a **view** over data that already exists — no dedicated `group_directory` table:

```
directory  =  group_contracts (WHERE discoverable = 1)
           ⋈  group_members  (member count)
           ⋈  group-identity-service  (name, when present — else slug)
```

The apps-store precedent (a dedicated `apps` table) does **not** transfer: apps are *external* entities with a node-side lifecycle (register, approve, visit-count), so the node keeps a store record of things it doesn't own. Groups are *core internal* entities that already have their structures (`group_contracts`, `group_members`). A `group_directory` table would duplicate the name/banner that belongs in `group-identity-service` — two sources of truth, guaranteed drift.

## Group Identity: `group-identity-service`

The rich display metadata for a group — name, description, banner, avatar, website, **tags** — lives in `group-identity-service`, a documents collection (one record per group). It is the **single home** for group display metadata: the directory, the group detail, and every app read it from here.

```json
{
  "name": "Jazz Collectors",
  "description": "Vinyl-first jazz community",
  "banner_ref": "…", "avatar_ref": "…", "website": "…",
  "tags": ["jazz", "vinyl", "collecting"]
}
```

- **Append-only** (per `identity.md`): curators add records, they don't overwrite; readers see the most recent.
- **Managed by the `page-curator` role** (or the owner) — the role that exists for exactly this.
- **Queryable**: it's a normal documents collection, so the SDK's `.query` / `$match` / `$sort` work on it.

`tags` is how a group's **topic** is expressed. Tags are deliberately *not* in the minimal directory — they're in the identity record, and topic search happens by querying it (below).

## Topic Search: Composition, Not a Baked Filter

The node does **not** bake search into the directory. It provides two canonical things — the minimal directory (the list) and the queryable identity docs — and **apps compose them** to search.

An app that wants "jazz groups":

1. `GET /v3/groups/directory` → the minimal list of discoverable groups.
2. `w.query('group-identity-service', { $match: { tags: 'jazz' } })` → the identity records tagged jazz.
3. Join on `group_id` → the jazz groups.

Different apps can search by tag, by description substring, by whatever — the node stays minimal, the search is as flexible as the app wants. Baking a `?tag=` filter into the directory would freeze the search shape into the node; keeping it in the composition keeps it open.

If the directory ever grows large enough that client-side joining is costly, the node can add an *optional* server-side `?tag=` filter as a pure optimization — it shortcuts the composition without replacing it, so nothing is painted into a corner.

## The Endpoint Surface

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /v3/groups/directory` | none (anon) | the minimal list of `discoverable = true` groups (fields above). Paginated. **Metadata only, no posts, no tags.** |
| group detail (by ID) | token optional | the flexible, principal-based read — see `detail.md`. Unlisted-model: reachable for any existing group; posts gated by the reader's membership. |

Both are **pure reads** — a directory view writes nothing.

## Security Invariants

- **I3 holds.** The directory exposes *metadata only*, and only for `discoverable` groups. The detail returns *posts* only when the *reader* is a member — the same membership gate that enforces I3 for every other read. `discoverable` never gates content.
- **The directory is the only existence surface.** A non-discoverable group is absent from the list. (Its detail is still reachable by ID — the unlisted model, `detail.md` — but the directory, the public browse surface, shows only what's blasted.)
- **Listing is revocable.** Setting `discoverable = false` delists immediately. Removing `anon` stops anon readability immediately. Each control revokes its own concern.

## Relationship to the Discover Group

The discover group (`web10.app/groups/web10/discover`) is anon-readable but **not** discoverable: `discoverable: false` + `anon` member. It is the public board, not a directory entry. The boolean is what lets the board stay out of the list without a special-case UI hack.

## Summary

A group is listed in the directory when `discoverable = true` — the default for `open`/`request` groups, `false` by default for `invite_only` groups and the discover group. The directory is a **minimal, canonical view** over `group_contracts` + `group_members` + `group-identity-service` (no dedicated table). Rich display metadata — including **tags** for topic — lives in `group-identity-service`, and topic search is a **composition** (the app joins the directory with an identity query), not a node-baked filter. The **detail** is a separate, flexible, principal-based read (unlisted-model) — see `detail.md`. `discoverable` is a blasting flag; membership is the read switch; the two are orthogonal.

For the detail (the by-ID read), see `detail.md`. For the generic group model, see `overview.md`. For the discover group contract, see `social-contracts.md` §1. For the identity record, see `identity.md`.
