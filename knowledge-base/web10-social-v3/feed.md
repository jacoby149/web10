# Your Feed

**Historical app-design/API examples.** The current implementation map is
`../web10-v3/`; the replacement targets are D116 (DECIDED), D117 (DIRECTION,
cell pending), and D118 (DECIDED), linked from the
[design map](../web10-v3/db/design-revolution.md). Old JSON/ref SQL is retained
as history, not a requirement to keep that storage representation.

Your personal feed. Posts from all groups you belong to, except discover.

## What the Screen Shows

```
Feed
─────────────────────
[alice] posted 1h ago
   "morning coffee run"
   [📷 attachment]
   [❤️ 12] [💬 2]

[bob] posted 3h ago
   "working on something cool"
   [❤️ 5] [💬 0]
```

## Protocol Mapping

**Your feed is all groups you belong to, except the discover group.** The discover group (`{provider}/groups/web10/discover`) is the public board — it has its own screen. Your feed is personal: followers, communities, close-friends.

The retained feed design uses an app-authored query and a prepare pass (D73; `POST /v3/feed` is retired). At the API -> ClickHouse boundary, API-generated access-filtered CTEs restrict the query to the selected readable groups:

> **Engagement counts are read separately.** The in-query `reactions` / `comments` joins are scoped to the feed's follower groups, but reactions and comments are *written* to the discover group (the default reaction/comment group — `createReaction` / `createComment` write there). So those joins see no data and return 0. The displayed like / dislike / comment tallies come from a second, small read (`readFeedEngagementCounts`) scoped to `[...feedGroups, discover]` — the same place `readFeedReactions` (the "did I like this?" read) and the DiscoverScreen count from. The in-query joins remain only to feed the tuned-preset power-mean score (total reactions = likes + dislikes).

```ts
const allGroups = await w.getGroups({ member: 'jacoby149' })
// → [
//    { group_id: '{provider}/groups/web10/discover', ... },
//    { group_id: 'web10.app/groups/jacoby149/followers', ... },
//    { group_id: 'web10.app/groups/jacoby149/close-friends', ... },
//    { group_id: 'web10.app/groups/charlie/st-louis-chess-club', ... },
//    { group_id: 'web10.app/groups/dave/jazz-collectors', ... },
//  ]

const feedGroups = allGroups
  .filter(g => g.group_id !== '{provider}/groups/web10/discover')
  .map(g => g.group_id)

const { rows } = await w.query(`
  SELECT p.doc_id, p.author_key, p.body, p.tags, p.created_at, p.ref_value,
         p.ad_mode, p.ad_target,
         coalesce(eng.reaction_count, 0) AS likes,
         coalesce(cmt.comment_count, 0)  AS comments,
         pr.body AS profile_body
  FROM posts p
  LEFT JOIN (SELECT ref_value, count() AS reaction_count
             FROM reactions WHERE ref_value != '' GROUP BY ref_value) eng
         ON eng.ref_value = p.doc_id
  LEFT JOIN (SELECT ref_value, count() AS comment_count
             FROM comments WHERE ref_value != '' GROUP BY ref_value) cmt
         ON cmt.ref_value = p.doc_id
  LEFT JOIN profile pr ON pr.author_key = p.author_key
  ORDER BY toUnixTimestamp64Milli(p.created_at) DESC
  LIMIT 51
`, {
  groups: feedGroups,
  prepare: {
    media: true,
    ads: true,
    face: { bodyField: 'profile_body', mediaField: 'avatar_ref',
            authorColumn: 'author_key', urlField: 'avatar_url' },
  },
})
```

One query + the prepare pass. The groups scope the read; the engine mints the media, ads, and the author's face so there is no second round of per-post reads. The reference example (the feed as a query) is spec'd in `../web10-v3/query-engine.md` → "The Feed as a Query".

**Narrowing to followers only:**

```ts
const followersGroups = allGroups
  .filter(g => g.group_id.endsWith('/followers'))
  .map(g => g.group_id)

// same query, groups: followersGroups
```

**Narrowing to a specific group.** Profile pages and group pages:

```ts
// Alice's profile — only her followers group
// same query, groups: ['web10.app/groups/alice/followers']

// Chess club page — only that group
// same query, groups: ['web10.app/groups/charlie/st-louis-chess-club']
```

## The Data Flow

```
User opens /feed
  → w.getGroups({ member: 'jacoby149' })
  → filter out web10/discover
  → w.query(feedSQL, { groups: feedGroups, prepare: { media, ads, face } })
  → readFeedEngagementCounts(postIds, feedGroups)   // scoped to [...feedGroups, discover]
  → merge like / dislike / comment tallies onto the posts
  → render
```

## Feed vs Discover

| Your Feed | Discover |
|---|---|
| All groups you belong to, except discover | Only `{provider}/groups/web10/discover` |
| Personal: followers, communities, close-friends | Public board: everything posted to discover |
| Chronological | Chronological or trending |
| Different for every user | Same for every user |

## TODO

- [ ] Follow list caching — app maintains list of followed users for faster queries
- [ ] Mute feature — per-author exclusion
- [ ] "See post" from feed → post detail screen
- [ ] Infinite scroll — keyset pagination on created_at
- [ ] WebSocket push — new posts from groups arrive in real-time

## Proof

This historical feed design scopes an app query using API-generated access-filtered CTEs before ClickHouse execution, then prepares media, ads and faces. Its engagement read and no-fanout description are retained history, not the current D113–D117 target or a new performance claim; use the current design map above.
