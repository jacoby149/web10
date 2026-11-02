# L1-J-01 Import Trace Isolation Repair

27.10.2026. Baseline: `b5ebcd7e7a43089ba7232185493bf78b63364f0c` (#1266 merged).
Author/fresh reviewer: separate OpenCode `openrouter/openai/gpt-6.1-sol` contexts,
same-model, not model-diverse three-dry review. Source repair merged #1267 at
`e0c271da1`; deployment/sign-off not established. Protocol L1 remains OPEN.

## Boundary And Intent

All active `_JobLogHandler` instances shared `web10-import`. Every handler
persisted every record under its own job ID: overlapping A/B jobs copied each
other's logs, and unrelated background logs entered both traces. An owner gate
on subsequent trace reads cannot undo already misattributed storage.

D90 requires durable owned diagnostics, full tracebacks, checkpoints and the
existing keep-exports debugging switch. This repair changes attribution, not
content retention policy, permissions, queue behavior, storage schemas or import
results. It introduces no app-specific API concept or new endpoint.

## Repair

A ContextVar identifies the unique active handler, not just its job ID or thread.
`filter` rejects foreign/unowned records BEFORE handler-lock acquisition; `emit`
also checks ownership and temporarily clears the context during formatting and
event insertion. A store-write warning therefore stays available to general
logging without recursively inserting trace rows or acquiring foreign handlers'
locks. The original context is restored even on failure.

The job context manager restores the previous token, removes and closes its
handler on every exit. Nested contexts capture only the innermost scope, even
for identical job IDs. Each actual thumbnail submission gets a distinct
`copy_context().run`; owned child diagnostics survive without reusing one Context
concurrently or leaving it attached to a pool thread. Arbitrary new threads/raw
executor submissions do not inherit job ownership automatically.

## Evidence And Verification

Two actual-handler/inert-insert tests failed at baseline: synchronized concurrent
jobs plus an unowned thread produced six trace rows instead of two; nested
contexts copied the inner message into the outer trace. Both now pass, preserving
owned message text/severity while unowned output remains in general logs.

Fresh review found a lock cycle in the first candidate: ownership checked only
inside `emit`, after Handler.handle had locked. Two simultaneous failing inserts
could deadlock their warning calls against each other's handler locks. An isolated
subprocess regression failed before the pre-lock filter (exit 2), passes after
(exit 0), and exits explicitly so a regression cannot hang pytest/logging shutdown.
The reviewer replayed both corrected and filter-removed variants and verified
that rejected records do not invoke foreign-handler lock acquisition. This
regression was fixed, not accepted as residual risk.

Nine new controls cover overlap/unowned logging, nested exception restoration,
same-job nesting without duplicate rows, two simultaneous real thumbnail tasks
on success/error, reusable-pool context reset, nonrecursive store failure and
recovery, synchronized store-failure liveness, and `_process_job` stages/cleanup.
Real event-row construction and the worker's real executor/pipeline orchestration
run over inert storage/network-dependent operations; no live service is used.
Existing tests retain full traceback capture, owner-gated trace reads and import
write/idempotency/keep-exports behavior. Cleanup/outer-worker logs already outside
the capture scope stay outside, rather than contaminating another job.

- Focused trace/worker/endpoint suites: 74 passed.
- `uv run --frozen pytest -q --disable-warnings --tb=short`: 1,225 passed, four subtests passed.
- Ruff lint/format and `git diff --check`: pass.
- Independent baseline/current overlap replay: A's canary reached A+B before, A only after. Additional formatter/store-failure probes restore ownership and detach correctly.

## DESIGN-INTENT REVIEW

- Intent: durable per-job diagnostics/full tracebacks without diagnostic failure killing imports; D90 queue/checkpoint/keep-exports model unchanged.
- Delta: traces exclude foreign/unowned execution and capture explicitly propagated thumbnail work; suppressed records are rejected before locks.
- By-design conflict: none found; owned messages are not redacted/truncated, stages and results remain pinned.
- Conventional deviation: detailed owner-scoped trace retention is intentional, not a blanket metadata-only logging conversion or operator-blindness change.
- Limits: synthetic dependencies, not real ClickHouse/MinIO, production concurrency, deployed versions, arbitrary third-party handlers or historical exposure.

Accepted for this bounded local repair, 27.10.2026: those operational integration
limits remain unverified. New child execution paths must propagate ownership
explicitly. Reopen on handler/filter changes, new asynchronous paths, missing
owned diagnostics or storage-failure hangs. Same-model review does not waive
required diverse sign-off. Historical contaminated rows and actual cross-owner
HTTP disclosure remain unassessed; no cleanup, rollout, whole-worker or L1 PASS.
