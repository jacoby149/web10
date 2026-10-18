# L1 API Scope G Receipt

- Date: 2026-10-18. Scanner: OpenCode/gpt-6.1 sol (API ID `openrouter/openai/gpt-6.1-sol`).
- Pinned source: `8af7e0fce922cada30002dff190a5bb3abcf4f63` (HEAD verified; all assigned files unchanged against pin).
- Coverage complete for assigned lines: **530/530**, no unscanned lines.
- Disposition: **OPEN** (L1-G-01 local logging hygiene); independent review/signoff pending. No whole-file secure, three-dry/model-diverse or design-review signoff.

## Orientation

- Read AGENTS, strategy directory/thesis, plan/lane/recent changelog, learnings/security record, I1-I6, checklist, design-intent gate and groups/access.md.
- Onboarding: I3 rests on the query boundary without storage ACLs; prior service audit is not endpoint coverage. B-4 is a known distinct middleware body-log sink, not assumed repaired here.
- Recession: validate endpoint ordering, per-service group sets, metadata fallback and post-query capability assumptions. Actual SQL compiler/auth/media helpers are not scanned.
- Obvious gap: authorized result rows need not have authentic document identity when arbitrary SELECT projections/literals are allowed; prepare/delivery must not confuse row shape with provenance.
- Intent: arbitrary safe SELECT/aggregations/joins, opt-in preparation and content-free telemetry remain supported. Readable nodes/body tokens/accepted cookie lifetime are not findings. Scope G receipt absent; coordinator serializes central updates.

## Exact Coverage

| File | Read ranges and symbols |
|---|---|
| `api/app/v3/endpoints/query.py` (280 lines) | 1-33 imports/config; 34-52 rate gate; 53-77 serializers; 78-115 `_prepare_face`; 116-141 `_prepare_rows`; 142-178 principal/app/query-services gates; 179-219 candidate/readable/meta sets; 220-250 compile/log/execute/errors; 251-280 serialize/delivery/prepare/return |
| `api/app/v3/models/query.py` (91 lines) | 1-21 PrepareFace; 22-38 PrepareSpec; 39-91 QueryRequest, SQL/groups/metadata/prepare/surface/content_service |
| `api/app/v3/models/__init__.py` (152 lines) | 1-69 model imports; 70-152 public export list (all entries read; imported model implementations outside assigned files not covered) |
| `api/app/v3/models/common.py` (7 lines) | 1-7 import/TokenOnly |

## Checklist Dispositions

| Class | L1 disposition |
|---|---|
| 1 Access control (I1/I2/I3/I5) | `user_or_anon` precedes work; service permissions/readable sets precede compilation; only compiled SQL reaches execution. No unsigned decode locally. Helper issuer/expiry/revocation/scope and preparation authority remain unverified. |
| 2 Injection | SQL deliberately flows to `query_services` then `build_safe_query`, not directly from request to execute. Compiler/raw-table/function/CTE protection needs L2/gauntlet. JSON parsing delegated; no shell/path/template/executable deserializer sink in assigned lines. |
| 3 Boundaries/transport | No local cookie/postMessage/fetch or token-in-URL. Origin-derived service allowlist is absent for anon/no-Origin requests by explicit rule (BP-2 handoff). Media preparation is a separate capability boundary. |
| 4 Availability | Reliability only: caller LIMIT honored, SQL length unbounded, anon skips per-user limiter, in-memory reader keys retained; execution timeout 10s. Not C+I findings. |
| 5 Lifecycle | Grant snapshots precede execution/preparation; tombstone/current-access semantics in helpers unverified. No nonce/ticket persistence locally. Delivery records use caller-chosen projection/service (handoff below). |
| 6 Hygiene | L1-G-01 logs SQL literals; error responses/logs include delegated query exception text at 248-249 (sensitivity needs L2). No hardcoded credential/build secret/security default/rotation implementation locally. |
| I4/I6 | Node readability respected; no direct cross-node storage/network calls. Rejection of remote/table functions is delegated, not proven by this endpoint scan. |

## Confirmed Local Finding

**L1-G-01: query text/literals copied into INFO logs (logging hygiene, OPEN).**
At query:232-240 the logger records caller SQL (first 200 chars) and compiler output (first 400 chars) without local literal redaction. Separate exact assertions demonstrate caller-SQL logging and logging of a distinct **stub-compiled SQL** value using the actual pinned `run_query` body and in-memory LogRecords.
This establishes a local sensitive-input logging sink, not real compiler preservation of literals, live log retention, unauthorized observation, or actual credential exposure. Exposure would additionally require sensitive caller literals, enabled INFO logging, retention and an unauthorized log observer; none of those deployment conditions was demonstrated. Truncation is not redaction. Existing B-4 concerns middleware body logging; this distinct endpoint sink gets a scope ID, not a new B-number.

