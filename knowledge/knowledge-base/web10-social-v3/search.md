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
  web10-dev — 100k members, open
  jazz-collectors — 500 members, request

Posts:
  jacoby149 · 2h ago — "just shipped the new groups feature"
```

## Protocol Mapping

**Search people:** Query profiles by bio text.
```sql
SELECT p.author_key, extractJSONString(p.body, '$.bio.value') AS bio,
       extractJSONString(p.body, '$.avatar.value') AS avatar
FROM posts p
WHERE p.deleted = 0
  AND p.collection_name = 'profile'
  AND (p.author_key LIKE '%query%'
       OR extractJSONString(p.body, '$.bio.value') ILIKE '%query%');
```

Or better — ClickHouse full-text search on the body JSON:
```sql
SELECT author_key, body FROM posts
WHERE deleted = 0
  AND collection_name = 'profile'
  AND match(body, '.*query.*');
```

**Search groups:** Query group_contracts by name.
```sql
SELECT group_id, name, join_policy, admin_key
FROM group_contracts
WHERE deleted = 0
  AND (group_id ILIKE '%query%' OR name ILIKE '%query%');
```

**Search posts:** Query posts by body text and tags.
```sql
SELECT p.post_id, p.author_key, p.body, p.created_at
FROM posts p
WHERE p.deleted = 0
  AND p.collection_name = 'posts'
  AND (match(p.body, '.*query.*')
       OR has(p.tags, 'query'))
ORDER BY p.created_at DESC
LIMIT 50;
```

**Ngram index (better search):** ClickHouse has ngram functions for fuzzy search.
```sql
SELECT post_id, author_key, body, created_at,
       sum(ngramDistance('query', p.body)) AS score
FROM posts
WHERE deleted = 0
  AND collection_name = 'posts'
GROUP BY post_id, author_key, body, created_at
HAVING score > 0
ORDER BY score DESC
LIMIT 50;
```

## The Data Flow

```
User types in search bar
  → debounce 300ms
  → GET /search?q=query&type=people
  → GET /search?q=query&type=groups
  → GET /search?q=query&type=posts
  → parallel: all three queries
  → render combined results
```

Three parallel queries. One table (posts) for people and posts. One table (group_contracts) for groups.

## Search Optimization

**People search:** Profile posts are few. Full scan is fine. Index the author_key and bio fields.

**Groups search:** Group contracts are few. Full scan is fine.

**Posts search:** This is the heavy one. Options:
1. **ClickHouse ngram index** — built-in, no extra infrastructure
2. **ClickHouse tokenbf index** — bloom filter for token presence, faster than full scan
3. **Elasticsearch** — external search engine, sync from ClickHouse. Overkill for day one.

Day one: ngram index. Eventually: tokenbf or Elasticsearch if needed.

## TODO

- [ ] Debounced search input — 300ms delay
- [ ] Search result tabs — People, Groups, Posts
- [ ] Ngram index on posts.body — CREATE INDEX on the posts table
- [ ] Group member count in results — JOIN with group_members count
- [ ] Recent searches — client-side localStorage
- [ ] Search within a group — `?group=web10-dev&q=query`

## Proof

Search is queries on the posts and group_contracts tables. No dedicated search index. No mirrors. No sync. ClickHouse full-text search handles it. The protocol handles it.
