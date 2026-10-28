# HTTP Request Logging Boundary

Protocol repair B-4: automatic API request logs must preserve useful diagnostics
without becoming a second store of bearer credentials, passwords or app content.
Token-in-body transport, node-readable data and D56 telemetry remain intentional;
none requires copying arbitrary HTTP content into diagnostics.

## Allowed Record

`api/app/middleware.py` records timestamp, service, severity, allowlisted HTTP
method, the matched server route template (or `<unmatched>`), response status and
latency until the downstream response is available (not stream-transfer time).
The message is composed only from those fields. Request/response body,
meta, origin and user_key columns remain empty for middleware-generated rows;
the existing ClickHouse layout is retained, with no migration or credential change.

Do not read request bodies, decode unverified JWTs for attribution, inspect
headers/query strings/raw paths, consume response iterators, or copy error detail
for automatic logging. Unknown secret field names and transformed echoes make
field-name redaction insufficient. Store-write failure emits a fixed diagnostic,
not exception text/traceback that may itself contain credentials or row values.

Return the original response, retaining streaming, duplicate headers/cookies,
background tasks and client-visible payloads. Keep method/route/status/latency
and severity diagnostics; do not add a silent request-origin/auth-context owner.
Any future trusted attribution/context must be integrated with its actual issuer/
authorization boundary rather than reintroducing unsigned body-derived metadata.

## Limits

This contract covers automatic middleware rows and their insert-failure logger,
not every logger in the application. Main exception handling, explicit SDK/E2E
log intake, query SQL logging and import traces have separate findings/handoffs.
Uncaught downstream exceptions still follow the existing exception-handler path;
this change does not catch or rewrite them. It does not change auth, permissions,
CORS, group/media access, telemetry consent, or client response contracts.

Existing rows, backups, proxy logs, artifacts and previously exposed credentials
are not scrubbed or rotated by a code change. Historical assessment and approved
operational actions remain separate. B-4 source repair and a green repro do not
imply whole-file PASS, deployment closure or model-diverse three-dry sign-off.

## Query Diagnostics Strategy

Agreed with the operator, 27.10.2026, for L1-G-01. The [local repair](../../security/scans/2026-10/repair-g01-query-logging.md)
implements this target; integration/deployment/sign-off remain open. Open-source SQL structure is not
secret; values in an individual user's query can be private input. Node-readable
execution is intentional, automatic duplication into retained logs is not.

- Routine diagnostics retain normalized query shape, literal types/lengths, execution duration, row counts and a correlation ID, using allowlisted metadata rather than arbitrary caller text.
- Build the shape from the SQL parser/AST, not regex or substitutions in the raw string. Replace literal values with placeholders and omit comments. Quoted identifiers and other caller-controlled AST text can also carry content: do not assume literal removal alone makes generated SQL safe. Normalize or omit those fields before logging.
- Cover both submitted and compiled SQL paths. Parse/normalization failures fall back to fixed diagnostics, never raw SQL or exception text that can echo it. Do not change the query executed, access checks or client response contract merely to sanitize logs.
- Exact-value reproduction uses synthetic input or an operator deliberately supplying a failing query in a controlled debugging session. This does not authorize an automatic raw-query debug flag, production log capture or retention of user values.

Repair acceptance requires synthetic content canaries in literals, comments,
quoted identifiers and failure paths to be absent from captured logs, while
useful query-shape/execution diagnostics and legitimate query results remain.
Use real parser/compiler paths where feasible, red -> green evidence and fresh
design-intent review. Historical logs/retention and deployment remain separate.

Local implementation records AST node class/parent topology, not re-emitted SQL:
all scalar names/values and comments are omitted, literal categories/lengths
retained, with a 128-node truncation marker. Parser fallback warnings, execution
errors and result aliases cannot reintroduce those values in these diagnostic
records. Exact names/values remain available to query execution and its caller,
not automatically copied into logs. The repair receipt records lost diagnostic
detail, external-parser compatibility and dependency-upgrade risks.
