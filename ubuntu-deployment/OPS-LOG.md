# OPS-LOG.md — append-only ledger of changes to the staging box

Newest at top. Format per AGENT-OPS.md §8. Read the top entries
BEFORE doing ops work — someone may already be mid-fix.

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
