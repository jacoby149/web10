# Date-bounded feed feasibility — 9 November 2026

## What is being tested

The operator asks for the date-based improvement, then an experiment. The social
board now offers a visible rolling-30-day lower bound anchored in the URL, plus
explicit Older / Advanced all-time browsing. Following, Video, profiles and
direct reads do not inherit that default. Generic date-candidate compilation is
experimental/default-off; production schema and deployment are unchanged.

The experiment is a **new date-filtered Following sensitivity**, not a rewritten
result for the frozen January workload. Its fixed UTC clock is 9 November 2026
12:00 and its inclusive lower bound is 10 October 12:00 (`1791633600000`). Five
percent of creator identities receive recent document/link timestamps. Every
K=1,000 reader has 50 eligible posts, so empty results cannot manufacture success.
The real main query retains its profile/reaction/comment/repost joins and actual
preparation. The captured sequence fetches 21, displays 20, then performs the
existing concurrent count/view requests. First and second pages use actual
app/SDK builder captures, not hand-edited pagination SQL.

Input identity and original parent hashes: [date input](evidence/date-input-20261109.json).
The parent is independently downloaded and all-row validated; frozen artifacts
and publication receipts are unchanged. This derivative is not newly published.

## Primitive native diagnostic: useful, not universal

An earlier disposable ClickHouse **24.8.14.39** diagnostic uses 1M synthetic
identities and compares identical authorized results. The time-ordered projection
contains generic service/time/identity fields, not a social counter or app table.
Current-state/history checks remain after candidate selection. The timestamp
distribution is an isolated physical-layout test, not the current paper's input.

| 1%-recent case, with projection | Original physical read | Candidate physical read | Interpretation |
|---|---:|---:|---|
| Clustered old/recent identities | 381.00 MB / 2,000,000 rows | 5.31 MB / 47,836 rows | Strong physical pruning |
| Recent identities scattered across blocks | 381.00 MB / 2,000,000 rows | 383.67 MB / 2,050,304 rows | Canonical retrieval still scans broadly |

The clustered candidate uses about 18.7 MB of query memory versus roughly
1.1–1.2 GB. Its two non-warmup samples are 15 ms versus 179/192 ms; these are
shared-machine diagnostics, not a controlled statistical speedup estimate.
Mixed-layout memory also drops, but bytes do not. Candidate EXPLAIN reads 2/123
projection granules for clustered input and 4/123 for mixed input. **Those are
candidate-stage plans, not complete-feed EXPLAIN or capacity proof.**

The all-recent controls are negative evidence: candidate work reads 4M rather
than 2M rows and about 487 MB rather than 381 MB. This is why the plan stays
default-off. No universal gain or production activation follows.

[Structured native receipt](evidence/date-native-20261109.json) predates the later
real-app admission fixes; it is retained as a primitive diagnostic, not falsely
relabelled final-source full-feed evidence. Native boundary controls separately
test cutoff−1 ms, exact cutoff, cutoff+1 ms, changed creation histories,
tombstones, default-filled outer joins and the parser envelope.

## Actual-plan admission is a gate

Initial small API floors prove functional outputs, not that the intended plan
ran. Integration catches two suppression cases: an exact identity `created_at`
projection was treated as a computed shadow, and repeated K-long readable lists
caused fallback. The compiler now accepts only the exact same-reference identity
alias and shares identical trusted constant ID lists for large inputs. Services
still resolve permissions separately; constants do not share document histories
or promise materialized execution. The native SQL cap remains unchanged; a
240-KiB byte envelope falls back to the full original compiler without discarding
any internal ID restriction.

The observer records whether candidate SQL was actually emitted. The runner
refuses a flag-only/fallback candidate pass. The fifth small local receipt passes
strict traffic and this witness, with exact first/second pages, Origin denial,
seven lifecycle controls before and after, counters/profiles/views and verified
cleanup. The fourth receipt is retained as **invalid candidate admission**, even
though its functional requests pass. Neither is million-author capacity proof.

