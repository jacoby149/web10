# Sixth-draft measurement record — 6 November 2026

**Status: tier-max retry in connected setup/build; no new measurements yet.**
The first larger-host attempt was blocked before provisioning. The operator then
asked: "do we need a larger instance? would be so cool to see how it goes on the
largest one in our tier!" The available non-GPU list tops out at four vCPUs;
the highest-memory listed four-vCPU option was provisioned:
`s5-4vcpu-12gb-80gb`, 4 vCPU / 12 GB / 80 GB disk, Atlanta (`atl1`), droplet
616682066, created `2026-11-06T20:25:53Z`. Advertised rate $0.12274/hour
($91.32/month), not an invoice or final run spend. This is an explicitly
operator-approved tier-limited experiment, not the rejected 8-vCPU host and not
a claim of million-user capacity.

That first tier-max attempt failed **before seeding**: ClickHouse accepted
`SELECT 1` on its temporary initialization server, then restarted between the
two schema templates. The second `clickhouse-client` call returned code 210,
connection refused on localhost:9000 (reported version 24.3.18.7). No query
samples were collected. Receipts were collected and droplet 616682066 was
deleted, with deletion verified at `2026-11-06T20:31:41Z`. The orchestration
now applies base schemas before API startup and retries the idempotent templates
at most 60 times across the init-server handoff; offline controls reproduce
refusal between templates and bounded exhaustion. This is not yet a connected
success claim or a project-wide schema-readiness repair.

A fresh retry uses the same size/region: droplet 616683895, created
`2026-11-06T20:32:58Z`. Its driver is running bootstrap/build → seed → benchmark,
with collection and deletion in a `finally` block. Workspace-local receipts:
`.context/sixth-draft/tiermax-run/` (failed startup) and
`.context/sixth-draft/tiermax-retry-run/` (active retry). No new measurement
is available yet. Final results and cleanup must be recorded before claiming
the repeat complete.
This file is an execution/status record, not a replacement for
`K1000-RESULTS.md` and not satisfaction of Task 4's results gate.

## Preflight and source

- Base revision: `8d7460d81f8bba8c51d189a35ea7216118762f7e` (v5).
- Harness changes in this branch: seeded randomized cell order, three excluded
  warm-up requests per cell, raw timing phases/query IDs retained alongside
  summaries, warm-up samples retained separately, schedule persisted before
  execution. Offline controls pass; no connected validation of these changes yet.
- Intended repeat: seed 42, 1,000 creators, one post each, K=10/100/1000;
  20 measured samples plus three excluded warm-ups per cell; K=1 discover
  remains a separate workload. Existing A is a direct-scan diagnostic, **not**
  a paired causal authorization baseline.
- `doctl account get` succeeded. Neither missing environment variables nor
  missing cloud authentication is the blocker: doctl has a configured context.
- Before and after the **first failed provisioning attempt**, `doctl compute droplet list --output json`
  returned `[]`. No droplet, billable experiment host, database, or load was
  created by that failed attempt. The subsequent operator-approved tier-max
  host above is a separate attempt. No production system was touched.

## Provisioning failure

Requested topology: one fresh Ubuntu 24.04 x64 node in sfo2,
`s-8vcpu-16gb` (8 vCPU, 16 GB nominal RAM), named
`web10-sixth-k1000-20261106`. Request:

```sh
doctl compute droplet create web10-sixth-k1000-20261106 \
  --region sfo2 --size s-8vcpu-16gb --image ubuntu-24-04-x64 \
  --ssh-keys 60548720 --tag-names web10-sixth-k1000 --wait --output json
```

DigitalOcean returned HTTP 422, request
`3ee31f50-16dd-43ed-83cd-8f009f6bec3f`:

> This size is currently restricted, please open a ticket to increase your account tier.

The requested specification is **not purchased hardware**. There is no measured
ClickHouse version, Uvicorn configuration, host price, runtime or invoice for
this attempt. Resolve the account-tier restriction or agree a supported larger
topology before retrying; do not silently cap at the old s-4vcpu-8gb host or
report a provisioning failure as a web10 scaling limit.

## Deployment and baseline gates

`api/app/settings.py` still defaults `QUERY_EVAL_READABLE_MODE` to `per-group`;
`compose.yml` and the original runner also default to it. The experimental
batched path exists, but this paper-only task has not changed the shipped API
default or deployed it. An explicitly configured batched experiment does not
prove a shipped-default change. That separate runtime/deployment gate needs
an authorized owner, equivalence tests and an exact deployed revision/config.

The existing harness A precompiles outside its timer and calls ClickHouse
directly. B includes authentication, compile and serialization in the handler.
Their difference is not paired causal authorization overhead. Task 4b still
needs same-engine paired trials over exact preauthorized inputs, matching
returned rows/fields/order (including denied/private controls), timing boundary,
cache/resources, and recording query-plan changes/checks removed. No PostgreSQL
versus ClickHouse absolute-millisecond race is planned. Optional PostgreSQL
evidence would be RLS-on/RLS-off ratios within PostgreSQL only.

## Million-author funnel (assumptions, not results)

The storage seed target is **1M registered author namespaces, one post each**,
not 1M observed active users. Assume one session per DAU per day; repeated
daily sessions would multiply these rates. Session duration includes idle gaps.

`concurrent users = peak-hour sessions × session minutes / 60`.

| Scenario | Population basis | MAU | DAU | Peak-hour share | Sessions/hour | 5-minute sessions | 15-minute sessions |
|---|---|---:|---:|---:|---:|---:|---:|
| A conservative | 1M registered | 300k | 100k (10% registered) | 12% | 12,000 | 1,000 | 3,000 |
| B likely | 1M assumed MAU | 1M | 250k (25% MAU) | 15% | 37,500 | 3,125 | 9,375 |
| C sticky | 1M assumed MAU | 1M | 500k (50% MAU) | 15% | 75,000 | — | 18,750 |

Generate the exact arithmetic and all offered-rate levels with:

```sh
python3 research/experiments/costfn/capacity_plan.py
python3 research/experiments/costfn/capacity_plan.test.py
```

At 10k concurrent virtual users loading every 60s, the planned offered load is
166.67 feed loads/s, **500 query calls/s plus 166.67 content-views calls/s**.
At 30s it doubles. Discovery, media and auxiliary calls add work. In-flight
requests are request rate × measured request latency; neither session duration
nor the dated full-page-readiness median is that latency.

The required levels remain 1k/3k/5k/10k/20k concurrently scheduled users with
30s/60s think time, warm-up, repeated trials and raw samples. No such test has
run. There are no p50/p95/p99 handler/readable latencies, errors, achieved
throughput, CPU/memory traces or breaking-point results to report. A million-
author storage seed, scalable reader fixture and full-feed/load generator are
also still required: do not run the original serial API seed at 1M and call
that a concurrency test.

## Close conditions

- [ ] Obtain supported larger hardware; record purchased specs/topology/cost/date.
- [ ] Deploy and verify batched endpoint default under its runtime owner's gates.
- [ ] Connected smoke of updated harness; then independent K1000 repeat(s).
- [ ] Archive raw samples, warm-ups, schedule, system/software/config and source patch.
- [ ] Build and verify the matched same-engine paired baseline (or explicitly omit).
- [ ] Seed 1M authors and run the stepped offered-load trials; retain resource traces.
- [ ] Replace paper/curve/table data only from reviewed new receipts.

The manuscript remains **unfrozen and not submission-ready**. No upload or
submission to CMT is authorized by this record.
