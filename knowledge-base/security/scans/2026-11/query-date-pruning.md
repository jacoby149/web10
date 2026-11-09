# Date candidate pruning — 9 November 2026

## Intent and scope

The operator asks for the date-based improvement and an experiment. Social owns
the visible recent window; the node only understands a generic timestamp lower
bound. `QUERY_EVAL_DATE_PRUNING` is default-off. It neither bypasses policy nor
changes the ten-second SQL deadline. The research projection is not installed
by node boot, and no production activation is implied.

The changed compiler recognizes a direct FROM reference with a qualified
`created_at >= fromUnixTimestamp64Milli(integer)` AND conjunct. It discovers
potential `(author_key, doc_id)` identities from all historical versions, narrows
whole document/link histories, then retains latest/deletion/visibility and the
original outer date predicate. Other references remain unrestricted. Unsupported
expressions, caller CTE shadowing, output alias shadowing and RIGHT/FULL joins
keep the original plan. No index count or raw relation is exposed to callers.

This is a changed-file/direct-call review, not full L1–L4 coverage. Orient keeps
I3's input boundary as the only grant; indexes request work, not authority.

## Findings and repro gates

1. Native ClickHouse 24.8 default-filled RIGHT/FULL joins reproduce an extra row
   with a pre-epoch matched document and cutoff zero. Skipping these joins keeps
   the original query. Unit and native parity controls retain the reproduction.
2. Six dated UNION branches and 1,000 readable groups expand a previously valid
   42,666-byte query to roughly 297 KiB. At 240 KiB, the compiler now reconstructs
   the unoptimized plan from original caller SQL and forwards all arguments.
   Empty and nonempty canonical ID restrictions survive; no group/result cap or
   parser-limit increase is used. Tests first fail, then pass unchanged.

Actual main-query admission also revealed two optimization-suppression cases:
the exact identity `created_at` output alias was conservatively skipped, and a
full multi-service K=1,000 boundary could still exceed the SQL envelope. Allow
only that same-reference identity alias; computed/foreign alias shadows still
skip. Above 32 KiB of quoted readable-list bytes, identical trusted ID tuples
share generated constant CTEs. They do not share permission decisions or
document/history work; distinct lists and empty services retain distinct scope.
Names avoid every caller AST identifier, case-insensitively. Native CTEs are
substitutions, not a promise of shared execution or materialization.

Durable controls require the real dated wire to emit candidates with all four
K=1,000 service lists, preserve asymmetric/identical/empty sets, avoid exact and
casefold CTE collisions, and retain argument-preserving oversized fallback.
An explicit observer boolean witnesses emitted candidates through canonical
preparation calls; the runner rejects an enabled flag without this evidence.

History/visibility controls cover changed creation dates, deletion, removed
links, multiple readable attachments, blocks, bans, sharing, hidden docs and
per-reference isolation. Native controls exercise cutoff−1 ms, exact cutoff,
cutoff+1 ms, real RIGHT/FULL defaults and the repeated-query envelope. The
SQLite controls are substitutes; the disposable native probe is separately
labelled and verifies owned-container cleanup.

## Evidence and open gates

Local native evidence uses 1M identities, separate clustered/mixed layouts and
1%-recent/all-recent predicates. Projection primary-key pruning is observed;
canonical mixed blocks can still scan broadly, and all-recent candidate work
regresses resources. These are not API/full-feed capacity measurements.

The real local API floor has nonempty date-filtered first/second pages, Origin
denial, before/after lifecycle controls and strict two-reader traffic. Docker's
shared disk is full; explicitly labelled tmpfs storage and a cached API image
with current app mounts provide a functional floor, not cloud timing evidence.
The fifth receipt explicitly witnesses the candidate plan in every main request;
earlier unwitnessed/fallback receipts are retained, not promoted as date-plan proof.

Initial review found the two regressions above; three subsequent fresh scoped
same-family reviews are dry (150, 172 and 107 focused tests plus independent
fallback/differential/denial probes). These are not model-family diversity.
After the subsequent admission/constant-sharing repairs, three fresh scoped
same-family reviews are dry (109, 89, and 67+111 focused tests with additional
substitute-engine differential/denial probes). Model-diverse sign-off,
merge/concurrent mutation, realistic alias/engine behavior and production
promotion remain OPEN. Both approved cloud attempts fail SSH preparation (22,
then controller-only 443) before any workload. All owned resources and temporary
keys are independently verified absent; estimated combined compute upper bound
is $0.256, not a settled invoice. Local million-author restore/initial correctness
pass, but strict traffic fails all four measured feeds and one warm-up. All six
main observations witness emitted candidate SQL; six native code-159 timeouts,
12 HTTP correlations, eight resource samples and seven before/after lifecycle
controls are retained. No code-241 memory exception is observed. All owned local
containers/volumes/networks are independently verified absent. This is different
hardware from the cloud test, not a measured before/after gain or regression.
Receipt: `research/experiments/costfn/DATE-RESULTS.md`.
No security or capacity PASS is claimed.

The experiment-runner review also rejects database diagnostics after an existing
target is refused and hand-edited pagination SQL. Current hooks admit only fresh
targets, cleanup remains independent of log timeouts, failures retain their
original cause, actual dated pagination captures are pinned, and the date wire's
bytes enter provenance. Two offline operational tests replay refusal and
diagnostic-timeout cleanup; the latter fails before repair and passes afterward.