## Cloud setup: blocked, no workload result

The operator approves the same isolated three-host sfo2 topology, $5 total cap
and two-hour deadline: DB g-8vcpu-32gb ($0.375/hour), API c-8 ($0.25/hour),
generator c-4 ($0.125/hour). All SSH22 attempts time out despite verified narrow
provider rules and matching controller IP. One retry requests guest SSH443 and
adds controller-only 443 rules, preserving the original total budget/deadline;
that transport is also unreachable. Guest bootstrap is not verified.

**No cloud restore, traffic, acceptance or capacity measurement runs.** Both
attempts are torn down and independently checked: no owned droplets, firewalls,
temporary cloud SSH keys or tags remain; both local private keys are deleted and
the unrelated existing key is preserved. Estimated combined compute upper bound
is **$0.256**, not a settled invoice. No production service is touched.

[Sanitized cloud preparation receipt](evidence/date-cloud-preparation-20261109.json).

## Local million-author sensitivity — strict acceptance FAILED

The separately identified derivative has 1M creators, 20k registered readers,
3.1M documents, 4.1M links, 1M contracts, 23.02M membership/class-grant rows and
20k app contracts. Two actual reader sessions run the original strict schedule:
five-second interval, five-second warmup, ten-second observation and up to
60-second drain. The SQL deadline remains ten seconds.

This is **not matching-cloud hardware**. Docker has eight logical CPUs and about
8 GB total memory; ClickHouse is bounded to 5 GB, with a 4-GB volatile data
filesystem. API/DB are co-located; the generator runs on the Mac. A cached API
image uses current app/lock mounts, with actual package/image/source identities
recorded. Shared-disk exhaustion is bypassed without pruning other workspaces.
The dedicated controller owns a 30-minute cleanup deadline and exact-project
verification. It completes within that bound and verifies no project containers,
volumes or networks remain.

| Gate | Result |
|---|---|
| Full restore and table counts | Pass |
| Two readers' exact nonempty first/second pages, profiles/counts/views, Origin denial | Pass |
| Lifecycle controls before / after traffic | 7 / 7 pass |
| Main requests with emitted candidate-plan witness | All 6 |
| Warm-up feeds completed / failed | 1 / 1 |
| Measured feeds completed / failed | **0 / 4** |
| HTTP observations correlated / resource samples | 12 / 8, no sampling errors |
| HTTP requests after drain | 0 |
| Measurement validity / strict acceptance | Valid / **FAILED** |

All four measured main requests return 400. One warm-up also fails its count
follow-ups. Six native code-159 timeout records occur during the traffic window;
there are no native code-241 memory-limit exceptions. The configured SQL limit
stays ten seconds; observed exception elapsed times range from about 10.0 to
18.0 seconds because enforcement is not a hard preemptive wall-clock interrupt.
Two earlier zero-work code-16 startup errors are retained separately, not removed.
Native query IDs are retained but are not claimed as an exact HTTP-to-native join.

**The date path is not sufficient to pass this local million-author workload.**
The witness confirms this is not another fallback-only test. Without a matched
local baseline or working matching-cloud setup, four failures versus the older
cloud run's two failures is **not evidence of a performance regression or win**.
The native primitive gain does not become an end-to-end capacity claim. Keep
pruning default-off; no timeout relaxation, ramp or production activation follows.

[Structured result](evidence/date-local-million-20261109.json) pins the source,
runtime, input, failure counts, cleanup and the digest of a credential-shape-scanned
[15-file receipt archive](evidence/date-local-million-20261109-receipts.tar.gz).
Container logs, tokens, input passwords and SSH keys are excluded. Full raw local
artifacts remain under `.context/date-million-run/`.

Production promotion, model-diverse sign-off, concurrent mutation/merge behavior,
connected foreign readers and the original strict cloud gate remain OPEN.
