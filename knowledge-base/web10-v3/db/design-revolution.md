# The 19 November design revolution — intent and receipts

A node should answer a small question without rereading its entire history.
Jacob Hoffman's 19 November 2026 direction changes how relationships, placements
and ultimately document values are represented. It does not announce a shipped
storage engine. The ledger below separates the decisions from their proof.

## Decision map

| Entry | Status | What changed |
|---|---|---|
| [D115](../../strategy/decisions.md#d115--ads-are-a-billboard-not-a-tracker-decided) | DECIDED | Static reusable ads; author-first post-time pin, no read-time repick |
| [D116](../../strategy/decisions.md#d116--docs-are-nodes-refs-are-edges-a-generic-n-ref-satellite-decided) | DECIDED | Derived N-ref pairs replace the single-ref design and, after parity, treated `ref_sorted` |
| [D117](../../strategy/decisions.md#d117--documents-become-versioned-pointers-to-immutable-typed-rows-measured-maximal-rejected) | MEASURED | Maximal payload decomposition rejected on assembly cost; keep queryable values as rows and payload as document content |
| [D118](../../strategy/decisions.md#d118--storage-shape-is-not-export-shape-decided) | DECIDED | API -> app/UI export shape does not prescribe API -> ClickHouse storage |
| [D119](../../strategy/decisions.md#d119--apps-declare-typed-keys-writes-enforce-the-declaration-direction-cell-pending) | DIRECTION | Apps declare typed keys; future write enforcement, no per-key DDL |
| [D120](../../strategy/decisions.md#d120--answer-the-question-once-rather-than-over-read-on-every-request-principle) | PRINCIPLE | Pre-answer question shapes with suitable satellites, not repeated scans |

These extend D60's generic seams, D109/D113's delivery direction and D114's
tallies. App meanings remain data. The current JSON/`ref_value` schema is still
documented in [clickhouse.md](clickhouse.md); do not mistake an intent entry for
an implemented replacement. In the row-model direction no new `documents`
projection is intended: question shapes belong in their satellites.

## Canonical homes: decisions here by link, measurements in reports

The [decisions ledger](../../strategy/decisions.md) owns the design definitions
and statuses above. This page is a navigation map, not a second specification.
The API JSON record format describes the app -> API input and API -> app/UI
response. D118 (DECIDED) does not require that representation in ClickHouse.

The receipt lineage is PRs #1587/#1589/#1590/#1591. Reports, query IDs, statement
digests and accounting scopes—not PR numbers alone—control the numerical facts.
Read the report rather than copying a rounded figure from another page.

| Question | Canonical measurement report | Required qualification |
|---|---|---|
| Document counts and read-time ad inventory | [Treated completion](../../../research/experiments/costfn/evidence/engagement-finish-20261118/RESULTS.md) | Isolated diagnostics are non-additive; inventory cost is not whole-response cost |
| Raw and aggregated views | [26.x A–D](../../../research/experiments/costfn/evidence/engagement26-20261118/RESULTS.md) | Exact parity is banked; the single sampled latency is not a latency win |
| Ordinary stored counts and tally responses | [Tally report and domain audit](../../../research/experiments/costfn/evidence/engagement-tally-20261119/RESULTS.md) | Ordinary observations stand; D114 paired/full acceptance remains **OPEN** |
| Complete treated responses | [Treated completion](../../../research/experiments/costfn/evidence/engagement-finish-20261118/RESULTS.md) and [tally report](../../../research/experiments/costfn/evidence/engagement-tally-20261119/RESULTS.md) | Their budget FAILs and captured-versus-auxiliary accounting stay distinct |

The [completion report](../../../research/experiments/costfn/evidence/engagement-completion-20261118/RESULTS.md)
banks the untreated modern-engine baseline, exact parity PASS/budget FAIL.
None of the new decisions changes those receipts. Do not
subtract diagnostic components from mixed statements or substitute aggregate
views costs into a response that actually queried raw events.

## What happens next, and who does it

“Make all the fixes, then do the experiments.” The implementation thread owns
source preparation, including row-model source before spending on execution.
The ordered proof is [all-fixes composition](../../../research/experiments/costfn/ALL-FIXES-THEN-MEASURE.md)
first, then [post-family row-model assembly](../../../research/experiments/costfn/ROW-MODEL-QUEUED.md).
The latter retains canonical JSON as source/oracle/fallback while testing a
JSON-free treatment. Same-cost-class parity supports the maximal version at
page scale; order-of-magnitude assembly cost rejects it in favour of
queryable-values-only decomposition. The measured cell triggered that rejection
rule in all six comparisons.

The [operative directive index](../../../research/experiments/costfn/README.md#directive-precedence-index)
owns which research document currently governs. The [source runbook](../../../research/experiments/costfn/ROW-MODEL-RUN.md)
describes the committed machinery; the [completed proving-cell report](../../../research/experiments/costfn/evidence/row-model-4096-20261123/RESULTS.md)
owns the numerical evidence and custody.

Documentation work grants no code, lease or native-execution admission. The row-model
result is parity PASS and maximal economics REJECT; live maintenance, integration,
production and §8 remain gated. Preserve every prior failure and superseded
design rather than rewriting yesterday's evidence to flatter today's plan.
