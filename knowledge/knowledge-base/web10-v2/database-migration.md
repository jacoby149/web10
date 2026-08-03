# Database Migration: MongoDB → FerretDB/DocumentDB

## Why

web10 was built on MongoDB from the start — `pymongo`, the Mongo wire protocol, 
collections-per-user, service records, whitelists, the whole stack spoke Mongo.

But MongoDB is not fully open source. Starting with Server Side License v2 
(2023), MongoDB requires commercial licensing for production deployments above 
a certain threshold. That conflicts with web10's ethos: an open protocol for 
open data, hosted anywhere, by anyone.

The goal was simple: **swap the database without touching the application code.**

## The Stack

Everything lives in the document store — user data, contracts, star records, 
service terms. The web10 service reads the contracts from the database to 
enforce them:

```mermaid
graph LR
    R["PATCH /alice/posts"] --> S["web10 service"]
    S -->|"1. read star record"| STAR["star record (*)"]
    STAR -->|"2. user exists"| S
    S -->|"3. read service term"| SVC["services term"]
    SVC -->|"4. contract"| S
    S -->|"5. ALLOW / DENY"| DATA["posts, inbox, dms..."]
    
    style R fill:#f5f5f5,stroke:#333,color:#000
    style S fill:#fff9c4,stroke:#f57f17,color:#000
    style STAR fill:#fff3e0,stroke:#e65100,color:#000
    style SVC fill:#e8f5e9,stroke:#2e7d32,color:#000
    style DATA fill:#e3f2fd,stroke:#1565c0,color:#000
```

Double security: the star record (`*`) is checked first — it proves the user 
exists and carries their verification status, credits, and space limits. Then 
the service term record is read from the `services` collection — it carries 
the whitelist and blacklist for that specific service. Both live in the user's 
own collection. Both must pass.

The database holds everything. The web10 service is the enforcement layer — 
it reads the rules from the database and applies them before any data touches 
the network.

## The Swap

The application code changed nothing. `documentdb.py` still imports `pymongo`, 
still uses `MongoClient`, still writes `db[user].find_one()`. The only thing 
that changed was the connection string:

```
# Before (MongoDB Atlas)
mongodb+srv://web10:password@cluster0.mongodb.net/myFirstDatabase

# After (FerretDB/DocumentDB)
mongodb://web10:web10@ferretdb:27017/
```

The `docker-compose.yml` was updated to include FerretDB + PostgreSQL as the 
default, with real MongoDB available via `--profile mongo` for compatibility 
testing:

```yaml
# Default: open-source stack
postgres:
  image: ghcr.io/ferretdb/postgres-documentdb:17

ferretdb:
  image: ghcr.io/ferretdb/ferretdb:2

# Optional: real MongoDB
mongo:
  image: mongo:7
  profiles: ["mongo"]
```

## Why It Works

FerretDB implements the MongoDB wire protocol at the network level. This means 
`pymongo` — or any MongoDB driver in any language — connects to FerretDB 
exactly as it would to MongoDB. FerretDB translates the wire protocol messages 
to PostgreSQL queries backed by the documentdb extension.

The web10 codebase uses standard MongoDB operations that FerretDB supports:

- CRUD (`insert_one`, `find`, `find_one_and_update`, `delete_many`)
- Queries with operators (`$set`, `$inc`, `$match`, `$in`, `$ne`, `$exists`)
- Aggregation pipelines (`$group`, `$sort`, `$limit`, `$unwind`, `$addFields`, etc.)
- Text indexes (`$text` search)
- Capped collections (metering events)
- Collection-level stats (`collStats`, `dbstats`)

## Benefits

- **Fully open source** — AGPLv3 for FerretDB, PostgreSQL license for the backend
- **Self-hostable** — no Atlas dependency, runs in docker-compose alongside the app
- **Same API** — zero application code changes
- **MongoDB remains supported** — flip `DB_URL` and you're on real Mongo
- **PostgreSQL durability** — ACID compliance, WAL, proven storage engine

## Trade-offs

- **Feature parity** — FerretDB covers the MongoDB features web10 uses, but not 
  every MongoDB feature exists. The aggregation pipeline validation in 
  `documentdb.py` already constrains what stages are allowed, which happens to 
  align with FerretDB's supported subset.
- **Performance** — FerretDB is a translation layer. For web10's workload 
  (small per-user collections, read-heavy discovery queries), the overhead is 
  negligible. The `total_s3_size()` function even has a 60-second cache to 
  avoid repeated cross-collection scans.
- **`collStats`** — FerretDB/DocumentDB returns a PostgreSQL-derived estimate 
  rather than exact MongoDB stats. This is acceptable for space-gating (the 
  quota check in `crud.check()`), which only needs an approximate byte count.

## Timeline

1. **Phase 1 (origin):** MongoDB Atlas clusters for development and early production
2. **Phase 2:** FerretDB added to `docker-compose.yml` as an optional profile
3. **Phase 3:** FerretDB/DocumentDB promoted to default; MongoDB moved to `--profile mongo`
4. **Now:** Both backends are supported, FerretDB is the default for local and self-hosted deployments