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
| [D117](../../strategy/decisions.md#d117--documents-become-versioned-pointers-to-immutable-typed-rows-direction-cell-pending) | DIRECTION | Versioned pointers and immutable shareable typed values; assembly cell pending |
| [D118](../../strategy/decisions.md#d118--storage-shape-is-not-export-shape-decided) | DECIDED | Export is boundary assembly, not the physical storage prescription |
| [D119](../../strategy/decisions.md#d119--apps-declare-typed-keys-writes-enforce-the-declaration-direction-cell-pending) | DIRECTION | Apps declare typed keys; future write enforcement, no per-key DDL |
| [D120](../../strategy/decisions.md#d120--answer-the-question-once-rather-than-over-read-on-every-request-principle) | PRINCIPLE | Pre-answer question shapes with suitable satellites, not repeated scans |

These extend D60's generic seams, D109/D113's delivery direction and D114's
tallies. App meanings remain data. The current JSON/`ref_value` schema is still
documented in [clickhouse.md](clickhouse.md); do not mistake an intent entry for
an implemented replacement. In the row-model direction no new `documents`
projection is intended: question shapes belong in their satellites.

## Banked evidence, not new measurements

The receipt lineage is PRs #1587/#1589/#1590/#1591. Reports, query IDs, statement
digests and accounting scopes—not PR numbers alone—bound the following facts:

| Question | Banked actuals | Evidence and limit |
|---|---|---|
| Counts over documents | 91,897,589 / 176,400,726 / 247,081,302 rows for standalone reactions/reposts/comments | [Treated completion](../../../research/experiments/costfn/evidence/engagement-finish-20261118/RESULTS.md), non-additive diagnostics |
| Views over raw events | 1,474,936 rows / 98,621,175 bytes → aggregate 344,064 / 46,216,238 | [26.x A–D](../../../research/experiments/costfn/evidence/engagement26-20261118/RESULTS.md), exact parity; 132→168ms single sample is **not** a latency win |
| Read-time node-ad inventory | 88,364,203 rows / 9,933,017,043 bytes, statement `4bc916c85c420f45a56d98424274efe1f83483092363c8c9fdae1194c24765f6` | [Treated completion](../../../research/experiments/costfn/evidence/engagement-finish-20261118/RESULTS.md), statement cost, not whole response |
| Stored ordinary counts | Each standalone tally lookup 1,600 rows / 107,200 bytes; follow-ups together 2,688 / 353,839 | [Tally report](../../../research/experiments/costfn/evidence/engagement-tally-20261119/RESULTS.md), ordinary parity measured; all20 paired roots omitted from five verification domains, full acceptance **OPEN** |
| Complete responses | Treated projection/uniform K20 59,461,806,191 / 52,097,155,602 bytes; tally projection/uniform 224,523,076 / 10,128,634,167 | Same completion/tally reports; parity observations do not erase budget FAILs or paired coverage gap |

The [completion report](../../../research/experiments/costfn/evidence/engagement-completion-20261118/RESULTS.md)
banks the untreated26.x baseline at 4,551.675ms / 222,387,685 bytes, exact parity
PASS/budget FAIL. None of the new decisions changes those receipts. Do not
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
queryable-values-only decomposition. Neither verdict exists yet.

This KB task performs **documentation only**: no code, leases or native
execution. It grants no additional execution admission. No new billboard,
N-ref or row-model measured PASS is recorded; live maintenance, integration,
production and §8 remain gated. Preserve every prior failure and superseded
design rather than rewriting yesterday's evidence to flatter today's plan.
