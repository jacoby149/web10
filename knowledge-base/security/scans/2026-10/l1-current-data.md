# Current Data API L1 Receipt

Integration: fresh evidence/design review in `l1-current-api-review.md`; B-8's working-tree overlay is not merged evidence.

- Date: 2026-10-27 (UTC command: `2026-10-27T12:23:46Z`). Model: `openai/gpt-6.1-sol` (provider ID `openrouter/openai/gpt-6.1-sol`).
- Pin: HEAD `f7aabdb26346752141f46f19c393dbadfd25ddd2`, verified before scanning. L1, complete files, not a diff-only review.
- Coverage: five data files **996/996** lines, plus middleware **94/94** and settings **140/140**, total **7 files / 1,230 lines**. Every file has a terminal LF; logical-line and newline counts agree. All imports, comments, blanks, declarations and bodies included; no gaps or overlap.
- Result: coverage complete for this assigned scope, findings/handoffs OPEN. No new demonstrated authorization exploit. Existing L1-G-01 and B-2 persist; B-8 persists at HEAD but is suppressed by the local overlay. B-4 repaired behavior remains present. No security PASS, L2 completion, independent review or model-diverse three-dry claim.
- Only this receipt was written. No runtime/test/central-document edits, application startup, test-suite execution, installs, network/service/DB access, commits or pushes. In-memory synthetic probes only; no credentials emitted.

## Orientation And Provenance

Read root AGENTS in full; browsed strategy; read security method README, orient, complete six-class checklist, design-intent gate, thesis, I1-I6 overview, D92, OAuth specification, logging contract, node-config intent, complete learnings, historical `l1-api-e.md`, `l1-api-f.md`, `l1-api-g.md`, B-4 and B-8 repair receipts. Scanned changelog top and relevant plan/lane entries. The current queue explicitly leaves post-pin delta coverage open; historical coverage is not current assurance.

The worktree was already dirty: settings, central security/strategy/changelog documents, SDK repair receipt, plus untracked settings test and B-8 receipt. Those were not modified. Orientation documents were read from this working tree, so local B-8 claims are context, not merged HEAD evidence. The changelog's top B-8 entry is local; its version does not prove merge/deployment. Source checks below use the explicit pin.

Onboarding: I3 has no storage row-ACL backstop. I1/issuer, B-2 defaults, BP-2 delegation, media capability provenance and analytics provenance remain known debt. B-4 is a distinct automatic HTTP logger repair, not a repair of explicit query logging.

Recession: recheck every document app-gate call, query service allowlist, revocation dispatch, response enrichment, metadata-only middleware and settings CLI output. Nonempty delegated IDs now take a contract branch without Origin. This local routing does not establish verified claim provenance or correct storage enforcement.

Obvious-gap assumptions: I1/I2 require trusted verification outside these files; I3 requires real read/compile/group/media gates and authentic capability provenance; I5 requires verified client identity, correct contract lookup and current revocation; I4 permits node readability but not unrestricted access or diagnostic content copies; I6 requires the compiler to reject cross-store/table-function access. Dependency integrity and deployment remain outside scope. Availability is a separate reliability track.

## Exact Coverage

All ranges below are inclusive and partition each file through EOF.

| File | Complete contiguous ranges inspected |
|---|---|
| `api/app/v3/endpoints/documents.py` 449 | 1-24 imports/router; 25-35 deliveries; 36-64 moderation; 65-94 reference HLS; 95-149 document/ad HLS; 150-177 app gate; 178-211 create; 212-324 read (by-id/me/explicit/ref/count/group); 325-357 update; 358-371 delete; 372-398 track event; 399-418 creator analytics; 419-449 viewer counts |
| `api/app/v3/endpoints/query.py` 283 | 1-33 imports/bounds/state; 34-52 rate gate; 53-62 value serializer; 63-77 row serializer; 78-115 face preparation; 116-141 preparation pipeline; 142-174 route/principal/app allowlist; 175-181 service validation; 182-209 group/metadata sets; 210-222 explicit-access denial; 223-244 compilation/SQL log; 245-253 execution/error; 254-283 serialize/delivery/column log/prepare/return |
| `api/app/v3/endpoints/contracts.py` 84 | 1-23 imports/router/origin helper; 24-40 add; 41-47 list; 48-70 revoke; 71-84 cleanup |
| `api/app/v3/models/contracts.py` 15 | 1-3 import/blanks; 4-9 AddAppContract; 10-15 RevokeAppContract |
| `api/app/v3/models/__init__.py` 165 | 1-76 all imports, including OAuth 65-71; 77-165 every export/comment/list entry |
| `api/app/middleware.py` 94 | 1-12 imports/logger; 13-53 insert and fixed failure diagnostic; 54-73 downstream call/metadata/severity; 74-94 scheduling/row/identity return |
| `api/app/settings.py` 140 | 1-6 imports/header; 7-49 provider/managers/bootstrap/auth/cost/signup/integration defaults; 50-60 storage defaults; 61-84 public signing endpoint/SSL/expiries/upload; 85-98 HLS; 99-123 import workers/retention/sweeper; 124-129 raw environment overwrite; 130-138 manager splitting/cost mapping; 139-140 CLI |

