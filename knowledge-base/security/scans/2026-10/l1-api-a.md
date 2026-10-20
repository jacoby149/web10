# L1 API A: App Assembly and System Surface

Date: 2026-10-18. Scanner: OpenCode/gpt-6.1 sol (API ID `openrouter/openai/gpt-6.1-sol`).
Pinned source: `8af7e0fce922cada30002dff190a5bb3abcf4f63`; HEAD matched and scoped `git diff <pin> -- <owned paths>` was empty.
Coverage complete: 794/794 assigned lines, including comments/imports/blanks; disposition **OPEN**. No fix or independent review/signoff.

## Exact Coverage

| Whole file | Lines | Symbols/ranges inspected |
|---|---:|---|
| `api/app/main.py` | 1-176 (176) | imports/app 1-28; CORS/middleware/routers 31-48; startup 51-78; map 81-98; CORS/map helpers 101-127; JWT/generic/validation handlers 130-176 |
| `api/app/docs.py` | 1-52 (52) | description and every tag |
| `api/app/exceptions.py` | 1-180 (180) | every HTTPException constant, LOGIN through SCHEMA_INVALID |
| `api/app/endpoints/system.py` | 1-386 (386) | imports/router 1-20; root/certify/ice 23-70; setup 73-117; config/admin 120-169; telemetry/event/admin analytics 172-249; ready 252-262; pwa_listing 265-302; bug submit/list/detail 305-386 |
| `api/app/__init__.py` | empty (0) | no executable content |
| `api/app/endpoints/__init__.py` | empty (0) | no executable content |
| `api/app/services/__init__.py` | empty (0) | no executable content |

## Orient

- Onboarding: read AGENTS, strategy inventory/thesis, plan/lane queues, recent changelog, security learnings/record, I1-I6, security method/checklist/design-intent gate and October backend audit. Main remains queued; middleware/settings receipts are not rescanned.
- Recession: B-5 remains a load-bearing wildcard/no-credentials assumption, not a demonstrated CORS exploit. B-3's optional bug attribution is not authorization. The older audit's claim that exception messages reveal no runtime secrets is not a valid premise.
- Gap: public-source visibility does not imply runtime-value publicity; error text and caller-selected manifest destinations need separate inspection. Storage/helper assurances remain L2+.
- Intent: preserve body tokens, generic primitives, operator config and D41/D56. This read-only receipt is not an independent design-intent review.

## Checklist Dispositions

| Class | Local disposition |
|---|---|
| 1 Access control / I1-I3,I5 | Config/analytics/report admin routes call check_admin; setup uses node_has_users; certify/ice delegate to certify. No missing gate inferred from delegation. Public setup status, telemetry and submission are intentional. Storage authority and bootstrap race require L2+. |
| 2 Injection | No local SQL/shell/eval/pickle/template/file-path execution. JSON parsing is data, not executable deserialization. User report/event fields enter uninspected CH helpers; parameterization/rendering unverified. |
| 3 Boundaries/transport | L1-A-02; B-5 configuration present at main:38-43, credentials not enabled here; no browser-wide transport assurance. No local cookie/postMessage or credential-URL construction. |
| 4 Availability | Separate reliability: report/beacon bodies and admin pagination unbounded locally; manifest response bounded to 256 KiB and timeout=1, not a whole-flow resource guarantee. |
| 5 Lifecycle | Setup check then config/key/admin writes are non-atomic locally; cross-worker and last-user-reset behavior unverified. Persistence/retention/tombstones are delegated. |
| 6 Hygiene | L1-A-01 unverified disclosure handoff; unredacted sink demonstrated, no protected-data leak confirmed. No literal runtime credential in these files. /ready also interpolates DB exception text; concrete secret-bearing DB failure unverified. Static docs/error constants contain no runtime values. |
| I4/I6 | Readable node respected, not a finding. No cross-store federation query here; imported services/startup routines uninspected. |

## Confirmed Findings

