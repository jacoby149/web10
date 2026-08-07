# Search

Find people, groups, and posts.

## What the Screen Shows

```
Search
─────────────────────
🔍 type to search...

People:
  [avatar] jacoby149 — builder
  [avatar] alice — jazz enthusiast

Groups:
  web10.app/groups/charlie/st-louis-chess-club — 100k members, open
  web10.app/groups/dave/jazz-collectors — 500 members, request

Posts:
  jacoby149 · 2h ago — "just shipped the new groups feature"
```

## Protocol Mapping

**Search people:** Query profiles by bio text.

```ts
const people = await w.aggregate('profile', [
  { $match: { $text: { $search: 'query' } } },
  { $limit: 50 },
])
// → [{ author_key: 'jacoby149', bio: 'builder', avatar: '...' }, ...]
```

**Search groups:** Query groups by name.

```ts
const allGroups = await w.getGroups({ member: 'jacoby149' })
const matched = allGroups.filter(g =>
  g.group_id.includes('query') || g.name?.includes('query')
)
```

Or server-side for broader search:

```ts
const groups = await w.aggregate('groups', [
  { $match: { $text: { $search: 'query' } } },
  { $limit: 50 },
])
```

**Search posts:** Query posts by body text and tags.

```ts
const posts = await w.aggregate('posts', [
  { $match: { $text: { $search: 'query' } } },
  { $sort: { created_at: -1 } },
  { $limit: 50 },
])
```

**Ngram search (fuzzy):** Server-side fuzzy matching.

```ts
const results = await w.aggregate('posts', [
  { $ngramMatch: { field: 'body', query: 'query', threshold: 0.7 } },
  { $sort: { score: -1 } },
  { $limit: 50 },
])
```

## The Data Flow

```
User types in search bar
  → debounce 300ms
  → w.aggregate('profile', [{ $match: { $text: 'query' } }])   (people)
  → w.aggregate('groups', [{ $match: { $text: 'query' } }])    (groups)
  → w.aggregate('posts', [{ $match: { $text: 'query' } }])     (posts)
  → parallel: all three calls
  → render combined results
```

Three parallel aggregate calls. One table for people and posts. Group metadata for groups.

## Search Optimization

**People search:** Profile documents are few. Full scan is fine. Index the author_key and bio fields.

**Groups search:** Group contracts are few. Full scan is fine.

**Posts search:** This is the heavy one. Options:
1. **ClickHouse ngram index** — built-in, no extra infrastructure
2. **ClickHouse tokenbf index** — bloom filter for token presence, faster than full scan
3. **Elasticsearch** — external search engine, sync from ClickHouse. Overkill for day one.

Day one: ngram index. Eventually: tokenbf or Elasticsearch if needed.

## TODO

- [ ] Debounced search input — 300ms delay
- [ ] Search result tabs — People, Groups, Posts
- [ ] Ngram index on documents.body — CREATE INDEX on the documents table
- [ ] Group member count in results — include from group metadata
- [ ] Recent searches — client-side localStorage
- [ ] Search within a group — `?group=web10.app/groups/charlie/st-louis-chess-club&q=query`

## Proof

Search is aggregate calls on the documents table and group metadata. No dedicated search index. No mirrors. No sync. ClickHouse full-text search handles it. The protocol handles it.