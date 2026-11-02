# Why Python

Research note, 28 October 2026. Supporting rationale for the paper and conference
discussion; not a change to the draft or a completed performance evaluation.

## The Short Answer

web10 uses Python and FastAPI for its API, authorization orchestration and query
rewriting. ClickHouse executes the database queries. This is a deliberate division
of work, not an attempt to implement a columnar database engine in Python.

Python is a legitimate choice for a commercial-grade service. FastAPI is a
production-oriented API framework, not a toy framework that needs replacing before
a system can serve paying users. Using it does not establish any particular
throughput, availability or security guarantee; neither would choosing Go.

The research contribution is the data and access architecture. Its implementation
should be judged by measured behavior, operating cost and correctness, not by
whether the API language happens to be fashionable at a systems conference.

## Where the Work Runs

Consider a fan loading a creator's feed. The API verifies the request, resolves
permissions, validates and rewrites the application's SQL, asks ClickHouse to
execute it, and prepares the returned rows for the client.

| Work | Execution Layer | Relevant Cost |
|---|---|---|
| Request validation, token checks and permission orchestration | Python/FastAPI and supporting libraries | CPU, metadata queries and connection waits |
| SQL parsing, validation and boundary-CTE compilation | Python/SQLGlot | CPU; grows with query complexity |
| Document scans, joins, aggregation, sorting and filtering | ClickHouse's native engine | Database CPU, memory, storage and query plan |
| Result conversion, JSON handling and capability preparation | Python and supporting libraries | CPU and any additional service/database calls |
| Media delivery through presigned object URLs | Object storage to client | Storage/network, not Python relaying every byte |

See [`run_query`](../api/app/v3/endpoints/query.py) and the
[`production API command`](../api/Dockerfile). The latter runs four Gunicorn
worker processes with Uvicorn workers. Multiple processes allow work across CPU
cores; they do not eliminate Python CPU overhead or guarantee linear scaling.

The architecture puts the large relational operations in ClickHouse. It is
reasonable to expect those operations to dominate some workloads, but "most of
the load is on ClickHouse" remains workload-dependent until measured. Small,
cached queries can expose API overhead; complex SQL can stress parsing; large
responses can stress serialization and preparation.

One browser request also need not mean one internal database query. The 267-to-one
request reduction is an application/network improvement, not by itself a CPU,
latency or throughput result.

## Performance Without a Language Rewrite

Go could reduce API CPU and memory costs, particularly for parsing, permission
loops and response processing. It would not automatically make the same
ClickHouse scan faster or remove unnecessary internal database round trips.

For illustration, if 10% of a request's latency were Python-side work, making
that portion five times faster would reduce total latency by 8%, assuming the
rest stayed unchanged. This is arithmetic, not a measurement of web10. At high
load, queueing and resource contention can change the result substantially.

The appropriate sequence is to measure, identify the bottleneck, and optimize
that component. Query plans, batching, metadata access and response size may offer
more than a language change. A full rewrite is justified only by a demonstrated
cost or service-level problem that smaller changes cannot solve economically.

## Security and Inspectability

Python's concise implementation can help reviewers follow the path from verified
identity to permissions to a database read. Retaining a familiar, tested
implementation also preserves accumulated review knowledge and regression tests.
These are practical advantages, not proof that Python is intrinsically safer.

Go offers compile-time checks and explicit types that can catch errors earlier.
Neither language prevents missing authorization checks, credential-bearing logs,
revocation mistakes or consent-response confusion. Those depend on boundary
design, tests and review. Framework popularity is not a security argument.

A Go rewrite would require revalidating those guarantees and SQL dialect/rewrite
compatibility, including the role currently played by SQLGlot. Translating the
endpoint signatures is not sufficient. Existing Python tests remain useful as a
behavioral specification, but do not automatically verify a new implementation.

## What Commercial Grade Means Here

Commercial grade and Python are compatible. The meaningful questions are whether
the deployed service meets its users' needs for correctness, latency, capacity,
recovery and operating cost, with an understood security posture. These are
properties of the running system, not a badge conferred by a language.

The paper can present web10 as a deployed product and describe its implementation
confidently. Quantified claims about scale, authorization overhead, reliability or
comparative performance still need their own evidence. Production experience,
synthetic experiments and design arguments should be labeled separately.

## Evidence for the Paper

The [evaluation plan](evaluation-plan.md) and [experiment harness](experiments/README.md)
are the starting points. For this implementation discussion, collect:

- End-to-end p50/p95/p99 latency, successful throughput, errors and timeouts as
  offered load increases; report repeated runs and variance.
- API and ClickHouse CPU/memory separately, with hardware, software versions,
  worker counts, connection/thread limits and database resource settings.
- Phase timings for authentication, contracts, membership resolution,
  parsing/compilation, execution, serialization and preparation. Phase wall time
  includes waits and is not a direct measurement of Python CPU consumption.
- Scaling with document count, groups per reader, services per query, query
  complexity and response size, with cache and background-write conditions stated.
- Matched baselines with equivalent returned data and authorization semantics,
  the same hardware/resource budget and explicit implementation differences.

The current `readable_p50 / execute_p50` harness metric is a ratio of phase
medians, not the total authorization penalty. Authorization also affects other
phases and the database query itself. A controlled ablation can isolate that
cost on synthetic data; an authorization-disabled variant must remain isolated
from production and is not a functionally equivalent product baseline. A fair
system comparison must retain equivalent access restrictions.

No Python-versus-Go experiment has been completed here. Do not imply that the
language is either the bottleneck or irrelevant before profiling it.

## Conference Answer

> The API and query-rewriting layer are implemented in Python using FastAPI and
> SQLGlot; ClickHouse executes the relational workload. The contribution is the
> generic data/access architecture, not a new database execution engine. We
> separate API and database costs in the evaluation and assess the implementation
> against end-to-end latency, throughput and resource use.

Use that final sentence as an evaluation commitment until the results exist, not
as a claim that data collection is already complete. There is no need to apologize
for Python, and no need to attribute an unmeasured benefit to it either.
