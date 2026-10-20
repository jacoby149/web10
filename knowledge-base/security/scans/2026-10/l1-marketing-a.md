# L1 MA: Marketing Import Boundary

- Source: `db325cd3ca242774ed0afdaf743fdf35419da1e7`; scanned 2026-10-18.
- Scanner: OpenCode gpt-6.1 sol; API ID `openrouter/openai/gpt-6.1-sol`.
- Whole files, every line including comments/blanks: `marketing/marketing-api/app/v3/endpoints/imports.py:1-405` (405), `marketing/marketing-api/app/validation.py:1-146` (146), `marketing/marketing-api/app/utils.py:1-106` (106). Total: 657 lines, 3 files; no remaining assigned lines.
- Read working-tree sources; `git diff <pin> -- <three paths>` returned empty; probes load pinned blobs.
- Disposition: **OPEN**, existing B-2 credential-default hygiene; no new demonstrated C+I exploit. Coverage complete; security review/sign-off pending.

## Orient And Intent

- Read root AGENTS, security theory README/post-mortem/orient/checklist/design-intent gate, current learnings and security record, I1-I6 overview, thesis, plan/lane scan queues and newest changelog entries; browsed strategy inventory and import decisions/context.
- Onboarding: B-1 issuer trust, B-2 credential defaults, B-3 unsigned authorization and B-4 sensitive logs remain known; body tokens, readable nodes, accepted cookie lifetime and telemetry are intentional.
- Recession: no closure/regression claimed; this file repeats B-2's known default-credential pattern. No JWT decode or signature verifier exists in these three files.
- Gap: I1/I2 assume verification somewhere upstream/downstream; I3 assumes job identity and stored authority are bound; I5 assumes later writes respect current expiry/revocation; I6 assumes destinations and remote content cannot become authority. Those assumptions are unverified here. Supply-chain trust remains outside this coverage; bounds are reliability, not new invariants.
- Intent: `web10-v3/social/import.md:42-48` says this marketing HTTP/v2 importer is retired, superseded by the node importer. Code presence is not production reachability. Preserve catalog portability/staging, authorized writes, useful diagnostics and operator configuration; do not revive or fix this engine in a scan.
- Runtime delta: none. No by-design deviation proposed; independent five-question design-intent review remains pending, not self-certified.

## Range/Symbol Coverage

| File | Exhaustive ranges and reviewed behavior |
|---|---|
| imports.py | 1-51 imports/config/global jobs/lock; 52-71 progress/result models; 72-91 `_s3`/`_ensure_bucket`; 92-108 `_write_record` URL/token/body/error flow |
| imports.py | 109-136 `_run_pipeline` job/source/download; 137-175 ZIP reading/detection/parser dispatch; 176-202 validation/dedup; 203-243 service grouping/writes/status; 244-264 exception/cleanup |
| imports.py | 265-307 `presign_import_upload`; 308-334 `start_import_job`; 335-361 `create_import_job`; 362-384 `upload_zip`; 385-405 `get_import_job` explicit response fields |
| validation.py | 1-20 fixed schema directory/`_load_schema`; 21-53 `_validate_schema`; 54-120 fallback schemas; 121-136 registry/`get_validators`; 137-146 `validate_record` |
| utils.py | 1-19 `safe_str`/`safe_num`; 20-30 `parse_timestamp`; 31-43 tags/mentions; 44-87 platform predicates; 88-99 detection precedence; 100-106 JSON/media filters |

## Six Checklist Classes

1. Access control: five route handlers have no local verified principal/owner check; start uses job ID plus pending phase, upload lacks even a phase guard. UUID unpredictability is not demonstrated disclosure or bypass. Router/app gates, models and node write authorization are unverified (L1-MA-U1).
2. Injection: no SQL, shell, eval, unsafe object deserialization or render sink. ZIP member names feed `zf.read`, not extraction/filesystem writes; no local Zip Slip established. Temp filename uses supplied `job_id`, but job dictionary membership precedes it and local creators generate UUIDs. Internal pipeline's arbitrary local-source branch is not a demonstrated remotely selectable path. Schema names are fixed literals, not request paths. Parser output/service path validation is L1-MA-U3.
3. Boundaries/transport: `_write_record` interpolates node URL/service and forwards bearer plus body, without local destination/scheme checks (L1-MA-U2). S3 endpoint is operator configuration; object key is server-generated. No account token placed into a URL here. CORS/cookies/global routing are outside scope; no live SSRF or token theft demonstrated.
4. Availability/reliability: presigned POST has compressed size range/expiry, but direct `file.read()`/write and full ZIP expansion have no local bound. Jobs never evict; entries/records/errors can grow; synchronous I/O runs in async pipeline; progress/duplicate uploads have weak state bounds. These are reliability handoffs, not C+I findings.
5. Data lifecycle: job dictionary retains `user_token` indefinitely, including terminal jobs; no credential clearing, expiry/revocation check or cleanup timer locally (L1-MA-U4). Start transition is lock-protected; upload can schedule repeat processing without phase guard. Finally attempts cleanup, including after failures: local temp ZIP/empty-parent cleanup is existence-conditional, S3 cleanup is source-conditional, and exceptions may prevent deletion; no external deletion probe executed. Status explicitly omits token, but create constructs an external response model from the whole secret-bearing dictionary: serialization unverified.
6. Hygiene: B-2 repeats at imports.py:36-37, consumed by `_s3`: literal fallback storage credentials when env absent. Values withheld; no credential validity, deployment use or public bucket claim. Error text flows into job state/status; S3 failure logging includes source/error. A protected-value source is not demonstrated, so sensitive-error disclosure remains L1-MA-U4, not confirmed B-4.

