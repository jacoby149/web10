# L1 API L: safe query compiler

- Date: 2026-10-18. Scanner: OpenCode/gpt-6.1 sol (API ID `openrouter/openai/gpt-6.1-sol`).
- Pinned source: `8af7e0fce922cada30002dff190a5bb3abcf4f63` (HEAD verified; assigned source diff empty).
- Owned whole file: `api/app/v3/services/safe_query.py:1-535`, 535 lines.
- Coverage complete for assigned lines; unscanned owned lines: none. Disposition: review/signoff pending.
- Confirmed C+I findings: none. Compiler acceptance candidates below are **UNVERIFIED L2+**, not demonstrated vulnerabilities.

## Orient
- Onboarding: AGENTS, strategy thesis/plan/lane/recent changelog, learnings/security record, I1-I6, threat checklist and design-intent gate read. Prior seed query-engine assurance is not a substitute for this bounded line read.
- Recession: I3 depends entirely on the query boundary, with no row ACL backstop. Check nested table references, group filters, tombstones and parser re-emission, not merely obvious raw names.
- Gap: `exp.Table` validation does not by itself characterize qualified-name resolution, scalar dictionary functions, query settings or the executing DB account's privileges.
- Intent: caller SELECTs over authorized service boundaries; group metadata deliberately retains candidate IDs while NULLing unreadable metadata. That honest signal and readable-node design are not findings. No code change or independent design review.

## Coverage By Symbol/Range
| Lines | Reviewed |
|---|---|
| 1-107 | Boundary contract/caveat, imports, raw-table set, output columns, group-meta name, exception |
| 108-128 | `_quote_group_ids`, identifier regex, `_quote_ident` |
| 129-242 | `_boundary_cte_sql`: doc/link dedup, empty boundary, reader/block/sharing/hidden/ban predicates |
| 243-321 | `_group_meta_cte_sql`: candidates, dedup contracts/member counts, readable-set CASE NULLing |
| 322-388 | Caller CTE enumeration, table validation, `_has_limit` |
| 389-438 | `query_services` parse/single-SELECT/table preflight |
| 439-535 | `build_safe_query` parse/validate/emit, CTE injection, optional limit and reparse |

## Checklist Dispositions
| Class | L1 disposition |
|---|---|
| 1 Access control | Inputs are supplied readable groups/member identity/allowed services. No JWT processing in this file: I1/I2/expiry/revocation/app-contract provenance must be established at L2. Raw names, ungranted services and nameless table functions rejected locally. Qualified names/caller CTE scope need sink review. |
| 2 Injection | AST parsing and single SELECT/set-operation checks precede emission; generated CTEs filter authorized groups. Round-trip checks statement count, not complete semantic confinement. String literals double apostrophes; identifier/backslash escaping and input validators need L2. No eval, shell, filesystem or render execution here. |
| 3 Boundaries/transport | No HTTP/browser/cookie/CORS/token-URL implementation. Table functions rejected in controls; scalar/server functionality and settings at the eventual DB sink remain unverified. |
| 4 Availability | Separate reliability: arbitrary query complexity, parser load and caller-provided LIMIT are not bounded by default append-only `max_limit`; no C+I finding inferred. |
| 5 Lifecycle | Document/doc-group and block/sharing/hidden/ban/member/contract boundary SQL ranks before filtering deletion. Tied versions without deleted tie-break in some subqueries need schema/writer/engine review; no resurrection replay performed. |
| 6 Hygiene | No credential literal/logging or artifact emission. Open/unrestricted service mode still injects a boundary; it is not by itself auth disabled. DB account permissions/configuration outside file. |
| I3/I4/I6 | Group-scoped SQL generation inspected; complete sink confinement unproved. Node readability and intentional metadata NULLing respected. Cross-store query functions rejected by basic table-function controls, not an all-flow federation proof. |

## Real-Code Compiler Probe
Executed from repository root using installed `sqlglot 30.17.0`; no package installation or application/settings import:
```sh
python3 -B -c 'import runpy,sqlglot; m=runpy.run_path("api/app/v3/services/safe_query.py"); print("sqlglot="+sqlglot.__version__); qs=["SELECT * FROM documents","SELECT * FROM file(\u0027/etc/passwd\u0027)","SELECT * FROM posts; SELECT * FROM users","SELECT * FROM other","SELECT * FROM posts","SELECT * FROM system.posts","SELECT getServerPort(\u0027http_port\u0027)","SELECT dictGet(\u0027private_dict\u0027,\u0027value\u0027,toUInt64(1))","SELECT * FROM posts SETTINGS additional_table_filters = {\u0027documents\u0027: \u00271=1\u0027}"]
for q in qs:
 try:
  out=m["build_safe_query"](q,{"posts":["synthetic-group"]},"synthetic-reader"); print("ACCEPT",q,"preserved=",q in out)
 except m["UnsafeQueryError"]: print("REJECT",q)'
```
- Results: rejected `documents`, `file('/etc/passwd')`, stacked SELECTs and ungranted `other`. Accepted ordinary `posts`, `system.posts`, `getServerPort`, `dictGet` and the supplied `SETTINGS` clause.
- `system.posts`, server-port expression and settings survived textually. `dictGet` was accepted/reformatted (`preserved=False` due spacing), not executed. `system.posts` is synthetic, not evidence that such a real table exists.
- Additional initial compiler-only probes rejected `INTO OUTFILE '/tmp/l1-never-written'`; no output file or query execution occurred. This was a string given to the compiler, not a filesystem access.
- These results establish compiler behavior only. No ClickHouse parse/execution, credential read, dictionary access, network request, file access, cross-user row disclosure or bypass was demonstrated. Local dependency version was observed, not asserted equal to deployment.

## UNVERIFIED L2+ Handoffs
- L-H1: `_validate:351-371` checks `table.name`, not catalog/database qualifiers. An allowed basename leaves `system.posts` qualified in final SQL while injecting an unqualified `posts` CTE. Test real ClickHouse resolution with synthetic isolated tables and actual service-name admission before asserting bypass.
- L-H2: no scalar-function allowlist: dictionary/server functions pass. Trace DB account grants, dictionary configuration and actual execution; acceptance is not proof of readable private dictionaries or sensitive data.
- L-H3: query `SETTINGS` survives. Inspect execution client's query settings/readonly enforcement and engine behavior before any authorization or injection claim. The tested additional filter alone demonstrated no leak.
- L-H4: `_quote_ident:126` wraps non-simple names without escaping backticks; service interpolation at 175 and quote helpers handle apostrophes but not explicit backslash normalization. Trace actual service/group/member validators and ClickHouse string semantics with safe synthetic values. No working injection established.
- L-H5: caller CTE names collected globally (324) rather than by lexical scope; test nested shadowing/recursive CTE behavior with engine resolution. Parser reparse is not an independent semantic oracle.
- L-H6: endpoint must derive readable group sets and member identity from verified authority, align preflight/build options, and execute only compiled SQL; actual caller and DB sink unscanned here.
- Limits: one-model L1 receipt only; no broad parser completeness, all-flow safety, fix, three-dry/model-diverse sign-off or whole-service assurance. Only new receipt written; no runtime/central docs/git mutations or live services/secrets.