**L1-A-02: unrestricted manifest fetch destination and returned JSON (OPEN).**
`system.py:268-293` accepts an arbitrary URL without registration/IP/scheme validation, appends `/manifest.json`, and returns parsed fetched JSON. Calling real pwa_listing with `http://127.0.0.1:8123/internal` reached the fake GET sink at `/internal/manifest.json` and returned synthetic internal JSON. Demonstrates local SSRF/read-proxy primitive; internal network services/redirect behavior and deployment egress are not tested. The response must be successful JSON within the cap; no arbitrary non-JSON read claim.

## Probe Reproduction

Executed `python3 - <<'PY' ... PY` locally, using this extraction setup (real pinned function bodies, only decorators removed):
```python
import ast, asyncio, json, logging, subprocess, uuid, jwt, requests
from types import SimpleNamespace as N
from fastapi import status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
P = '8af7e0fce922cada30002dff190a5bb3abcf4f63'
def load(path, names, env):
    t = ast.parse(subprocess.check_output(['git','show',P+':'+path], text=True))
    ns = [n for n in t.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in names]
    assert {n.name for n in ns} == set(names)
    for n in ns: n.decorator_list = []
    exec(compile(ast.Module(body=ns,type_ignores=[]),path,'exec'),env)
logs=[]; logger=N(error=lambda *a,**k: logs.append(str(a)))
a=dict(jwt=jwt,Request=object,RequestValidationError=RequestValidationError,JSONResponse=JSONResponse,status=status,uuid=uuid,logging=logger,_EXCEPTION_MAP={})
load('api/app/main.py',['_with_cors','_mapped_response','bare_exception_handler','validation_exception_handler'],a)
c='SYNTHETIC_RUNTIME_CREDENTIAL'
r=asyncio.run(a['bare_exception_handler']('fake-request',RuntimeError(c)))
v=asyncio.run(a['validation_exception_handler']('fake-request',RequestValidationError([{'loc':('body','password'),'msg':'bad '+c,'type':'value_error','input':c}])))
assert c.encode() in r.body and c.encode() in v.body and c in str(logs)
calls=[]
class Response:
    def __enter__(self): return self
    def __exit__(self,*a): pass
    def raise_for_status(self): pass
    def iter_content(self,**k): return [b'{"synthetic_internal":"fixture"}']
def get(url,**kw): calls.append(url); return Response()
e=dict(requests=N(get=get,exceptions=requests.exceptions),json=json,exceptions=N(NO_PWA=RuntimeError('NO_PWA')),log=logger)
load('api/app/endpoints/system.py',['pwa_listing'],e)
assert e['pwa_listing']('http://127.0.0.1:8123/internal')=={'synthetic_internal':'fixture'}
assert calls==['http://127.0.0.1:8123/internal/manifest.json']
```
Results: all assertions passed; exit 0. FastAPI status alias deprecation warning only. No network, DB, startup or app import executed.

## UNVERIFIED L2+ Handoffs

**L1-A-01: demonstrated unredacted error sink; unauthorized sensitive disclosure UNVERIFIED.**
`main.py:145-164` returns `str(exc)` and logs it; `169-174` stringifies/logs validation errors and returns that string. Directly invoking real handlers with a synthetic RuntimeError and manufactured RequestValidationError produced 500/422 bodies and captured logger arguments containing the canary. This proves copying at the sink only: neither probe supplies a reachable protected-value source or demonstrates that a requester receives data they are not entitled to see. No confirmed protected-data leak, production incident or actual credential exposure. Related B-4 logging concern, not a duplicate confirmed middleware finding.

- Trace actual error producers for secret/other-user values, validation-library versions and request-to-handler reachability; /ready error disclosure; downstream log duplication/retention remains B-4-related debt.
- Trace startup/schema helpers, config/key persistence, setup concurrency/reconfiguration and admin gate/credential lifecycle. No claim that helper names/comments establish safety.
- Trace optional unsigned report attribution (B-3) into bugbot/render consumers; telemetry/report SQL binding and retention. B-6 storage reads are not covered here; B-2/B-8 settings and B-7 accepted lifetime are not newly adjudicated.
- Pin B-5's actual credential-free browser boundary with route/transport tests; this scan did not establish whether all existing tests cover it.
