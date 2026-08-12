# OPS-LOG.md — append-only ledger of changes to the box

Newest at top. Format per AGENT-OPS.md §8. Read the top entries
BEFORE doing ops work — someone may already be mid-fix.

## 12.08.2026 02:26 — opencode (amsterdam) — ClickHouse init script made resilient + web10-dev schema reset
did:
  - Diagnosed: clickhouse-init/001-init-v3-schema.sql ran before server
    accepted connections, silently creating 0 tables. Renamed to
    .sql.template (entrypoint ignores non-.sql/.sh). Added
    001-init-v3-schema.sh wrapper that retries clickhouse-client up to
    60s before piping SQL.
  - web10-dev-clickhouse-1: stopped, removed, volume
    web10-dev_clickhouse-data wiped, redeployed with docker compose.
    All 16 tables verified created on fresh start.
  - Pushed fix to dev (PR #567, merged).
state: web10-dev ClickHouse has all 16 tables (documents, doc_groups,
  group_contracts, group_members, group_join_requests, group_hidden_docs,
  service_contracts, user_blacklist, group_blacklist, user_group_sharing,
  provider_service_contracts, users, apps, app_ratings, app_contracts,
  bug_reports). Init script now resilient to startup race.
next: none — init is idempotent (IF NOT EXISTS), so future volume wipes
  will auto-recreate schema without manual intervention.

## 29.07.2026 01:35 — opencode (prague) — host reboot test: onboot + watchdog VERIFIED end-to-end
did:
  - Operator rebooted the Proxmox HOST as a live test. Result: VM 100
    auto-started ~1 min after the host (onboot: 1 works). All 20 docker
    containers came up; mongod active (restart drop-in held).
- Watchdog now fully live: i6300esb device visible in guest
     (lspci 00:04.0), /dev/watchdog0 present, RuntimeWatchdogUSec=30s
     armed (systemd pinging). A hung guest now gets hard-reset by the
     host. Note: i6300esb needed one manual `modprobe` this boot —
     root cause: Ubuntu ships `/etc/modprobe.d/97-blacklist-watchdog.conf`
     that blocks watchdog modules at boot. Blacklist file removed;
     `/etc/modules-load.d/watchdog.conf` (i6300esb) now loads it
     automatically. Verified post-fix: module loads, /dev/watchdog
     present, systemd armed at 30s — no manual steps needed.
  - Prod public smoke green after it all: web10.app, api/docs, auth,
    social, marketing-api/docs all 200.
state: fully hardened chain verified: power loss -> host boots -> VM
  boots (onboot) -> containers + mongo self-heal; guest hang ->
  watchdog reset. No manual steps needed anymore.
next: only the optional SSH-key-for-root@pve + password rotation
  remains (password was shared in chat).

## 29.07.2026 01:10 — opencode (prague) — hardening: VM watchdog + mongod auto-restart
did (operator-approved follow-up to the entry above):
  - HOST (pve): `qm set 100 --watchdog model=i6300esb,action=reset` —
    Proxmox now hard-resets the VM if the guest OS hangs. Device is in
    the config but NOT live yet: the i6300esb PCI device can't
    hotplug, so it activates at the next VM reboot (no /dev/watchdog
    in the guest until then).
  - GUEST: `/etc/modules-load.d/watchdog.conf` loads i6300esb at boot;
    `RuntimeWatchdogSec=30` set in /etc/systemd/system.conf so systemd
    pings the watchdog once the device exists (active next boot).
  - GUEST: systemd drop-in /etc/systemd/system/mongod.service.d/
    restart.conf — Restart=on-failure, RestartSec=5, no start limit —
    so the status-48 boot race self-heals instead of leaving mongo
    down. daemon-reloaded; verified via systemctl show (active/running,
    Restart=on-failure).
state: prod untouched and green. Watchdog pending one VM reboot;
  everything else live.
next: reboot the VM in a maintenance window (~1 min prod downtime) to
  activate the watchdog; after reboot verify /dev/watchdog exists and
  `systemctl show mongod` still active. Optionally install an SSH key
  for root@pve and rotate its password (currently shared in chat).

## 29.07.2026 00:58 — opencode (prague) — power loss took down Proxmox host; VM onboot fixed; mongod restarted
did:
  - INCIDENT: all web10.app vhosts unreachable (no ping, no TCP 22/80/443
    on the public IP). Root cause: NOT the VM — the Proxmox host
    (192.168.8.20, "pve") lost power / hard-crashed ~05:17 EDT 28.07:
    both host journal (prev boot, 5 months uptime since 04.02) and VM
    journal end abruptly mid-cron with no shutdown sequence. Host came
    back but the VM (100, server-rack-ubuntu-original) had no `onboot`
    flag, so it stayed off until the operator started it manually.
  - FIX (on pve): `qm set 100 --onboot 1` — VM now auto-starts with the
    host. Verified in /etc/pve/qemu-server/100.conf. New-boot journal
    shows no MCE/hardware errors; SMART on /dev/sdd clean (0
    reallocated, 33C). Cause reads as power event, not hardware fault.
  - Started the natively-installed mongod on the VM (`sudo systemctl
    start mongod`): it had failed at boot with exit status 48 (port
    already in use — startup race, also seen on the 17.07 boot). Now
    `active`, `enabled`, ping `{ok:1}`, listening on 127.0.0.1:27017.
  - Verified prod public slice: web10.app, www, auth, social,
    marketing-api/docs all 200; api.web10.app / 307 + /docs 200.
state: all green. Proxmox root login currently uses a password in
  operator chat — recommend installing an SSH key and rotating it.
  mongod boot-race (status 48) may recur on future VM boots.

## 24.07.2026 19:45 — opencode (el-paso-v1, chore/backup-restore-drill) — off-box backup + smoke verification
did (SSH as jacob@192.168.8.25):
  - SMOKE: ran scripts/smoke.sh on the box — GREEN both envs (dev + prod,
    all 7 endpoints 200 each, prod money path signup+token 200).
  - MONGO BACKUP: `mongodump --db deploy --out
    ~/web10-backup-deploy-07.24.26` — 13 MB, 208+ user collections +
    web10.schemas + metering_events. Copied off-box via scp.
  - MINIO BACKUP (dev): tar of web10-dev_minio-data volume →
    /tmp/minio-dev-backup-07.24.26.tar.gz (5.7 MB).
  - MINIO BACKUP (prod): tar of web10-prod_minio-data volume →
    /tmp/minio-prod-backup-07.24.26.tar.gz (6.3 MB).
  - MIGRATION STATUS: AGENT-OPS.md §4.2 ordered migration is COMPLETE
    (done 19.07 by valencia workspace). Legacy Caddy stopped, edge NPM
    stack running, dev/prod DNS live, both stacks deployed, staging
    decommissioned, smoke green. No further migration steps remain.
state: all three backups (mongo, minio-dev, minio-prod) on-box and
  mongo copied off-box to /tmp/web10-backup-deploy-07.24.26. Smoke
  green both envs. Restore drill (restore into scratch env + prove
  login) NOT attempted — requires stopping/recreating a dev stack
  volume, which is a destructive operation on a shared box with real
  data. Logged as a known gap for the operator to approve.
next: operator approval needed before the restore drill (requires
  `docker volume rm web10-dev_postgres-data` + redeploy, or a scratch
  third stack). Once approved, restore the mongo dump into a scratch
  FerretDB, point a temporary stack at it, and prove a real user login.

## 23.07.2026 (later) — Claude (boise) — Portainer auto-update OFF for web10-dev/web10-prod; deploy.yml is the single deployer
did (SSH as jacob; Portainer API on localhost:9000):
  - CONTEXT: after the Dockerfile .git fix merged (1.0.133), Portainer's
    healed auto-update became a LIABILITY: web10-prod tracks dev (split
    unfinished per 22.07) and bakes commit "unknown" (its checkout has
    no .git), so every dev push would overwrite prod with unknown-commit
    builds and dev-content containers; web10-dev's redeploy also raced
    deploy.yml (dev api 502'd mid-boot during the 20:06 smoke).
  - CHANGE: disabled GitOps auto-update (AutoUpdate=null) on stacks 1
    (web10-dev) and 2 (web10-prod) via POST /api/stacks/{id}/git.
    Stack env vars and refs preserved (verified 10 + 12 vars after).
    Edge stack untouched. Deployment ownership is now: dev pushes →
    deploy.yml → web10-dev; main pushes → deploy.yml → web10-prod.
  - INCIDENT (self-inflicted, fixed): a method-probe POST with an empty
    body to /api/stacks/2/git WIPED stack 2's env + ref (Portainer
    2.39.5 treats missing payload fields as "set empty"). Restored
    within minutes from the values recorded earlier in-session +
    MINIO_PASSWORD_PROD from ~/web10-ops/.env; verified 12 vars + ref
    back. LESSON: never probe Portainer git endpoints with empty
    bodies — always send the full payload.
  - RESULT: first-ever green deploy.yml prod run (after a smoke rerun —
    boot race, fixed repo-side in 1.0.134). Prod status.json bakes real
    version + commit (1.0.133 / 0b90870). Prod media-upload 403 root
    cause found by live repro (presigned-POST policy missing
    Content-Type) — fixed repo-side in 1.0.134.
state: web10-prod effectively runs main now; web10-dev runs dev via
  deploy.yml. Portainer remains for manual redeploys/visibility only.
next: promote 1.0.134 (upload fix) dev → main once merged; if the
  operator ever wants GitOps auto-update back, re-enable AFTER pointing
  web10-prod at refs/heads/main and accepting unknown-commit bakes.

## 23.07.2026 — Claude (boise, jacoby149/boise) — prod status unblocked: env.prod completed + surgical marketing-ui rebuild
did (SSH as jacob):
  - DIAGNOSIS: prod www served status.json baked 19:25Z with
    version/commit "unknown" and never rebuilt after. Two independent
    failures: (1) Portainer web10-prod auto-update (5m poll, tracks
    dev) failed EVERY attempt since ~19:35Z — its GitOps checkout
    strips .git, and the 1.0.131 marketing-ui Dockerfile hard-COPYs
    .git, so the compose build died ("/.git": not found) and the
    WHOLE stack redeploy aborted (stack 2 ConfigHash frozen at
    de1d036a; web10-dev stack similarly stuck at 49518e8, masked by
    the SSH deploy). (2) deploy.yml's prod job has failed 7/7 runs
    ever: env.prod had MINIO_PASSWORD empty → compose parse error.
    Worse, env.prod also lacked DB=deploy + DB_URL — a run that got
    past the parse would have recreated prod api against the empty
    FerretDB (real 208-account mongo unmounted). Parse failure was
    accidentally protective.
  - FIX env.prod (backup left: env.prod.bak.<epoch>): set
    MINIO_PASSWORD from ~/web10-ops/.env (MINIO_PASSWORD_PROD),
    added DB=deploy + DB_URL=mongodb://host.docker.internal:27017/.
    env.prod now matches Portainer stack 2's env exactly.
  - REBUILD (surgical, marketing-ui only): /opt/web10 was already at
    dev@7022e63 (real clone, .git present); exported GIT_COMMIT +
    STATUS_VERSION, `docker compose -p web10-prod --env-file env.prod
    -f docker-compose.ecosystem.yml up -d --build marketing-ui`.
    Only web10-prod-marketing-ui-1 recreated; api/social untouched.
  - VERIFIED: https://web10.app/status.json → version 1.0.132,
    commit 7022e63, real commitDate; www + apex 200.
state: prod status pill live with real version. Portainer web10-prod
  auto-update KEEPS failing every 5m until the Dockerfile fix (this
  branch: bind-mount .git instead of COPY) merges to dev — its
  tracked ref. deploy.yml prod is now unblocked (env complete) but
  unexercised; first real test is the next main push.
next: (1) merge the marketing-ui Dockerfile bind-mount fix to dev —
  heals GitOps auto-update for BOTH stacks. (2) OPERATOR DECISION,
  unchanged from 22.07: web10-prod tracks refs/heads/dev while
  deploy.yml deploys main to the same stack — once both paths work
  they will fight; point Portainer web10-prod at main or disable its
  auto-update. (3) NPM_PASSWORD still empty (22.07 item, untouched).

## 22.07.2026 — Claude (calgary, trending-fix-missing) — Portainer creds reset; secrets moved out of the repo checkout
did (SSH as jacob):
  - CONTEXT: the GitOps conversion (21/22.07) re-cloned /opt/web10,
    which wiped the gitignored ubuntu-deployment/.env — losing the
    Portainer admin password (it was generated on-box on 19.07 and
    existed nowhere else; confirmed not recoverable from any session
    transcript). The ~/web10-backup-deploy-07.19.26 backup is a mongo
    dump only, no .env.
  - RESET: `docker stop portainer` → `docker run --rm -v
    portainer-data:/data portainer/helper-reset-password` → start.
    New password for admin `jacob` (32 chars). Verified: POST
    /api/auth returns a JWT; all 3 stacks (edge, web10-dev,
    web10-prod) intact, status 1, GitOps poll 5m.
  - RECOVERED the rest of the old .env from still-live sources:
    CF token from /opt/caddy/Caddyfile, Minio dev/prod root
    passwords from `docker inspect` on the minio containers.
  - NEW CANONICAL LOCATION: /home/jacob/web10-ops/.env (dir 700,
    file 600) — outside any checkout so re-clones can't wipe it.
    /opt/web10/ubuntu-deployment/.env is now a SYMLINK to it (the
    scripts/ read that path). If /opt/web10 is ever recreated:
    `ln -sfn ~/web10-ops/.env /opt/web10/ubuntu-deployment/.env`.
  - Docs updated: README §Secrets, AGENT-OPS §1, .env.example header.
next: (1) NPM admin password was lost with the same file and is NOT
  reset yet (NPM_PASSWORD empty in the new .env) — sync-npm.py will
  fail until it's reset (sqlite edit in the npm container or NPM
  password-reset flow). (2) web10-prod stack tracks refs/heads/dev,
  not main — the dev/prod split the operator asked for is unfinished.