## Safe Reproduction

Executed the following isolated command (no file writes, imports of application settings, inherited environment or network):

```sh
git show 8af7e0fce922cada30002dff190a5bb3abcf4f63:api/app/v3/endpoints/query.py | env -i PATH=/usr/bin:/bin /usr/bin/python3 -I -B -c '
import ast,sys,logging
from types import SimpleNamespace as N
tree=ast.parse(sys.stdin.read())
fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=="run_query")
fn.decorator_list=[]
module=ast.fix_missing_locations(ast.Module(body=[ast.ImportFrom(module="__future__",names=[ast.alias(name="annotations")],level=0),fn],type_ignores=[]))
records=[]; log=logging.getLogger("l1-g-probe"); log.setLevel(logging.INFO)
handler=logging.Handler(); handler.emit=records.append; log.addHandler(handler)
request_sql="SELECT '\''L1_G_REQUEST_CANARY'\'' AS value"
compiled_sql="SELECT '\''L1_G_STUB_COMPILED_CANARY'\'' AS value"
sq=N(query_services=lambda *a,**k:set(),build_safe_query=lambda *a,**k:compiled_sql,UnsafeQueryError=ValueError)
ch=N(get_user_groups=lambda *a:[],execute_query=lambda *a,**k:([],[]),QueryExecutionError=RuntimeError)
ns=dict(user_or_anon=lambda d:"synthetic-reader",_check_query_rate_limit=lambda r:None,sq=sq,ch=ch,log=log,MAX_ROWS=1000,MAX_EXECUTION_TIME_S=10)
exec(compile(module,"pinned-query.py","exec"),ns)
data=N(sql=request_sql,groups=None,withGroupMeta=False,surface=None,content_service=None,prepare=None)
result=ns["run_query"](N(headers={}),data)
record=next(r for r in records if r.msg=="[query] reader=%s services=%s group_meta=%s candidates=%d sql=%s compiled=%s")
assert record.args[4]==request_sql[:200]
assert record.args[5]==compiled_sql[:400]
rendered=record.getMessage()
assert " sql="+request_sql[:200]+" compiled=" in rendered
assert rendered.endswith(" compiled="+compiled_sql[:400])
print("request sql field: exact assertion succeeded; stub-compiled sql field: exact assertion succeeded; result="+repr(result))
print("No real compiler preservation, live retention, unauthorized observation or authorization exploit demonstrated")'
```

Fresh-review rerun: all four field-specific argument/rendering assertions succeeded; `result={'rows': [], 'count': 0}`. Distinct request/stub-compiled canaries replace the earlier identity compiler stub and somewhere-in-logs assertion, which alone did not prove both fields. Real function body unchanged; only decorator removed/annotations postponed, external dependencies stubbed. Initial historical harness attempt omitted `ast.fix_missing_locations` and failed with missing `lineno`; corrected runs succeeded. No real compiler acceptance/preservation, live retention, unauthorized observation or authorization exploit demonstrated.

## UNVERIFIED L2+ Handoffs

- **G-C1, capability provenance (priority):** query:78-139,274-279 uses projected `author_key`/body/media fields and caller-selected face columns to resolve/mint capabilities. Inspect compiler literal/alias support, `resolve_media_urls`, `resolve_media_urls_in_docs`, ad helpers and HLS gates; try synthetic forged projections against real authorization-aware helpers. A fake presigner accepting inputs cannot prove disclosure.
- **G-C2, delivery provenance:** query:259-261 logs returned `doc_id` with caller-declared `content_service`. Verify `log_content_deliveries` validates readable canonical documents/service before establishing the delivery prerequisite used by `record_content_event` (scope F). Otherwise literal projection could become an analytics-integrity issue; not demonstrated here.
- **G-C3, query/I3 wall:** query:175,187,199-205,221-228,243 depend on `query_services`, `readable_groups`, `build_safe_query`, `execute_query`; verify raw tables/table functions, CTE/name shadowing, denied-service joins, metadata NULL gating, block/sharing/hidden/tombstones with real compiler/DB gauntlet. No inferred compiler bypass.
- **G-C4, delegation (existing BP-2):** query:156-170 uses Origin-derived allowlist and unrestricted services for absent Origin. Inspect verified app token scope/revocation and helpers before alleging bypass.

## Limits

All **4 files, 530 lines** read with Read; `git rev-parse HEAD` matched pin. Scope G recheck: `git diff 8af7e0fce922cada30002dff190a5bb3abcf4f63 -- api/app/v3/endpoints/query.py api/app/v3/models/query.py api/app/v3/models/__init__.py api/app/v3/models/common.py` was empty. No L2 coverage, live database/network, actual secrets, installs, runtime/central-doc edits or git mutations. No fix or independent document/design/convergence signoff claimed.
