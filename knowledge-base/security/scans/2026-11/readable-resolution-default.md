# Production readable-resolution default

## Intent and boundary

Operator: “make the fix please!” after confirming production uses per-group
resolution. Promote the existing batch algorithm into the generic read helper,
not a social endpoint. No deployment or live configuration change is authorized.

`READABLE_RESOLUTION_MODE` accepts `batched` (new default) or `per-group`
(rollback). An explicitly configured `QUERY_EVAL_READABLE_MODE` overrides only
query evaluation; its unset value becomes empty, not an implicit legacy default.
Unknown modes fail startup without echoing configuration values. Bypass/stub
flags remain separate and off by default; this is not their public-boot repair.

The public helper stays `readable_groups`; the original loop becomes the named
`readable_groups_per_group` reference. Batch resolution retains current membership,
principal-class, role normalization, tombstone/tie and order/duplicate semantics.
If every candidate has an active principal membership, one batched query suffices;
otherwise the existing class/contract queries still apply. No cache, guessed
threshold, service-wide permission shortcut or change to app-contract checks.

## Verification, 08.11.2026

Author/auditor: GPT-6.1 Sol. Changed-hunk and direct-call-path review only; no
full-file L1 or transitive L3/L4 claim. Existing I3 membership-first compatibility,
app-contract checks, exact foreign principals and current metadata reads are the
intent; neither a cross-request cache nor a new policy was introduced.

- Retained pre-fix regression: the all-member K1000 helper made 1,000 membership
  queries instead of the asserted one; settings tests also failed because the
  production setting did not exist. This is a performance/default regression,
  not a newly demonstrated confidentiality exploit.
- `cd api && uv run pytest -q`: **2,089 passed, eight subtests passed, one opt-in
  skip**, 56.86 seconds on the audited source. Ruff lint and format checks pass.
- `cd api && uv run pytest tests/test_readable_resolution.py
  tests/test_query_endpoint.py tests/test_media_delivery_compose.py -q`:
  **66 passed**, including default/rollback, explicit research precedence,
  invalid-setting refusal without configuration echo and API-only Compose wiring.
- `cd api && uv run python -m tests.test_readable_resolution`: actual
  **ClickHouse 24.8.14.39**, disposable loopback-only container, Memory tables
  retaining all supplied histories. Twelve combinations (anonymous, local member,
  stranger, foreign principal × posts/profile/other) equal the scalar reference
  and independently specified expected sets. Controls include removed/restored
  memberships and public grants, role/service changes, missing roles/contracts,
  deletion-winning ties in both insertion orders, exact local/foreign identity,
  wildcard roles, duplicate output and denied/mixed escaped candidate chunks.
  The container's removal is verified in the finally block.
- Direct all-member resolver budgets at K0/1/10/100/1000: scalar 0/1/10/100/1000
  queries versus batch 0/1/1/1/1 for these short IDs. Three measured samples after
  one excluded warm-up, alternating arm order, give K1 medians 2.607/1.935 ms and
  K1000 2,162.999/10.465 ms (scalar/batch). These are local direct-resolver
  Memory-table smoke timings, **not** HTTP/feed capacity, a mixed-public crossover
  study, manuscript measurements or a production speedup. Public/mixed parity
  cases use at most three queries for the single chunk; 3,000 escaped denied IDs
  exercise multiple bounded chunks rather than one oversized query or N queries.
- All eight `research/experiments/costfn/*.test.py` scripts pass, including legacy
  benchmark controls; both Bun source-capture files pass (four tests, 24 asserts).
  Existing historical research receipts are left immutable and are not
  source-matched acceptance for this runtime revision. The per-group comparator
  names the reference loop so production selection cannot contaminate that arm.

Workspace logs (gitignored): `.context/readable-default-red.log`,
`.context/readable-audit-full-api.log`, `.context/readable-audit-clickhouse.log`,
and `.context/readable-pr-research-tests.log`. The executable fixture and explicit
expected sets are committed in `api/tests/test_readable_resolution.py`.

## Independent bounded review

Fresh general-agent review 1 (GPT-6.1 Sol session `ses_e45373b08ffedMeHo8HJAe9MaX`)
finds no runtime blocker after inspecting selection, SQL, byte budgets, reference
fixtures and deployment/research wiring; independently reruns the 66 focused
tests. It requires replacing this record's provisional status and completing
learnings/changelog entries, now done. This is not model-diverse convergence.
Fresh review 2 (`ses_e45364c97ffeDVN205Ip4M3afp`) independently passes 375 focused
tests and reruns the real ClickHouse harness with cleanup verification. Additional
inline probes pass 5,120 deterministic scalar/batch comparisons across 80 retained
history snapshots (seed 861102), propagate failures at all three metadata stages,
and exercise registered query/compiler dispatch plus explicit-group/Origin gates.
These differential probes supplement, not replace, the independent expected sets;
the HTTP probe doubles metadata/app lookups and final execution.

Fresh integration review 3 (`ses_e4535053bffeZbhppPDvXwr0E4`) independently passes
139 focused tests, nine registered carrier cases with actual batched SQLite SQL
and sixteen registered query cases across default/rollback/research selections.
Its only requested touch-up is clarifying that B01c's shared-helper wiring is
already present while real-schema verification remains open; the queue now says
that explicitly. Supplemental inline probes are review evidence, not committed
regressions or actual ClickHouse/Origin/signing proof. Both later reviewers retain
their initial SQLite thread/backup harness failures and corrected passing probes;
those failures did not demonstrate a product defect.

Three fresh bounded reviews found no demonstrated runtime blocker. All use the
same model family, so this is **not** model-diverse convergence or full L1–L4
closure; those gates remain OPEN rather than being silently waived.

## DESIGN-INTENT REVIEW

- Intended behavior: Apps compose currently readable generic services while
  app contracts and document boundaries retain authority. Preserve implemented
  membership-first reads plus applicable public/authenticated service grants
  (D58/D60/D73; `groups/access.md`, `query-engine.md`).
- Changed behavior: App/fan reads through the generic helper use chunked batch
  metadata by default; operators can roll back to per-group without removing
  authorization. Research overrides explicitly select their reference algorithm.
- By-design conflict? No new conflict found; D41 readability, D60 genericity and
  legacy orphan/undefined-role member compatibility are unchanged.
- Conventional standard violated intentionally? No new deviation; existing
  node-readable data policy is intentional under D41, not a new privacy promise.
- Tests cover the delta? Yes within the bounded local expected-result, history,
  class/service/foreign, chunk/order, setting and Compose controls above; the
  fresh reviewer independently reran 66 focused tests.
- Untested intent risk: Mixed/public latency, real merge/concurrent mutation and
  exhaustive default-batched carrier/HTTP integration are not established by
  scalar carrier fixtures or Memory histories. Accept only bounded local source
  promotion with rollback; retain these as OPEN before production acceptance.
- KB write-back: Dated learning, coverage record, access/query contracts and
  completion/remaining-rollout queues updated together; no new policy decision.

## Remaining gates — OPEN

Real ReplacingMergeTree lifecycle, concurrent permission mutations and atomic
snapshots are not certified (neither algorithm promises an atomic snapshot).
Mixed/public small-set crossover, representative full-feed resource/load,
independent model-diverse review and approved dev/production deployment/config
verification remain OPEN. This is not whole-security assurance, shipped batching,
submission readiness, a newly accepted benchmark or permission for paid execution.
