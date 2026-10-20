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
