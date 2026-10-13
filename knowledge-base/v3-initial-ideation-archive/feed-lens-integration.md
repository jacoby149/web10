# Feed Lens: Power Mean Ranking — Integration Plan

The marketing site has the feed tuning knobs working purely in frontend JS (`powerMean.ts`). Every post fetches engagement counts, then the client scores and sorts. The goal: push the ranking into the SDK so ClickHouse does the work and returns pre-sorted results.

## What Exists Today

**Frontend scoring** (`marketing-ui/src/lib/powerMean.ts`):
- 5 knobs: recency weight, likes weight, comments weight, time half-life, character (p)
- 6 detents per knob (7,776 total combos, encoded as a 5-digit mix code)
- 3 presets: Newest, Most Loved · All Time, Balanced
- Saturating normalizers (log1p → saturate for counts, exp decay for recency)
- Weighted power mean: `score = (Σ wᵢ·xᵢ^p / Σ wᵢ)^(1/p)`
- Scored and sorted client-side after fetching posts + engagement counts

**Lens schema** (`marketing-ui/public/docs/schemas/lens.json`):
- User-owned record: `ranking_rules` (field + weight), `muted_topics`, `muted_users`, `ui_toggles`
- The shape of a saved feed configuration

**Gap:** The SDK has `$sort: { created_at: -1 }` — chronological only. No way to pass a lens. The client fetches raw posts, computes engagement, then sorts. Wasteful and slow.

## The Integration

### 1. Lens as a User-Owned Document

The lens config is a document in the user's collection. The user owns it, edits it, shares it.

```ts
// Default lens (balanced)
const lens = await w.create('lens', {
  name: 'Balanced',
  ranking_rules: [
    { field: 'recency', weight: 0.6 },
    { field: 'likes', weight: 0.6 },
    { field: 'comments', weight: 0.4 },
  ],
  half_life_ms: 86_400_000,  // 1 day
  character: -1,              // Flat (harmonic-ish)
})
// → { doc_id: 'lens-abc' }
```

The lens is just a document. The user can have multiple lenses ("detox mode", "close-friends", "chronological"). Each is a record they own.

### 2. SDK: `w.read` Accepts a Lens

The read call takes a lens — either a lens ID or inline config:

```ts
// By lens ID (the user's saved config)
const posts = await w.read('posts', {
  groups: feedGroups,
  $lens: 'lens-abc',
  $limit: 50,
})

// Inline lens (quick tuning, no save)
const posts = await w.read('posts', {
  groups: feedGroups,
  $lens: {
    ranking_rules: [
      { field: 'recency', weight: 0.8 },
      { field: 'likes', weight: 0.6 },
      { field: 'comments', weight: 0.2 },
    ],
    half_life_ms: 43_200_000,
    character: 0,
  },
  $limit: 50,
})
```

The SDK sends the lens to the API. The API computes the score in ClickHouse. Returns pre-sorted posts.

### 3. ClickHouse: Server-Side Power Mean

ClickHouse can compute the entire ranking function natively:

```sql
SELECT
    p.doc_id, p.author_key, p.body, p.tags, p.created_at,
    -- Normalized signals
    exp(-timestampDiff('millisecond', p.created_at, now()) / :half_life_ms) AS recency,
    (:k_likes * log1p(
        SELECT count() FROM documents r
        WHERE r.deleted = 0 AND r.collection_name = 'reactions'
        AND hasToken(r.body, p.doc_id)
    )) / (1 + :k_likes * log1p(...)) AS likes_norm,
    (:k_comments * log1p(
        SELECT count() FROM documents c
        WHERE c.deleted = 0 AND c.collection_name = 'comments'
        AND hasToken(c.body, p.doc_id)
    )) / (1 + :k_comments * log1p(...)) AS comments_norm,
    -- Power mean score
    power(
        (:w_recency * power(recency, :p)
         + :w_likes * power(likes_norm, :p)
         + :w_comments * power(comments_norm, :p))
        / (:w_recency + :w_likes + :w_comments),
        1.0 / :p
    ) AS score
FROM documents p
JOIN doc_groups pg ON p.doc_id = pg.doc_id
JOIN group_members gm ON pg.group_id = gm.group_id
WHERE p.deleted = 0
  AND p.collection_name = 'posts'
  AND pg.deleted = 0
  AND gm.member_key = :user
  AND gm.deleted = 0
  AND pg.group_id IN (:groups)
ORDER BY score DESC
LIMIT 50;
```

