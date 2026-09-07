# Query Engine (the Flexible Read)

**Who this is for:** you — a developer building an app on web10 data.

## What it is

`w.query(sql, { groups? })` — you write a ClickHouse `SELECT` over your
**service names** (`posts`, `comments`, `reactions`, …) and the node runs it.
This is the "go crazy" read: filters, cross-service joins, aggregations,
subqueries, your own CTEs — the full read power, safe by construction.

```ts
const { rows, count } = await w.query(`
  SELECT p.doc_id, p.author_key, count() AS reactions
  FROM posts p
  JOIN reactions r ON r.ref_value = p.doc_id
  GROUP BY p.doc_id, p.author_key
  ORDER BY reactions DESC
  LIMIT 20
`)
```

**The response** is `{ rows, count }`:

- `rows` — an array of objects keyed by your query's column names.
- A `body` column comes back **parsed** (the documents table stores JSON; you
  get the object).
- Datetimes are ISO-8601.
- `count` — the number of rows returned.

**Scoping:** `groups` is optional. Omit it and the query runs over all the
reader's readable groups (the "me" semantics of the group read). Pass a list
to scope to specific groups. A missing token reads as the node's public
board (anon) — the same rule as the group read.

## What each service exposes

Every service is a view over the caller's readable documents:

| Column | Type | Notes |
|---|---|---|
| `doc_id` | String | the document id |
| `author_key` | String | who created it |
| `body` | String (JSON) | use `JSONExtractString(body, 'field', 'value')` for fields |
| `ref_value` | String | the universal link (engagement join) |
| `tags` | Array(String) | `has(tags, 'jazz')` |
| `created_at` | DateTime | ISO-8601 in results |
| `updated_at` | DateTime | ISO-8601 in results |

## Reading JSON bodies

`body` is a JSON string in SQL. Pull fields out with ClickHouse's JSON
functions:

```sql
-- What reaction types are people using?
SELECT JSONExtractString(body, 'reaction_type', 'value') AS type, count() AS n
FROM reactions
GROUP BY type
ORDER BY n DESC
```

## The boundary: a wall, not a membrane

Your SQL is **never executed as-is**. The node parses it, validates every
table reference, and rewrites each service name to an API-built **boundary
CTE** — that service's documents, filtered to the groups the reader can read,
with blocks, sharing pauses, and hidden docs applied. Then it runs the
compiled query.

The guarantee: **the raw node tables are unreachable from your query.**
`documents`, `doc_groups`, `group_members` — you can't name them, subquery
them, or join them. The boundary is on the *input*, not a filter on the
output, so an aggregation can't bake in data a filter would have removed.

**What you can do:**

- Filter anything (`WHERE has(tags, 'jazz') AND created_at > …`)
- Self-join across services (`posts` ⋈ `reactions` on `ref_value = doc_id`)
- Aggregate (`count()`, `sum`, `GROUP BY`)
- Use subqueries and your own `WITH` CTEs

**What you can't do (all → 403):**

- Anything but a single `SELECT` — no `INSERT`/`UPDATE`/`DELETE`/`DROP`
- Reference raw node tables (`documents`, `doc_groups`, …)
- Use table functions (`file()`, `s3()`, `numbers()` — escape hatches)
- Touch a service your app contract doesn't grant `readAll` on

## The error surface

| Status | Meaning |
|---|---|
| **403** | Unsafe query — DML/DDL, a raw table, a table function, or a service your contract doesn't grant `readAll` on. The boundary said no. |
| **400** | Caller-SQL failure — the query is structurally safe but ClickHouse rejected it (a column the service doesn't expose, a bad function argument, a type mismatch). The `detail` says what. |
| **429** | Rate limit — you're over budget for the window (below). |
| **403** `"not a member of the requested group"` | You passed explicit `groups` you can't read any of (the D42 access-failure rule — an error the app can act on, not an empty result). |

## Performance bounds

- **Max rows:** an unbounded query gets `LIMIT 1000` appended server-side. A
  caller-supplied `LIMIT` is honored as-is.
- **Timeout:** queries must finish in 10 seconds.
- **Data bound:** the boundary CTE is the bound — a query can only scan the
  caller's readable groups, not the whole node.

## The rate limit (D65)

`/v3/query` is rate-limited **per user**: 60 queries per 60-second window,
keyed on the verified user from the token (not IP, not the raw token). Over
budget → **429** until the window resets. Anon (no token) is not
per-user-limited. If your app fans out a lot of queries, batch them — one
aggregated query beats fifty small ones.

## Worked examples

These are the five examples from the
[Query playground](/docs/query/) — each one runs against a real node:

**Recent posts** — the simple case:

```sql
SELECT doc_id, author_key, created_at
FROM posts
ORDER BY created_at DESC
LIMIT 20
```

**Trending (self-join)** — join `posts` to `reactions` across services:

```sql
SELECT p.doc_id, p.author_key, count() AS reactions
FROM posts p
JOIN reactions r ON r.ref_value = p.doc_id
GROUP BY p.doc_id, p.author_key
ORDER BY reactions DESC
LIMIT 20
```

**Reaction breakdown** — aggregate over the JSON body:

```sql
SELECT JSONExtractString(body, 'reaction_type', 'value') AS type, count() AS n
FROM reactions
GROUP BY type
ORDER BY n DESC
```

**Hot posts (CTE)** — your own `WITH` clause, then join it back:

```sql
WITH hot AS (
  SELECT ref_value, count() AS n
  FROM reactions
  GROUP BY ref_value
  HAVING n > 1
)
SELECT p.doc_id, p.author_key, h.n AS reactions
FROM posts p
JOIN hot h ON h.ref_value = p.doc_id
ORDER BY h.n DESC
LIMIT 20
```

**Comments by author** — plain aggregation:

```sql
SELECT author_key, count() AS comments
FROM comments
GROUP BY author_key
ORDER BY comments DESC
LIMIT 20
```

## When to use what

| Need | Use |
|---|---|
| A post's comments/reactions | The read's `ref` filter (simpler, same boundary) |
| Engagement counts for a batch of posts | The read's `count` shape (`readRefCounts`) |
| Arbitrary filtering, joins, aggregation | `w.query` |

The fixed shapes are faster to write; the query engine is the escape hatch
for everything else. Both run through the same boundary.

## Try it

The [Query playground](/docs/query/) is this exact surface, live: sign in,
write a `SELECT`, hit Run. It's read-only by construction — the playground
can't leak past the signed-in user's data.