First six working-tree files have no diff against HEAD. Settings differs at **one line only**, 140:

```diff
-    print(globals())
+    print("Settings loaded; configuration values omitted.")
```

Settings was inspected with credential-bearing literals withheld from tool output; expression structure, environment names, defaults' presence and all nonsecret lines were inspected. No credential literal is reproduced here. The seven pinned blobs were also parsed/read in-memory by the isolated probes/accounting command.

Historical data baseline: `8af7e0fce922cada30002dff190a5bb3abcf4f63`. The five files were 433+280+81+12+152 = **958** lines, now 449+283+84+15+165 = **996**, net +38. Actual diff inspected: documents imports/app helper/seven call sites; query import/allowlist; contracts client-ID revoke dispatch; revoke model field; OAuth imports/exports. All unchanged lines were reread, not merely carried forward. Historical E/F/G also cover other files not included here; this receipt does not refresh those.

## All Six Classes

| Class | File-local disposition across the complete scope |
|---|---|
| 1 Access control: I1/I2/I3/I5 | Documents mutations/metrics invoke `_user`; reads invoke `user_or_anon`; all seven app-gate calls pass `client_id_of(data)`. Truthy client ID takes precedence over Origin, uses empty origin and client-ID keyword; false permission raises 403. Browser absent-Origin skip is retained by D92. Query derives a readAll service set before validation/compilation; empty permissions becomes empty frozenset, not None. Contracts management gates Origin except list; every operation calls `_user`. No local unsigned JWT decode. Models declare inputs, not authority. Real auth, scoping, expiry, revocation and compiler/storage gates unverified. Middleware/settings do not make request-auth decisions. B-2/I1 defaults remain known risk. |
| 2 Injection | Query deliberately accepts SQL but sends it through `query_services` then `build_safe_query`; only compiled output reaches execute. No proof of actual compiler protection follows from this wiring. Documents/contracts forward dicts/identifiers to helpers; no local SQL interpolation. HLS URL construction interpolates document IDs/scoped sigs but does not fetch. No local shell, filesystem traversal sink, template renderer, eval/pickle/unsafe YAML deserializer. Models index is imports/exports only; imported implementations are not scanned. Middleware insert is a structured API call. Settings getenv/globals assignment is operator-controlled configuration, not an HTTP execution sink. |
| 3 Boundaries/transport: I5/I6 | Body tokens, public anonymous reads and browser no-Origin behavior are intentional. Scoped HLS URL signatures are not automatically account credentials. No account token URL parameter in these seven files; E-01 belongs to unscanned groups detail and is neither closed nor rediscovered here. Origin is a request header, not proof of token purpose. No direct outbound fetch, cookie or postMessage implementation here. Compiler cross-store restrictions, HLS signer/consumer and client-ID provenance remain L2+. |
| 4 Availability | Reliability only: caller LIMIT honored, anon rate-limit exemption, retained per-reader limiter keys/per-worker state, enrichment/fan-out, unbounded input dictionaries and worker/body configuration. Query timeout is 10s and default maximum appended rows 1000, not a proof of a cost bound. Middleware background task loss/backpressure and settings invalid-env startup failures are not C+I findings. |
| 5 Data lifecycle | Create inserts before requested-group authorization; update writes before group replacement; delete tombstones before detachment. Partial failure/atomicity are handoffs, not demonstrated unauthorized writes. Contract tombstones/revocation storage and grant snapshot races uninspected. Query projected identifiers feed delivery/preparation; canonical provenance unverified. Middleware queues an asynchronous insert and has no retention control in this file. Settings CLI captures effective globals at HEAD; prior copies/backups/rotation untouched by overlay. |
| 6 Hygiene | B-2 credential-bearing defaults remain (values withheld); HS256/lifetime/bootstrap choices are not newly classified exploits. B-8 globals output exists at HEAD, overlay replaces it with fixed output. B-4 middleware has no body/header/raw-path/unsigned attribution copy and fixed insert-error output. L1-G-01 SQL logging remains query:235-243; truncation is not redaction. Moderation/face/query errors include delegated exception text with no proven protected-value source. No artifact content scanned or rotation/deployment assurance. |

