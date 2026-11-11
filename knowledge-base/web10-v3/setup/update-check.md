# Update Check

How a deployed node knows which version it runs, which version is next,
and what a redeploy would bring. Operator surface: the **Version &
Updates** card at the top of Node Configuration (auth.web10.app,
admin-gated like every card on that page).

## The two halves

**This node's version** is baked at image build time. `api/Dockerfile`
(repo-root context, like marketing-ui's) reads the top line of
`knowledge-base/changelogs/CHANGELOG.md` — the project's release version,
the same number `cd.yml`/`deploy.yml` bake into the status pill — and
writes it to `/web10/VERSION`. `node_version()` (the service) resolves:

```
WEB10_VERSION env  →  /web10/VERSION  →  "unknown"
```

The last case is honest, not broken: the local `docker-compose.yml` and
the e2e stack mount the `api/` source over `/web10`, which shadows the
baked file. A code-mounted dev node runs whatever the checkout is, and it
says so.

**The next version** is the top line of the changelog on the upstream
GitHub ref — NOT the GitHub *releases* feed. Two reasons: (1) the project
versions from the changelog, and releases have not been cut since
`v2.0.0` while the changelog has moved on to 5.x — comparing against
`releases/latest` would report a 5.15 node as "ahead" of a 2.0.0 release;
(2) the deploy model is GitOps against the repo (`AGENT-OPS.md` §5 — the
stacks are git-backed and redeploys track the ref), so the changelog on
the ref is exactly what a redeploy would bring.

## The endpoint

`POST /admin/update_status` (body `{token}`, optional `?force=true`) —
admin-gated via `check_admin` like `/config`. Response:

| Field | Meaning |
|---|---|
| `node_version` | `"5.15.1"` or `"unknown"` (dev/e2e mounts) |
| `latest_version` | upstream changelog top line, or `null` when unreachable |
| `update_available` | `true` / `false` / `null` (unknown current, or no latest) |
| `upstream` | `{repo, ref, url}` — `UPSTREAM_REPO` @ `UPSTREAM_REF` |
| `status` | `update-available` \| `up-to-date` \| `version-unknown` \| `unavailable` |
| `reason` | failure class (`upstream-http-404`, `upstream-unreachable:*`, `dns-unavailable`, `bad-upstream-changelog`, `misconfigured-upstream`, …) or `null` |
| `checked_at` | when this worker's cache was populated |
| `cached` | whether the answer came from the per-worker cache |

Comparison is strict semver on the leading `X.Y.Z` of the first changelog
line; a node equal to or ahead of upstream is `up-to-date` (never a false
"update available").

## Settings

| Env | Default | Meaning |
|---|---|---|
| `WEB10_VERSION` | — | explicit node version (wins over the baked file) |
| `UPSTREAM_REPO` | `jacoby149/web10` | GitHub repo this node's releases come from (forked self-hosters: point at your fork) |
| `UPSTREAM_REF` | `main` | the ref a redeploy tracks (prod stacks: `main`; the dev stack: `dev`) |
| `UPDATE_CHECK_TTL_SECONDS` | `3600` | success cache, per worker |
| `UPDATE_CHECK_FAIL_TTL_SECONDS` | `300` | failure cache, per worker |
| `UPDATE_CHECK_TIMEOUT_SECONDS` | `5` | connect + read bound for the upstream fetch |

The check is detection, not auto-update: a stateful node does not
redeploy its own containers (no docker socket by design — the API
container has no `/var/run/docker.sock`, ever). The card's copy says the
update path out loud per deploy flavor (git-backed stacks pick up a new
release on their next poll; elsewhere: pull the image, recreate the
`api` container).

## Security posture

The upstream read mirrors the `pwa_listing` outbound-fetch discipline:

- host **pinned** to `raw.githubusercontent.com` — the repo and ref come
  from settings (validated by regex at request time), never from the
  request body;
- TLS required, `server_hostname`/`assert_hostname` pinned, no redirects;
- DNS answers must be public addresses (private/loopback/multicast
  denied — `dns-unavailable`), so a poisoned resolver cannot steer the
  fetch at the node's own network;
- bounded transfer: only the first line is read (4 KiB cap);
- no credentials to GitHub (an unauthenticated raw read — a public repo
  needs no more);
- a GitHub outage degrades to `status: "unavailable"` with the local
  version still reported — the check never 500s and never blocks the
  admin surface;
- the version itself is public data (the status pill ships it); the gate
  exists because the check is an outbound resource the node's admins own,
  not because the number is secret.

## What this is not

- **Not an auto-update.** No self-redeploy, no docker socket, no
  long-poll. The GitOps stacks (ubuntu-deployment) already converge on
  the ref; this surface tells the operator whether they have.
- **Not a release-artifact check.** No GHCR tag comparison, no binary
  download. The source of truth is the changelog on the tracked ref.
- **Not app-specific (D60).** A notes node and a social node run the same
  check — it is about the node itself, expressed through the universal
  system endpoints, like `/ready`.
