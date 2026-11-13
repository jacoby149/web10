# Canonical service names

Operator direction, 13.11.2026: `Posts` and `posts` identify the same service.
Normalize ASCII uppercase to lowercase; ordinary names start with a letter and
contain only ASCII letters, digits, hyphens and underscores, 1–64 characters.
Reject whitespace, dots, slashes, quotes, controls and Unicode rather than
stripping or repairing them. Reserve infrastructure/query names and the `group`
management key. Only group permission metadata may use `*` or `group`.

Local implementation: one shared validator for API service fields,
permission keys and query service references. Case-colliding permission keys
are rejected, never merged. Query spelling/aliases remain intact while the
boundary CTE filters the canonical lowercase collection. SQL literals, column
names, body fields, role names, group IDs and permission operation codes are not
lowercased. Existing auth checks, parameterization and AST restrictions remain.

The preceding implementation was case-sensitive throughout CRUD/storage/grants.
Operator-authorized read-only production metadata checks across all retained
history found 10 document service names, 18 app-map keys, 11 group-map keys and
3 legacy role-service keys, all lowercase, no collisions or out-of-alphabet
ordinary names, maximum length 31; app/group JSON malformed counts were zero.
Queries used readonly mode, five-second/256-MiB/two-thread bounds and returned no
bodies, principals or credentials. The original inventory is documented in the
separate permissions UI PR #1541; this is runtime protocol work on its own branch.

No automatic database rewrite or production activation. Existing mixed-case,
out-of-policy or colliding data/grants on other nodes require an explicit
inventory/compatibility decision before rollout. Tests and independent security
review must establish normalization and denial across all ingress paths; source
and mocked storage results are not a connected-storage or whole-security PASS.
The query compiler rejects noncanonical stored authorization/readability scopes;
it does not silently fold an old differently cased grant onto another collection.

## Full production sweep

A second operator-requested read-only sweep enumerated service-bearing columns
from `system.columns`, then checked all retained history against the complete
`[a-z][a-z0-9_-]{0,63}` convention. Results:

| Surface | Distinct names | Uppercase / malformed / collisions | Max length |
|---|---:|---|---:|
| `documents.collection_name` | 10 | 0 / 0 / 0 | 27 |
| App permission keys | 18 | 0 / 0 / 0 | 31 |
| Group permission keys | 11 | 0 / 0 / 0 | 27 ordinary |
| Legacy group service lists | 3 | 0 / 0 / 0 | 8 ordinary |
| `content_events.service` | 1 | 0 / 0 / 0 | 5 |
| Legacy `service_contracts.service_name` | 0 | 0 / 0 / 0 | — |
| `logs.service` | 1 | 0 / 0 / 0 | 3 |

Group `*`/`group` keys are expected permission metadata, not ordinary collections;
log `service` is a diagnostic label, not collection authority. App permissions
and group roles have zero malformed-JSON rows. Each SELECT used read-only mode,
five-second/256-MiB/two-thread/10,000-row bounds. No production rows, grants,
schema, files, containers or environment were changed. This dated inventory is
not permission to deploy, nor a promise about future writes or other nodes.
