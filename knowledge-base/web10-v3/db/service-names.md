# Service names: current behavior and the lowercase target

An app should not accidentally create a second collection by spelling `posts`
as `Posts`. The operator's direction on 13.11.2026 is one case-insensitive
service identity, stored and authorized under a canonical lowercase name.

## What works today

**The current implementation is case-sensitive.** Document request models accept
an ordinary string. The document endpoint passes it unchanged to app/group
authorization and storage. `insert_document` stores it unchanged in
`documents.collection_name`; reads compare that column with the supplied string.
App permissions use `perms.get(service_name)`, and group permissions use the
exact service key before their existing wildcard fallback. The query compiler
also checks referenced service names against exact allowed names and emits an
exact collection-name filter.

Consequently, a `posts` app grant does not grant `Posts`, and storing under
`Posts` does not make that data part of `posts`. This is unlike usernames,
which already normalize to lowercase. The UI's readable labels do not change
service identity.

Source: `api/app/v3/models/documents.py`, `endpoints/documents.py`,
`services/clickhouse.py` (`insert_document`, `read_documents`, `has_permission`,
`_effective_allows`) and `services/safe_query.py` (relative to `api/app/v3/`).
An offline check executes those storage/grant function bodies with inert storage:
case is preserved, the exact grant succeeds, and its case variant is denied.
That is not an HTTP or real-database normalization test.

## Intended naming contract — enforcement still OPEN

- Use ASCII letters, digits, hyphens and underscores, starting with a letter.
- Accept ASCII uppercase input and normalize to lowercase; `Posts` means `posts`.
- Reject spaces, dots, slashes, quotes, control characters, Unicode lookalikes
  and other symbols, rather than trimming or silently removing them.
- Proposed length bound: **1–64 characters**. After normalization the proposed
  ordinary-name grammar is `^[a-z][a-z0-9_-]{0,63}$`.
- Keep `*` and `group` context-specific permission metadata, not ordinary document
  collection names. Retain query-engine reserved-name protections independently
  of this grammar; matching the pattern is not SQL or authorization approval.
- Reject a request containing case-colliding permission keys such as both
  `posts` and `Posts`; never silently union grants under a normalized key.

The alphabet/lowercase direction is operator-approved. The 64-character bound,
complete reserved-name policy and compatibility details need protocol-owner
review before implementation. Do not describe this section as deployed validation.

## Production inventory — 13.11.2026, read-only

Operator-authorized SSH verified the intended host and exact production API
container, then used its existing database client without exporting credentials.
SELECTs were limited to five seconds, 256 MiB, two threads and 10,000 result rows,
with read-only mode and overflow errors. Only service identifiers and aggregate
validation counts were returned; no bodies, principals, tokens or grant records.

Across **all retained history**, not just undeleted rows:

| Surface | Distinct service keys |
|---|---:|
| Documents (`collection_name`) | 10 |
| App-permission map keys | 18 |
| Group-permission map keys | 11 |
| Legacy group role service lists | 3 |

All discovered keys are lowercase, with **zero case collisions**. Excluding
reserved `*`/`group`, all match the proposed alphabet and letter-first rule.
The longest observed key is 31 characters. No malformed JSON was found in the
app-permission or group-role columns. This supports compatibility on this node
at this observation time, not on every self-hosted node or after future writes.
No data/grant mutation, deployment, environment change or service restart occurred.

## Implementation boundaries

Canonicalization must agree across document create/read/update/delete, media and
deferred writes, app grants, group role maps, delegated service scopes, query
references/boundary filters and SDK/UI declarations. Do not add `.lower()` only
to one endpoint and strand differently cased rows or permissions elsewhere.

Before rollout, inventory the target node again and refuse unresolved historical
case collisions or out-of-policy names. Preserve the original data and authority;
legacy compatibility or migration is a separate reviewed decision, never automatic
grant merging. Tests must cover mixed-case CRUD/grant/query equivalence, invalid
names, reserved/wildcard handling, collision denial and unchanged I3 boundaries.
Keep parameterization, query AST validation and live authorization checks intact.
Implement in small protocol/security-owned PRs, separate from the permission UI.
