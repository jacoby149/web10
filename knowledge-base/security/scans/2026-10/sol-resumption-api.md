# Sol Resumption: API Repair Drift

2026-10-28, verified UTC 21:27:44. Scanner: parent Sol, known model
`openrouter/openai/gpt-6.1-sol` (OpenCode). No independent reviewer/family used.
HEAD: `49178a87dcd651337e7f17dea68b66f377ae2e05`, commit timestamp
`2026-10-28T17:14:48-04:00`. Baseline: `1332abc678344d24dc6f85227549dda2b0bef9a9`.
Disposition: **OPEN**. Backend-first bounded resumption, not entire-project
completion, L1 security PASS, L2/L3/L4 completion or diverse three-dry sign-off.

## Orientation And Scope

Read root AGENTS completely; browsed strategy, thesis, changelog top, security
learnings, security-method README and complete six-class checklist. Read current
index, identity/data/store A-C and API-review receipts before runtime inspection;
also OAuth specification and HTTP/query logging contract. S1/S3/S4/S5 obligations
remain; historical coverage is not a fresh reread. Plan/lane security/OAuth searches
were truncated, not complete reads of those large documents.
Onboarding: issuer trust/defaults, unsigned decoder footgun and no storage ACL
backstop persist. Recession: check repaired freshness and diagnostics separately
from unchanged admission/revocation boundaries. Obvious gap: verified/fresh identity
is not live client authority; error formatting can become another credential store.

`git diff --name-only <baseline> <HEAD> -- api/` identified six changed first-party
app files (and tests/tools). All six app files were then read completely through
EOF, including comments/imports/blanks; full app diff also inspected:

| Path relative to `api/app/` | Inclusive fresh whole-file read |
|---|---|
| `services/auth.py` | 1-143 |
| `settings.py` | 1-140 |
| `v3/endpoints/access.py` | 1-136 |
| `v3/endpoints/query.py` | 1-353 |
| `v3/services/import_worker.py` | 1-1043 |
| `v3/services/safe_query.py` | 1-550 |

Six-file total: 2,365 lines. Additional unchanged whole-file reads:
`v3/endpoints/oauth.py:1-197`, `v3/endpoints/auth_helper.py:1-44`,
`main.py:1-176`. **Partial store read only:**
`v3/services/clickhouse.py:250-318,2105-2442` (DDL, contracts, clients, code/refresh
lifecycle); not a whole-file reread of its 5,317 lines. Store was unchanged since
baseline. Tests freshly read: `api/tests/conftest.py:1-142`,
`test_token_freshness.py:1-211`, `test_query_logging.py:1-180`,
`test_import_trace_isolation.py:1-236`, `test_settings_diagnostics.py:1-52`.
Attempted `v3/endpoints/accounts.py` read found no file; no coverage credited.
Changed tools, other tests, SDK/UI/deployment/artifacts are outside this receipt.

## Proven Open Local Findings

**P1 / L1-VAL-01: Credential-bearing validation diagnostics, HIGH-priority B-4/S1 residual.**
`main.py:168-175` stringifies RequestValidationError, logs it at ERROR and returns
the same string. In-process actual FastAPI POST `/v3/query` with a fresh signed
synthetic body token but missing required `sql` returned 422. Pydantic's missing
field error includes the entire input dictionary: the exact complete token was
present in both the captured root LogRecord and HTTP response. This demonstrates
a reachable protected-value source, not a fabricated secret-bearing exception.
No JWT verification occurs before this validation error. Preconditions for actual
credential disclosure: a credential-bearing malformed request and an observer of
logs/response copies who should not possess the credential. Response echo to its
own sender is not independently cross-user disclosure. Real retention/readers,
production framework versions and historical exposure untested. No real token
used. This unchanged producer is outside the repaired middleware; do not reopen
that bounded repair as a regression or claim B-4 globally closed.

**P2 / L1-OAUTH-SOURCE-01: Live client revocation skipped at OAuth authorization, BP-2/S3 continuation.**
`oauth.py:130-142` checks the destination client but accepts a fresh signed source
delegation without `certify` or source-client/contract validation.
Using the actual decoder and handler, a synthetic `client_id=revoked-source`
token was denied by actual `certify` with TOKEN when registry lookup returned
None. The same token produced a returned code and inert store call for active
`target`; lookup capture contained only `target`, never `revoked-source`.
Proven local authentication-policy inconsistency, unchanged from baseline, not
freshness regression or unsigned authentication. Requires possession of an
unexpired previously signed delegated token and a registered matching target URI.
Registry and persistence were doubles: no actual revoked row, durable code,
redemption, refreshed authority, contract escape or account takeover demonstrated.
Keep potential high-impact re-delegation as a bounded handoff, not a deployed exploit.

## Six-Class Assessment

