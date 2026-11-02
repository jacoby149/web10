# Interoperability Demo

**Connected verification: passed on 2 November 2026.** The real social app writes
a profile; Snake and Marketplace reuse it through consent and the query boundary.
See [RESULTS.md](RESULTS.md) for measured evidence, failures, provenance and limits.

## Run

Use a fresh disposable Ubuntu host, never production or a shared development
stack. Provisioning is separate: install Git, Node 22+, npm, Docker Engine with
Compose 2.24.4+ (`!override` support), and authenticate GHCR pulls if required.
Map `api.localhost`, `auth.localhost`, `social.localhost`, `rtc.localhost`,
`marketing.localhost` and `sdk.localhost` to `127.0.0.1` on the host.

From the repository root:

```sh
npm ci --prefix e2e
node e2e/node_modules/playwright/cli.js install --with-deps chromium
WEB10_DISPOSABLE=interoperability-demo bash research/interoperability-demo/run.sh
```

The runner rejects unrelated running containers and remote Docker routing. It
uses only the `web10-interop` project, loopback-published ports, fresh storage,
schema-before-API startup, one worker, and zero retries. It collects results
before project-only teardown. It never provisions or destroys cloud hosts;
destroy the purchased host separately after collecting evidence.

No runner filters are accepted: success requires both browser viewports, the HTTP
correctness case and every expected screenshot. For diagnostic partial runs
against an already-started disposable stack, use Playwright directly:

```sh
node e2e/node_modules/playwright/cli.js test \
  --config research/interoperability-demo/playwright.config.ts --project=desktop
```

The normal E2E suite also discovers the browser scenario through
`e2e/tests/interop-demos.spec.ts`. Both runners use the E2E Playwright installation.

## Scenario

- Social popup login and consent, followed by a profile name/bio edit through
  the real social UI. No browser credential injection or preinstalled app grant.
- Snake popup consent, one real earned 10-point run, UI and API joins to the
  exact social-written profile, and a verified wall link.
- Browser-origin app-contract revocation: API 403 and a cleared leaderboard/error
  state on a fresh UI request.
- Marketplace popup consent after sign-out/revocation, a real listing publication,
  the same profile identity, exact API join, and URL-held detail reload.
- The existing `experiments/social/interop.mjs` runs against three real accounts:
  exact two-author score/profile and listing/profile joins, missing app permission,
  grant/revoke, and an independent private-profile membership grant/removal case.

The HTTP layer's app grants are API fixtures, not browser consent evidence.
Both clickable apps share `marketing.localhost`; they are not distinct browser
origins. HTTP cross-author checks use a separate `snake.localhost` Origin header.
Developer A/B are application roles, not independently recruited developers.

## Evidence

Each run writes `.context/interoperability-demo/run-<UTC>-<pid>/`: Playwright JSON
and log, exact source revision plus patch/overlay, source/config hashes, runtime
versions, image identities, cleanup status, and screenshots. Traces are disabled
because they can contain credentials; network requests outside localhost are
blocked in the synthetic browsers. Screenshots are mandatory, not best effort.

Desktop app viewport: 1440x1000. Mobile app viewport: 375x812. Authenticator
popups use their requested 480x720 window dimensions in both projects. Each
viewport has six complete flow captures and two direct identity-card captures.

Curated paper images live in [figures/](figures/); the final receipt archive lives
in [evidence/](evidence/). Full captures remain in the local evidence directory.
All pictured identities, scores and listings are synthetic.

Offline checks:

```sh
node --test research/interoperability-demo/marketplace.test.mjs
bash -n research/interoperability-demo/run.sh
node e2e/node_modules/playwright/cli.js test \
  --config research/interoperability-demo/playwright.config.ts --list
```