The subqueries for likes/comments are the bottleneck. Two approaches:

**Approach A: Subquery ranking (pure, slow for large sets)**
- Exact engagement counts per post via subquery
- Accurate but O(N·M) — N posts × M engagement subqueries
- Works for page-sized results (50 posts)

**Approach B: Cached counters (practical, fast)**
- `post_engagement(doc_id, reaction_count, comment_count)` — lightweight counter table
- API writes to it on reaction/comment insert (already planned in discover.md TODO)
- The ranking query joins once, no subqueries
- Counters are eventually consistent (Redis or ClickHouse table)

**Approach C: Hybrid (best of both)**
- Cached counters for the ranking query (fast sort)
- Exact counts fetched in parallel for display (accuracy in the UI)
- The ranking uses the counter, the card shows the real number

### 4. Lens Sharing and Discovery

Lenses are documents. They can be attached to groups for sharing:

```ts
// Share a lens to a group
const lens = await w.create('lens', {
  name: 'Jazz Vibes',
  ranking_rules: [
    { field: 'likes', weight: 1.0 },
    { field: 'comments', weight: 0.8 },
  ],
  half_life_ms: 604_800_000,  // 7 days
  character: -1,
}, {
  groups: ['web10.app/groups/dave/jazz-collectors'],
})
```

Group members can discover and apply shared lenses. The mix code (5-digit encoding) becomes a shareable URL param: `?mix=03231`.

### 5. Implementation Order

**Phase 1: SDK lens parameter + ClickHouse ranking**
- Add `$lens` to `w.read()` — inline config and lens ID
- API resolves lens document (if ID), extracts ranking_rules
- ClickHouse query computes power mean score, ORDER BY score
- Uses cached engagement counters (post_engagement table)
- The frontend knobs still work, but now the sort is server-side

**Phase 2: Lens as a user-owned document**
- `w.create('lens', config)` — save a lens
- `w.read('lens', { groups: ['me'] })` — list your lenses
- `w.update('lens', { _id }, config)` — edit a lens
- Lens attached to groups for sharing
- Mix code encoding/decoding in SDK

**Phase 3: Lens marketplace**
- Discover shared lenses in groups
- "Apply this lens" — clone to your collection
- Lens creator gets attribution
- Trending lenses (most-applied)

### 6. What Changes in Existing Docs

| Doc | Change |
|---|---|
| `sdk-api.md` | `$lens` parameter on `w.read()`. Lens CRUD operations. Mix code encode/decode. |
| `sdk-implementation.md` | Power mean SQL in ClickHouse. post_engagement counter table. Lens document schema. |
| `feed.md` | `w.read('posts', { groups, $lens })` — the feed uses a lens by default. |
| `discover.md` | Trending sort uses a preset lens (`$lens: 'trending'`). |
| `web10-social-groups.md` | Lenses shared within groups. |

### 7. Open Questions

- **Half-life when p = 0 (geometric mean):** The formula changes at p = 0. ClickHouse needs a CASE for this. Should the SDK handle it or the API?
- **Recency-only shortcut:** When only recency has weight, the marketing code skips the power mean and sorts by `-ageMs`. Should ClickHouse do the same (CASE in ORDER BY)?
- **Reposts:** The marketing code has reposts normalized but weighted to 0. Should the lens schema include it as a field?
- **Lens validation:** Should the API reject invalid lenses (negative weights, zero total weight) or clamp them?
- **Counter consistency:** How stale can the post_engagement counter be before the ranking feels wrong? Redis (sub-second) vs ClickHouse table (eventual)?
