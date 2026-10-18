# L1 API J: import worker lines 1-532

- Date: 2026-10-18. Scanner: OpenCode/gpt-6.1 sol (API ID `openrouter/openai/gpt-6.1-sol`).
- Pinned source: `8af7e0fce922cada30002dff190a5bb3abcf4f63` (HEAD verified).
- Owned: `api/app/v3/services/import_worker.py:1-532`, 532 lines of 1,028.
- Coverage complete for assigned lines; unscanned owned lines: none. Disposition: **OPEN**.
- Lines 533-1028 were context/another assigned receipt, not J coverage. No whole-worker safety claim.
- `git diff <pinned-source> --` the four assigned source paths returned empty; source matches pin.

## Orient
- Onboarding: read AGENTS, strategy thesis/D90, plan/lane queues, recent changelog, security learnings/record, I1-I6, checklist and design-intent gate. Existing D90 review is not exhaustive L1 evidence; middleware/settings work was not repeated.
- Recession: D90 promises per-job traces; the handler's stated thread isolation is not implemented. I3 has no storage ACL backstop.
- Gap: trace attribution is itself an isolation boundary; an owner gate on trace reads cannot repair cross-job copies already persisted.
- Intent: retain detailed diagnostics, readable-node operation and the accepted keep-exports switch. No runtime change or independent design review performed.

## Coverage By Symbol/Range
| Lines | Reviewed |
|---|---|
| 1-130 | Module flow/imports, phases, follower roles, queue, schema and columns |
| 131-232 | Schema healing, time/JSON helpers, create/get job, progress clamp |
| 233-292 | Versioned job updates and boot resubmission |
| 293-391 | Event schema, sequence lock, event writes/reads, completed stages |
| 392-434 | `_JobLogHandler`, `_with_job_logging` |
| 435-532 | Submission/start, worker/sweep loops, stuck-job mutation, `_mark_error`, section boundary |

## Checklist Dispositions
| Class | L1 disposition |
|---|---|
| 1 Access control | Job/event helpers select by bound job ID, not caller identity; caller authentication, expiry, app grants and ownership remain L2. Confirmed cross-job trace mixing below. Updates preserve user/platform/target rather than mass-assigning them. |
| 2 Injection | SQL literals or bound parameters; JSON decoding, not executable deserialization. No shell, template renderer or filesystem path sink in owned lines. |
| 3 Boundaries/transport | No outbound URL fetch, cookie, CORS or postMessage implementation in owned range. No token URL construction. |
| 4 Availability | Separate reliability: unbounded queue/event history, in-memory post-query log limiting, stale requeue without active-job exclusion; no C+I finding asserted from those alone. |
| 5 Lifecycle | Event persistence intentional; concurrent handler attribution fails. Versioned job reads filter deleted before ranking; tombstone/revocation consequences require actual writers at L2. |
| 6 Hygiene | No embedded credential found. Exception/detail persistence is broad; no actual secret leak established. Cross-job capture is not existing B-4 request-body logging. |
| I1/I2/I5 | No token verification/decoding here; authority supplied by callers, not proven missing. |
| I3/I4/I6 | Trace isolation defect confirmed locally; node readability respected. No cross-node store operation in owned lines. |

## Confirmed L1-J-01: Concurrent Jobs Copy Logs Into Each Other's Traces
- Evidence: lines 403-415 associate every received record with `self.job_id`; lines 423-429 install all handlers on one shared logger, without record/thread/job filtering. Handler locking serializes writes but does not isolate recipients.
- Impact: trace integrity violation, with potential cross-user confidentiality exposure when different owners' jobs overlap and logs contain private identifiers/errors. No live database or endpoint disclosure demonstrated. Concurrency above one, or otherwise overlapping contexts, is required; configured production concurrency was not inspected.
- Safe real-code proof: AST-select the unchanged handler/context/event functions to avoid importing settings or live clients. Two synchronized threads hold distinct job contexts; only A logs a synthetic private-origin canary. Real `record_event` calls an in-memory insert sink.
- Run from repository root (stdlib only, no file writes):
```sh
python3 -B -c 'import ast, logging, threading, traceback; from pathlib import Path; from datetime import datetime; from types import SimpleNamespace; from concurrent.futures import ThreadPoolExecutor; p="api/app/v3/services/import_worker.py"; tree=ast.parse(Path(p).read_text()); names={"_now","_next_seq","record_event","_JobLogHandler","_with_job_logging"}; selected=ast.Module(body=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in names],type_ignores=[]); rows=[]; logger=logging.getLogger("l1-j-proof"); logger.setLevel(logging.INFO); logger.propagate=False; ns=dict(logging=logging,threading=threading,traceback=traceback,datetime=datetime,logger=logger,ch=SimpleNamespace(client=SimpleNamespace(insert=lambda table,data,**kw: rows.extend(data))),_event_seq={},_event_seq_lock=threading.Lock()); exec(compile(selected,p,"exec"),ns); barrier=threading.Barrier(2)
def run(job):
 with ns["_with_job_logging"](job):
  barrier.wait()
  if job=="job-A": logger.info("synthetic-A-private-origin")
  barrier.wait()
with ThreadPoolExecutor(max_workers=2) as pool: list(pool.map(run,["job-A","job-B"]))
hits=sorted(r[0] for r in rows if "synthetic-A-private-origin" in r[4]); assert hits==["job-A","job-B"],hits; print("real_handler_canary_jobs=",hits,"rows=",len(rows))'
```
- Result: `real_handler_canary_jobs= ['job-A', 'job-B'] rows= 2`. Confirmed local attribution defect, unfixed.

## UNVERIFIED L2+ Handoffs / Limitations
- J-H1: trace/status/create/start callers: prove issuer/expiry/app/owner checks and evaluate L1-J-01's user-visible reach. Endpoint code was not scanned for this receipt.
- J-H2: follow exception payload sources and trace retention/access; do not infer credential exposure from generic traceback persistence.
- J-H3: inspect actual job deletion writers before claiming tombstone resurrection; inspect sweep/write interleavings for integrity effects beyond reliability.
- No network, live services, production secrets, installs or git mutation. Only this new receipt written for J; no fixes, model-diverse/three-dry sign-off or whole-file assurance.
