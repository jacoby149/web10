# AGENT-OPS.md — field manual for agents operating the box

You are an agent with SSH access to a LIVE machine serving real
domains. This file is written to be followed literally, step by step.
Do not improvise. If a step fails twice, STOP, write what happened in
`OPS-LOG.md` (§8), and report back to the operator — a wrong guess on
a live box costs more than a paused task.

Read `README.md` before your first session — it is the single
human-facing doc (URL map, environments, procedures, security
model). This file is its "what do I actually type" companion for
agents.

## 0. Prime directives

1. **Never** expose Portainer (:9000), the NPM admin (:81), or the
   Minio console (:9001) to the internet — no DNS record, no NPM
   proxy host, no port-forward. This is the load-bearing security
   rule of the whole deployment.
2. **Never** delete a Docker volume, run `docker system prune -a`,
   or wipe data unless the task explicitly says so AND
   `README.md` has a procedure for it. Prefer restart >
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
VM_PUBLIC_IP=...   # public IP (prod DNS target)
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

Remote tunnel pattern: `ssh -L 9000:localhost:9000 $SSH_USER@$VM_IP`,
then open `http://localhost:9000`.

## 2. Map of the box

- Everything runs as Docker containers on the shared external
  `proxy` network (created by `prep-vm.sh`).
- Everything web10 runs as **Portainer stacks** (so the whole map is
  visible in the Portainer UI from the VPN): the `edge` stack (NPM,
  from `docker-compose.edge.yml` — proxy mappings live in its
  `npm-data` volume, certs in `npm-letsencrypt`) plus TWO app
  stacks (`web10-dev`, `web10-prod`), both pasted from the ONE
  canonical compose, `docker-compose.ecosystem.yml`, differing only
  in their stack env vars (`env.dev.example` / `env.prod.example`
  document them). Build contexts are `../api`, `../ui`,
  `../api/rtc`, `../marketing/*` — the repo clone on the box
  (`/opt/web10`) is a deploy artifact, never a place to develop.
- NPM terminates TLS on 80/443 and forwards over the `proxy` network
  BY STACK-PREFIXED ALIAS (`web10-dev-api`), never by bare service
  name — with several stacks on one network, a bare `api` resolves
  ambiguously across environments and routes traffic cross-env.
- REALITY CHECK before assuming the above: as of 19.07.2026 the live
  box runs the pre-runbook LEGACY deployment — a root-managed Caddy
  edge + a bare-name staging stack on `*.staging` vhosts. Staging
  as an environment was CUT (D24-lite, 19.07.2026: dev + prod only);
  the legacy stack gets decommissioned during migration — §4.

Domain map (zone `web10.app`; dev DNS points at the LAN IP and only
works on VPN; prod on public real names — full table in README.md):

| Public URL (dev / prod) | NPM forwards to | What |
|---|---|---|
| `dev.web10.app` / `api.web10.app` | `web10-{env}-api:80` | FastAPI node |
| `auth.dev.web10.app` / `auth.web10.app` | `web10-{env}-ui:80` | node admin/consent UI |
| `rtc.dev.web10.app` / `rtc.web10.app` | `web10-{env}-rtc:80` | signaling |
| `minio.dev.web10.app` / `minio.web10.app` | `web10-{env}-minio:9000` | S3 API (media) — never :9001 |
| `social.dev.web10.app` / `social.web10.app` | `web10-{env}-social:80` | web10-social |
| `www.dev.web10.app` / `www.web10.app`+apex | `web10-{env}-marketing-ui:80` | marketing site |
| `marketing-api.dev.web10.app` / `marketing-api.web10.app` | `web10-{env}-marketing-api:80` | importer/analytics API |

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

# D. is it reachable FROM OUTSIDE? (dev vhosts only answer on VPN)
curl -sS -o /dev/null -w '%{http_code}\n' https://api.web10.app/docs
curl -sS -o /dev/null -w '%{http_code}\n' https://dev.web10.app/docs

# E. does DNS even exist? (run from YOUR machine, not the box)
dig +short auth.dev.web10.app
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

