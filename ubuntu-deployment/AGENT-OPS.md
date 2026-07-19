# AGENT-OPS.md — field manual for agents operating the staging box

You are an agent with SSH access to a LIVE machine serving real
domains. This file is written to be followed literally, step by step.
Do not improvise. If a step fails twice, STOP, write what happened in
`OPS-LOG.md` (§8), and report back to the operator — a wrong guess on
a live box costs more than a paused task.

Read `README.md` (security model) before your first session. This
file is the "what do I actually type" companion to it and to
`STAGING-RUNBOOK.md` (day-2 procedures).

## 0. Prime directives

1. **Never** expose Portainer (:9000), the NPM admin (:81), or the
   Minio console (:9001) to the internet — no DNS record, no NPM
   proxy host, no port-forward. This is the load-bearing security
   rule of the whole deployment.
2. **Never** delete a Docker volume, run `docker system prune -a`,
   or wipe data unless the task explicitly says so AND
   `STAGING-RUNBOOK.md` has a procedure for it. Prefer restart >
   rebuild > redeploy > wipe, in that order.
3. **Never** commit secrets: no IPs beyond what's already public DNS,
   no passwords, no tokens, no key material. Secrets live in
   `ubuntu-deployment/.env` (gitignored) and in Portainer stack env
   vars — nowhere else.
4. **Always** append an entry to `OPS-LOG.md` (§8) before you end a
   session in which you changed ANYTHING on the box. The log is how
   parallel agents avoid stepping on each other.
5. One change at a time. Change → verify → log. Never batch three
   fixes and then check.

## 1. Getting in

Connection details are NOT in git. They live in
`ubuntu-deployment/.env` (copy of `.env.example`, filled in by the
operator):

```
VM_IP=...          # the box's LAN IP (VPN/LAN reachable)
VM_PUBLIC_IP=...   # public IP (staging/prod DNS target)
SSH_USER=...       # login user (NOT root on this box)
CF_ZONE=web10.app
CF_API_TOKEN=...   # Cloudflare DNS edits
```

THE BOX IS THE OPERATOR'S EVERYTHING BOX — a personal machine
(hostname `all-spark`) that also runs unrelated services and
desktop software. Extra prime directive: you manage ONLY the
`edge` and `web10-*` stacks and their volumes. Never stop,
restart, prune, or reconfigure any container, volume, network, or
service you didn't deploy from this directory — no matter how
broken it looks. Report, don't touch.

```bash
# 1. read the env file — if it doesn't exist, STOP and ask the
#    operator for it. do not guess IPs.
cat ubuntu-deployment/.env

# 2. ssh in (key auth; the operator's key must already be installed)
ssh $SSH_USER@$VM_IP

# 3. prove you're on the right box before touching anything:
hostname                      # expect: all-spark
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
# expect portainer + the edge/web10 stack containers among OTHERS —
# it's a shared box. if hostname is wrong, disconnect and report.
# if `docker ps` says permission denied, $SSH_USER isn't in the
# docker group yet — STOP and ask the operator to run
# `sudo usermod -aG docker $SSH_USER` (agents have no sudo).
# the repo's deploy clone lives at /opt/web10 (owned by $SSH_USER).
```

