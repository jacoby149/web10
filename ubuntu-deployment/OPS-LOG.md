# OPS-LOG.md — append-only ledger of changes to the staging box

Newest at top. Format per AGENT-OPS.md §8. Read the top entries
BEFORE doing ops work — someone may already be mid-fix.

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
