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
CF_ZONE=web10.app
CF_API_TOKEN=...   # Cloudflare DNS edits
```

```bash
# 1. read the env file — if it doesn't exist, STOP and ask the
#    operator for it. do not guess IPs.
cat ubuntu-deployment/.env

# 2. ssh in (key auth; the operator's key must already be installed)
ssh root@$VM_IP

# 3. prove you're on the right box before touching anything:
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
# expect: portainer, nginx-proxy-manager (or npm_app), and the
# web10-staging stack services (api, ui, rtc, minio, ferretdb,
# postgres). if you don't see these, you are on the wrong machine
# — disconnect and report.
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
- The app stack is a **Portainer stack** named `web10-staging`,
  created by pasting `docker-compose.staging.yml` into Portainer.
  Its build contexts are `../api`, `../ui`, `../api/rtc` — Portainer
  has a clone of this repo for that; the repo on the box is a
  deploy artifact, never a place to develop.
- NPM terminates TLS on 80/443 and forwards BY CONTAINER NAME over
  the `proxy` network.

Domain map (zone `web10.app`):

| Public URL | NPM forwards to | What |
|---|---|---|
| `staging.web10.app` | `api:80` | FastAPI node |
| `auth.staging.web10.app` | `ui:80` | node admin/consent UI |
| `rtc.staging.web10.app` | `rtc:80` | signaling |
| `minio.staging.web10.app` | `minio:9000` | S3 API (media) — never :9001 |

Marketing + social are NOT in this stack yet (see plan.txt
CROSS-CUTTING deployment / lane items E3+E5): `docker-compose.marketing.yml`
is the marketing stack; social has no staging service yet.

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
| Container `Restarting` | app crash — env var missing is the usual | `docker logs`; compare env against `docker-compose.staging.yml` requireds (e.g. `MINIO_PASSWORD`) |
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
   prefixes) + a Dockerfile `ARG`, and have
   `docker-compose.staging.yml` pass them from `PROVIDER`. An ops
   agent CANNOT fix this on the box — do not try; rebuilding with
   the same code reproduces the same bundle.
2. **DNS records exist only for `staging` + `auth.staging`.**
   `rtc.staging` / `minio.staging` (and any future
   `social.staging` / `www.staging`) did not resolve as of
   19.07.2026 — media upload and RTC will fail even once the UI is
   fixed. Add the A records per §2.
3. **CORS**: the API's `CORS_SERVICE_MANAGERS` must include
   `https://auth.staging.web10.app` (Portainer → stack → env vars).
   See STAGING-RUNBOOK.md troubleshooting.
4. **Marketing + social are not deployed at all.** The staging stack
   only contains api/ui/rtc/minio/db. Deploying them is lane E work
   (E3 prod / E5 dev env), not an ops fix.

When one of these is fixed, update this section in the same PR.

## 5. Redeploy (the normal change loop)

Code changed in git and you need the box to serve it:

```bash
# Portainer way (preferred): Portainer → Stacks → web10-staging →
#   "Pull and redeploy" / re-deploy with "Re-pull image and rebuild".
# SSH way:
ssh root@$VM_IP
cd /path/to/web10-clone && git pull          # find it: docker inspect or ls /root /opt /srv
docker compose -f ubuntu-deployment/docker-compose.staging.yml up -d --build
```

After ANY redeploy, verify (§3 C+D) and smoke-test the money path:
open `https://auth.staging.web10.app`, sign up a throwaway account,
log in. If you can't complete that, the deploy is NOT done.

## 6. Changing DNS (Cloudflare)

Use the token from `.env` (scope: DNS edit on the zone). Records for
public services: A record, name per §2, content = the box's PUBLIC
IP, **proxy status: DNS only**. For the future VPN-only dev env (E5):
same, but content = the box's INTERNAL LAN IP — that record is
intentionally useless off-VPN.

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
