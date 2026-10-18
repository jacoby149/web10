# Layered Permissions: Replaced by Groups

## What v2 Had

v2 used a collection ceiling model. Each collection had a default visibility set by the user's privacy panel. Individual posts could only narrow that visibility — never widen it. The strictest permission won.

```
Collection: public_posts (whitelist: ".*") → anyone can read
Post-level: visibility = "followers" → only followers see it
Result: followers-only (stricter wins)

Collection: private_posts (whitelist: []) → owner only
Post-level: visibility = "public" → IGNORED
Result: owner-only (collection ceiling)
```

This was the Unix file permission model: directory permission is the ceiling, file permission can only narrow. It was conceptually clean but operationally complex — term records with whitelists, blacklists, regex matching, per-action permissions. It was the source of most bugs in v2.

## What v3 Does

Groups replace the collection ceiling entirely. There is no `visibility` column. No `collection_permissions` table. No post-level narrowing. No ceiling. Just groups.

**A post is visible to whoever is in the groups it's attached to.**

```ts
// Public — attached to the discover group (open, auto-enrolled, anon is a member)
await createDocument({
  text: "hello world",
  groups: ["web10/discover"]
});

// Private — no groups
await createDocument({
  text: "secret"
});

// Followers-only — attached to the followers group
await createDocument({
  text: "behind the scenes",
  groups: ["alice.followers"]
});

// Multiple groups — visible to members of either
await createDocument({
  text: "team update",
   groups: ["alice.followers", "charlie/st-louis-chess-club"]
});
```

The discover group is the public surface. Open join policy. Auto-enrolled on signup. Anon is a member. Posts attached to it are public. Posts not attached to it are private.

The followers group controls the followers-only surface. Join policy determines if it's public (open) or private (request). Members see posts attached to it.

**The role model replaces the ceiling.** Each group defines roles with service-scoped permissions. A follower gets `readAll` on posts. A member gets `readAll`, `create`, `updateOwn`, `deleteOwn`. An owner gets everything. The role defines what you can do. The group defines who can see.

## Why Groups Are Simpler

| v2 (Collection Ceiling) | v3 (Groups) |
|---|---|
| Term records with whitelists/blacklists | Group membership |
| `visibility` column per post | Groups array per post |
| Collection-level ceiling + post-level narrowing | One permission model: roles |
| Regex matching on whitelists | Exact group membership check |
| Two checks must pass (collection + post) | One check: group membership |
| Privacy panel manages collections | Authenticator manages groups |

The ceiling model required two checks at query time: collection visible AND post visible. Groups require one: is the requester a member of a group the post is attached to?

## The Sovereignty Story

The user's authenticator is the source of truth for their data. Groups set the default. The author attaches to groups. The user manages groups at the authenticator level. Block sharing, opt out, privatize all, kill switch.

The data viewer shows which groups each post is attached to. The user can add or remove group attachments. The system is transparent. The user is in control.

## Summary

- **No collection ceiling.** Groups replace it.
- **No visibility column.** Groups replace it.
- **No term records.** Groups replace them.
- **One permission model.** Roles define access. Groups define membership.
- **One check at query time.** Group membership.
- **Transparent.** The authenticator shows groups. The author controls attachments.