Admin UIs (from LAN/VPN, or via SSH tunnel — see README §"How the
private side is enforced"):

| UI | Where | For |
|---|---|---|
| Portainer | `http://$VM_IP:9000` | stacks: deploy, env vars, logs, restart |
| NPM admin | `http://$VM_IP:81` | proxy hosts, TLS certs |
| Minio console | `http://$VM_IP:9001` | S3 buckets (rarely needed) |

Remote tunnel pattern: `ssh -L 9000:localhost:9000 root@$VM_IP`, then
open `http://localhost:9000`.

## 2. Map of the box

- Everything runs as Docker containers on the shared external
  `proxy` network (created by `prep-vm.sh`).
- Everything web10 runs as **Portainer stacks** (so the whole map is
  visible in the Portainer UI from the VPN): the `edge` stack (NPM,
  from `docker-compose.edge.yml` — proxy mappings live in its
  `npm-data` volume, certs in `npm-letsencrypt`) plus up to three
  app stacks (`web10-staging`, `web10-dev`, `web10-prod`), ALL
  pasted from the ONE canonical compose,
  `docker-compose.ecosystem.yml`, differing only in their stack env
  vars (`env.staging.example` / `env.dev.example` /
  `env.prod.example` document them). Build contexts are `../api`,
  `../ui`, `../api/rtc`, `../marketing/*` — the repo clone on the
  box (`/opt/web10`) is a deploy artifact, never a place to develop.
- NPM terminates TLS on 80/443 and forwards over the `proxy` network
  BY STACK-PREFIXED ALIAS (`web10-staging-api`), never by bare
  service name — with several stacks on one network, a bare `api`
  resolves ambiguously across environments and routes traffic
  cross-env.
- REALITY CHECK before assuming the above: as of 19.07.2026 the live
  box still runs the pre-runbook edge (root-managed Caddy, bare-name
  targets) and the old staging compose — see §4 issues #4 and #5 for
  the migration procedure.

Domain map (zone `web10.app`; `{env}` = staging / dev — dev DNS
points at the LAN IP and only works on VPN; prod uses bare zone
names, see STAGING-RUNBOOK.md):

| Public URL | NPM forwards to | What |
|---|---|---|
| `{env}.web10.app` | `web10-{env}-api:80` | FastAPI node |
| `auth.{env}.web10.app` | `web10-{env}-ui:80` | node admin/consent UI |
| `rtc.{env}.web10.app` | `web10-{env}-rtc:80` | signaling |
| `minio.{env}.web10.app` | `web10-{env}-minio:9000` | S3 API (media) — never :9001 |
| `social.{env}.web10.app` | `web10-{env}-social:80` | web10-social |
| `www.{env}.web10.app` | `web10-{env}-marketing-ui:80` | marketing site |
| `marketing-api.{env}.web10.app` | `web10-{env}-marketing-api:80` | importer/analytics API |

## 3. Diagnosis — run this sequence, in order, before changing anything

```bash
# A. what's up, what's crash-looping?
docker ps -a --format 'table {{.Names}}\t{{.Status}}'
# "Restarting (1) X seconds ago" = crash loop -> step B on that name.

# B. logs of a suspect container (NEVER guess from memory):
docker logs --tail 100 <container-name>

# C. is the service healthy FROM INSIDE the proxy network?
docker run --rm --network proxy curlimages/curl -sS -o /dev/null \
  -w '%{http_code}\n' http://api:80/docs        # expect 200
docker run --rm --network proxy curlimages/curl -sS -o /dev/null \
  -w '%{http_code}\n' http://ui:80/             # expect 200

# D. is it reachable FROM OUTSIDE?
curl -sS -o /dev/null -w '%{http_code}\n' https://staging.web10.app/docs
curl -sS -o /dev/null -w '%{http_code}\n' https://auth.staging.web10.app/

# E. does DNS even exist? (run from YOUR machine, not the box)
dig +short auth.staging.web10.app
```

Symptom → likely cause (check in this order, stop at first hit):

| Symptom | Cause | Fix |
|---|---|---|
| `Could not resolve host` | Cloudflare DNS record missing | add A record (DNS only, not proxied) via CF dashboard or API with `CF_API_TOKEN` |
| 502 from NPM | container down, or NPM forwards to wrong name/port | step A/B; check NPM proxy host target matches §2 table |
| 521/timeout | box or NPM down, or router 80/443 forward broken | `docker ps` for NPM; check router |
| Container `Restarting` | app crash — env var missing is the usual | `docker logs`; compare stack env against `env.{env}.example` (all `docker-compose.ecosystem.yml` `${VAR:?}` vars are required) |
| Page loads but app is dead/blank | frontend built with wrong baked-in URLs, or CORS | §4 Known issues — check browser devtools console first: what URL is it calling? |
| API 500s | read the traceback in `docker logs <api-container>` — don't theorize | fix per traceback |

## 4. KNOWN ISSUES — live breakage, triaged 19.07.2026

Read this before re-diagnosing; these are already understood:

1. **The auth UI at `auth.staging.web10.app` is broken by
   construction.** The UI serves (HTTP 200) but the JS bundle has
   its backend origins HARDCODED at build time in
   `ui/src/interfaces/authAdapter.ts` — dev builds point at
   `*.localhost`, any production build points at
   `https://api.web10.app` / `https://auth.web10.app` (which is not
   this environment). `ui/src/config.ts` likewise defaults to
   `api.web10.app`. So the staging UI calls a wrong API and dies.
   **The fix is a `ui/` code change (lane B, queued with B5):**
   read the origins from build-time env
   (`REACT_APP_*`/`VITE_*` — `ui/vite.config.js` already allows both
   prefixes) + Dockerfile `ARG`s. The compose side is DONE:
   `docker-compose.ecosystem.yml` already passes `VITE_API_ORIGIN`,
   `VITE_AUTH_ORIGIN`, `VITE_RTC_HOST`, `REACT_APP_DEFAULT_API` as
   build args (harmless warnings until the Dockerfile declares
   them). Same story for web10-social's adapter (lane D / D12).
   An ops agent CANNOT fix this on the box — do not try; rebuilding
   with the same code reproduces the same bundle.
2. ~~DNS records missing for `rtc.staging` / `minio.staging`.~~
   **FIXED as of 19.07.2026 (evening)** — verified remotely:
   `rtc.staging.web10.app` returns 200, `minio.staging.web10.app`
   returns 403 (normal for unauthenticated S3). Whoever added the
   records did not log it in OPS-LOG.md — log your box changes.
   Still to create: `social.{env}` / `www.{env}` /
   `marketing-api.{env}` records per §2 when deploying those
   services, and the whole `*.dev` set (LAN IP!) for E5.
3. **CORS**: the API's `CORS_SERVICE_MANAGERS` must include
   `auth.staging.web10.app` (bare hostname, comma-separated —
   Portainer → stack → env vars). Unverified on the live stack;
   check when the UI fix lands. See STAGING-RUNBOOK.md.
4. **Marketing + social are not deployed yet.** The compose work is
   DONE — `docker-compose.ecosystem.yml` contains social,
   marketing-ui and marketing-api. What remains is box execution:
   repaste the staging stack from the ecosystem compose (full env
   set per `env.staging.example`), create the `web10-dev` +
   `web10-prod` stacks (E5/E3), add their NPM proxy hosts + DNS
   records per §2/STAGING-RUNBOOK.md. Note: social/ui bundles stay
   mis-originated until known-issue #1's app-side fixes merge.
5. **The live edge is NOT NPM yet (found 19.07.2026 evening).** The
   19.07 staging deploy diverged from the runbook: 80/443 are held
   by a root-managed **Caddy** container (config
   `/opt/caddy/Caddyfile`, DNS-01 via a Cloudflare token, proxying
   BARE service names `api`/`ui`/`rtc`/`minio`). Two problems:
   (a) the operator's chosen design is NPM-as-Portainer-stack (UI
   for the mappings, config in the `npm-data` volume) — the Caddy
   setup has no UI and no managed volume; (b) that Caddyfile is
   WORLD-READABLE and contains a live CF API token — the operator
   must `chmod 600` it and ROTATE the token in Cloudflare
   (consider it burned). MIGRATION (one change at a time, §0.5):
   deploy the `edge` stack (`docker-compose.edge.yml`) — it will
   fail to bind 80/443 while Caddy holds them, so: recreate the
   four staging proxy hosts in NPM first via the :81 UI (they'll
   go live the moment NPM binds), stop+disable the Caddy
   container, deploy/restart the edge stack, verify §3-D, THEN
   the bare-name forward targets must be repointed to
   stack-prefixed aliases when staging is repasted (issue #4).
   Expect a few minutes of staging downtime; log it.

When one of these is fixed, update this section in the same PR.

## 5. Redeploy (the normal change loop)

Code changed in git and you need the box to serve it:

```bash
# Portainer way (preferred): Portainer → Stacks → web10-{env} →
#   "Pull and redeploy" / re-deploy with "Re-pull image and rebuild".
# SSH way:
ssh root@$VM_IP
cd /path/to/web10-clone && git pull          # find it: docker inspect or ls /root /opt /srv
docker compose -p web10-{env} --env-file env.{env} \
  -f ubuntu-deployment/docker-compose.ecosystem.yml up -d --build
```

After ANY redeploy, verify (§3 C+D) and smoke-test the money path:
open `https://auth.staging.web10.app`, sign up a throwaway account,
log in. If you can't complete that, the deploy is NOT done.

## 6. Changing DNS (Cloudflare)

Use the token from `.env` (scope: DNS edit on the zone). Records for
public services (staging/prod): A record, name per §2, content = the
box's PUBLIC IP (`VM_PUBLIC_IP` in `.env`), **proxy status: DNS
only**. For the VPN-only dev env (E5): same names s/staging/dev/,
but content = the box's INTERNAL LAN IP (`VM_IP`) — those records
are intentionally useless off-VPN, and their TLS certs must use the
DNS-01 challenge (see STAGING-RUNBOOK.md).

```bash
# list records (sanity check what exists):
curl -sS -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=$CF_ZONE" # -> zone id
curl -sS -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?per_page=100" \
  | python3 -m json.tool | grep -E '"name"|"content"'
```

Never create records for admin ports/panels (prime directive 1).

## 7. What an ops agent may and may not do

MAY (self-serve): restart containers, read any logs, redeploy stacks
from git, edit stack env vars per a documented fix, add/repair NPM
proxy hosts and DNS records for the public services in §2, run the
smoke test.

MAY NOT (report instead): change code to "fix" something on the box
(code fixes go through a PR in the right lane), touch Portainer/NPM
admin accounts, expose new surfaces, delete volumes/data, change the
router/firewall, rotate `MINIO_PASSWORD` (coordinated change — API
and Minio share it).

## 8. OPS-LOG.md — the coordination ledger

`ubuntu-deployment/OPS-LOG.md` is append-only, newest entry at top:

```
## DD.MM.YYYY HH:MM — <who> (<workspace/branch>)
did: <exact changes — commands run, env vars set, records added>
state: <what's green, what's still red>
next: <what you'd do next / what you're handing off>
```

Append an entry for every session that changed the box, commit it in
your branch. Before starting ops work, READ the top entries — someone
may already be mid-fix on the thing you're about to touch.
