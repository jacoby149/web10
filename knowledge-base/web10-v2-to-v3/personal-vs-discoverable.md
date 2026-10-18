# Personal Data vs Discoverable Data: Resolved by Groups

## Two Kinds of Data, Two Kinds of Needs

web10 has to serve two fundamentally different needs:

**Personal data** — the user's private bucket. Posts, messages, media, follows, settings. The user owns it, controls it, can delete it, can take it with them. This is the sovereignty story.

**Discoverable data** — the public surface. A trending feed, engagement counts, follower counts, search results, suggested accounts. This is the growth story. An influencer needs people to find them. A platform needs content to surface.

In v2, these were built as separate systems that happened to overlap. The overlap is where everything broke.

## v2: Two Surfaces, One Sync Problem

**Personal data** lived in the user's collection. Service terms controlled access. The CRUD endpoints were the gate.

```
alice/
  ├── public_posts             — public posts (anon-read whitelisted)
  ├── private_posts            — private posts (owner-only)
  ├── reactions                — alice's reactions
  ├── comments                 — alice's comments
  └── follows                  — who alice follows
```

**Discoverable data** lived in system collections — cross-user surfaces outside any single user's control:

```
web10/
  ├── discovery_posts          — public post index (text, tags, media refs)
  ├── public                   — structured interactions (reactions, comments, follows)
  └── metering_events          — per-request metering
```

The discovery index was a **projection** — a subset of each user's public posts. The public ledger was a **mirror** — every reaction, comment, and follow got copied here. The client was responsible for keeping them in sync. The sync broke.

**The tension:** the user must own their data, but the system must be able to project it. In v2, the compromise was "the system projects from the user's data via server-side hooks." That worked for posts. It didn't work for reactions, comments, and follows — those still needed the client to write the ledger mirror.

## v3: One Surface, Groups Marry the Two

v3 eliminates the tension. One table. Groups handle both personal ownership and cross-user discovery.

**Personal data** is a post with no groups. Only the author sees it. The author owns it.

```ts
await createDocument({ text: "private note" });  // no groups → private
```

**Discoverable data** is a post attached to groups. Members see it. The discover group makes it public.

```ts
await createDocument({
  text: "hello world",
  groups: ["web10/discover"]  // public
});
```

The discover group is an open group with auto-enrollment on signup, including the anon user. Posts attached to it are discoverable by anyone. Posts not attached to it are private.

**The projection is automatic.** ClickHouse queries the documents table. Group membership filters at query time. No mirror. No sync. No double-write.

```sql
SELECT p.doc_id, p.author_key, p.body, p.tags, p.created_at
FROM documents p
JOIN doc_groups pg ON p.doc_id = pg.doc_id
JOIN group_members gm ON pg.group_id = gm.group_id
WHERE p.deleted = 0
  AND gm.member_key = 'alice'
  AND gm.deleted = 0
ORDER BY p.created_at DESC
LIMIT 50;
```

Alice sees every post attached to a group she belongs to. No visibility column. No collection ceiling. No discovery index. No public ledger. Just group membership.

## The Double-Write Problem: Gone

v2's double-write problem existed because personal data and discoverable data lived in different places. The client had to write to both. The mirror was fire-and-forget. If it failed, the data was silently out of sync.

v3 eliminates it. One insert. One table. The API writes the document and the doc_groups attachment. ClickHouse queries it. No mirror. No sync. No double-write.

```
Client → POST /alice/posts → API
                               → INSERT INTO documents (alice's post)
                               → INSERT INTO doc_groups (group attachment)
                               → done
```

One client call. One source of truth. The projection is a query, not a mirror.

## Engagement: Queries, Not Mirrors

v2 needed the public ledger because MongoDB couldn't aggregate across users. Reactions, comments, and follows had to be mirrored to a shared surface.

v3 uses ClickHouse. Cross-user queries are native. Engagement is a query, not a mirror.

```sql
-- Reaction count for post-123
SELECT count() FROM documents
WHERE deleted = 0
  AND collection_name = 'reactions'
  AND hasToken(body, 'post-123');

-- Comments for post-123
SELECT doc_id, author_key, body, created_at
FROM documents
WHERE deleted = 0
  AND collection_name = 'comments'
  AND hasToken(body, 'post-123')
ORDER BY created_at ASC;
```

No ledger. No mirror. Just documents with `ref` types. ClickHouse aggregates them.

## The Sovereignty Story

The user owns their data. Posts are in their collection. Groups define who sees them. The user controls group attachments. The authenticator manages groups — block sharing, opt out, privatize all, kill switch.

The user can export their data. They can delete their posts. They can take their data with them. The platform can't touch their data without a service contract.

The discover group is opt-in. The author attaches to it. The author can remove it. The post becomes private. The user is in control.

## Summary

v2 had two surfaces: personal collections and system mirrors. The sync broke. v3 has one surface: the documents table. Groups marry personal ownership and cross-user discovery. No mirrors. No sync. No double-write. The user owns their data. Groups define who sees it. ClickHouse queries it. One insert. One table. One permission model.