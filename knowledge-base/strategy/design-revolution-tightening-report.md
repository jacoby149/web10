# Design-revolution tightening — seven-task audit

Jacob Hoffman's 19 November 2026 directive asks a future reader to distinguish
what runs, what was chosen, what was measured, and which document governs next.
This pass changes documentation only. A green source test is not a native cell;
a decision is not a deployment. There is no new lease, engine execution,
application change or alteration of a banked measurement in this pass.

## 1. Name the two sides

The [per-occurrence inventory](design-revolution-boundary-inventory.json) records
**826 word occurrences across 189 files**, with original line/column, before and
after excerpts, current replacement ranges and a disposition for every instance.
It includes Markdown under `knowledge-base/` and `research/experiments/costfn/`,
`AGENTS.md`, and a supplementary JSON/TXT/RST/ADOC documentary scan. Plurals and
hyphenated prose are included. Code identifiers and compatibility anchors are
identified rather than renamed. The inventory is an audit of quoted wording,
not another current design specification or measurement report.

| Disposition | Occurrences | What happened |
|---|---:|---|
| Changed living prose | 294 | Named the exchange, or used the actual non-interface noun |
| Archived/release history | 152 | Retained verbatim |
| Immutable Markdown evidence/review records | 245 | Retained verbatim |
| Older decision/kickoff/completion narrative, quotations or already-named interfaces | 95 | Retained with current rule/successor context |
| Contextual continuation/literal quotation | 1 | Retained; its named exchange is in surrounding text |
| Older costfn directive/report | 28 | Retained; the README index identifies its status/successor |
| Non-Markdown evidence | 11 | Retained verbatim |

The settled writing rule is [interface-language.md](interface-language.md).
The main corrections are concrete:

- SQL compilation: **at the API -> ClickHouse boundary**, the API supplies
  authorized SQL. “Boundary CTE” becomes “API-generated access-filtered CTE” in
  living query/SDK guidance. Table access authorization is not physical scan pruning.
- Credentials and consent: distinguish **app -> API**, **app -> authenticator**,
  and **credential-window -> app** handoffs instead of a generic “trust” label.
- Media: distinguish **API -> object-storage signer** authority from
  **node capability issuer -> CDN edge verifier** checks.
- Federation: **reader app -> serving-node API** carries content requests;
  **serving-node API -> home-node API** certifies tokens. Neither is a foreign
  ClickHouse connection, and neither implies anonymous transport.
- Preview fetching: **preview service -> remote HTTP origin** is the SSRF
  exchange. CORS permits browser reads; a rate damper is a separate control.
- Telemetry: **browser page -> PostHog** capture is distinct from the proposed
  **API -> PostHog** flag-decision seam in AB-06. Authenticator consent is not
  substituted for that server/vendor exchange.
- Non-interface meanings now say calendar cutoff, mention-token delimiter,
  complete-word truncation, scope, or membership-cutoff transition.

`ROW-MODEL-RUN.md` now names API -> app/UI export serialization. The banked
`evidence/all-fixes-source-20261119/source-controls.json:19` phrase “JSON at
boundary/ingest only” is preserved and inventoried: request JSON enters through
app -> API; assembled response serialization leaves through API -> app/UI.
No receipt is rewritten to improve its prose.

Original kickoff narratives next to completed group-metadata entries are marked
historical rather than turned into new build instructions. Original quotations,
the D84 kickoff, older ledger rationales, changelog entries, scan records and
superseded arm blocks remain visible. Their vague words in the inventory are
intentional historical exceptions, not a claim that the repository has no
remaining literal matches.

## 2. Keep decision and acceptance statuses separate

The [decision ledger](decisions.md) remains the canonical design authority:

| Decision | Unchanged status |
|---|---|
| D115 | DECIDED |
| D116 | DECIDED |
| D117 | DIRECTION — cell pending |
| D118 | DECIDED |
| D119 | DIRECTION |
| D120 | PRINCIPLE |
| D114 acceptance | OPEN on the paired gate |