## Findings And Negative Results

**L1-G-01, OPEN, reproduced at current pin.** `query.py:235-243` places request SQL[:200] and compiled SQL[:400] into INFO log arguments. P2 used distinct synthetic literals and asserted each exact field. This proves the local logging sink independently of B-4. It does not prove real compiler preservation, live log persistence, unauthorized observation or credential theft. Preconditions for disclosure include sensitive SQL literals, enabled logging/retention and an unauthorized observer. No new duplicate B-number allocated.

**B-2, OPEN, existing source hygiene.** Settings retains signing/integration/storage credential defaults at lines 22,38-48,59,71-72 (including identity/config lines among those ranges). No defaults' values or validity disclosed. Empty-environment fallback is visible statically; actual issuer/third-party compromise, production configuration and rotation are untested. B-8 does not fix this.

**B-8, OPEN at HEAD; local overlay suppresses this sink.** Settings:139-140 executes globals printing only as `__main__`. P6 captured five injected synthetic credential canaries at HEAD, none after the exact one-line replacement; import was silent for both and every uppercase setting compared equal. Output was captured in memory and never printed. This is diagnostic-invocation disclosure, not an unauthenticated remote route. Real script/module entry points, stderr and malformed configuration were not exercised by this scan; repair receipt's tests are historical/author-reported, not rerun here. Overlay is not committed/merged/deployed evidence.

**B-4, source behavior retained; no regression demonstrated.** Middleware:54-94 logs allowlisted method, route template, status, severity and availability latency; attribution/content columns empty; original response returned. P5's body/header traps were not touched, response identity held, nonstandard method became OTHER, 500 became error, and insert failure emitted only the fixed diagnostic without exception info. This is a local negative control, not complete ASGI/streaming/storage/deployment assurance. Historical B-4 exposure and required sign-off remain open.

**P1/P3/P4 negative local controls.** Denying document permission double caused 403 for delegated no-Origin, delegated with Origin and browser with Origin; browser with neither client ID nor Origin intentionally skipped lookup. Query passed empty delegated allowlist downstream; a rejecting service-validation double produced 403 before execution. Contract helper rejected unrelated host, accepted configured manager and absent Origin. These prove local branching only, NOT safety of real permission/compiler/auth helpers or denial of a real attacker.

**P7 type behavior, existing L2 handoff.** Settings:124-128 overwrites earlier typed getenv conversions with raw environment strings. Explicit `"false"` remained a truthy string for CLICKHOUSE_SECURE and KEEP_IMPORT_EXPORTS in both HEAD and overlay. No TLS, retention, recovery or authorization bypass inferred without consumers. No new ID; corresponds to settings learning.

**Other static negative results.** No local unsigned authentication decode, direct uncompiled SQL execution, account token query parameter or direct remote fetch found in these files. These are bounded source observations, not service-wide negatives or failed real exploits.

## Unverified L2 Handoffs

