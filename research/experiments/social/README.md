# Connected Social Evaluation

A timed application scenario for a **fresh, disposable Ubuntu droplet**. This
uses actual web10 authentication, storage, API authorization and production-built
frontends, rather than the legacy random seed/query loop.

**Status:** implemented and locally checked with offline regressions and isolated
Chromium guard tests. A complete Docker-stack/droplet run has not been verified
in the implementation workspace because its Docker daemon is unavailable.
Do not cite implemented tests as completed experiment results.

Implementation verification on 28 October 2026: 13 Node tests (zero skipped,
including isolated Chromium and real subprocess interruption), 24 mocked Python
orchestration tests, Compose configuration validation, Bash syntax and discovery
of the single Playwright scenario pass. A fresh source review found no remaining
blocking integration issue after repairs. Image builds/startup and the connected
application run still require the actual disposable host.

## Scenario

The state machine follows the existing `e2e/tests/gauntlets/feed.spec.ts`,
`posts.spec.ts` and `reactions.spec.ts` patterns, but uses a separate config,
explicit safety checks and a durable timing journal. It does not import the
old gauntlet feed-truth helper as a substitute for the current application.

1. Configure the new isolated node; create a creator, reader and outsider through
   actual signup/login APIs. Fixture setup is recorded separately from samples.
2. Log each account into the real social frontend through its authenticator popup
   and consent UI. No browser token-cookie injection or mocked API responses.
3. Publish a synthetic public post through the real composer; verify its exact
   persisted text, author and returned document identity through the API.
4. Follow through the reader's UI, verify the post appears, and verify reload
   persistence. Like and comment through the UI, then check exact persisted
   records and rendered counts, including after another reload.
5. Unfollow through the UI; verify Following exclusion while public discover
   access remains valid. Separately assert private-group read and query 403s,
   successful joined access, and denial after membership revocation.
6. Collect repeated genuine empty-Following samples, then provision exactly 20
   connected creator posts through the API, follow again and collect nonempty
   samples using the actual UI's complete feed path.

The creator is the synthetic bootstrap admin, which is recorded as a fixture
limitation. Reader and outsider are ordinary accounts. All accounts have P2P
disabled through persisted application settings before browser login; the
temporary authenticator-origin settings grant is revoked before social consent.
Native peer-connection constructors are also blocked before page scripts.
**RTC delivery, media upload/playback and concurrent-user capacity are outside
this scenario.** They need separate scenarios if claimed in the paper.

## Disposable Host Contract

The runner requires `WEB10_DISPOSABLE=social-evaluation`, Ubuntu/Linux, a local
Docker socket, no running Docker containers, a clean committed checkout, free
loopback ports 80/9000 and installed dependencies. It rejects target URL overrides,
inherited Docker/Compose routing and caller-supplied result directories. Use a
fresh droplet, not the live Ubuntu server, an existing development stack or the
small provisioning-only baby-test instance.

Only localhost vhosts are accepted. The newly built proxy must return an exact
experiment marker before fixture/authentication writes. Browser HTTP/WebSocket
requests are restricted to the expected local hosts; unexpected destinations
fail the scenario. Containers use an internal runtime network. Builds still need
registry/package access. This is not a full OS sandbox or a modification to the
host firewall; keep the droplet itself disposable and access-controlled.

Only the proxy's `127.0.0.1:80` and MinIO's `127.0.0.1:9000` are published.
No admin console or database port is published, and no Docker socket is mounted
into a container. Browser and services run on the droplet, so the result is a
co-located localhost experiment, not a remote-client/WAN benchmark.

## Prepare the Droplet

Use a clean clone pinned to the commit being evaluated. A 4-vCPU/16-GB instance
is a reasonable starting configuration for building this stack, not a measured
minimum or cost claim. Record the actual purchased instance and billing details.

Prerequisites: Git, Node.js 22+, npm, Python 3.10+, Docker Engine and the Docker
Compose plugin. The current operator must have Docker access and permission to
bind port 80; the standard fresh DigitalOcean root account satisfies that access
requirement. Ensure the mirrored GHCR images are accessible before the run.

Map these names to `127.0.0.1` in the droplet's `/etc/hosts`:

```text
127.0.0.1 api.localhost auth.localhost social.localhost rtc.localhost marketing.localhost
```

From the repository root, install the locked test dependencies explicitly:

```bash
npm ci --prefix e2e
node e2e/node_modules/@playwright/test/cli.js install --with-deps chromium
```

The runner never installs dependencies, provisions/deletes droplets, changes DNS,
edits hosts/firewall rules or connects over SSH. The existing cloud provisioning
scripts are independent tools; their successful execution is not a web10 test.

## Run

From the **clean committed** repository root on the disposable host:

```bash
WEB10_DISPOSABLE=social-evaluation \
WEB10_EVAL_REPETITIONS=20 \
WEB10_EVAL_WARMUP=2 \
bash research/experiments/social/run.sh
```

Repetitions: 3-100, default 20, **for each of the empty and nonempty distributions**.
Warmups: 0-10, default two per distribution. One browser worker, no test retries,
and no mutation retries. The initial connected correctness journey must pass
before either distribution can support a successful run. A run that fails or
collects too few samples exits nonzero rather than reporting a partial pass.

The runner builds the production Dockerfiles, starts fresh project-scoped storage,
initializes the checked-in schema templates, checks service readiness, samples
container resources during the test, and tears down only its generated
`web10-eval-<random>` project and volumes. No global prune or unrelated-container
cleanup. Cleanup failures also make the overall run unsuccessful.

Inspect the manifest's cleanup status after failure. After retrieving artifacts,
destroy the purchased droplet and verify its deletion separately; local Docker
cleanup does not stop the cloud bill. SIGKILL, host loss and cloud outages can
prevent automatic cleanup; use the recorded project identity for recovery.

## Evidence

The artifact directory is generated under `.context/evaluation/<runid>/` and
printed at startup. Copy it off the droplet before deleting the host.

| Artifact | Meaning |
|---|---|
| `manifest.json` | Commit, workload/config/schema/lock hashes, actual Node/Playwright/Chromium versions, hardware, built image identities, phase outcomes and cleanup status |
| `operations.jsonl` | Fsynced operation-start/finish events; completed records survive worker termination and unmatched starts remain interrupted failures |
| `operations.json` | Sanitized operation records and summaries, or recovered failed journal if worker teardown permits |
| `run.json` | Safe Playwright outcome and full-sample completeness check; may be absent if the entire runner is forcibly terminated |
| `docker-stats.jsonl` | Timestamped resource samples restricted to this project's container IDs |
| `query-timings.jsonl` | Allowlisted numeric API phase timings from the fresh project's entire lifetime, including setup and warmups |

An operation records elapsed monotonic duration, epoch timestamps, phase, trial,
warmup flag, readiness polls, request counts and API success/failure counters.
Reload success requires exact expected cards/counts, successful group discovery,
a successful query for nonempty feeds, settled API requests and no observed API
errors. An empty UI caused by a failed load is a failed operation, not fast
successful readiness. Nonempty measured samples also wait for the expected
engagement counts. This milestone differs from the earlier live pilot's first
visible author element; compare only like-for-like definitions.

Setup, preauthentication and warmups are excluded from measured feed quantiles.
Failures remain recorded, including failed warmups, and fail the run. Successful
sample medians and minimums are descriptive; p95 is emitted only at n >= 20 and
labeled as repeated same-session data. No p99, maximum-capacity or constant-time
scaling claim follows. Reusing a browser session retains cache/state effects;
each operation is a full reload, and browsers share resources with the services.

API phase timings are not attributed to individual browser operations. Correlate
operation timestamps with resource snapshots, but do not call a phase-median
ratio total authorization overhead. The scenario is not the optional
1K/10K/100K-document scaling experiment or a matched conventional-backend baseline.

No passwords, JWTs, response bodies, raw browser console output, session-state
files, traces, screenshots or raw container logs are exported. Diagnostics keep
operation names, sanitized error classes/statuses and fixed failure guidance.
Synthetic fixture content is still not needed in published timing artifacts.

## Local Regression Checks

These check orchestration and measurement logic without creating a droplet:

```bash
python3 research/experiments/social/runner.test.py
node --test research/experiments/social/metrics.test.mjs
bash -n research/experiments/social/run.sh
```

Node checks use the locked e2e Playwright installation. An isolated Chromium
peer-guard regression runs when its executable is installed; that check alone
is not execution of the connected web10 stack. The offline suite covers safety
refusals, project-only cleanup, startup failure/interrupts, credential suppression,
sample completeness, API-failure readiness and durable interrupted journals.
