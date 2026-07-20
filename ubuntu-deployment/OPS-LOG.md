# OPS-LOG.md — append-only ledger of changes to the box

Newest at top. Format per AGENT-OPS.md §8. Read the top entries
BEFORE doing ops work — someone may already be mid-fix.

## 19.07.2026 — opencode (albany, jacoby149/connect-to-prod-mongo) — A7: mongo recon + backup
did (SSH as jacob@192.168.8.25, no sudo needed):
  - Confirmed real web10 data lives in MongoDB database `deploy` (not `web10`).
  - 206 user collections, 60 registered apps, 45 phone numbers, ~2536 total docs.
  - All records follow {service, body} shape — no drift. Star records at
    {service: "services", body: {service: "*", ...}} — matches code's q_t().
  - Mongo binds 127.0.0.1,172.17.0.1:27017 — containers on Docker bridge can reach it.
  - host.docker.internal:host-gateway verified working from a container on the proxy network.
  - Backup: `mongodump --db deploy --out ~/web10-backup-deploy-07.19.26` (11MB, 208 collections).
state:
  - Compose wired (extra_hosts + optional DB_URL fallback). env.prod.example documents
    DB_URL + DB=deploy override. Audit script at api/tools/audit_mongo.py defaults to deploy.
  - Gate: prod must NOT switch until a dev login works against a COPY.
next: B6 (auth revamp) needs a copy restored into dev's FerretDB for testing.

## 19.07.2026 (night) — Claude (valencia, d14-social-origins) — FULL MIGRATION: box is live
did (all via scripts, SSH as jacob, docker group granted by operator):
  - Portainer: initialized admin `jacob` (X-Setup-Token from logs),
    created the `local` docker endpoint. Creds saved to .env.
  - Wrote /opt/web10/ubuntu-deployment/.env (chmod 600) with CF token
    (lifted from the old Caddyfile), Portainer/NPM/Minio creds,
    VM_IP/VM_PUBLIC_IP (184.174.17.178)/SSH_USER. Gitignored.
  - Cloudflare DNS: created 7 *.dev records → 192.168.8.25 (LAN),
    7 prod records + apex → 184.174.17.178; converted api/auth/rtc/
    www/apex from proxied→DNS-only and recreated the apex as A
    (kept MX/TXT). Later pruned the 4 *.staging records.
  - Deployed 3 Portainer git-backed stacks (branch dev, 5-min GitOps
    poll): edge (NPM), web10-dev, web10-prod. Stopped+removed the
    legacy Caddy container and the old `ubuntu-deployment` staging
    stack + its 2 volumes.
  - NPM: created admin user (default admin@example.com was NOT
    seeded in this version — created jacob@web10.app instead), one
    Cloudflare DNS-01 LE cert covering all 15 vhosts (expires
    2026-10-17), 15 proxy hosts forwarding by stack-prefixed alias,
    SSL forced + HTTP/2 + HSTS.
state:
  - GREEN prod (public HTTPS 200): api/docs, auth, social, www, apex,
    marketing-api. Money path verified: signup 200 → POST /web10token
    200 (JWT). Login route is /web10token, NOT /login (docs fixed).
  - GREEN dev (HTTPS 200 from the box; VPN-only by DNS): api/docs,
    auth, social, www. Origin fix verified — dev auth bundle calls
    dev.web10.app, not prod.
  - Codified the whole thing in ubuntu-deployment/scripts/ (sync-dns,
    deploy-stacks, sync-npm, smoke, lib) so it's repeatable + in the
    repo. NOTE: these scripts landed in a PR AFTER the box was
    already built by hand — the box and repo now match, but the box's
    /opt/web10 clone must `git pull` once that PR merges to have them.
next: operator should rotate the CF token (it sat world-readable in
  the old Caddyfile). Run scripts/smoke.sh after any redeploy. C6
  e2e bug-hunt can now run against dev.

## 19.07.2026 (late) — Claude (valencia, e5-e3-ecosystem-envs) — decision log, no box changes
did: nothing on the box. logging two operator decisions that change
  the standing plan: (1) STAGING IS CUT — two envs only (dev
  VPN-only + prod public); do NOT repair or repaste the legacy
  *.staging stack, it gets decommissioned. (2) the edge is
  NPM-as-a-Portainer-stack (docker-compose.edge.yml), replacing the
  root-managed Caddy found holding 80/443 (whose world-readable
  Caddyfile embeds a live CF token — operator to chmod 600 +
  rotate).
state: unchanged from the entry below, plus: box SSH confirmed as
  the operator's user on all-spark; docker group membership still
  missing (blocks all stack work).
next: the full ordered migration is AGENT-OPS.md §4.2 (stop caddy →
  edge stack → DNS → web10-dev/web10-prod → smoke → decommission
  staging leftovers). prerequisites: operator merges the infra PR,
  adds the ssh user to the docker group, rotates the CF token.

## 19.07.2026 (evening) — Claude (valencia, e5-e3-ecosystem-envs) — remote verify + repo-side E3/E5, no box changes
did: re-probed from outside (no SSH); landed the repo side of E3/E5:
  docker-compose.ecosystem.yml (ONE parameterized compose for
  staging/dev/prod, whole ecosystem incl. social + marketing,
  stack-prefixed aliases so multiple stacks can share the proxy
  network), env.{staging,dev,prod}.example, web10-social prod
  Dockerfile, marketing-ui Dockerfile build args, runbook/ops-manual
  updates. docker-compose.staging.yml + docker-compose.marketing.yml
  DELETED (superseded).
state:
  - GREEN (new since last entry): rtc.staging.web10.app 200,
    minio.staging.web10.app 403 (normal unauthenticated S3) — the
    missing DNS records were added by someone who didn't log it here.
  - RED (unchanged): auth UI still serves a bundle hardcoding
    api.web10.app/auth.web10.app (checked the live JS) — waiting on
    lane B's B5 origins fix; social/www/marketing-api.staging still
    NXDOMAIN (not deployed).
next: box execution per AGENT-OPS.md §4.4 — repaste web10-staging
  from the ecosystem compose (full env set), create web10-dev
  (VPN-only, DNS→LAN IP, DNS-01 certs) + web10-prod stacks, NPM
  proxy hosts + DNS records, then smoke test each env. UI/social
  bundles stay mis-originated until B5/D12 merge — rebuild after.

## 19.07.2026 — Claude (valencia, planning branch) — remote triage only, no box changes
did: probed the fresh deploy from outside (no SSH used).
state:
  - GREEN: api up at https://staging.web10.app (/docs 200, openapi
    serves); ui serves at https://auth.staging.web10.app (200).
  - RED: auth UI is broken by construction — bundle hardcodes
    https://api.web10.app / auth.web10.app (ui/src/interfaces/
    authAdapter.ts, ui/src/config.ts); needs the lane-B env-
    parameterization fix (AGENT-OPS.md §4.1). NOT fixable on box.
  - RED: DNS missing for rtc.staging + minio.staging (NXDOMAIN) —
    media/rtc will fail even after the UI fix (§4.2).
  - UNKNOWN: CORS_SERVICE_MANAGERS on the api — verify it includes
    https://auth.staging.web10.app when the UI fix lands (§4.3).
  - NOT DEPLOYED: marketing-ui, marketing-api, web10-social (not in
    the staging stack yet — lane E3/E5 work).
next: (1) lane B lands the UI origin env fix + staging compose build
args, (2) ops agent adds rtc/minio DNS records per §6, (3) redeploy
+ smoke test per §5.
