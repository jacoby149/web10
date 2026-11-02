# Connected Interoperability Results

## Outcome

**Three of three cases passed, zero retries, zero skipped, in the final fresh-stack
run on 2 November 2026.** All 16 required screenshots were captured and inspected.
The runner finished with `exit=0 diagnostics=0 cleanup=0` at 03:04:23 UTC.

| Case | Evidence | Outcome |
|---|---|---|
| Desktop browser, 1440x1000 | Real social login/consent, UI profile edit, Snake consent/game/save/join, app revoke/API 403/UI denial, Marketplace consent/publish/join/detail reload | Passed, 19.9 s |
| Mobile browser, 375x812 | Same sequence, visible mobile social sign-in and actual Snake direction button | Passed, 22.6 s |
| Two-author HTTP correctness | Exact score/profile and listing/profile rows; absent profile app permission denied; grant enables joins; revoke denies; private-profile membership grant/removal changes join while scores remain readable; all three fixture contracts cleaned up | Passed, 17.7 s |

These are test execution durations, not application latency distributions.
The preceding fresh-stack run also passed all three cases before the final
direction-label and compact-capture refinements. Individual desktop, mobile and
HTTP diagnostic runs had passed as well; none is an independent performance trial.

## What Was Demonstrated

The browser uses one synthetic account per viewport. web10-social writes and edits
its profile to the distinct display name **Alex Morgan**. Snake stores a genuinely
earned 10-point score and Marketplace publishes a synthetic **Field recorder**
listing priced at **$79.00**. Both show that name, not the username fallback.
API assertions compare each joined profile body with the actual social-written
record, check authors and counts, and check the Marketplace detail URL's document
ID. No node, SDK or social-app source change was needed for the reuse.

The browser grants are approved in the authenticator popup, not installed by the
test. The Snake contract is revoked before the UI denial capture, then marketing
is signed out before Marketplace requests its service permission. Both hosted
apps share `http://marketing.localhost`; sequential grants do not demonstrate
distinct-origin browser isolation. Popup captures are 480x720, including in the
mobile project; the application pages are 375 pixels wide.

The separate HTTP case reuses the existing social evaluation's correctness
module. Creator and outsider profiles are produced by actual social popup login;
the reader is a different account. A `http://snake.localhost` Origin header and
API-installed contracts exercise that boundary. A separately labeled synthetic
private profile is used only for the membership control; it does not replace the
social-written profiles in the principal reuse demonstration.

## Failures and Repairs

1. Initial node setup returned HTTP 500: `group_contracts.tags` was absent. The
   inherited E2E startup launches the API before schema initialization. The new
   runner starts ClickHouse/MinIO, initializes schema, then starts the API so its
   existing boot migration can run against real tables. This is a runner-ordering
   workaround, not closure of the project-wide fresh-start/schema issue.
2. The inherited browser scenario injected a social credential and then waited
   for the signed-out login button. Replaced token injection/preinstalled app
   grants with the actual popup login and consent; use the visible mobile or
   desktop sign-in button and the true browser origin, not path-bearing strings.
3. Verification initially used the authenticator Origin for a profile read, where
   it lacked the social app's document grant. Use the consented social Origin.
   Query `body` values are already parsed objects; aliased profile bodies remain
   JSON strings. Assertions now respect the actual response contract.
4. Marketplace enabled publishing before its initial asynchronous read settled.
   A publication succeeded, but that read overwrote its success with an empty
   state. The form now remains disabled until the initial read settles. A focused
   Node/VM regression failed before the repair and passes afterward.
5. Screenshot inspection found clipped Snake direction labels. Reduced their
   horizontal padding inside the existing token/grid layout; browser assertions
   check that all four labels fit. Food placement is deterministic in the test;
   gameplay, score accumulation, saving and API responses are not mocked.
6. The HTTP fixture initially read a profile before social's asynchronous seed
   completed. Poll until the real authorized record is readable before closing
   that browser; do not substitute a directly seeded profile.

Failure logs are retained locally under `.context/interoperability-demo/` as
`interop-baseline*.log`, `interop-iteration-{1,2,3}.log` and `interop-http.log`.
The final archive contains the successful source snapshot and receipts, not a
claim that the development process was failure-free.

## Provenance

- Run: `20261102T030217Z-23217`, started 03:02:17 UTC.
- Base revision: `db897bccb9877b684eaaa8bd2189172617bce346` plus the retained
  `source.patch` and `source-overlay.tar.gz`. This was a dirty development snapshot,
  not an unmodified release. Runtime changes are limited to the Marketplace
  startup race and direction-button CSS; the remaining changes are test tooling.
- Tracked patch SHA-256:
  `6754ef7fc6fe2d61e25b1c868ead18b58f62b4215f79ae67194fec268d33581f`.
- Source overlay SHA-256:
  `f73d0c98b3d33b13f1ff5b5966f5eab8713a073f06574276252b380e753693e0`.
- DigitalOcean droplet `614938034`, sfo2, `s-4vcpu-8gb`: 4 vCPUs, 8 GB nominal
  RAM, 160 GiB disk; Ubuntu 24.04, Linux 6.8.0-147. Provider-listed hourly price
  was $0.07143, not a measured invoice or production cost result.
- Node 22.23.4, Playwright 1.63.0, Chrome for Testing 153.0.8010.12, Docker 29.1.3,
  Compose 2.40.3, ClickHouse 24.8.14.39. Images/config/source hashes are in the receipt.
- The E2E stack uses the development API/auth/social configurations and a built
  marketing frontend. It is not the production-build social performance harness.
- Original receipt: `.context/interoperability-demo/run-20261102T030217Z-23217/`;
  retained archive: `evidence/run-20261102T030217Z-23217.tar.gz`.
- Container/volume cleanup succeeded. Artifacts were copied locally before the
  droplet was deleted; the subsequent account list contained only the unrelated
  Davao droplet `614936287`. No shared/production host was used or modified.

## Scope

Additional verification: the Marketplace regression plus existing interoperability
offline controls pass (8 Node tests), the existing social orchestration suite
passes (24 Python tests), shell syntax and both Playwright discovery paths pass,
and a focused strict TypeScript check of the demo's TS files passes with the E2E
Node types. Tectonic builds the updated nine-page manuscript; font, BibTeX and
layout warnings remain, so this is not a publication-layout sign-off.

This closes the bounded connected interoperability demonstration: actual reuse,
consent, exact cross-author joins and named denial/recovery controls. It does not
establish independent-developer adoption, schema discovery, distinct-origin
browser isolation between Snake and Marketplace, media/avatar delivery, RTC,
federation, full social-feed evaluation, concurrent capacity, or a revocation
latency bound. The avatars shown are initial-letter fallbacks, not a media test.