## 4. KNOWN ISSUES + THE MIGRATION — state as of 19.07.2026

Read this before re-diagnosing; these are already understood:

1. **Frontend bundles hardcode their backend origins.** The auth UI
   (`ui/src/interfaces/authAdapter.ts`, `ui/src/config.ts`) bakes
   `https://api.web10.app` / `https://auth.web10.app` into any
   production build; web10-social's adapter does the same. That
   makes the UI unusable in ANY env whose API isn't literally at
   those URLs (this is why the legacy staging auth UI is dead, and
   why the DEV env's UI will be broken until fixed).
   **The fix is app code (lane B / B5 for ui, lane D / D14 for
   social):** read origins from build-time env + Dockerfile `ARG`s.
   The compose side is DONE — `docker-compose.ecosystem.yml`
   already passes `VITE_API_ORIGIN`, `VITE_AUTH_ORIGIN`,
   `VITE_RTC_HOST`, `REACT_APP_DEFAULT_API` build args (harmless
   warnings until the Dockerfiles declare them). An ops agent
   CANNOT fix this on the box — do not try; rebuilding the same
   code reproduces the same bundle. After those lanes merge:
   redeploy both stacks with rebuild.
2. **The live box runs the LEGACY deployment, due for teardown.**
   What's there today: a root-managed **Caddy** container holding
   80/443 (config `/opt/caddy/Caddyfile` — WORLD-READABLE with a
   live CF API token; operator must `chmod 600` + ROTATE it,
   consider it burned) proxying BARE names to the old bare-name
   staging stack on `*.staging.web10.app`. Staging as an
   environment was CUT — do not repair it, replace it. MIGRATION
   (one change at a time, §0.5; staging downtime is fine — it's
   being deleted):
   a. Stop + disable the legacy Caddy container (frees 80/443).
   b. Deploy the `edge` stack (`docker-compose.edge.yml`), create
      the NPM admin account, add the Cloudflare DNS-01 provider.
   c. Create the `*.dev` DNS records (LAN IP!) and the prod records
      (public IP — see README.md, mind the cutover caution there).
   d. Deploy `web10-dev` then `web10-prod` from
      `docker-compose.ecosystem.yml` + their env files; add the NPM
      proxy hosts per §2 (stack-prefixed aliases; DNS challenge for
      dev certs).
   e. Verify §3 C+D per env; smoke test per README.md.
   f. Decommission the leftovers: remove the legacy staging stack +
      its volumes (this one IS an authorized volume delete), delete
      the four `*.staging` DNS records, remove the Caddy container
      + `/opt/caddy` (operator does the root-owned parts).
   g. Log every step in OPS-LOG.md.
3. **CORS**: each stack's `CORS_SERVICE_MANAGERS` env must list every
   browser origin for that env (bare hostnames, comma-separated) —
   the env example files already contain the right values; don't
   trim them.

When one of these is fixed, update this section in the same PR.

## 5. Redeploy (the normal change loop)

Code changed in git and you need the box to serve it:

```bash
# Portainer way (preferred): Portainer → Stacks → web10-{env} →
#   "Pull and redeploy" / re-deploy with "Re-pull image and rebuild".
# SSH way:
ssh $SSH_USER@$VM_IP
cd /opt/web10 && git pull
docker compose -p web10-{env} --env-file env.{env} \
  -f ubuntu-deployment/docker-compose.ecosystem.yml up -d --build
```

After ANY redeploy, verify (§3 C+D) and smoke-test the money path:
open `https://auth.dev.web10.app` (or `auth.web10.app` for prod),
sign up a throwaway account, log in. If you can't complete that,
the deploy is NOT done.

## 6. Changing DNS (Cloudflare)

Use the token from `.env` (scope: DNS edit on the zone). Records for
prod: A record, name per §2, content = the box's PUBLIC IP
(`VM_PUBLIC_IP` in `.env`), **proxy status: DNS only**. For the
VPN-only dev env: same service names on `*.dev`, but content = the
box's INTERNAL LAN IP (`VM_IP`) — those records are intentionally
useless off-VPN, and their TLS certs must use the DNS-01 challenge
(see README.md).

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
