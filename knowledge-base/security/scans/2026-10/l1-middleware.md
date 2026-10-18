# L1: API request logging

Users need credentials to remain credentials, not become log data. This first
bounded scan checks the logger itself; it does not claim coverage of the API.

## Receipt

- Unit: `api/app/middleware.py`, lines 1-143, entire file, including blank lines.
- Level: L1, file-local only.
- Source commit: `d86658be6d9bb202bbab981a918a6b69c9bde966` (`origin/dev` at scan time).
- Date: 2026-10-18.
- Scanner: OpenCode, model `openrouter/openai/gpt-6.1-sol`.
- Result: **OPEN**, existing finding **B-4 reproduced**, not a new finding or fix.
- Runtime changes: none. No live database, network, production credentials, or user data used.
- Independent convergence reviews: not performed; no three-dry sign-off claimed.

## Orient

Read the security learnings, I1-I6, thesis (D41), security record, checklist,
scope/record rules, running procedure, plan/lane queues, and recent changelog.

- Onboarding: B-4 already describes body logging; token-in-body is intentional.
  Do not change credential transport or re-open the accepted cookie/E2E decisions.
- Recession: B-4 is still present at this commit. This is outstanding debt,
  not a regression of a proven merged fix. Old PR references do not close it.
- Obvious gap: truncation is not redaction. Error `meta` and `message` are separate
  copies of response content, so a body-only repair would leave a local leak path.

## Line-by-line coverage

| Lines | Inspected behavior | L1 judgment |
|---|---|---|
| 1-16 | Imports, logger, 4096-character body limit | No embedded credential; limit is not sanitization. |
| 17-57 | `_insert_log`, explicit table/columns, insert exception handling | B-4 sink: body/meta values go straight to insert arguments. No SQL string construction from input; driver behavior not audited at L1. |
| 58-69 | `_extract_user_key`, unsigned JWT decode, fallback | Unverified username is log attribution only within this file, not an authorization decision. Do not relabel it B-3; downstream trust in this column remains an L2+ question. |
| 70-73 | `_truncate` | Keeps the first 4096 characters verbatim, including short credentials. |
| 74-83 | Body capture, attribution, origin, downstream invocation | Request JSON is copied without field filtering before downstream handling. Origin is recorded, not enforced here; endpoint auth/CORS are outside this file. |
| 84-101 | Response buffering, truncation, severity/message | Response JSON also copied verbatim. Full buffering is a reliability concern, not an additional C+I finding under this checklist. |
| 102-113 | Error detail and JSON duplication | B-4 also affects `meta` (untruncated error JSON) and `message` (error detail). |
| 114-143 | Response reconstruction, scheduled insert, return | Secret-bearing copies reach `_insert_log`; probe runs the actual scheduled sink. Returned response still carries its original status. |

Checklist coverage: access control (unsigned decode traced only within file; no
local auth decision); injection (JSON parsing only, fixed insert destination,
no shell/eval/template/path sink); boundaries/transport (no outbound fetch,
cookie setter, or postMessage; no query string copied by `url.path`); lifecycle
and hygiene (B-4 persists secrets to log insert arguments). Storage retention,
log-reader authorization, middleware registration, exception paths outside this
function, and downstream response/header semantics are not established by L1.
No new threat class or confirmed independent vulnerability is claimed.

## B-4: demonstrated secret logging

Severity: **High**, credential exposure to the log store; exploitability by a
particular log reader and production historical exposure are not tested here.

Precondition: `log_requests` is invoked with JSON containing a credential, or
the downstream response contains one. No special token validity is required for
the logger to copy it. A successful local probe proves the secret reaches the
ClickHouse client's insert arguments, not that a real database accepted a write.

Request path: lines 77-78 -> 136 -> 33. Response path: 85-89 -> 137 -> 34.
Error copies: 104-110 -> 135/138 -> 32/35. Existing B-4 owns all these copies.

Run the following from the repository root with Python 3, PyJWT, FastAPI and
Starlette installed (the API environment provides them). This is a temporary
evidence probe, not a committed permanent test. It imports the real middleware
and substitutes only its ClickHouse dependency with an in-memory sink.

```python
import asyncio
import importlib.util
import json
import sys
import types
from unittest.mock import patch
from starlette.requests import Request
from starlette.responses import StreamingResponse

async def main():
    rows = []
    ch = types.ModuleType("app.v3.services.clickhouse")
    ch.client = types.SimpleNamespace(insert=lambda table, values, column_names:
        rows.extend(dict(zip(column_names, value)) for value in values))
    modules = {"app.v3.services.clickhouse": ch}
    for name in ("app", "app.v3", "app.v3.services"):
        modules[name] = types.ModuleType(name)
        modules[name].__path__ = []
    modules["app.v3.services"].clickhouse = ch
    with patch.dict(sys.modules, modules):
        spec = importlib.util.spec_from_file_location("scanned_middleware", "api/app/middleware.py")
        middleware = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(middleware)
    request_canary = "SYNTHETIC_REQUEST_TOKEN_NOT_A_CREDENTIAL"
    response_canary = "SYNTHETIC_RESPONSE_TOKEN_NOT_A_CREDENTIAL"
    detail_canary = "SYNTHETIC_ERROR_DETAIL_NOT_USER_DATA"
    for status in (200, 400):
        async def receive():
            return {"type": "http.request", "body": json.dumps({"token": request_canary}).encode()}
        request = Request({"type": "http", "method": "POST", "path": "/synthetic",
            "headers": [], "query_string": b""}, receive)
        async def call_next(_):
            return StreamingResponse(iter([json.dumps({"token": response_canary,
                "detail": detail_canary})]), status_code=status)
        response = await middleware.log_requests(request, call_next)
        await asyncio.sleep(0)
        assert response.status_code == status
        row = rows[-1]
        assert request_canary in row["request_body"]
        assert response_canary in row["response_body"]
        if status == 400:
            assert response_canary in row["meta"]
            assert detail_canary in row["message"]
        print(f"status={status}: raw request/response canaries reached ClickHouse insert arguments")
    print("status=400: error JSON token also reached meta; detail reached message")
    assert len(rows) == 2
    print("B-4 reproduced using real log_requests + _insert_log; no database/network used")

asyncio.run(main())
```

Observed output (all assertions passed):

```text
status=200: raw request/response canaries reached ClickHouse insert arguments
status=400: raw request/response canaries reached ClickHouse insert arguments
status=400: error JSON token also reached meta; detail reached message
B-4 reproduced using real log_requests + _insert_log; no database/network used
```

## Follow-up

**B-4 remains OPEN.** One separate fix PR must protect request/response bodies
and their error copies without changing the intentional token transport. Commit
the exploit as a pinning test, demonstrate vulnerable red -> denied green, and
write back the fix. Coordinate with existing extraction S1 rather than duplicate
its implementation. Historical credential exposure/rotation needs separate
operational assessment; this synthetic scan does not establish its extent.

Next L1 scan: `api/app/settings.py`, entire file, with credential values redacted
from reports. No L2 or whole-API PASS follows from this single-file receipt.