No new native PASS is found or inferred. Ambiguous/overbroad presentation was
corrected in these places:

- `web10-v3/README.md` no longer calls every page finalized implemented
  architecture; it separates current implementation from chosen directions.
- `ROW-MODEL-QUEUED.md`, `ROW-MODEL-RUN.md` and `AGENTS.md` distinguish implemented
  source machinery from D117's pending native proving cell and production cutover.
- `db/tallies.md`, the ledger and plan/lane summaries keep ordinary observations
  separate from the missing actual-paired-root check. Repaired source is not
  repaired native acceptance. Old coverage-repair admission is consumed/cancelled.
- Query/SDK wording no longer treats authorized projected inputs as automatic
  canonical signing authority, or a logical CTE restriction as a scan-cost bound.
  The existing preparation gaps stay linked, not declared fixed by prose.

The prior D115–D120 entries already used the required status labels. This pass
does not invent a mistaken DECIDED label to downgrade; it removes the surrounding
ambiguity that could make intent or source implementation look like proof.

## 3. Label current implementation and intended replacement

`db/clickhouse.md`, `query-engine.md`, `safe-query.md`, SDK API/contracts/SQL
guides and affected social composition pages now say that JSON bodies,
single-`ref_value` columns and projection examples describe current/legacy
implementation. They link D116 (DECIDED), D117 (DIRECTION, cell pending) and
D118 (DECIDED), rather than prescribing a permanent JSON-plus-index hybrid.

The ad pages point at D115/D116 instead of repeating a competing future
selection contract. Existing production descriptions are retained, not silently
replaced with target DDL. The earlier `web10-social-v3/` and affected `web10-v4/`
proposals are labelled historical on the individual pages; related gauntlets
are labelled current app/API verification plans rather than storage targets.

The [design map](../web10-v3/db/design-revolution.md) is navigation, not a second
specification. Canonical JSON remains experimental source/oracle/fallback until
replacement proof, not an assertion that the intended replacement stores JSON.

## 4. Link canonical facts; do not recopy results

Design definitions remain in `decisions.md`. The map, schema notice, ad notices
and agent orientation link there. Isolated run checklists remain operational
applications of those decisions, not independent implementation-status oracles.

Exact measurement homes are:

- [Treated completion](../../research/experiments/costfn/evidence/engagement-finish-20261118/RESULTS.md): complete treated responses, inventory statement and standalone count diagnostics.
- [Tally results/domain audit](../../research/experiments/costfn/evidence/engagement-tally-20261119/RESULTS.md): ordinary stored-count costs, fat/sample checks, response totals and OPEN paired acceptance.
- [Modern-engine A–D report](../../research/experiments/costfn/evidence/engagement26-20261118/RESULTS.md): independent raw/aggregate views and migration proof.
- [Completion attempt](../../research/experiments/costfn/evidence/engagement-completion-20261118/RESULTS.md): untreated modern baseline and preserved stopped treated work.

Copies were checked and replaced by report links in D115/D120, the design map,
`db/tallies.md`, `AGENTS.md`, `ALL-FIXES-THEN-MEASURE.md`, the README motivation,
and the duplicated tally/treated-completion/completion-lease/native-review queue
entries in both `plan.md` and `parallel-execution.md`.

**Numerical discrepancy audit:** no incorrect exact value was found in those
targeted benchmark copies. The following are not exact interchangeable values:

- The all-fixes directive's old **59.462GB / 52.097GB** were rounded decimal
  shorthand for the captured-query response totals, not exact byte figures.
  They are replaced with links, not “corrected” inside a receipt.
- The prior README's **88.64M** was a rounded *selection estimate*, not the
  stopped statement's actual reads. That explanatory copy is now a report link.
- Independent Stage B raw/aggregate views and a complete response's raw-views
  stage have different accounting/query scopes. The former must not be
  substituted arithmetically into the latter. A single latency observation is
  not a latency win or p95.