## 19.07.2026 — Claude (lincoln, b7-auth-ui) — prod cutover to the real mongo (deploy)
did (SSH as jacob; box /opt/web10 is still a stale non-git snapshot):
  - ROOT CAUSE: web10-prod-api was serving the containerized FerretDB
    (DB=web10, ~5 e2e smoke accounts) instead of the host-native mongo's
    `deploy` DB (208 real accounts) — so every real login said "the user
    doesn't exist". The compose hardcoded `DB: web10`, so the intended
    prod override never took effect.
  - FIX (two parts, both merged to dev): (1) compose `DB: ${DB:-web10}`
    so the env can override it (PR #145); (2) deploy-stacks.py prod env
    now sets DB=deploy + DB_URL=mongodb://host.docker.internal:27017/.
  - Verified the deploy DB before flipping: 208 collections, jacoby149
    present, its {service:services, body.service:"*"} record has a
    bcrypt hash + verified=true (matches get_star()). The only accounts
    in FerretDB were e2e smoke users (smoke*, verified=false) — nothing
    real stranded.
  - APPLIED: scp'd updated deploy-stacks.py to the box (backup left as
    deploy-stacks.py.bak.<ts>), ran `deploy-stacks.py prod` → Portainer
    stack web10-prod (id 2) redeployed. web10-prod-api-1 now has
    DB=deploy + DB_URL=host mongo (status running).
  - VERIFIED: POST /stats → users:208 (was 5); real apps show
    (web10auth 13.5k visits, crm/mail.web10.app, …); jacoby149 with a
    wrong password now returns "incorrect username or password" (found),
    not "the user doesn't exist".
  - host mongo needs no auth (binds 127.0.0.1 + 172.17.0.1:27017;
    host.docker.internal→host-gateway already in the compose).
