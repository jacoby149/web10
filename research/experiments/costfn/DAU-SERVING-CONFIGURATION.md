# DAU c-32 serving bundle for the utilization replay

The bundle is limited to the admitted DAU utilization cell. It is **one
treatment**, not an attribution experiment. Compare the post-fix calibration
against its own utilization and queue traces. Do not infer that an individual
setting was the sole bottleneck, or that this configuration serves production.

| Seam | Pinned value on the existing 32-logical-CPU guest |
|---|---|
| API process layout | Four read-only HTTP workers, one dedicated publication worker; actual `--workers 1` per independently bound process |
| API/engine work admission | Five AnyIO thread tokens per reader process; four for publication (24 total); each reader stays on the same loopback port across main and follow-ups |
| ClickHouse query threads | One per query in the default profile and explicitly for the measured transport; setup statement bounds remain unchanged |
| ClickHouse query ceiling | 40 concurrent queries, with room beyond the 24 API handler slots for operational evidence and internal traffic |
| ClickHouse background merges | Pool size 8, merge/mutation ratio 2; minimum free entries for mutation / entire-partition optimize / lower merge-size threshold: 4 / 4 / 8 |
| API → ClickHouse transport | Retain actual thread-local clients; use one persistent pool manager per API process, retaining up to 16 connections per host, non-blocking. This is not a global admission semaphore. |
| Descriptor limits | API 65,536 soft/hard; ClickHouse 262,144 soft/hard; raise owned driver soft limit to at least 65,536 within its existing hard limit |
| SQL preparation | Retain the existing exact-input SQL caches and full-key prepare, and reuse follow-up syntax and rendering keyed on the exact compiled SQL, scope and targets. All live policy/route checks still run. No credential decision or response caching. |
| Store, memory and traffic | Same frozen input and banked oracles; 28/22 GiB ClickHouse container/server limits and existing API memory cap; same phases and offered rates |

Twenty-four potential synchronous API handlers at one ClickHouse query
thread plus the eight merge worker slots give a starting budget of 32. This
is arithmetic, not measured utilization: a handler may be parsing SQL or
waiting, and the engine has background and I/O work beyond this count.

On the replay guest before the bundle, native inspection found
`max_concurrent_queries=1000`, `background_pool_size=16`,
`background_merges_mutations_concurrency_ratio=2`, and `max_threads=auto(32)`
on a connection without a probe thread override. The merge pool can only
increase without restarting, so the owned configured engine restarts once
between preparation and calibration. The retained input and physical
certificates must verify again before starting the serving cell. Reapply
the existing canonical/copy/index merge fences after restart; leave normal
event merges enabled. This preserves the preparation's freeze, not a new
freeze on the writer's event stream.

The four read listeners bind only to host loopback. Native writes still go
through live authorization and the single original publication journal on
port 6098, which also handles login. Read processes accept only the measured
query and content-views routes (plus readiness) and do not start fanout
maintenance or rebuild tasks. Runtime receipts remain keyed to the same
request IDs. Existing delivery side effects from reads are unchanged.
The bundle API container declares a 610-second graceful shutdown window
instead of adding a separate worker kill timer.

Verify effective settings, worker hook identities, ceilings and per-core
utilization on the owned guest before interpreting calibration. The worker
startup probes check native query threads, installed hook hashes, AnyIO
tokens and the retained connection pool; resource samples include each
worker's CPU ticks and the worker-labelled queue and connection counters. A startup
or physical-certificate refusal is not a measured resource/capacity result.
