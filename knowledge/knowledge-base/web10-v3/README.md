# web10 v3 — Final Decisions

This folder holds the finalized, authoritative documentation for web10 v3.

Everything here is decided. Everything else is brainstorming.

## Brainstorm

Work-in-progress ideas, alternatives, and explorations live in `web10-v3-brainstorm/`. When a direction is picked and finalized, it moves here.

## Structure

```
web10-v3/
├── README.md              ← you are here
├── sdk/                   ← the JavaScript/TypeScript SDK
│   ├── api.md             ← surface: CRUD, groups, $sort, $match, $query
│   └── implementation.md  ← ClickHouse SQL behind every SDK call
├── schema/                ← the data model
│   ├── clickhouse.md      ← complete schema: tables, indexes, patterns
│   └── contracts.md       ← service contracts, group contracts, blacklists
├── groups/                ← groups as a platform primitive
│   ├── overview.md        ← policy containers, roles, join policies
│   └── identity.md        ← profiles, URLs, service-scoped roles
└── social/                ← web10-social implementation
    ├── overview.md        ← how social uses groups: discover, follows, communities
    └── group-policy-example.json.md ← concrete role/permission examples
```

## Quick Links

- **SDK** — `sdk/api.md` (surface), `sdk/implementation.md` (SQL)
- **Schema** — `schema/clickhouse.md` (tables), `schema/contracts.md` (contracts)
- **Groups** — `groups/overview.md` (primitive), `groups/identity.md` (profiles)
- **Social** — `social/overview.md` (implementation), `social/group-policy-example.json.md` (examples)

## Decisions

Decisions land here as they're made:
- Architecture
- Data models
- Protocols
- Security invariants
- Group system
- Service contracts

If it's not here, it's not decided yet.