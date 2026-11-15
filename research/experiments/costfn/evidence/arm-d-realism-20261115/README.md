# Arm D realism: INVALID at the warm-up

**Report to Jacob — 15 November 2026.** The standalone copy built and settled,
but the unchanged author shortcut did not preserve main-query aggregates.
The 21 document IDs and their order match the independent reference. Every
returned row reports **15 likes and 15 comments**, while the canonical
K20-plus-self group-scoped main reference expects **0 and 0**. Stop here:
**zero measured trials, no K1000, no treatment repair or further cell**.

This is not a reaction-follow-up failure. It is a mismatch in the main's
joined aggregates. Removing the document/group join admits author-owned
engagement that is outside the main's selected attachment scope. Having
one attached author per followed group does not prove that all documents
by that author belong to that group. The owner shortcut loses that distinction.

## Build and part receipt

Input remains `2d6bbc4d89dfa5f9bfc43da3d8bc1395a915ae26061a4f120a0f1e3e19f8dddd`.
The retained isolated DO host is619371600; ClickHouse24.8.14.39,32GiB host,
28GiB container,22GiB server/query cap and ten-second main ceiling are unchanged.
Only `documents_d` was created/consolidated. Original tables were not renamed,
replaced or optimized by this run.

| Setup check | Receipt |
|---|---|
| Sort key | `(author_key, created_at, doc_id, updated_at)` |
| Source documents | 88,200,300 rows |
| New copy | 88,200,300 rows, exact count match |
| External sort/group threshold | 2,147,483,648 bytes each |
| Query temporary-disk cap | 107,374,182,400 bytes |
| Query memory cap | 23,622,320,128 bytes |
| Setup threads / join algorithm | 4 / full_sorting_merge |
| INSERT SELECT elapsed | 277.599s, setup only |
| OPTIMIZE FINAL elapsed | 131.827s, setup only |
| Settlement | Three identical censuses, no active merges |

| Table | Parts before → after | Rows after |
|---|---:|---:|
| documents_d | 11 → 1 | 88,200,300 |
| documents | 1 → 1 | 88,200,300 |
| doc_groups | 1 → 1 | 92,200,600 |
| doc_groups_t | 1 → 1 | 92,200,600 |

All tables have one `all` partition. Exact counts are verified; no new claim
of exhaustive all-column equality follows from counts alone. The initial
escaped-SHOW-CREATE setup failure is preserved in `arm-d-realism/`, together
with its executing source. The JSON-decoded retry is `arm-d-realism-r1/`.

## Parity and native observations

Reader index1 is `rd42-u0980001`, the original20 follows plus self, LIMIT21.
The base-series compiler pin exactly matches the preserved realism baseline
after removing only its Native output format. The transform is unchanged;
its only physical substitution is `FROM documents` → `FROM documents_d`.

The raw native JSON encodes UInt64 aggregate values as strings, unlike API
Native decoding. The runner used the existing API-oriented validator directly.
An additional **offline** numeric-normalization replay therefore checks the
failure independently of representation: all21 rows still have actual15
versus expected0 for both likes and comments. This is a genuine value mismatch,
not merely string-versus-integer inequality. No engine rerun or oracle change.
Other projected values pass the separately labelled offline isolation check;
that diagnostic does not turn failed aggregate parity into a pass.

| Observation | Native rows | Logical bytes | Native duration | Status |
|---|---:|---:|---:|---|
| Excluded warm-up main | 6,512,640 | 962,112,014 | 1,030ms | INVALID: aggregate parity fails |
| Measured trial1 | — | — | — | Not run: parity gate |
| Measured trial2 | — | — | — | Not run: parity gate |
| Measured trial3 | — | — | — | Not run: parity gate |

The three unchanged owner/membership/policy verification queries additionally
read2,928,706 rows/237,405,246 bytes in146ms summed native duration. Main plus
those verifications totals9,441,346 rows/1,199,517,260 bytes/1,176ms, excluding
setup/oracle/inspection. These are query-ID-attributed native observations,
not HTTP latency or a successful performance trial. The10M-row anomaly rule
did not fire. The invalid warm-up also exceeds both performance targets, but
there is **no valid three-trial Phase-0 performance verdict**.

## Author-set census

Each group below is `api.localhost/groups/users/<owner>/followers`.
Actual attached-author sets are independently read from canonical document/link
facts across services; full identities are retained in the raw result receipt.
The unchanged shortcut enumerates the group's owner only.

| Group owner | Actual attached authors | Shortcut authors |
|---|---:|---:|
| rd42-u0000000 | 1 | 1 |
| rd42-u0000001 | 1 | 1 |
| rd42-u0000002 | 1 | 1 |
| rd42-u0000003 | 1 | 1 |
| rd42-u0000004 | 1 | 1 |
| rd42-u0000005 | 1 | 1 |
| rd42-u0000006 | 1 | 1 |
| rd42-u0000007 | 1 | 1 |
| rd42-u0000008 | 1 | 1 |
| rd42-u0000009 | 1 | 1 |
| rd42-u0000010 | 1 | 1 |
| rd42-u0000011 | 1 | 1 |
| rd42-u0000012 | 1 | 1 |
| rd42-u0000013 | 1 | 1 |
| rd42-u0000014 | 1 | 1 |
| rd42-u0000015 | 1 | 1 |
| rd42-u0614008 | 1 | 1 |
| rd42-u0614009 | 1 | 1 |
| rd42-u0614010 | 1 | 1 |
| rd42-u0614011 | 1 | 1 |
| **20 followed groups: sum** | **20** | **20** |
| rd42-u0980001 (self, separate) | 1 | 1 |

This fixture has no observed multi-author followers group. It does not test
shared-group generality, and its singleton sets do not rescue aggregate parity.

## Like-for-like scope, not like-for-like success

| Metric | Baseline, realism | Arm T v3, realism | Arm D, realism | Arm D, old store — CROSS-STORE ONLY |
|---|---:|---:|---:|---:|
| Main native rows | 360,801,800 | 1,720,364 | 6,512,640 | ~74k |
| Main logical bytes | 24,319,446,938 | 156,463,443 | 962,112,014 | ~2.6MB |
| Native time |10s timeout,3/3 |1,086/996/874ms |1,030ms, excluded warm-up only |~36ms |
| Main parity | No returned page |4/4 pass |FAIL: likes/comments |Historical comparator, not realism proof |
| Interpretation | Preserved failed baseline |Group-general comparator, targets missed |INVALID; no measured trials |Different dataset/store; not transferable proof |

Arm T's entry includes its three core stages; Arm D's entry is its single main
statement, with verification overhead explicitly reported above. No baseline
or Arm T cell was rerun. Full sequence was not attempted. Preparation and native
code159 reaction-follow-up timeouts remain separate known blockers; the realism
ad inventory is nonempty (~300 synthetic posts), not an empty-inventory result.

## Preservation and stop

The run completes at04:47:51UTC with service exit0 and all owned containers
stopped. All53 pre-existing baseline/Arm T operational evidence files match
their pre-run SHA-256 inventory; original table UUIDs/sort keys also match.
See `preservation-and-cleanup.json`. Provider deletion is not claimed: the
existing independent watchdog retains its unchanged05:17:51UTC cleanup deadline.

**Phase-0 verdict: INVALID, not a slow pass.** K1000 is gated off. Any treatment
repair or further execution requires Jacob's next explicit instruction.