- **E-C3 / F-C4 / G-C4 / BP-2:** trace `_user`, `user_or_anon`, `client_id_of`, actual token verification/certify, purpose/site/target, `has_permission`, `get_app_permissions` and revoke helpers. All seven document operations visibly forward client IDs; claim authenticity/cache isolation and exact origin/client precedence are outside scope. Falsey/empty IDs take browser routing; determine which claims can actually be minted/accepted before alleging bypass. Query's docstring at 150-154 omits the delegated exception although code/comments at 163-173 implement it.
- **E-C3 management continuation:** contracts add/list/revoke/cleanup rely on `_user` and origin checking, not an inline restriction on delegated tokens. Absent/spoofable Origin or a permissive `_user` stub does not prove delegated authority. Revoke model:10-15 documents mutual exclusion but has no validator; handler:61-67 prioritizes truthy client_id when both selectors exist, and neither selects revoke-all. This is a static API-contract ambiguity/correctness concern, not a proven escalation. Verify real token purpose, caller intent and storage revocation/family behavior.
- **F-C1:** documents:349-351 forwards replacement groups without create's writable-group filter at 194-205. Trace `replace_doc_groups` with real author-owned documents/non-writable targets; fake accepting storage is not proof of unauthorized attachment. Create's insert-before-denial similarly proves ordering, not cross-group disclosure.
- **F-C2 / G-C1 / related B-6:** documents:65-147, query:78-139 and enrichment call sites mint capabilities from bodies/refs/ads/projected author columns. Validate real resolver/signer and HLS authorization against canonical documents, author/object binding and forged SQL projections. Read authorization alone does not establish projected-row provenance.
- **F-C3 / G-C2:** delivery/content event/contentViews/creator analytics forward identity, service, doc IDs, payloads and readable groups. Query:262-264 uses projected doc_id plus caller content_service. Real delivery dedup, preceding-delivery validation, readable canonical documents, author scope and service isolation need real helper evidence; no inflated accounting or cross-owner metric read demonstrated.
- **G-C3:** query_services/build_safe_query/readable_groups/execute_query enforce raw-table/table-function restrictions, denied-service joins, metadata fallbacks, tombstones, block/sharing/hidden behavior. No actual compiler/DB executed. `group_meta=(readable_meta,candidates)` includes unchecked candidates by construction; actual CTE gating must be examined before any disclosure claim.
- **Error sinks:** documents:62, query:111,251-252 log/interpolate helper errors. Need reachable protected-value source before confirming disclosure. Fabricated secret-bearing exceptions alone would establish only a sink.
- **Settings consumers:** operator env can replace any existing globals key, erase types, alter baseline/managers and derived COST values. Actual consumers/admin union/auth trust require L2; node-config KB explicitly preserves bootstrap baseline despite settings comment's replace-vs-union discrepancy. Do not remove operator configuration as a speculative security fix.

## Runnable Minimal Replays

Run from repository root. Uses only standard library, pinned Git objects, empty inherited environment and inert doubles. It never imports the application, starts a server, connects to storage/network, writes files or prints captured configuration. Pinned settings is executed only in memory; do not replace the capture with `print` or invoke its unmodified CLI directly. `load` changes only decorators/annotation evaluation, retaining actual selected function bodies. These are minimal local replays, not endpoint integration tests.

