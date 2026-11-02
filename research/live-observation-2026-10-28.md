# Live Ubuntu Deployment Observation

Collected 28 October 2026, approximately 22:44-22:55 UTC, with operator
authorization. This is a production pilot, not a stress test, capacity estimate,
comparative benchmark or complete social gauntlet. Collection checkout:
`0a4e6b8fdbf1e98b81117b11cf1273c9ee4a2aa6`.

## Environment

The existing deployment served `social.web10.app`, `auth.web10.app` and
`api.web10.app`. SSH verified the documented host before collection. This VM
also hosts the development stack and unrelated workloads.

| Observed Property | Value |
|---|---|
| Guest OS / kernel | Ubuntu 22.04.5 LTS / 6.2.0-36-generic |
| Virtualization | KVM guest |
| CPU model exposed to guest | Intel Xeon E3-1240 v5 @ 3.50 GHz |
| Logical CPUs exposed to guest | 8 |
| Guest RAM | 33,639,768,064 bytes (31.33 GiB) |
| Root filesystem capacity / used | 1,967,315,451,904 / 409,982,078,976 bytes |
| Host uptime snapshot | 61 days, 16 hours, 28 minutes |
| Docker / ClickHouse server | 29.2.1 / 26.8.3.105 |
| API Python / FastAPI / SQLGlot | 3.12.12 / 0.139.0 / 30.18.0 |

Guest topology is hypervisor-reported, not evidence of eight physical cores.
Host uptime is not application availability. Hardware purchase date, hosting
cost and historical service availability were not collected.

## Dataset Snapshot

Read-only queries used `FINAL`, then `deleted = 0`, one thread and a 10-15s
execution limit. No account lists, document bodies, messages, contact details,
credentials or keys were retained in this report.

| Metric | Count |
|---|---:|
| Live account rows | 597 |
| Live documents | 593 |
| Distinct authors with live documents | 30 |
| Distinct services with live documents | 10 |
| Live group contracts | 49 |
| Live membership rows, including principal-class grants | 1,298 |
| Membership rows excluding `anyone` and `authenticated` | 1,271 |
| Live document/group attachments | 437 |
| Live `posts` documents tagged `music` | 0 |

These are registered records, not 597 active humans. Organic/operator/test/bot
populations were not classified. Author count has no activity window. Separate
SQL statements are not a transactionally atomic snapshot of a live service.

| Service | Live Documents |
|---|---:|
| `media_metadata` | 189 |
| `posts` | 175 |
| `reactions` | 86 |
| `comments` | 51 |
| `web10-social-group-identity` | 43 |
| `profile` | 31 |
| `settings` | 8 |
| `contacts` | 4 |
| `notifications` | 4 |
| `saved` | 2 |

An independent active `system.parts` snapshot includes physical versions and
tombstones. It excludes media, other tables, backups and total deployment storage.

| Table | Physical Rows | Compressed Bytes |
|---|---:|---:|
| `documents` | 710 | 97,810 |
| `users` | 598 | 55,338 |
| `group_contracts` | 49 | 6,486 |
| `group_members` | 1,299 | 30,509 |
| `doc_groups` | 559 | 29,316 |

## Authenticated Browser Checks

One headless Chromium 153.0.8010.12 browser on the operator's ARM64 Mac accessed
actual production HTTPS origins. The client had LAN/VPN access for SSH; the
HTTPS network path and round-trip latency were not characterized as a WAN
workload. It opened the social Sign in popup, filled the real authenticator
form and verified the expected principal in the SDK handoff. No cookie injection
or mocked responses. The local driver used a transient credential environment,
did not print credentials/tokens or save session state, screenshots, traces or
response bodies, and closed the browser afterward.

Completed run: **22:53:31-22:54:14 UTC**. Login submission to observed SDK handoff:
**3,203 ms**. Three sequential navigation rounds with 1.5s pauses after readiness;
no deliberate posts, reactions, follows, messages or group edits.

Readiness measures full-page `goto` start to the listed visible DOM state,
including network, frontend startup, API and render work. This is neither
server-query duration nor complete page/media loading.

| Route | Readiness Condition | Round 1 ms | Round 2 ms | Round 3 ms | Rendered Items |
|---|---|---:|---:|---:|---:|
| `/feed?tab=following` | First post-author element, or empty-feed state | 5,962 | 5,396 | 4,366 | 20 posts each |
| `/music` | Track card, or explicit no-music state | 893 | 1,365 | 1,380 | 0 tracks each |
| `/groups` | My Groups list, or explicit empty state | 1,401 | 2,378 | 845 | 6 group rows each |

