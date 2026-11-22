# First full-API attempt — setup timeout STOP

The independent canonical-table-only reference finishes and produces21 prepared
rows plus a nonempty20-creative inventory reference. Only its digest and native
metadata are retained here; reference bodies remain private and are not in Git.

The gated API then logs in, but ordinary `/v3/groups/list` setup returns HTTP500
with native159 at10.001s. **No feed warm-up, T2 result, follow-up sequence or
performance observation completes.** The root driver stops all owned containers.
The source-generation, budget, host and cleanup deadline are not extended.

Diagnosis: the first adapter applied the measured-feed ten-second setting to
unlabelled group-discovery setup too. The source now preserves the original
setup timeout while retaining22-GiB memory and ten seconds for every marked
feed read. A red-then-green local regression pins that distinction. The fix has
not been established by another native attempt at this record's creation.

`serve-probe/config-p.json` is the raw STOP receipt; `reference/summary.json`
records the independent reference provenance without payloads. The two drivers
and `executing-source/` preserve the code that actually ran, before the timeout
scope repair. `failure-summary.json` retains the safe exception classification
and binds the privately retained API log by digest; it is not a native query-ID
receipt or a substitute for a new measured sample.

The existing code16 schema-ensure warning is separate from the actual159 setup
failure. Neither is waived or silently converted into successful feed evidence.
No fanout, production change or performance pass is claimed.