```sh
env -i PATH=/usr/bin:/bin /usr/bin/python3 -I -B - <<'PY'
import ast, asyncio, contextlib, io, logging, os, subprocess, time
from datetime import datetime
from types import SimpleNamespace as N
PIN = 'f7aabdb26346752141f46f19c393dbadfd25ddd2'
def source(path):
    return subprocess.check_output(['git', 'show', PIN+':api/app/'+path], text=True)
def load(path, names, ns):
    nodes = [n for n in ast.parse(source(path)).body
             if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    for n in nodes: n.decorator_list = []
    future = ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0)
    module = ast.fix_missing_locations(ast.Module(body=[future]+nodes, type_ignores=[]))
    exec(compile(module, path, 'exec'), ns)
class Denied(Exception):
    def __init__(self, **kw): self.status_code = kw['status_code']
class Unsafe(Exception): pass
calls = []
def permission(*a, **kw): calls.append((a, kw)); return False
ns = dict(ch=N(has_permission=permission), HTTPException=Denied)
load('v3/endpoints/documents.py', {'_check_app_permission'}, ns)
for origin, client, expected in [('',None,False),('https://app.invalid',None,True),
                                ('','synthetic-client',True),('https://app.invalid','synthetic-client',True)]:
    calls.clear(); denied = False
    try: ns['_check_app_permission'](N(headers={'origin':origin}), 'user', 'notes', 'readAll', client)
    except Denied as e: denied = e.status_code == 403
    assert denied == expected and bool(calls) == expected
    if client: assert calls[0][1] == {'client_id':client} and calls[0][0][1] == ''
print('P1 local document branch controls passed')
records = []; log = logging.getLogger('isolated'); log.setLevel(logging.INFO)
h = logging.Handler(); h.emit = records.append; log.addHandler(h)
request_sql = "SELECT 'SYNTHETIC_REQUEST' AS value"
compiled_sql = "SELECT 'SYNTHETIC_COMPILED' AS value"
allowed_seen = []
def services(sql, allowed, **kw): allowed_seen.append(allowed); return set()
ns = dict(HTTPException=Denied, user_or_anon=lambda d:'user', client_id_of=lambda d:'client',
          _check_query_rate_limit=lambda r:None, log=log, MAX_ROWS=1000, MAX_EXECUTION_TIME_S=10,
          sq=N(query_services=services, build_safe_query=lambda *a,**kw:compiled_sql, UnsafeQueryError=Unsafe),
          ch=N(get_app_permissions=lambda *a,**kw:{}, get_user_groups=lambda *a:[],
               execute_query=lambda *a,**kw:([],[]), QueryExecutionError=RuntimeError))
load('v3/endpoints/query.py', {'run_query'}, ns)
data = N(sql=request_sql, groups=None, withGroupMeta=False, surface=None, content_service=None, prepare=None)
ns['run_query'](N(headers={}), data)
r = next(r for r in records if 'compiled=%s' in r.msg)
assert r.args[4] == request_sql and r.args[5] == compiled_sql
assert allowed_seen == [frozenset()]
print('P2 separate request/stub-compiled fields and delegated empty allowlist confirmed')
executed = []
def reject(*a, **kw): raise Unsafe('synthetic denial')
ns['sq'].query_services = reject
ns['ch'].execute_query = lambda *a,**kw:executed.append(True)
try: ns['run_query'](N(headers={}), data)
except Denied as e: assert e.status_code == 403
else: raise AssertionError('expected denial')
assert not executed
print('P3 rejecting boundary stopped execution')
ns = dict(settings=N(CORS_SERVICE_MANAGERS=['auth.invalid']))
load('v3/endpoints/contracts.py', {'_is_authenticator_origin'}, ns)
assert ns['_is_authenticator_origin'](N(headers={}))
assert ns['_is_authenticator_origin'](N(headers={'origin':'https://auth.invalid'}))
assert not ns['_is_authenticator_origin'](N(headers={'origin':'https://evil.invalid'}))
print('P4 local origin controls passed')
inserted = []; log.setLevel(logging.DEBUG)
ns = dict(asyncio=asyncio, time=time, datetime=datetime, log=log,
          ch=N(client=N(insert=lambda *a,**kw:inserted.append((a,kw)))))
load('middleware.py', {'log_requests','_insert_log'}, ns)
class Request:
    scope = {'route':N(path='/synthetic/{id}')}; method = 'NONSTANDARD'
    @property
    def headers(self): raise AssertionError('header read')
    async def body(self): raise AssertionError('body read')
async def exercise():
    response = N(status_code=500, private='SYNTHETIC_RESPONSE')
    async def next_(request): return response
    assert await ns['log_requests'](Request(), next_) is response
    await asyncio.sleep(0)
    d = dict(zip(inserted[0][1]['column_names'], inserted[0][0][1][0]))
    assert all(d[k] == '' for k in ['user_key','origin','request_body','response_body','meta'])
    assert d['method'] == 'OTHER' and d['path'] == '/synthetic/{id}' and d['level'] == 'error'
    def fail(*a, **kw): raise RuntimeError('SYNTHETIC_INSERT_ERROR')
    ns['ch'].client.insert = fail; records.clear(); await ns['_insert_log'](d)
    assert len(records) == 1 and records[0].getMessage() == 'log insert failed (CH unavailable?)'
    assert not records[0].exc_info
asyncio.run(exercise())
print('P5 local B-4 controls passed')
s = source('settings.py')
overlay = s.replace('    print(globals())', '    print("Settings loaded; configuration values omitted.")')
assert s != overlay
keys = ['PRIVATE_KEY','TWILIO_AUTH_TOKEN','STRIPE_TEST_KEY','CLICKHOUSE_PASSWORD','S3_SECRET_KEY']
env = {k:'SYNTHETIC_'+str(i) for i,k in enumerate(keys)}
env.update(CLICKHOUSE_SECURE='false', KEEP_IMPORT_EXPORTS='false')
os.environ.clear(); os.environ.update(env)
def run(code, name):
    out = io.StringIO(); ns = {'__name__':name}
    with contextlib.redirect_stdout(out): exec(compile(code,'pinned-settings','exec'),ns)
    return out.getvalue(), ns
a, _ = run(s, '__main__'); b, _ = run(overlay, '__main__')
c, cn = run(s, 'synthetic_import'); d, dn = run(overlay, 'synthetic_import')
assert all(env[k] in a for k in keys) and not any(env[k] in b for k in keys)
assert b == 'Settings loaded; configuration values omitted.\n' and c == d == ''
assert {k:v for k,v in cn.items() if k.isupper()} == {k:v for k,v in dn.items() if k.isupper()}
assert all(cn[k] == 'false' and bool(cn[k]) for k in ['CLICKHOUSE_SECURE','KEEP_IMPORT_EXPORTS'])
print('P6 HEAD 5/5 captured, overlay 0/5; imports silent and uppercase settings equal')
print('P7 two explicit false strings remain truthy; consumer impact unverified')
PY
```