| Class | Result across fresh scope and bounded supporting edges |
|---|---|
| Access control I1/I2/I3/I5 | Freshness rejects missing/malformed/expired user claims at verified decode; anon exception retained. P2 remains. Unsigned default decoder is metadata footgun, not newly proved unsigned auth. HS256/default key trust still OPEN; no key validity tested. Query still obtains per-service readable groups before compile. |
| Injection | Real parser/compiler exercised by logging tests; direct raw-table query denied before inert execute. Parser override preserves tested ClickHouse ordering/error semantics. No new shell/eval/archive extraction-to-disk sink in changed files. Qualified tables, lexical CTE scope, scalar functions/settings and projected capability provenance are unresolved, not certified by passing controls. |
| Boundaries/transport I5/I6 | Remote certify still derives destination from unsigned claims and trusts HTTP 200; no egress replay here. Thumbnail GET consumes parser-produced URL; destination provenance/parser constraints untraced. Account token URLs elsewhere not rescanned. No network, cookie or federation safety claim. |
| Availability | Rate budgets, caller LIMIT, archive expansion, thumbnail bytes, queues and full-history work remain separate reliability debt. Import lock-cycle regression control passes; not C+I closure. |
| Lifecycle | Code redemption race and delegated bulk-key omission reproduced with existing inert-store probe below. Code DDL still references undeclared updated_at; actual reach/schema/merge semantics remain conditional. Refresh replay invalidation before client binding is availability/order observation, not proved unauthorized access. |
| Hygiene | P1 confirmed. Settings dump, SQL-content logging and cross-job trace repairs survive focused tests; timing telemetry uses server ID/numbers, no SQL text. Defaults still exist (values withheld). Exception/face/worker diagnostics require separate reachable-source/audience tracing; no blanket safe-logging claim. |

By design: D41 readable node, D56 content-blind telemetry, body tokens, anonymous
public grants, browser no-Origin behavior and confidential OAuth clients remain.
No E2E/HttpOnly/PKCE policy reversal or ownership-only media restriction proposed.

## Commands And Results

- `git status --short`, `git rev-parse HEAD`, `git show -s --format='%H %cI %s' HEAD`: pin matched; pre-existing `ui/src/interfaces/Interface.tsx` modified, untouched.
- `git diff --name-only 1332abc678344d24dc6f85227549dda2b0bef9a9 49178a87dcd651337e7f17dea68b66f377ae2e05 -- api/`; `git diff --stat` and full `git diff` with same pins restricted to `api/app`: six app files, 153 insertions/46 deletions.
- From `api/`: `env -i PATH="$PATH" HOME=/var/folders/_s/m12h99rn72xfxy8rvjv5q1_40000gn/T/opencode PYTHONDONTWRITEBYTECODE=1 PRIVATE_KEY=synthetic-audit-signing-key-at-least-32-bytes python3 -B -m pytest -p no:cacheprovider tests/test_token_freshness.py tests/test_query_logging.py tests/test_import_trace_isolation.py tests/test_settings_diagnostics.py -q`: **127 passed, 4 subtests passed, 70 deprecation warnings**, 1.22s, exit 0. Existing dependency/store doubles; in-process HTTP only, not real services.
- P1/P2 inline `python3 -B` probe under the same clean environment: execute `tests/conftest.py` to mock boto/ClickHouse, import actual app/auth/OAuth; patch socket.connect to raise on network. TestClient POST missing sql with synthetic fresh JWT asserted 422 and exact JWT in captured log/response. Control well-shaped `sql=SELECT 1` plus malformed JWT asserted 401/no token log. Actual certify denied revoked-source token; actual authorize returned matching sink code. **All assertions passed, exit 0**. Existing root handler printed the synthetic token; no real credentials read/emitted. No probe file created.
- `git show HEAD:knowledge-base/security/scans/2026-10/l1-current-store-b.md | python3 -B -c 'import sys,re,subprocess; text=sys.stdin.read(); block=re.search(r"```sh\n(.*?)\n```",text,re.S).group(1); block=block.replace("f7aabdb26346752141f46f19c393dbadfd25ddd2","49178a87dcd651337e7f17dea68b66f377ae2e05"); subprocess.run(["/bin/sh","-c",block],check=True)'`: **exit 0**, two forced active snapshots returned `['alice','alice']`; bulk identity omission and binding/expiry/hash/media controls passed. Inert successful commands, NOT ClickHouse concurrency or private retrieval evidence.
- `git diff --name-only HEAD -- api/app`: empty. `date -u '+%Y-%m-%dT%H:%M:%SZ'`: timestamp above. No installs, live requests, external services, secrets, commit/push or runtime/central-doc changes. This receipt is the sole intentional write via apply_patch.

## Next Bounded Repair