## Confirmed Local Finding

- **B-2 (existing ID, not double-counted), OPEN:** imports.py:36-37 credential fallbacks; imports.py:75-81 forwards them to boto3. Static AST evidence confirms both fallback arguments are literals. Environment overrides remain supported; no real credential output or storage connection. Later repair requires a static guard against credential defaults and valid operator-config behavior; this scan fixes nothing.

## UNVERIFIED L2+ Handoffs

- **L1-MA-U1:** imports.py:265-405: establish whether retired routes are mounted/exposed and what upstream guards enforce; prove ownership/capability semantics before claiming cross-user status, archive replacement or stored-token writes. Direct function dispatch proof below establishes only local behavior with synthetic known job ID.
- **L1-MA-U2:** imports.py:92-106, 213-222, 295-296/356-357: node destination and bearer flow. Real writer accepts loopback in isolated invocation; models, caller selection, redirects, egress policy and deployment reachability unverified. Caller-supplied bearer to caller-chosen node is not by itself stolen authority.
- **L1-MA-U3:** parser delegation at imports.py:145-163/181-222; validation.py:137-146 accepts unknown services and shallow schemas allow null/type edge cases. Inspect parser provenance, model constraints, actual schemas and downstream node permissions/staging before naming path manipulation, auto-publication or unauthorized writes. `safe_*` helpers are coercion, not sanitizers; filename heuristics do not authenticate an archive.
- **L1-MA-U4:** imports.py:244-248/280-298/341-359/385-405: inspect model field filtering and reachable protected error sources, token expiry/clearing policy, status visibility and lifecycle callers. No private-data access, token response leak, production retention or historical exposure established.
- Models, parser implementations, loaded schema files, boto3/requests internals, global route dependencies/middleware and downstream node APIs are outside scope and unverified, not extra coverage or automatically missing gates.

## Safe Pinned Probes

Executed inline with `python3 -B -c '<code below>'`; stdlib AST extraction executes unchanged function bodies with inert dependencies. No imports of application modules, archive/file operations, services, live network or real tokens.

```python
import ast, subprocess, types, asyncio, sys
from threading import Lock
pin = "db325cd3ca242774ed0afdaf743fdf35419da1e7"
root = "marketing/marketing-api/app/"
src = lambda p: subprocess.check_output(["git", "show", pin+":"+root+p], text=True)
paths = ("v3/endpoints/imports.py", "validation.py", "utils.py")
assert [len(src(p).splitlines()) for p in paths] == [405, 146, 106]
tree = ast.parse(src(paths[0]))
ns = {"jobs": {"synthetic": {"phase": "pending", "object_key": "imports/synthetic.zip",
      "node_api_url": "https://node.invalid", "user_token": "SYNTHETIC-MA"}},
      "jobs_lock": Lock(), "Phase": types.SimpleNamespace(PENDING="pending", PARSING="parsing"),
      "BackgroundTasks": object, "_run_pipeline": object(),
      "router": types.SimpleNamespace(post=lambda *a, **k: lambda f: f)}
funcs = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
         and n.name in ("_write_record", "start_import_job")]
exec(compile(ast.Module(body=funcs, type_ignores=[]), "pinned-MA", "exec"), ns)
calls = []
sys.modules["requests"] = types.SimpleNamespace(post=lambda u, **k:
    (calls.append((u, k)) or types.SimpleNamespace(status_code=201, text="synthetic")))
assert ns["_write_record"]("http://127.0.0.1:9", "SYNTHETIC-MA", "posts", {}) == (True, None)
assert calls[0][0] == "http://127.0.0.1:9/create/posts"
assert calls[0][1]["headers"]["Authorization"] == "Bearer SYNTHETIC-MA"
queued = []
bg = types.SimpleNamespace(add_task=lambda *a: queued.append(a))
assert asyncio.run(ns["start_import_job"]("synthetic", bg))["status"] == "processing"
assert queued[0][-1] == "SYNTHETIC-MA"
for n in tree.body:
    if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name):
        if n.targets[0].id in ("S3_ACCESS_KEY", "S3_SECRET_KEY"):
            assert isinstance(n.value.args[1], ast.Constant)
print("657 lines verified; B-2 static defaults; MA-U1 queued stored authority; "
      "MA-U2 loopback/bearer forwarded to inert sink; assertions OK; "
      "no network/filesystem side effects")
```

- Initial extraction omitted the router decorator stub and failed with `NameError: router`; writer/default checks had completed. Repaired only probe setup with inert identity decorator; rerun completed all assertions, exit 0, output as printed above. No runtime edits or partial-run success substituted for completion.
- The fake HTTP/task sinks prove conditional local routing/dispatch, not accepted credentials, actual network access, authenticated HTTP reachability or protected-data access. Static hygiene is distinct from executed exploit evidence.
- No service-wide safety, PASS, fix, model diversity or three-dry claim; independent review and all L2+ tracing remain owed. Only this receipt was written; central docs, git state and runtime were not modified.