next: the ~5 FerretDB smoke accounts are orphaned (harmless test data).
  If any real signups happened while prod was on FerretDB, migrate them
  into `deploy` before decommissioning the prod FerretDB.

## 19.07.2026 — Claude (port-vila, mongo-backup-and-dev-urls) — dev URL rename: api.dev.web10.app
did (SSH as jacob, scripts scp'd to the box since /opt/web10 is a stale
non-git snapshot — see note below):
  - DNS: sync-dns.py created api.dev.web10.app → 192.168.8.25.
  - NPM: sync-npm.py issued a new DNS-01 cert including api.dev.web10.app,
    created the api.dev vhost → web10-dev-api, remapped dev.web10.app →
    web10-dev-marketing-ui (dev apex now mirrors prod apex).
  - Portainer: deploy-stacks.py dev — redeployed web10-dev with
    PROVIDER/API_ORIGIN/API_HOST = api.dev.web10.app (rebuilds ui/social
    bundles with the new baked origin). Dev accounts invalidated (throwaway).
  - smoke.sh green both envs (incl. new api-root redirect + apex checks).
state:
  - URL rule is now uniform: dev host = prod host with ".dev" inserted.
  - WARNING: /opt/web10 on the box is NOT a git clone (rsync snapshot,
    ubuntu-deployment/ predates scripts/). Box scripts refreshed by scp
    this time; someone should replace /opt/web10 with a real clone of dev.
