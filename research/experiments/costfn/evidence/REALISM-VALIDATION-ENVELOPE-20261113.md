# Give validation the approved node envelope

The operator wants the existing dataset checked, not another undersized attempt.
Use the already-approved 22-GiB ClickHouse / 28-GiB process envelope on the same
32-GiB host. Exact checks stay exact; more time is not permission to pass bad
records. The existing cleanup deadline remains 06:50:22 UTC November 13, with
the same $5 compute ceiling and retained 400-GiB volume.

## Before the repair

Pinned SSH readback at approximately 02:46 UTC confirms the worker is failed,
not running. The negative receipt names `import_documents`, ClickHouse exit 241,
and the old source pins; systemd records a 12-GiB MemoryMax and 12-GiB peak.
The old diagnostic contains no error text beyond the exit code, and the retained
query log/journal do not recover the missing exception message. Do not invent
its allocator or claim a kernel OOM kill. About 304 GB remains free.

The retained context binds dataset
`2d6bbc4d89dfa5f9bfc43da3d8bc1395a915ae26061a4f120a0f1e3e19f8dddd`,
ClickHouse 24.8.14.39, the nine input inventories and original executing source.
Completed event/doc_groups/cohort/app-contract imports must not be relabeled or
discarded to make new code appear resumable. The unmarked documents table is
not proof of completion.

## The bounded change

An explicit performance profile raises query and aggregate ClickHouse budgets
to 22 GiB and the Docker cap to 28 GiB; native execution still needs a separate
28-GiB systemd cap. Four threads, exact aggregates and disk limits are unchanged.
The profile permits up to four hours per query, shortened by the existing
worker deadline; it grants no additional paid time. A local ClickHouse config
sets its aggregate tracker and enables console diagnostics; unterminated error
lines are now also retained in the query log.

An explicit retained-work path permits just the reviewed predecessor's source
and entrypoint hashes with unchanged engine, input inventory and parsed import
semantics (version, ordering, SQL builder and import/marker checks). All input
hashes are reverified before opening ClickHouse; every reused table must still
match its original UUID and exact count. Preserve the old context and marker
bytes. New receipts pin current source and resource settings, with original
import lineage; derived checks run again. Unknown source, changed semantics,
wrong inventory, count or UUID remain denials.

## Verification and execution

Offline suites and actual-engine/floor probes are recorded separately from the
full-input run. An initial local floor attempt uses the obsolete `realism-10k-r7`
manifest and is correctly denied before importing because it differs from the
current executable contract. Preserve that negative receipt; use the existing
current-contract floor instead, without weakening the integrity gate.

Eight actual-engine controls pass, including actual performance-profile reopen
and completed-import reuse without reimport or lineage rewriting, and changed-
count denial. Thirteen offline suites, five Bun controls and Ruff pass; the
new unterminated-error regression passes with a real subprocess. The unchanged
current-contract 10k/16M-delivery floor passes 50/50 under the performance profile;
all verdicts and account/post/cohort/concentration/correlation reports match the
previous bounded receipt exactly. These are not full-scale capacity claims.

At **02:52:02 UTC**, restart PID **63333** on the existing host, using immutable
staged sources under `clickhouse-envelope-20261113-r1/code/`. Before launch,
verify mount UUID, pinned native binary, active 06:50:22 host-stop timer, original
input/context identity and source-bound local passing receipts. The same native
binary passes the 22-GiB configuration smoke. Preserve the previous negative
receipt and hashes of the original context and all four existing markers.

Readback confirms **28-GiB MemoryMax**, four-CPU quota, performance profile and
explicit retained-work path. Worker RuntimeMaxSec is 13,700 seconds, ending
before **06:40:22 UTC**; compute cleanup remains **06:50:22 UTC**. Initial phase
is all-file generation reverification, not yet completed validation. The host
20-second volume-reserve timer remains active; the scoped local cleanup launchd
job is loaded, and the metadata/reserve controller is rearmed without a duplicate
observer. Original context and marker hashes remain unchanged after launch.

**02:53:40 UTC readback:** all input hashes have been reverified; app contracts,
45.2M cohort rows, **1.6B events** and **92,200,600 doc_groups** are actually reused
after UUID/count verification, not reimported. The unmarked documents table is
preserved as `interrupted_documents_1794538372240511586`. Documents import is
active past **22.49M rows read of 88,200,300**, beyond the old failure point;
read progress is not a completed-import count. Original context/four marker
hashes are unchanged. Service memory is about 8.68 GiB and volume free space is
310,616,580,096 bytes; no new error is reported. This does not guarantee later
imports or statistical queries will fit.

Full-input outcome remains OPEN. No new host, storage resize, lease extension,
upload, experiment or production change occurs.
