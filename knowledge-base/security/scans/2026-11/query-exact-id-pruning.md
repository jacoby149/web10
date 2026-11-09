# Exact-ID canonical preparation pruning — 8 November 2026

## Intent and boundary

Operator: “okay, keep optimizing”, following the failed million-author strict
acceptance and its two unimplemented hypotheses. Q01 takes the smaller bite:
canonical media/ad preparation already asks for exact document IDs, but its
boundary ranks the service's broad document history first.

An internal `document_ids_by_service` compiler argument narrows both documents
and attachments before their windows. `doc_id` belongs to both partition keys;
every retained identity keeps all versions. The outer ID predicate, readable
groups, post-rank deletion, visibility and ambiguous-author/service denial stay.
There is no request-model field, SQL predicate inference, permission cache,
authority shortcut, early LIMIT, timeout change or app-specific node concept.
Ordinary queries and face preparation do not supply the hint. Empty hints deny.
Literal IDs use sqlglot's ClickHouse emitter, including its backslash escaping.
Safe logs report lookup/result counts, never IDs, SQL, bodies or credentials.
Large canonical lookups retain the existing SQL path when the hinted query
exceeds a 128-KiB UTF-8 budget; this is an optimization bound, not a result cap.
Only the canonical helper chooses fallback, because its outer predicate retains
exact scope. The generic compiler never discards supplied restrictions.

Orient: I3 still relies on the existing input boundary; a requested ID is not a
grant. The regression risk is pruning denying versions or selecting a projected
author, not a newly demonstrated confidentiality defect. Both remain forbidden.
Review scope is changed compiler/wiring hunks and direct tests, not full L1–L4.

## Verification

- Seventeen new controls initially fail. The direct canonical-path reproduction
  reaches generated SQL and finds only `collection_name` before the document
  window, rather than the required `doc_id`; other cases expose the absent hint.
- All 24 pass after repair: both windows, latest/deleted/restored histories,
  removed/unreadable links, per-group multiplicity, duplicate/missing IDs, five
  visibility denials, no-hint/service isolation, empty hints, opaque literals,
  and actual canonical helper execution with ambiguous-author denial. Command
  budgets remain one DB query per readable service at 1/10/100/3,000 requested
  documents; a multibyte-ID control pins UTF-8 byte budgeting. SQLite is
  an execution substitute, not the real engine.
- Full API suite: **2,226 passed, eight subtests passed, one opt-in skip**.
- Opt-in `cd api && uv run python -m tests.query_exact_id_clickhouse` runs actual
  ClickHouse **24.8.14.39** in an owned loopback-only disposable container.
  Production document/attachment DDL and sorting keys; stopped merges retain
  supplied histories. Empty visibility tables use Memory. Twelve native cases
  compare hinted/unhinted SQL and independent expected rows, including quote,
  backslash, Unicode and injection-shaped IDs. No production data is accessed.
- With 100,000 irrelevant same-service/same-group identities, three alternating
  measured pairs after one excluded warm-up produce these native query-log values:

  | Arm | Rows read | Bytes read | Measured duration ms | Peak-query memory bytes |
  |---|---:|---:|---|---|
  | Existing boundary | 200,022 | 37,068,149 | 51, 65, 177 | 115,460,154; 132,806,750; 123,895,780 |
  | Exact-ID hint | 100,014 | 3,389,609 | 13, 13, 13 | 240,219; 758,797; 662,341 |

  Results match. The document table still scans roughly 100k rows; this does not
  solve its author-first storage layout. These are local synthetic query
  diagnostics, not million-author, HTTP, full-feed, load-study or production
  speedup evidence. No capacity extrapolation follows.
- Fresh review reproduces an initial functionality regression: repeating 3,000
  UUIDs grows canonical SQL from 122,265 to 362,295 bytes, exceeding the native
  256-KiB parser limit. The retained actual-helper/native-engine red reproduction
  fails with code 62. Byte-budget fallback restores all 3,000 rows with identical
  122,265-byte reference/candidate SQL, without changing supported result sizes.
- A second fresh review reproduces generic compiler fallback discarding empty
  restrictions above budget (readable rows return instead of none; not an auth
  bypass). Two retained red→green controls cover empty/nonempty large compiled
  queries. Move fallback into the canonical helper, whose independent outer ID
  predicate makes it redundant; the compiler always honors its restriction.
- All eight Python research harness suites and five Bun source captures pass.
- Initial native probe fails because the shared Docker filesystem is full;
  memory-backed owned ClickHouse data/log storage avoids pruning others' work.
  A second harness attempt exposes the installed driver's absent `query_id`
  keyword; using the returned query ID fixes measurement collection. Every
  attempt verifies owned-container removal. No unrelated resources are removed.

Workspace logs: `.context/exact-id-{red,focused,full-api,clickhouse}.log` and
`.context/exact-id-clickhouse-r{2,3}.log`, `exact-id-size{,-native}-red.log`,
`exact-id-clickhouse-final{,2}.log`, `exact-id-full-api-final{,2,3}.log` and
`exact-id-empty-red.log`. Earlier small diagnostics remain recorded (61–77 vs
10–11 ms, then 36–44 vs 9–10 ms); the table is the final2 run. Shared-host timing
varies and the API suite ran concurrently; rows/bytes are the stable work signal.
The executable fixture ships with this change;
the older research receipts are unchanged and are not acceptance for this source.

## Review and remaining gates

Fresh initial reviews reproduce the size and empty-restriction regressions above;
both are repaired. Three subsequent fresh same-family reviews find no blocker.
Review 1 independently runs 206 focused controls and the native large-read
harness; review 2 runs 210 controls/native parity plus forced-fallback denial and
two-service restriction probes; review 3 runs 186 controls and a nine-query SQLite
probe covering service/author ambiguity, actual UTF-8 fallback, duplicate rows,
multiple groups and hidden/deleted/removed/unreadable/missing denials. Sessions:
`ses_e41d44674ffeaPquJTq1kZm6QG`, `ses_e41d31abfffeZOc4PcVStXMVlX`,
`ses_e41d1fa97ffeDnvSv7F59CBPhf`. These are not model-diverse or complete
L1–L4 sign-off. Native ambiguity/fallback-denial combinations are not exhaustively
pinned; supplemental SQLite probes are review evidence, not native assurance.

Design-intent review: canonical authorized data remains the only source for
capability minting; the delta is less history work, not stronger/weaker access.
No by-design product conflict or new conventional-standard deviation was found.
Small/large/empty/UTF-8/history/visibility tests cover the delta; compile-twice
CPU on fallback and connected multi-service/full-feed load remain unmeasured.

Timestamp-tie ambiguity is inherited, not repaired;
stopped merges do not certify real background merges or concurrent revocation.
The million-author strict-concurrency gate, normal PR/CI and approved deployment
remain OPEN. Q02 readable-link document narrowing is a separate bite. No cloud
spend, production write, deployment or manuscript measurement occurred.
