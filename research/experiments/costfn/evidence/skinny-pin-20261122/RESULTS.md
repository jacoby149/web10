# Skinny pin lookup: measured Discover drops from 8.85 GB to 123 MB

**Exact response parity passes in all three feed cases.** On the same research
store, the indexed uniform K20 measured sample reads **98.6% fewer logical
bytes**, with the same ads. Pin discovery plus canonical verification goes from
8,724,706,238 bytes to **56,681 bytes**. No platform API, document schema,
production deployment, or frozen MinIO input changed.

## Scope and sequence

The B baseline ran on merged `b114cbbf79639cf1b6bd8cf210e2526cd35fc810` in
DO622231325, with the original 22 November 11:53:24 → 23 November 11:53:24 UTC
lease, AMD32GiB / container28GiB / ClickHouse22GiB, ClickHouse26.10.4.207 and
600s measured statement bounds. It banked full composition/four parity gates,
three feed sequences and statement decomposition. Two original tiny preflight
STOPs are preserved; merged PRs #1610 and #1611 cleared the response-identity
and changed-only setting evidence issues on the third attempt.

The operator rejected waiting on the unrelated four-million-post typed rebuild.
At 23:04:35 UTC, the agent stopped the row worker after suspending its submitter
and observing zero active row-native operations. The last completed checkpoint
has **2,104,576 of 4,000,675 identities**, with the same number of versions.
Original RUNNING state remains immutable; the separate supervisor record says
partial STOP. Full-family build is **NOT BANKED**, all six typed comparisons
**NOT RUN**. The user-directed stop is not a native correctness or speed result.

The later operator direction superseded the fresh-full-repeat plan: run the pin
comparison on the already-frozen B store, in a separate directory, with no
additional host, reset, restore, typed rebuild or deadline extension. Exact
merged #1612 `cf73aac193537704797bf5dad0587b21b50ce888`, 1,522 deployed source
hashes and 50 no-engine suites / 465 tests bind the indexed run. The orchestration
wrapper SHA256 is `ed6a17548d685b494d32c13322d3f93abf3b135e3eed40f8f80ff5b43fad3f65`;
it checks preserved B summary/STOP digests, current canonical copy/pairs parts
and the existing counter/metadata/fanout certificate before building the index.
No original B result or failed packet was overwritten. Refs, paired tallies,
both views grains, ads (same-question B plus independent oracle), all complete
sequences and the real statement inventory pass again.

## Complete feed: captured query work

| Case | Phase | B elapsed ms | Indexed elapsed ms | B logical bytes | Indexed logical bytes | Indexed rows |
|---|---|---:|---:|---:|---:|---:|
| Uniform K20 | warmup |12,429.192|7,424.414|10,944,881,819|132,509,201|2,011,736|
| Uniform K20 | measured |9,589.268|7,017.152|8,847,767,874|123,119,689|1,782,340|
| Paired P | warmup |6,680.387|5,369.372|1,901,571,427|58,533,510|1,000,601|
| Paired P | measured |5,525.774|5,201.101|56,901,406|46,048,902|697,497|
| Paired F | warmup |6,615.680|5,073.449|56,876,122|46,023,618|696,798|
| Paired F | measured |7,866.801|5,951.431|56,876,122|46,023,618|696,798|

The largest individual native query memory value in measured uniform falls from
779,239,804 bytes to 119,265,441 bytes. This is not request-wide peak/RSS. The
indexed uniform native duration sum is 1,332ms; the HTTP envelope is 7,017ms.
Neither is a p95. The latest user direction treats 25MB as a reference, not a
requirement; the historical 500ms/25MB lines are still not reached. Each indexed
cell independently records 24 auxiliary operations across both phases with
120 rows / 13,680 bytes read, excluded from the captured totals above. The
captured totals retain index/parts/fence work; no auxiliary cost is assumed zero.

The later run inherits B delivery history. In uniform warmup, the separately
named raw delivery-history read drops from 2,084,413,450 to 9,391,234 bytes,
which is **not** a pin improvement. In the measured uniform pair, delivery
history reads the same 1,722 bytes each time. The full timings are sequential
observations, not a randomized cold-cache comparison or production guarantee.

## Uniform measured pin actuals

| Query | Native rows | Logical bytes | Native memory bytes | Native ms |
|---|---:|---:|---:|---:|
| B generic candidate discovery and skinny winner resolution |82,897,093|8,724,652,469|779,239,804|3,385|
| B canonical materialization |338|53,769|5,710,072|12|
| Indexed post-key lookup |32|2,912|4,800,843|6|
| Indexed canonical materialization |338|53,769|5,710,072|11|

Indexed native IDs: lookup `3532209a-df4e-45ce-86af-88efdaadf00e`;
materialization `5c472704-af10-4f57-94ee-c6942c2c981c`. Both stages are
accounted separately for every measured and warmup request. The old lookup
digest and the B `pin_selection` stage are absent from all indexed sequences;
uniform creative SQL retains original digest `5dfb76d3…64a29`. The untouched
canonical fetch remains the authority for latest version, service, root,
deletion and body eligibility. **The 32 index rows are the entire test fixture
index, not a production size or worst-case scan guarantee.**

The one-time build read 88,200,701 rows / 1,021,137,932 logical bytes and took
730 native ms; the exact census read 88,200,733 / 1,021,140,843 and took 652ms.
It reconciles all 32 edges with zero mismatches. Both are outside the HTTP
sequence, not free. Live maintenance and production write/read integration
remain unimplemented.

## Custody and cleanup

Final state checkpoint: 905,870,226 bytes,
SHA256 `d3e5d5c27ade424816acb25126e3fd9f7ded9a90ee23fcb71b8f1b7a8112bb3d`.
Stopped original native query-log parts: 763,371,649 bytes,
SHA256 `d646ccc771ab41b0680ed7fd0d90feb70b9b103ddf7f7be54afd960f71995bb1`.
Both verified off-host before deletion. Indexed service exited success; B
service retains its partial-stop exit. First provider absence check had not
settled; final readback at **23:44:41 UTC** verified owned droplet, firewall,
key and tag absent with original snapshot255003176 retained. Conservative
elapsed compute estimate **$2.963705**, not an invoice; storage separate.

The next row-model attempt should first prove a bulk loader on a representative
slice with exact typed outputs, native costs and publication ordering. That is
separate work; the indexed feed result does not rely on a completed row model.