- Captured-query totals and request-tagged inclusive totals differ by separately
  reported auxiliary work. They are not transcription errors or interchangeable
  historical comparisons. Standalone count decomposition is non-additive.

Completed historical queues, superseded directives and old changelog entries
retain their original exact/rounded observations. They are not new canonical
copies or current admission; their successor/report links control interpretation.
No banked number, raw PASS flag or original FAIL/STOP was edited.

## 5. Make directive precedence boring

The [costfn directive index](../../research/experiments/costfn/README.md#directive-precedence-index)
classifies every top-level directive/runbook/report in that folder. It names
operative contracts, executed-and-banked work (including partial/failed attempts),
superseding successors and the queued cell's predecessor. Older originals are
unchanged; the index carries the status.

Current execution policy and `ALL-FIXES-THEN-MEASURE.md` govern together. Both
source implementations are prepared before spending; all-fixes measurements
bank before row-model assembly measurements. `ROW-MODEL-RUN.md` is a source
runbook, not a banked cell. Validation-engine/custody/recovery contracts are
separate from measurement-engine selection and do not admit a rebuild or host.
No original lease is reopened by a surviving command or historical “run” verb.

## 6. Record the deliberate research-track choice

D121 (DECIDED) records the retarget; [paper-submission.md](paper-submission.md)
owns the dates, official-call re-verification gate and fallback. Plan/lane entry
points now link there. The former industrial deadline/rationale is explicitly
historical, and the former CIDR target is no longer the current programme target.

The target is **SIGMOD RESEARCH, January round of SIGMOD 2028**, with **PVLDB
monthly research rounds after rejection**, never concurrent submission. The
**January 10/17, 2027, 11:59 PM AoE** abstract/conflict and paper dates are
**projected from the two preceding cycles**, not published SIGMOD 2028 dates.
They require re-verification when the official call posts. Official prior-call
and PVLDB links are on the canonical page. The existing **twelve pages excluding
references** plan is unchanged. No manuscript rewrite or submission occurred.

## 7. Reconcile indexes, source PR state and changelog

Read-only GitHub inspection found:

- [PR #1592](https://github.com/jacoby149/web10/pull/1592) merged into `dev` on
  19 November 2026 at 12:02:53 UTC, merge `f400251c282a54a80fdd062a95d777052b69f9e2`.
  It records the design pages **and research source controls**, not a native
  replacement-storage result. Its new Markdown pages are indexed.
- [PR #1593](https://github.com/jacoby149/web10/pull/1593) is **OPEN**, head
  `ea490ce4edc7636485114ee7c4cab3660577bf6a`, base `dev`, at this audit. Its three
  displayed checks pass. It adds run/worker/native/action integration source,
  tests and `ROW-MODEL-RUN.md`. Committed source is not merged work or native proof.
- The changelog's existing 6.24.4 documentation entry and 6.25.0 source entry
  describe their original checkpoints. Later source integration does not erase
  the earlier checkpoint's then-open integration gate. The new 6.25.1 entry
  records this documentation reconciliation only; old entries remain byte-identical.

The root KB index and v3 index now reach the decision/evidence map, directive
index, all-fixes contract, queued row-model cell and source runbook. New language,
paper-target, report and per-instance inventory pages are indexed as well.

### Integrity checks and limits

- All **161 pre-snapshotted protected Markdown records** retain their hashes.
  The two additional dated security-review/retirement records inspected during
  classification are also retained verbatim. Evidence directories have no diff.
- The three pre-existing Python changes remain unmodified and outside this
  docs task. Their combined `git diff` SHA-256 remains
  `6f0a1aa2a2538f2dea327f0119c4f13ef60db990aad8c35994f833730f8c1182`.
- Verification is documentation-only: inventory coverage, local link/anchor
  checks, protected/history comparisons and whitespace checks. No application
  tests, local/native engines, cloud resources or production requests ran here.
- PR state is an observation at audit time, not a promise about later merges.
  No new measurement or native acceptance is inferred from this report or CI.
