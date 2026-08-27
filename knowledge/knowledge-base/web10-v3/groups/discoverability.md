# Discoverable Groups: The Group Directory

A group is **discoverable** when it is listed in the public, anon-browsable group directory. Discoverability is an owner choice about **visibility** — it is a `discoverable` boolean on the group's contract, and it is a *separate* decision from whether `anon` can read the group's posts.

Two things are easy to conflate, and they are not the same:

- **Listed in the directory** — strangers can see the group *exists* (its name, description, member count). Controlled by the `discoverable` boolean.
- **Anon-readable** — a token-less reader can see the group's *posts*. Controlled by `anon` being a member.

The node-default discover group (`social-contracts.md` §1) is the proof they come apart: it is anon-readable (it is the public board) but it is *not* a directory entry (it's a board, not a community). So it is `discoverable: false` + `anon` member.

## The Two Controls

```
listed in directory   ⟺  group_contracts.discoverable == true
anon can read posts   ⟺  anon ∈ members(group)   (with readAll)
```

| `discoverable` | `anon` member | Result |
|---|---|---|
| `false` | no | private — not listed, not anon-readable, direct URL 404s (no existence leak) |
| `false` | yes | **anon-readable but not listed** (the discover group) — anon can read posts via direct URL / group read, but it's not in the directory |
| `true` | yes | listed **and** anon can read posts (the common "public group") |
| `true` | no | listed, but "join to view posts" (public listing, gated content) |

The `discoverable` boolean is the "is it on the directory" switch. `anon` membership is the read switch. They are orthogonal.

```mermaid
graph LR
    subgraph Directory["Group Directory (public, anon-browsable)"]
        L["list: groups where<br/>discoverable = true"]
    end

    subgraph Model["Existing tables + one new field"]
        GC["group_contracts<br/>(group_id, join_policy, roles,<br/>discoverable)"]
        GM["group_members<br/>(group_id, member_key)"]
        GI["group-identity-service<br/>(name, banner, avatar, website)"]
    end

    GC -->|"WHERE discoverable = true"| L
    GC -->|contract + join policy| L
    GI -->|display metadata (when present)| L
    GM -.->|"detail page: posts only if anon is a member"| L

    style Directory fill:#e8f5e9,stroke:#2e7d32,color:#000
    style Model fill:#f5f5f5,stroke:#333,color:#000
```

The directory is a **view** over data that already exists, plus one new boolean. It invents no new store and no new permission.

## How a Group Gets Listed

The owner sets `discoverable = true` on the group (through the existing group-update path — no dedicated opt-in endpoint). In the authenticator that is a "List in directory" toggle.

The toggle is a **convenience for the common case**: it sets `discoverable = true` *and* adds `anon` as a member (default role), so the group is listed and its posts are anon-readable in one action. The advanced case — listed but content-private — is `discoverable = true` *without* adding `anon`.

| Action | `discoverable` | `anon` member | Directory effect |
|---|---|---|---|
| "List in directory" (common) | `true` | added | group appears, posts anon-readable |
| List, keep content private | `true` | not added | group appears, "join to view posts" |
| Remove from directory | `false` | (unchanged) | group disappears |

The discover group is the node's own use of the controls: `ensure_discover_group()` enrolls `anon` (anon-readable board) but leaves `discoverable: false` (not a directory entry).

## What the Directory Shows

Per group, the directory card shows **metadata only** — never posts:

| Field | Source | Notes |
|---|---|---|
| Name | `group-identity-service` record, else derived from the URL slug | see Display metadata |
| Owner | the username in the group_id (`web10.app/groups/{owner}/{slug}`) | |
| Join policy | `group_contracts.join_policy` | `open` / `request` / `invite_only` |
| Member count | `count(group_members)` for the group | public, like a follower count |
| Recent activity | latest post timestamp in the group | default sort key |
| Banner / avatar | `group-identity-service` record | when present |

### Display metadata

`group_contracts` carries no name, description, or icon — the slug in the group_id is the name. Two tiers:

- **v0 (zero schema change beyond the boolean):** derive display from the URL — owner username + slug — plus member count, join policy, and recent post count.
- **When present:** if the group has published a `group-identity-service` record (banner, name, website, avatar — designed in `identity.md`, managed by the `page-curator` role), the directory prefers it over the derived values.

The directory reads what exists; it does not require a group to have an identity record to be listed.

## The Endpoint Surface

Mirrors the app store (D52): a public list + a public detail page, both pure reads, both anon-capable.

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /v3/groups/directory` | none (anon) | the groups where `discoverable = true` — id, owner, slug, join policy, member count, recent activity, display metadata. **Metadata only.** Paginated, sorted by recent activity. |
| `GET /v3/groups/detail?id=` | none (anon) | one discoverable group: contract (join policy, roles summary) + display metadata + member count, always. Recent posts **only if `anon` is a member** (read through the anon-capable `/v3/read`); otherwise a "join to view posts" state. |

Both are **pure reads** — a directory view writes nothing. The detail page's recent posts are the same group read the Discover screen and the marketing trending page already use (3.16.2), just scoped to one group and forked on `anon` membership.

**404, not 403, for a non-discoverable group.** `detail?id=` on a group where `discoverable = false` returns 404 — no existence leak beyond the URL, the same call the app store makes for an unapproved app (D52).

## Security Invariants

- **I3 holds end to end.** The directory exposes *metadata only*, and only for groups the owner set `discoverable = true` (an explicit choice to be public). The detail page returns *posts* only when `anon` is a member — the same membership gate that enforces I3 for every other reader. No new access surface.
- **No existence leak.** A group with `discoverable = false` is indistinguishable from a non-existent group to an anon reader (absent from the list, 404 on detail).
- **Listing is revocable.** Setting `discoverable = false` delists immediately. Removing `anon` stops anon readability immediately. Each control revokes its own concern.

## The Honest Cost

The boolean is a second source of truth, and it can diverge from membership (`discoverable = true` but `anon` not a member). That divergence is **not a bug** — it is the "listed, join to view" state (the middle row of the table). The only real hazard is a group whose owner *expected* it to be readable and it isn't; the detail page's "join to view posts" state makes that visible instead of silent.

## Relationship to the Discover Group

The discover group (`web10.app/groups/web10/discover`) is anon-readable but **not** discoverable: `discoverable: false` + `anon` member. It is the public board, not a directory entry. The boolean is what lets the board stay out of the list without a special-case UI hack — the mechanism that made the first draft fudge this is gone.

## Summary

A group is listed in the directory when its owner sets `discoverable = true`; its posts are anon-readable when `anon` is a member. The two are orthogonal — the discover group (anon-readable board, not listed) is the proof. The directory is a public, metadata-only read of the `discoverable` groups; the detail page adds posts only when `anon` is a member, else "join to view." Display metadata is derived from the URL in v0 and read from `group-identity-service` when present. I3 holds end to end: metadata is public by the owner's choice, posts stay gated by membership.

For the generic group model, see `overview.md`. For the discover group contract, see `social-contracts.md` §1. For the identity record the directory reads, see `identity.md`.
