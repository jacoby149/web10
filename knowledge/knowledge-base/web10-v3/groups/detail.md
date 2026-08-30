# The Group Detail: A Flexible Read by ID

The group **detail** is the read of a *specific* group by its ID — "open this group." It is deliberately **not** a constrained "directory detail page." It is a flexible, principal-based read that **any app can use for any group**, the way an app reads any document it has a principal for. This is the groups analog of the app store's detail (D52), but looser on purpose: the app store's detail 404s for unapproved apps (approval is the gate); a group's detail has no such gate, because a group's content is already governed by the reader's effective role.

The model is an **unlisted YouTube video**: a group that is not in the directory is still fully reachable if you have its ID. Being *listed* and being *reachable* are different things.

## The Core Split: Listing vs Reachability vs Content

Three questions are easy to tangle. They are separate:

| Question | Controlled by | Notes |
|---|---|---|
| Is it **in the directory**? | `discoverable` (boolean) | the *blasting* flag — advertised or not |
| Is it **reachable by ID**? | always (if it exists) | the detail never 404s for a non-discoverable group |
| Can a reader see its **posts**? | the reader's effective role (I3) | the real permission boundary — independent of `discoverable` |

`discoverable` is a **blasting** flag, not a **permission** flag. It controls whether the group is *advertised* in the directory. It never gates the detail, and it never gates content. The permission boundary is the reader's effective role, full stop (`access.md`).

## The Unlisted Model

A group with `discoverable = false` is **unlisted**, not hidden:

- It is **absent from the directory** (not advertised).
- It is **still reachable by ID** — the detail returns it. Like an unlisted video: not in the browse list, but open if you have the link.
- Its **metadata** (name, join policy, member count, roles) is visible to the reader — like an unlisted video's title and thumbnail.
- Its **posts** are still governed by the reader's effective role (I3) — the reader sees them only if their role grants `readAll` on the service (as a member, or via an `anyone` / `authenticated` grant the group made).

So `discoverable` answers "is it blasted?" and the effective role answers "can this reader see the content?" A non-discoverable group is one you can find *if someone gives you the ID*, but you still need a role that grants `readAll` to read the posts.

**Only a non-existent group 404s.** `detail?id=` on a group ID that doesn't exist returns 404. A group that exists but is `discoverable = false` does **not** 404 — it returns normally (metadata always, posts per the reader's effective role).

## The Read Is Principal-Based

The detail takes a **token (optional)** and reads as that principal — the same `user_or_anon` seam the anon-capable `/v3/read` already uses (3.16.2):

- **No token** → reads as `anon`.
- **A token** → reads as that user.

Everything the reader sees is then governed by *that principal's* **effective role** in the group (`access.md`) — the union of the roles on every principal class they belong to (`anyone`, `authenticated` if signed in, their member role if a member). This is what makes it flexible: the same endpoint serves a signed-out visitor and any signed-in user, and each sees exactly what their own effective role allows. An app holding a member's token reads the group as that member; an app with no token reads it as the `anyone` principal.

## What the Detail Returns

Two layers, with different gates:

**Metadata — always returned** (the group exists, so its contract is readable):
- `group_id`, owner (the username in the ID), `join_policy`
- a roles / permission summary (from `group_contracts.roles`)
- member count (`count(group_members)`)
- display metadata from the `group_identity` table when present (name, description, banner, avatar, website, tags) — else derived from the slug

**Posts — gated by the reader's effective role (I3):**
- The reader's effective role grants `readAll` on the service (as a member, or via an `anyone` / `authenticated` grant) → recent posts are returned (the same group read the Discover screen and marketing trending use, scoped to one group).
- The reader's effective role grants no `readAll` → no posts; the response carries a "join to view posts" state (the group is findable, its content is gated). This is the flexible "here's a group, join it" state — not a 404.

Because the read is principal-based, access is evaluated against *the reader's* effective role, not against the `anyone` principal specifically. The `anyone` principal is just who you are when there's no token.

## Why No Constrained Detail Endpoint

The first draft of this design made the detail a rigid "directory detail page": 404 for non-discoverable groups, posts only for `anon` members. That was over-constrained, and it conflated two things:

- It used `discoverable` (a *listing* flag) to gate the detail (a *reachability* question) — wrong axis.
- It gated posts on `anon` membership specifically, instead of on *the reader's* membership — which would have blocked a signed-in member from reading their own group's detail through this endpoint.

The fix is to separate the axes: `discoverable` gates the directory only; the detail is a principal-based read gated by membership. That's the flexibility the app store's detail doesn't need (apps have an approval gate) but groups do (any app should be able to open any group it has a principal for).

## Relationship to the Directory

The **directory** (`discoverability.md`) is the curated, anon-browsable *list* of `discoverable` groups — a minimal, canonical surface. The **detail** (this doc) is the flexible *read* of any group by ID. They share the `discoverable` flag only in that the directory *filters on it*; the detail ignores it.

A directory entry deep-links to the detail. A signed-out visitor clicking a directory entry reads the detail as the `anyone` principal (metadata + posts if the group granted `anyone` a read role). A signed-in user reads it as themselves (metadata + posts if their effective role grants `readAll`). Same endpoint, different principal, different result.

## Security Invariants

- **I3 holds.** Posts are returned only when the *reader's* effective role grants `readAll` on the service — the same role gate that enforces I3 for every other read. `discoverable` plays no part in content access.
- **Metadata is low-sensitivity.** The contract (join policy, roles, member count) and the identity (name, banner, tags) are readable by ID. This is accepted: group IDs are guessable URLs anyway, and the real boundary is the content, which stays role-gated. (A DM group's *metadata* — "invite_only, 2 members" — is visible by ID; its *posts* are not.)
- **No new access surface.** The detail reuses the existing principal seam (`user_or_anon`) and the existing group read. It invents no new permission.

## Summary

The group detail is a flexible, principal-based read of a group by ID. It is **unlisted-model**: `discoverable` controls only the directory listing, never reachability — a non-discoverable group is still open by ID (like an unlisted video), and only a non-existent group 404s. Metadata is always returned; posts are gated by the *reader's* effective role (I3), evaluated against the token's principal (or the `anyone` principal with no token). Any app can grab any group it has a principal for. The permission boundary is the effective role, not `discoverable`.

For the directory (the list) and the `discoverable` flag, see `discoverability.md`. For the identity record the detail reads (name, banner, tags), see `identity.md`. For the generic group model, see `overview.md`.
