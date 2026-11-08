# Attachment-history partition pruning — 8 November 2026

## Intent and delta

The million-author three-host preflight restored the pinned dispersed V2 input
and passed initial exact results, but all six overlapping main requests reached
the unchanged ten-second SQL limit. Primary points completed: zero. Read-only
plans show whole-table document and attachment windows, including canonical
reads for only 21 requested IDs. This is a performance finding, not a reproduced
confidentiality exploit or a ClickHouse dataset-size limit.

Move only the trusted readable `group_id IN (...)` predicate into the
`doc_groups` history SELECT before `row_number()`. Its partition key is
`(doc_id, group_id)`: the predicate removes complete partitions, retaining every
version of every readable link. Remove the equivalent outer predicate so a
1,000-group list is still emitted once per service. Keep deletion filtering
after ranking. No new CTE, external field, grant cache, bypass or timeout change.

## Bounded evidence

- Predicate-placement regression fails on the original compiler and passes with
  the patch. Fifteen durable controls retain tombstones, reattachment, unreadable
  alternates, per-group multiplicity, quotes, duplicate IDs, caller CTEs and
  blacklist/sharing/hidden/ban rules. SQLite executes the full generated boundary.
- Eight actual ClickHouse 24.8 constant-CTE controls compare original compiler,
  candidate and expected rows. EXPLAIN confirms no storage tables are reached:
  no production data or test-table writes. All eight match.
- Named single-pass SQL diagnostics on the restored synthetic input: main
  7,606 → 2,423 ms with identical ordered output; canonical post read
  1,691 → 577 ms with identical complete row multiset (no SQL ordering contract).
  Main physical rows read remain 36,000,020: reduced window work is not index
  pruning. These are diagnostic observations, not independent study repeats.
- More aggressive exact-ID/semijoin variants remain hypotheses; they are not
  included in this runtime patch. Canonical authority reads and ad checks stay.
- Original failed acceptance, image/source identities and raw diagnostics are
  archived before the fresh candidate replay. Public summary:
  `research/experiments/costfn/evidence/cloud-preflight-20261108.json`.

## Review and limits

Three fresh scoped reviews find no concrete blocker; they are same-family, not
model-diverse assurance. One reviewer additionally ran 4,332 temporary SQLite
parity comparisons. The design-intent verdict is unchanged generic service/group
visibility with less history-window work, not a stricter policy or social-only
node feature.

Inherited document/attachment timestamp ties remain nondeterministic: retaining
the same candidate versions does not guarantee an identical observed winner
between plans when `updated_at` ties. This patch does not add deletion-winning
tie resolution. Real merge/concurrent-mutation, diverse sign-off, fresh accepted
study source and normal PR/CI/deployment gates remain OPEN. No L3/L4 or
whole-query-engine security PASS.
