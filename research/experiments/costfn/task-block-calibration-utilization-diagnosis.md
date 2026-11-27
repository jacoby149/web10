# DAU calibration utilization diagnosis

The [original receipt](evidence/dau-sustain-diverse-20261127/RESULTS.md) is
calibration-only, on `9f2837d343c0b145dd38eb4151878e28b4fa633a`. Preserve its
SHA-verified archive, original supervisor stop, and the distinction between
the intermediate 29 completions and the 33 recorded at final custody. Only
three complete reads finished within the 120-second average offer interval;
none finished within the burst.

Use one fresh `c-32` under a separate $25 compute cap, with the existing
24-hour failsafe and unchanged 28/22 GiB ClickHouse envelope. Restore the same
frozen Parquet and existing fixture authority. The fresh native census must
produce the exact same selection domain, and the transferred oracle packets
must verify against the original index and canonical receipts. Host-local
census receipt identity may change; oracle values and authority may not.

The archived `/proc/stat` rows contain only the aggregate line. The prior
profile identifies where the API spends sampled Python interpreter time,
but cannot prove either per-core load or that an admission ceiling was the
first to bind. Capture actual logical-CPU counters, process CPU, cgroups and
native active-query totals at timed sampler points on the replay. Record
ClickHouse server and API connection settings; record the serving process's
effective AnyIO limiter and pool shape with no credential values. Retain the
server's existing request phase timings for a complete isolated feed plus
the driver/HTTP timings. Do not equate the ASGI-minus-handler remainder with
queue-only time or a GIL stack fraction with milliseconds.

Change only the configuration ceiling demonstrated by matching utilization
and queue/limit evidence. If instead per-read application work is the
observed bottleneck, the stage-by-stage profile is the deliverable; no feed
query, authority or serving-path rewrite is admitted in this task. A passing
fixed calibration proceeds to the original measured windows only under the
same contract and admission. Preserve any new stopped calibration with the
resource named. Require off-host archive verification and owned cleanup,
then amend draft v8 with the verified ruling, never a capacity claim for a
window that did not run.

The operator's next instruction admits the
[recorded serving bundle](DAU-SERVING-CONFIGURATION.md) before the diagnostic
replay. This intentionally trades per-setting attribution for a named,
reproducible configuration; keep the original failure separate. No
serving-policy or read-query rewrite follows from the bundle.