Prioritize **S1 validation diagnostics only**, one <=500-line repair: remove raw
validation exception/input copies from automatic logs; define safe field/error
metadata and a bounded client error envelope without changing validation/status.
Pin P1 red-to-denied-green with actual routes, synthetic token/password/content
canaries and missing/nested/type-error cases; retain useful diagnosis and legitimate
422/401/success controls. Do not silently absorb generic-exception, issuer or OAuth
redesign. Separately assign P2 to S3 for source-credential authority/revocation and
valid delegation controls. DB schema/merge/race integration, historical exposure,
deployment and independent model-diverse review remain blockers to stronger claims.

## Runnable P1/P2 Replay

Run from `api/` with existing Python dependencies. No app lifespan/startup workers:
TestClient invokes actual routes in-process; conftest replaces storage dependencies.
Logs are captured before app import, never printed; assertions omit credential values.
Registry/code persistence remain inert doubles, not proof of durable delegation.

```sh
env -i PATH="$PATH" PYTHONDONTWRITEBYTECODE=1 PRIVATE_KEY=synthetic-audit-signing-key-at-least-32-bytes python3 -B - <<'PY'
import logging, runpy, socket, subprocess, warnings
from contextlib import ExitStack
from datetime import UTC, datetime, timedelta
from unittest.mock import patch
warnings.simplefilter('ignore', DeprecationWarning)
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == '49178a87dcd651337e7f17dea68b66f377ae2e05'
assert not subprocess.check_output(['git', 'diff', 'HEAD', '--', 'app', 'tests/conftest.py'])
records = []
handler = logging.Handler()
handler.emit = records.append
logging.getLogger().handlers = [handler]
logging.getLogger().setLevel(logging.INFO)
def blocked(*args, **kwargs):
    raise AssertionError('network forbidden')
with ExitStack() as stack:
    for target in ('socket.socket.connect', 'socket.socket.connect_ex',
                   'socket.create_connection', 'socket.getaddrinfo'):
        stack.enter_context(patch(target, side_effect=blocked))
    runpy.run_path('tests/conftest.py')
    import jwt
    from fastapi import HTTPException
    from fastapi.testclient import TestClient
    from app.main import app
    from app import settings
    from app.models.auth import Token
    from app.services.auth import certify
    from app.v3.endpoints import oauth
    from app.v3.models import OauthAuthorize
    from app.v3.services import clickhouse as ch
    def signed(**extra):
        claims = dict(username='audit-user', provider=settings.PROVIDER,
                      expires=(datetime.now(UTC) + timedelta(hours=1)).isoformat())
        return jwt.encode(claims | extra, settings.PRIVATE_KEY, algorithm='HS256')
    token = signed()
    client = TestClient(app)  # No context manager: lifespan intentionally not run.
    records.clear()
    response = client.post('/v3/query', json={'token': token})
    assert response.status_code == 422
    assert any(token in record.getMessage() for record in records)
    assert token in response.text
    records.clear()
    response = client.post('/v3/query', json={'sql': 'SELECT 1', 'token': 'invalid-synthetic-token'})
    assert response.status_code == 401
    assert not any('invalid-synthetic-token' in r.getMessage() for r in records)
    client.close()
    target = dict(client_id='target', redirect_uris=['https://target.invalid/cb'])
    looked, stored = [], []
    def lookup(cid):
        looked.append(cid)
        return target if cid == 'target' else None
    stack.enter_context(patch.object(ch, 'get_oauth_client', side_effect=lookup))
    stack.enter_context(patch.object(ch, 'store_oauth_code', side_effect=lambda *a: stored.append(a)))
    delegated = signed(client_id='revoked-source')
    try:
        certify(Token(token=delegated))
    except Exception as error:
        assert type(error) is Exception and str(error) == 'TOKEN'
    else:
        raise AssertionError('revoked source unexpectedly certified')
    assert looked == ['revoked-source']
    looked.clear()
    request = dict(token=delegated, client_id='target', redirect_uri=target['redirect_uris'][0])
    result = oauth.oauth_authorize(OauthAuthorize(**request))
    assert looked == ['target'] and len(stored) == 1
    assert stored[0] == (result['code'], 'target', 'audit-user', request['redirect_uri'], 60)
    try:
        oauth.oauth_authorize(OauthAuthorize(**(request | dict(redirect_uri='https://wrong.invalid/cb'))))
    except HTTPException as error:
        assert error.status_code == 400 and error.detail == 'redirect_uri_mismatch'
    else:
        raise AssertionError('wrong redirect accepted')
    assert len(stored) == 1
    assert certify(Token(token=token)) is True  # Fresh nondelegated session retained.
print('P1/P2 reproduced; 401, redirect-denial and valid-session controls passed; sockets disabled; no token output')
PY
```

Executed verbatim from `api/`, 2026-10-28: exit 0; printed the success line above
and two Starlette deprecation warnings only. Both findings reproduced; malformed
JWT, wrong-redirect/no-new-write and fresh-valid-session controls passed. No token
or captured log printed, no socket connection, no startup worker or real store.