Execution record: P1/P2 passed in the first run. That run's P3 initially failed because the synthetic namespace omitted HTTPException, not because the source allowed execution. Corrected P3 and P4-P7 all passed in a second isolated run. Both fenced replays above/below were then extracted from this receipt and executed unchanged: P1-P7 all passed and accounting returned exactly 449/283/84/15/165/94/140. No real compiler, permission implementation, auth helper or storage was executed by P1-P5; never promote their permissive doubles to an access-control bypass or their rejecting doubles to actual end-to-end protection.

Accounting can be replayed without exposing source:

```sh
env -i PATH=/usr/bin:/bin /usr/bin/python3 -I -B - <<'PY'
import subprocess
p = 'f7aabdb26346752141f46f19c393dbadfd25ddd2'
paths = ['v3/endpoints/documents.py','v3/endpoints/query.py','v3/endpoints/contracts.py',
         'v3/models/contracts.py','v3/models/__init__.py','middleware.py','settings.py']
counts = []
for path in paths:
    b = subprocess.check_output(['git','show',p+':api/app/'+path])
    n = len(b.splitlines()); assert n == b.count(b'\n') and b.endswith(b'\n')
    counts.append(n); print(path,n)
assert counts == [449,283,84,15,165,94,140]
assert sum(counts[:5]) == 996 and sum(counts) == 1230
PY
```

## Design-Intent Assessment And Limits

1. Intended behavior: generic document CRUD, safe flexible SELECT and opt-in capability preparation; public discovery bounded by group grants; app and group contracts protect user-owned data. D92 adds client-ID-keyed delegation while preserving browser/direct behavior. Operators retain configurable bootstrap/integrations and useful diagnostics.
2. Behavioral delta: this scan changes nothing. The existing local B-8 overlay changes diagnostic consumers from globals output to fixed completion text, not settings/import/auth behavior. B-4 retains response identity and metadata diagnostics rather than content copies.
3. By-design conflict: none introduced. D41 node readability, public grants, body-token transport and D56 telemetry do not authorize credential dumps or arbitrary content in diagnostics. Do not prescribe default E2E, HttpOnly or changing body tokens as repairs here.
4. Conventional deviations: body tokens, browser no-Origin skip, readable node and JS-readable token design are deliberate; D92 explicitly retains browser routing. Account-token URLs are not exempt, but the earlier E-01 groups route is outside this scope. SQL literal logging and globals dumps are not justified by those choices.
5. Untested intent risk: real delegated consent/revocation, browser/direct callers, group visibility, forged projection capability binding, streaming/shutdown/mounted routing, real CH inserts, external dump-parsing tooling and deployment remain untested. No new risk acceptance is granted by this receipt. Existing B-4/B-8 dated acceptances were read, not substituted for current integration evidence.

No tests or runtime repairs were performed. This is one model/context's bounded L1 source/evidence assessment, not fresh independent fix review. Broader OAuth endpoints/auth/models/storage, imported model bodies, main router/exception handling, HLS consumer, SDK artifacts, packaging, credentials' validity, historical cleanup, rollout, rotation and protocol/project L1-L4 completion remain explicitly outside this receipt. Central KB write-back is deferred to the coordinator under the user's only-file constraint.
