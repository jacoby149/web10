# Manifest Destination Replay

01.11.2026; source pin `0d2a5d3fcc8ca2f2e87330b387ef65cbfca3b20f`.
Author and separate reviewer contexts: `openrouter/openai/gpt-6.1-sol`.
**L1-A-02 remains OPEN.** This bounded follow-up adds evidence, not a fix,
whole-file rescan, L2 advancement or model-diverse sign-off.

Later local [source repair](repair-a02-manifest.md) supersedes the vulnerable
working-tree behavior described below. The retained replay now loads this
historical Git pin and keeps four destination/path controls; current pytest
retains the size/fallback controls and denied-green regressions.

## Intent And Scope

The node fetches app manifests for the public store without requiring browser
CORS. App paths and trailing-slash equivalence are intentional (app-store
overview, lines 140-161). AppStore.tsx and AppDetail.tsx still call this proxy.
The S1 extraction contract requires approved registration, unambiguous URLs,
public literal/all DNS answers, numeric connection pinning, Host/TLS verification,
no redirects, timeout and decoded-size cap. Registration alone is insufficient.

Read `api/app/endpoints/system.py:270-307`; execute the actual current
`pwa_listing` AST body without decorators or application startup. Requests uses
real HTTP to an ephemeral threaded loopback fixture, with environment proxy/netrc
configuration disabled. No credentials, real data, external hosts or database.
Only exception namespace/logger are substituted. This does not exercise FastAPI
routing, middleware, deployment egress or the production process's network view.
The replay reads the working source, not a frozen Git blob; the pin above records
the source used for this run. Future changes can invalidate its acceptance claims.

Orientation: existing L1-A-02 was fake-GET evidence; no fix is recorded in the
plan/lane/changelog. Recession check confirms no destination gate was added.
The obvious gap is automatic redirect handling, which a starting-host check
alone would not cover. D41 node readability does not authorize caller-selected
internal services. Availability remains separate from C+I findings.

## Execution

```sh
python3 -B knowledge-base/security/scans/2026-10/repro_manifest_destination.py
```

Result: exit 0, **eight controls passed**:

- Direct caller-selected loopback URL returns fixture-only internal JSON.
- A 302 follows to the fixture's internal path and returns that JSON; exact
  initial/final request paths asserted.
- App paths with and without trailing slash return the synthetic app name.
- Valid JSON at exactly 262,144 bytes is accepted.
- Invalid JSON, valid JSON at 262,145 bytes and HTTP 404 raise NO_PWA.

Passing here means the current vulnerable behavior is reproduced. It is not a
denied-green repair gate. The size controls are compatibility/reliability evidence,
not extra C+I findings. No production sensitive-data disclosure is established.

## Review And Next Gate

Separate same-model review ran the replay and found that oversized non-JSON
would not isolate the cap. Replaced it with valid oversized JSON and added exact
boundary acceptance. Reviewer reran all eight controls with no residual findings.

DESIGN-INTENT REVIEW: intent is public store identity proxying; delta is evidence
only; no by-design feature changes; unrestricted internal destinations are not an
accepted conventional deviation; approved/public HTTPS, DNS/IPv6/rebinding,
connection pinning, TLS, redirect denial and UI fallback remain untested intent.

Next: one S1-owned manifest destination repair, not a generic private-IP helper
bolted onto Requests. Preserve public approved app paths and NO_PWA fallbacks;
prove unapproved/private/mixed-DNS/redirect requests denied before destination
contact, pin actual connection authority and verify HTTPS hostname handling.
Keep it <=500 changed code/test lines, obtain fresh intent review and update
the security record/learnings. Source/HTTP/deployment/diverse-review gates stay
OPEN until their evidence exists. No commit or PR created for this follow-up.