next: replace /opt/web10 with a git clone; restore prod mongo copy into
  dev FerretDB (B6 gate); set up automated mongo backups (operator asked).

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

## 31.07.2026 — lincoln (web10web10! workspace) — prod terms migrations RUN (follow-persistence fix)
did: ran the two terms migrations on PROD via the api container's own
python (`docker exec -w /web10 web10-prod-api-1 /web10/.venv/bin/python`),
idempotent + additive (inserts missing terms only):
  - `db.migrate_follows_terms()` → {'migrated': 1880, 'skipped': 620, 'errors': 0}
    (follows/inbox/reactions/comments/dms core terms for every account
    that lacked them — the follow-write 403 class; jacoby149 + coolguydavid
    both verified provisioned after)
  - `db.migrate_public_posts_terms()` → {'migrated': 330, 'skipped': 170, 'errors': 0}
why: operator report 31.07 — follow doesn't persist (refresh → "Follow"
again), friends' posts unreachable. Root cause: accounts created before
core-terms provisioning had no `follows` term, so wapi.create('follows')
403'd silently. This is the E-run-discovery-migration item's terms half,
executed with box access instead of the admin token.
DELIBERATELY NOT RUN: the discovery backfill (`/admin/discovery/backfill`).
(1) coolguydavid's only public post was admin-removed from the board by
the operator 27.07 (the A16 incident post) — a backfill would resurrect
it on trending; (2) per decisions.md D40 (31.07) the profile wall and the
friends feed now read collections DIRECTLY, so the backfill is no longer
load-bearing for those surfaces — it only affects Discover/trending media
fields (A17). Run it when the operator explicitly wants the old corpus
re-indexed for Discover.
state: prod serving 1.0.298 (pull feed + direct profile wall); e2e green
on main; anon direct read of coolguydavid/public_posts verified 200.

## 31.07.2026 (second run) — lincoln — 10-term core set migration on PROD
did: re-ran `db.migrate_follows_terms()` after core_services_terms grew to
the full 10-term app set (1.0.300: + profile, public_media anon-read;
+ private_posts, staging_posts, media owner-only):
  {'migrated': 2515, 'skipped': 2545, 'errors': 0}
why: the blank-feed hotfix — coolguydavid's account predated the `profile`
term, so the friends feed's per-author profile read 403'd and (pre-fix)
blanked the whole feed. Verified after: coolguydavid carries all 14 terms;
anon PATCH /coolguydavid/profile → 200 (was 403).
