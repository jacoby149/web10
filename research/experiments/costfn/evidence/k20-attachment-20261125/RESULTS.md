# K20 hybrid attachment history: fewer reads, slower complete response

The hybrid preserves exact complete-response parity and reduces captured logical
reads **70.6%** in both measurement orders. It increases complete HTTP wall time
in both. This run does not advance to the six-case cell: the I/O saving did not
carry through to latency and dynamic publication with concurrent cleanup has
not been proven.

Both warmups and both measured responses for each arm passed the same independent
oracle. Each measured pair shared identical quiet delivery history. The hybrid
reused the [Step 2 fixed store](../k20-projected-20261125/RESULTS.md); nothing in
its preparation, candidate window, ranking, or oracle was rebuilt or replaced.

| Measured order | Arm | Rows read | Logical bytes read | Largest statement memory (B) | Summed native ms | Complete HTTP ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Indexed → hybrid | Indexed | 8,942,938 | 620,851,039 | 87,968,547 | 1,094 | 5,741.635 |
| Indexed → hybrid | Hybrid | 3,265,935 | 182,335,633 | 85,807,499 | 1,093 | 6,739.253 |
| Hybrid → indexed | Indexed | 8,942,938 | 620,851,039 | 89,277,539 | 1,054 | 5,490.085 |
| Hybrid → indexed | Hybrid | 3,265,935 | 182,335,633 | 90,930,384 | 1,059 | 6,336.874 |

The table is captured native work, except the separately measured HTTP column.
Each sample had 12 additional request-tagged auxiliary statements, 60 rows and
6,840 bytes. The hybrid's extra generation-fence work is charged to captured
work: that stage increased by 7,062 logical bytes; captured statements rose
75→80. Summed native duration is not CPU time; these fixed-order sample pairs
are not a distribution or a physical disk measurement. Neither arm meets 500 ms.

| Stage, including exact body seeks | Indexed logical bytes | Hybrid logical bytes |
| --- | ---: | ---: |
| Resolution with embedded counts | 240,762,306 | 4,938,909 |
| Preparation (including untouched creative preparation) | 303,819,000 | 101,119,929 |

On the native plans, the two attachment reads in the Step 2 projected resolution
went from 323 and 54 selected granules to 21 and 1 in the skinny table. The
projected preparation key read went from 323 attachment granules to 21. The
rest of preparation includes unchanged authorized creative work. These are plan
granules, not table-level byte attribution. The measured hybrid adds a whole
layout and generation checks, not just a body projection.

## Separate build and fault evidence

Native copy read 59,796,005 rows and 5,084,235,508 logical bytes; it wrote
59,796,005 rows and 5,682,269,450 logical bytes, in a 7,806 ms statement with
1,419,783,780 B peak statement memory. `OPTIMIZE FINAL` took 61,694 native ms.
Those are setup receipts, not complete-read costs. All 32 native subdivisions
matched the exact attachment history multiset, including versions, tombstones
and raw multiplicity; no conflicting timestamp tie was found.

The frozen-generation fault lab passed seven named cases with 43 native
statement receipts. It exercised an unpublished missing staged row,
identical publication retry after discarding the acknowledgement, a detached
committed satellite and reattachment, stale-generation refusal after a
canonical edit, exact rebuild after satellite loss, and missing/conflicting
exact-version payloads. It used isolated fixtures and rechecked the original
measured store before and after. It did **not** prove live concurrent publish or
cleanup safe, and it did not replay either measurement.

## Provenance, custody and cleanup

- Same admission and host `622910856`, ClickHouse `26.10.4.207`, 32/28/22 GiB.
  Starting merge `7f8fc1e1d9a5a315848ee68958d1e273921a84fb`; Step 2 repair
  `93806d5c6bd7560032c4d17c98a2fa20af630c39`; Step 3 measured
  `9d4e81da6061085341a21b1ce52045b0cef452e8`; fault phase/final executable
  `f5b9a061177dc8f7b69e9c7fd49441a853abb745`.
- Private off-host archives verified before deleting owned resources at
  `2026-11-25T02:41:21.525465Z`. Snapshot `255003176` retained. Estimated
  task compute **$3.795870**, not an invoice, including idle time between
  provisioning and the interrupted launch. The old four-hour attempt's
  $0.781173 estimate is separate.

| Private archive | Bytes | SHA-256 |
| --- | ---: | --- |
| Task state, plans, and receipts | 16,087,262 | `77992b2a786c248fa63f16f0c5cee0f55cb7007a29a057bcbc9bd0d70b38f744` |
| Stopped native query-log parts | 10,386,473 | `b97cf9999c296e109f083d97f3f43a527a76ef771355a77c2f441375acbdda63` |