| Route | n | Minimum ms | Median ms | Maximum ms |
|---|---:|---:|---:|---:|
| Following | 3 | 4,366 | 5,396 | 5,962 |
| Music empty state | 3 | 893 | 1,365 | 1,380 |
| My Groups | 3 | 845 | 1,401 | 2,378 |

All nine navigations returned HTTP 200 and retained an SDK session cookie;
initial handoff additionally checked the expected principal. Zero uncaught
page-script errors were observed. Music tests empty-state rendering, not
playback. Feed checks visible records, not result equivalence to an independent
oracle. These are exploratory checks, not formal conformance tests.

The driver counted 589 observed API responses, all HTTP 200: 18 query responses,
138 document reads, 82 group-list responses, one login, four app-contract adds,
and 346 other API responses. These include startup, auth/setup and background
work, not per-feed counts. Requests with no response and console-level errors
were not separately counted; response content and dynamic URLs were not printed.

### Initial Attempt

22:51:38-22:52:14 UTC: login succeeded (3,640ms handoff), then 20 Following posts
rendered (5,938ms readiness). Waiting specifically for a music card timed out.
There were zero music-tagged posts; the corrected driver accepts the explicit
empty state. The initial failure remains recorded; no playback result is inferred.

## Resource Snapshots

`docker stats --no-stream` was sampled before browser runs and afterward at
22:54:41 UTC, not continuously during navigation. CPU is a short sample, memory
is instantaneous; neither is a peak or an isolated cost of this workload.

| Production Container | Before CPU | Before Memory | After CPU | After Memory |
|---|---:|---:|---:|---:|
| API | 0.53% | 551.9 MiB | 0.51% | 582.7 MiB |
| ClickHouse | 27.18% | 2.203 GiB | 4.45% | 2.186 GiB |
| Social frontend/preview | 0.00% | 35.84 MiB | 0.00% | 35.84 MiB |
| Authenticator frontend | 0.00% | 45.68 MiB | 0.00% | 45.7 MiB |
| RTC | 0.07% | 29.05 MiB | 0.32% | 29.98 MiB |
| MinIO | 0.00% | 317.1 MiB | 0.04% | 368.7 MiB |

All containers reported the VM's 31.33GiB memory ceiling. Shared-box activity
was not isolated. Cumulative block-I/O counters are not browser workload costs.

## Provenance and Missing Telemetry

| Production Artifact | Observed Identity |
|---|---|
| API image ID | `sha256:89d9b1c534e1dfa3eac1b6195960a6e94f1e2a719c0273d60b43118ea6806518` |
| API container created | 2026-10-26 10:40:34 UTC |
| Social image ID | `sha256:79db518fc90bc0309c659e882c045fc657a74840fd981d8f3fe948d9bebf706f` |
| Social container created | 2026-10-22 11:17:08 UTC |
| ClickHouse image ID | `sha256:b9e33e5edc3391f1eb283991809dacbcdd8aa9142a2649461fff4f9bf01040d5` |
| Deployed query endpoint SHA-256 | `43dece2218e6d3aa8c0f8c07035a4e7c8be0248bb0b8c085947412aac262acf1` |

The host deploy checkout was `0a4e6b8fdbf1e98b81117b11cf1273c9ee4a2aa6`;
running-image correspondence to that revision is unverified. API OCI labels
described its base image; social had no application revision label.

No `[query] ... timing_ms` records appeared in the completed run's narrow log
window. The running query endpoint lacks the `timing_ms` source marker. This
pilot therefore supplies no authorization/compile/execute breakdown. No
deployment or instrumentation changes were made to obtain one.

## Procedure and Safety

- Read deployment field manual/ops log; verify host identity.
- Read host metadata and named production-container status and software versions.
- Use `clickhouse-client --readonly=2 --max_execution_time=15 --max_threads=1`
  for aggregate queries, e.g. `SELECT count() FROM web10.documents FINAL WHERE deleted = 0`.
- Query active `system.parts` for physical rows/bytes, without content bodies.
- Run the bounded real-browser observation, not CI fixture setup, destructive
  seeding, account factories or concurrent write gauntlets.
- Parse the timing-log window remotely and emit numeric summaries only.
- Inspect named image IDs and source hash without dumping env, secrets or raw logs.

Normal browsing has side effects: login/session state, app-contract refreshes,
delivery impressions, telemetry and possible app-owned initialization/self-heal.
This was read-only infrastructure collection plus ordinary account browsing,
not a claim the app issued no writes. No restarts, rebuilds, deployments,
volume/schema changes or account password changes were performed.

The snapshot supplies an observed operating point, not active-user population,
sustained concurrency, peak capacity, write correctness, playback, recovery,
historical uptime, hosting cost or comparative performance. Larger trials and
exact build provenance remain separate work for the finished paper evaluation.
