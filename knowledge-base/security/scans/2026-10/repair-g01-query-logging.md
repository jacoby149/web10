# L1-G-01 Query Diagnostic Repair

27.10.2026. Baseline: `b5d128a52824ccc90ad773e565a8a108d1e07b44` (#1265 merged).
Author/fresh reviewer: separate OpenCode `openrouter/openai/gpt-6.1-sol`
contexts; same-model, not model-diverse three-dry review. Status: local source
repair verified; pending PR integration/merge, not deployed. Protocol L1 remains OPEN.

## Boundary And Delta

The endpoint copied submitted/compiled SQL into INFO arguments; its execution
warning copied database error text, and its result log copied caller-controlled
column names. Successful compilation does not make literals, aliases, service
names, comments or function names appropriate retained diagnostic content.
Fresh review additionally reproduced raw input in sqlglot's rejected-command
fallback warning before endpoint diagnostics ran. That path is repaired too.

`_query_shape` parses a separate diagnostic AST and records only trusted parser
class names with parent indexes, literal category/length and fixed status. This
is topology, not generated SQL with a partial blacklist. Comments and all scalar
AST text, including identifiers/function names, are omitted. Both submitted and
compiled paths use it, capped at 128 nodes with explicit truncation. Parser
failures yield fixed `unavailable`; the diagnostic parser uses zero source context
for fallback warnings and raising error behavior. No raw fallback or debug flag.

Execution records share a server-generated correlation ID. Service/candidate and
column counts, group-meta flag, row count and database-call duration remain;
reader/service/column names and database exception text are not logged there.
Compiled SQL, query settings, returned aliases/rows, access checks and existing
client errors remain unchanged. Prepare-pass and other loggers are not certified.

All three validation/compiler parses use a ClickHouse parser subclass whose only
override replaces the content-bearing unsupported-syntax warning with a fixed
message. Tokenization and parser receive the same explicit ClickHouse dialect;
client parse-error text is preserved. The private warning hook is a dependency
compatibility risk, not new query policy.

## Repro And Controls

Eight original endpoint cases failed before repair: literal, comment, identifier,
function, service, alias, result-column echo and execution-error echo. Tests
capture original LogRecord fields, not just formatted output. A later numeric
case was independently replayed against baseline/current: identical SQL and
response, one content-bearing baseline record versus zero after. Both rejected
`SHOW` and stacked `SHOW` cases separately failed before the parser fix and pass
after. Genuine diagnostic `SHOW` fallback is pinned, not a fake unknown-command
case that emits no warning.

Final `tests/test_query_logging.py`: 24 cases, with real compiler, HTTP endpoint
and storage wrapper over an inert driver. Controls cover unchanged executed SQL,
settings/results/aliases/client errors, rejected raw tables, literal metadata,
shape differences, shared IDs/counts/duration, shape truncation and independent
submitted/compiled normalization failures. Five differential parser cases pin
ClickHouse null ordering, functions, set operations and exact parse-error text.

`uv run --frozen pytest -q --disable-warnings --tb=short`: **1,216 passed, four
subtests passed**. Ruff check/format pass for three changed Python files.
Independent review also ran 14 equivalent AST/error comparisons, direct preflight
and compiler fallback probes, a forced round-trip fallback and a malformed
compiled-input control: zero content-bearing parser log records after repair.
Forced round-trip substitution proves the logging path, not a reachable exploit.
No live ClickHouse, production log access, exposure or credential theft proven.

An initial parser construction without its dialect changed ASC null ordering;
the full suite caught two regressions. Explicit ClickHouse dialect construction
repaired them; no tests were weakened. Future dependency updates must rerun these
differential and genuine-fallback controls.

## DESIGN-INTENT REVIEW

- Intent: generic boundary-enforced reads with useful diagnostics, without automatic retention of user query content; D41/D56 and body tokens unchanged.
- Delta: safe topology/type/length/count/timing diagnostics replace SQL, names and error echoes; parser fallback warnings become fixed messages.
- By-design conflict: none found; applications retain the tested execution/results/errors/permissions behavior.
- Conventional deviation: none in product policy; private parser-hook compatibility is explicitly accepted below.
- Coverage limits: synthetic driver and parser controls, not real DB/driver internals, future dependency versions, production handlers or deployment.

Accepted for this bounded local repair, 27.10.2026: external log consumers may
depend on removed fields; topology cannot identify exact alias qualification or
arbitrary function names, and compiled topology may truncate early. Parsing CPU
and memory are not bounded by the output cap and remain unbenchmarked. The private
sqlglot warning hook can change on upgrade. Reopen on dependency/log-consumer
changes or diagnostic regressions, using safe diagnostics or controlled synthetic
reproduction, never restored automatic raw SQL retention. These risks do not
waive model-diverse sign-off. Prepare/uncaught/generator/driver logging, historical
logs/retention and rollout need their own evidence; no whole-file security PASS.
