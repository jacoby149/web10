# Q02 readable-join investigation — rejected, code removed

## Decision

**Do not promote either early-join candidate.** Operator: “we should doc our
findings, and make a pr. ge rid of the changes here to the code for sure if it is
a bad optimization”. This PR records the investigation only. All unpublished
Q02 application code, compiler flags, added harnesses/tests and changes to Q01
tests are removed. `api/` matches the merged Q01 baseline; #1448 is untouched.

The sparse-read gain was real in the local diagnostic. It did not establish an
overall improvement: overlapping histories made the unrestricted plan materially
worse, and restricting it to one readable group still left dense-read tradeoffs.
Correctness parity is not performance acceptance. A passing API suite did not
justify promotion.

## What was tried

The baseline ranks document histories before joining current readable group
attachments. The objective was to avoid ranking unrelated documents for a reader
who can see only a small slice of the service.

1. **Readable-ID semijoin using a CTE.** A boundary-local CTE failed native
   ClickHouse 24.8 scope/inlining with code 60, despite working in SQLite. A
   top-level CTE resolved scope, but ClickHouse inlined both references: the
   attachment relation was scanned/ranked twice. Sparse bytes fell from about
   34.08 MB to 6.19 MB, but rows read rose from 200,014 to 300,022 and broad reads
   became slower. This version was rejected.
2. **Join readable attachments before the document window.** This retained one
   document and one attachment scan. To preserve one result per readable group,
   the window included `(doc_id, author_key, group_id)`. Results matched, but
   each historical version was replicated once per readable attachment before
   ranking. `LIMIT 21` outside the window did not prevent that work.
3. **Single-distinct-group restriction.** Multi-group SQL was restored exactly
   to the baseline. A unique current link in one group cannot replicate histories,
   but this cardinality proof is not a universal cost proof: dense single-group
   reads still showed extra memory/latency. This restricted version is also
   removed, not left enabled or dormant behind a flag.

The read checks, post-rank tombstones and visibility rules were retained during
these experiments. No new authorization bypass was reproduced in the bounded
reviews. That does not turn a performance regression into an acceptable default.

## Evidence: unrestricted overlap regression

Native ClickHouse **24.8.14.39**, repository ReplacingMergeTree schemas, 200
document identities with ten distinct-timestamp versions and 100 links each.
Versions were inserted into separate parts; the probe asserted **2,000 physical
document rows, 200 identities and ten timestamps**. Two CPUs/1-GiB container;
queries bounded to two threads, 512 MiB and ten seconds. Three alternating
measured pairs followed an excluded warm-up. Outputs matched in every run.

| Readable groups | Baseline median ms | Early-join median ms | Baseline median memory B | Early-join median memory B |
|---|---:|---:|---:|---:|
| 1 | 11 | 11 | 1,345,138 | 2,540,482 |
| 10 | 9 | 18 | 1,455,908 | 20,073,240 |
| 100 | 14 | 116 | 6,857,496 | 234,678,942 |

At 100 groups that is **8.3× duration and 34.2× query memory**, despite only
2,000 document-history rows. Both plans read 22,000 rows / 1,316,899 bytes.
This was an observed existing-workload regression, not a hypothetical capacity
concern or incorrect result. It blocked unconditional promotion.

## Evidence: restricted candidate still has tradeoffs

The corrected native fixture asserted **eight retained document-history rows
and eleven attachment-history rows**, then added 100,000 irrelevant identities.
It passed 24 native parity cases, including visibility denials, history removal/
restoration, empty groups, compositions and group fanout. The overlap fixture
separately asserted 2,000 document versions and 20,000 links. Container limits
were two CPUs/2 GiB; query limits remained two threads/512 MiB/ten seconds.

| Workload | Baseline median ms | Restricted median ms | Baseline median memory B | Restricted median memory B |
|---|---:|---:|---:|---:|
| Sparse, one group | 79 | 20 | 106,977,157 | 9,818,805 |
| Public broad, one group | 56 | 67 | 135,353,511 | 121,965,496 |
| Dense overlap, one group | 7 | 8 | 1,081,790 | 2,303,758 |

The sparse case used about **91% less query memory**, with a lower local median
time. Public broad latency was worse in this small sample; dense single-group
memory more than doubled in absolute terms shown above. Physical rows/bytes did
not fall. Ten/100-group SQL was identical to the baseline, so timing differences
between those arms are noise, not a gain. These are local diagnostics, not
independent performance repeats or proof of broad non-regression.

## Fixture and review learnings

- **Stopping merges does not prove retained histories.** A single insert into
  ReplacingMergeTree can collapse same-key versions. Separate version parts and
  assert physical row/identity/timestamp counts before claiming pre-window
  tombstone coverage. Initial unasserted-history receipts remain historical
  diagnostics, not the corrected history proof.
- **SQLite is not a native-engine oracle.** It missed the CTE scope failure;
  UNION ordering also differed until the fixture used an explicit outer ordered
  SELECT. Neither failure justified weakening production checks.
- **Review must include resource workloads.** One correctness-focused review
  found no blocker; a fresh high-overlap native probe exposed the material cost
  regression. There was no model-diverse/full-L1–L4 approval of Q02.
- The removed prototype had 20 additional controls and a 2,246-test API run;
  these are historical prototype results, not tests shipped by this docs-only
  PR. The existing merged baseline has 2,226 API tests. No dormant implementation
  or executable candidate fixture remains in the repository.

## Receipts and limits

[Structured evidence](query-readable-join-evidence.json) retains all three
measured samples per arm for the overlap review and the corrected constrained
run, with fixture settings and SHA-256 provenance. Warm-ups are excluded from
these arrays. This extract is not a standalone executable reproduction package.
The rejected source/tests and raw local diagnostics are archived, gitignored, at
`.context/q02-rejected-candidate.tar.gz` (SHA-256
`12b88b50fe57b8e8c929ed0963bb22f7de8e7a24fb9ed47fcee762d159f4aa7a`).
All owned native containers were removed and absence verified. No unrelated
Docker pruning, paid hosts, production writes or deployment occurred.

**Did #1448 make the million-author experiment pass? Unknown.** Its local
exact-ID lookup gains are separate. The last actual-host strict acceptance
failed three of four measured feeds **before** #1448; no source-matched
post-#1448 million-author acceptance has run here. Do not relabel that old
failure as a post-fix failure, or local gains as full-feed success. Historical
study receipts and manuscript measurements are unchanged.

Q02 implementation is rejected/removed. A new non-amplifying design would need
fresh approval, complete-history/visibility/multiplicity parity and sparse,
broad, dense/high-overlap resource evidence before promotion. Existing real
merge/churn/timestamp, full-feed/concurrency and production gates remain open.

## Docs-only verification

After removal, `git diff --exit-code origin/dev -- api ui sdk marketing` is
empty against Q01 commit `2ae3f52c9cbd601b937859a9c5cb1550919cfa8e`.
The restored API suite passes **2,226 tests plus eight subtests, one opt-in
skip**. The evidence JSON parses and every measured array/row/byte value and
physical-history count matches the SHA-256-pinned local source receipts.
`git diff --check` passes. This validates removal and documentation, not a new
resource run, a shipped Q02 regression suite or post-#1448 capacity acceptance.
