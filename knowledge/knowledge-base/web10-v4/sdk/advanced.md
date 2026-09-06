# Advanced SDK Features (v4)

These SDK features are beyond the core v3 architecture switch. They require the foundation to be stable first.

## w.query() — CTE-Wrapped ClickHouse SQL

**Implemented in v3** (the safe-query engine). Full ClickHouse `SELECT` over
your services — the API compiles it through the safe-query engine (boundary
CTEs + block/sharing/hidden) and runs it. Read-only by construction: raw node
tables, table functions, and anything but a single `SELECT` are rejected before
execution. Self-joins, aggregations, subqueries, and caller CTEs all work, and
none can leak past your groups.

```ts
const results = await w.query(`
  SELECT p.doc_id, p.author_key, countIf(c.ref_value = p.doc_id) AS reactions
  FROM posts p
  LEFT JOIN reactions c ON c.ref_value = p.doc_id
  GROUP BY p.doc_id, p.author_key
  ORDER BY reactions DESC
  LIMIT 50
`)
```

The engine replaces each service name with an API-built boundary CTE, then
applies:
- `deleted = 0` (tombstone filter) + ReplacingMergeTree dedup
- Group membership check (you only see documents in groups you can read)
- Block/sharing/hidden filters (blocked authors, paused sharing, hidden docs)

**Note:** the original design wrapped the query over the raw `documents` table
with a `user_docs` CTE. The implemented design is stronger — the caller queries
*service names* that the engine rewrites to boundary CTEs, so the raw tables are
unreachable (a wall, not a membrane). See
`../web10-v3/safe-query.md` + `../web10-v3/query-engine.md`.

## PowerMean Sorting

Advanced weighted ranking with configurable signals:

```ts
const posts = await w.read('posts', {
  groups: feedGroups,
  $sort: {
    type: 'powerMean',
    fields: [
      { field: 'created_at', type: 'time', weight: 0.6, half_life: 24, boost: 1 },
      { field: 'ref_count', type: 'ref_count', collection: 'reactions', weight: 0.6, boost: 2 },
      { field: 'ref_count', type: 'ref_count', collection: 'comments', weight: 0.4, boost: 0.5 },
    ],
    balance: -1,
  },
  $limit: 50,
})
```

Each field has:
- `type` — how the API normalizes the signal (`time` or `ref_count`)
- `weight` — how much it contributes to the power mean (0 = ignored)
- `boost` — multiplier applied after normalization, before combining (default 1)
- `half_life` — for `time` fields, decay in hours (0 = no decay)
- `collection` — for `ref_count`, which collection to count from

`balance` controls how signals combine:

| balance | Effect | Example |
|---|---|---|
| +5 (Extreme) | Best signal dominates | A post with 1000 reactions ranks high even if it's old and has no comments. |
| +1 (Loose) | High signals pull up | A post great in one area beats one that's mediocre everywhere. |
| 0 (Flat) | Geometric mean | All signals matter equally in log space. |
| -1 (Tight) | Low signals pull down | A post with zero comments can't rank high, even with tons of reactions. |
| -5 (Strict) | Weakest signal dominates | A post must be good across all dimensions. |

The API normalizes signals, computes the power mean score in ClickHouse, and returns pre-sorted results. No client-side scoring.

## Cross-Node Addressing

Optional `username` and `provider` on every CRUD call:

```ts
const posts = await w.read('posts', {}, 'alice', 'api.web10.app')
```

No provider = hits your own node. Provider = routes to that node's origin. The SDK constructs the URL as `${protocol}//${provider}/${username}/${service}`.

## Enforced Schemas (from document-typing.md)

The v3 document typing convention is weak — the API trusts the `type` field. v4 plans to enforce schemas:

**Service contract schema** — the service declares its schema. The API validates against it.

```
service:cats → schema:
  cat: {type: text, required: true}
  cat-pic: {type: minio, required: false}
  age: {type: number, required: false}
```

**Per-document schema** — each document carries its schema:

```json
{
  "$schema": "cats-v1",
  "cat": {"type": "text", "value": "henry"},
  "cat-pic": {"type": "minio", "value": "alice/henry.png"},
  "age": {"type": "number", "value": 5}
}
```

**The plan:**
1. Start with weak typing (current convention)
2. Add schema validation to service contracts
3. Add `$schema` field to documents
4. Enforce schema at write time
5. Validate schema at read time

## Provider Service Contracts (from cross-app-sharing.md)

Providers control which apps participate on their nodes. Two levels of service contracts:

**User level** — which websites can access my data (CORS, browser-enforced)
```
service:notes → allowed: notesapp.com
```

**Provider level** — which apps can participate on this node (server-enforced)
```
provider-a:
  allowed apps: notesapp.com, mailapp.com
  blocked apps: spamapp.com
```

A bad app floods the network → providers block it at the node level. The provider protects itself. The user protects their data. Two layers.

## Summary

v3 has: basic CRUD with groups, `w.query()` (the flexible read), simple sorting (`created_at:desc`), weak document typing, user-level service contracts.
v4 adds: `powerMean` sorting, cross-node addressing, enforced schemas, provider-level service contracts.