# Config P count setup — memory STOP

The build stopped15 November12:35:14UTC. **T1 is not established; no treated
feed ran.** The raw result keeps its original `T1=NOT_RUN`, alongside partial
comparisons. The derived report labels overall correctness NOT_ESTABLISHED.

Four main-scope recipes matched independent canonical values on26 targets
each, but every checked value was zero. This is not positive/shared-group
coverage. Broader-scope likes then built451,600 stored rows without completing
independent parity. The subsequent dislike build failed. Those partial rows
are not a completed, serveable scope.

Failed query `satellite-p-ca04567173624cb28230c04e54322cb6`:

- Native241,15,547ms;125,362,176 rows /16,850,322,290 logical bytes.
- Server-total memory would reach22.26GiB against the unchanged22GiB cap;
  OvercommitTracker selected this query to stop during `MergeTreeSelect`.
- Tracked query peak16,863,490,897 bytes is distinct from server-total memory.
- Four external-sort parts were written; selecting a spill-capable join and
  sort does not establish a whole-query/whole-server memory bound.
- ClickHouse remained alive, `OOMKilled=false`. This was not a kernel OOM.

The native fifteen-versus-zero/shared-attachment fixtures, closing source
generation check, remaining scope parity, metadata builds and T2/T3/T5/T6/T8
were not reached. Setup scans are not ten-second measured-feed cells; this
failure opens neither a cost-gate result nor Config F/fanout admission.

After read-only native failure attribution and receipt collection, all three
owned containers stopped: ClickHouse/MinIO exit0; API exit143 from requested
termination. Store files remain on the owned host pending the unchanged
15:38:32UTC cleanup. No retry, limit increase, new host or lease extension.

`result.json`, saved build SQL, native `failure-diagnosis.json`, executing
drivers and the query ledger are retained unchanged. `report.json` binds their
hashes and the original build sources. Any repaired setup needs a separate
attempt/receipt and must preserve this failure, canonical semantics, resource
limits and exact parity; do not restart this partial build as if it succeeded.
