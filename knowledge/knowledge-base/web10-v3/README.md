# web10 v3 — Final Decisions

This folder holds the finalized, authoritative documentation for web10 v3.

Everything here is decided. Everything else is brainstorming.

## Brainstorm

Work-in-progress ideas, alternatives, and explorations live in `web10-v3-brainstorm/`. When a direction is picked and finalized, it moves here.

## Files

- `groups.md` — groups as a generic platform primitive. Policy containers, service-scoped roles, join policies, blocking, cross-app identity. No app-specific assumptions.
- `web10-social-groups.md` — how web10-social uses groups. Community groups, discover, private circles, follows. Specific roles and join policies for social use cases.
- `contract-schemas.md` — ClickHouse table schemas for service contracts, group contracts, membership, join requests, sharing toggle, blacklists.
- `group-identity-management.md` — group profile, URLs, service-scoped roles, permissions, CRUD operations.
- `sdk-api.md` — the JavaScript/TypeScript SDK. Typed `createClient()`. Groups baked into every CRUD verb. Auth, service contracts, media, aggregate, cross-node addressing. What ClickHouse each call triggers.

## Structure

Decisions land here as they're made:
- Architecture
- Data models
- Protocols
- Security invariants
- Group system
- Service contracts

If it's not here, it's not decided yet.