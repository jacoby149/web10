# L1-A-02 Manifest Destination Repair

01.11.2026. Base `0d2a5d3fcc8ca2f2e87330b387ef65cbfca3b20f` plus local
manifest repair. Author and separate review: `openrouter/openai/gpt-6.1-sol`.
**Locally source-repaired; not merged or deployed. Protocol L1 remains OPEN.**

## Intent And Delta

D47's public manifest proxy supplies app names/icons without browser CORS.
S1's binding extraction contract (lines 314-316) restricts it to approved apps,
public connections and no redirects. D41 node readability does not authorize
arbitrary internal-network reads. No app-specific node data model was introduced;
the existing generic app registry remains the approval source.

`api/app/endpoints/system.py::pwa_listing` now rejects ambiguous authority,
credentials, control/non-ASCII input, query/fragment, invalid ports and zones.
It checks existing `get_app` approval before DNS, validates every resolved address,
and rejects private/reserved/multicast and IPv6 transition addresses. It connects
only to a selected numeric address using urllib3 2.7.0, with canonical Host,
HTTPS SNI and certificate hostname verification (`CERT_REQUIRED`). No original
hostname is re-resolved at connection time. Direct pools do not consume Requests
cookies, environment proxies or netrc. Redirects/retries are disabled.

Registry canonicalization remains authoritative, including `www.` removal and
`index.html` folding. Public HTTP and HTTPS remain supported. Responses retain
the decoded 256 KiB cap and NO_PWA fallback, with response/pool cleanup. Logs
contain fixed outcomes, not raw destination URLs, fetched content or exceptions.

## Repro Gate

Before source edits, the initial focused suite produced **four genuine failures**:
three approval states permitted real loopback fixture reads, and mixed public/
loopback DNS was accepted. An initial test-construction error was corrected before
counting these failures. After repair, the same assertions deny before any fixture
request or connection pool creation.

Commands from `api/`:

```sh
python3 -m pytest tests/test_manifest_ssrf.py -q
python3 -m pytest tests/test_manifest_ssrf.py tests/test_v3_endpoints.py::TestPwaListing -q --tb=short --disable-warnings
python3 -m pytest -q --tb=short --disable-warnings
ruff check .
```

Results: initial **4 failed**; final **70 focused passed** (64 new and six adapted
existing controls); **1,407 API tests and four subtests passed**; Ruff passed.
Parent independently reran the focused suite with frozen uv: 70 passed.
`git diff --check` passed. No production/store reads or credential use.

Parent full-suite invocation from the repository root (`uv run --frozen --project
api pytest api/tests ...`) initially produced 1 failure/1,406 passes: an import-trace
subprocess looks up `tests/conftest.py` relative to its working directory. Rerunning
the documented command from `api/` with frozen uv passed all 1,407 tests and four
subtests. No assertion or runtime change was made to accommodate this invocation.

Retained tests cover actual handler denial and zero loopback hits, mixed DNS,
approval/parser failures, numeric socket handoff, redirect refusal, Host/TLS
configuration, literal IPv4/IPv6, transport errors, malformed compression and
valid exact/over-cap JSON with and without gzip. Real HTTP transport tests map
the numeric public destination to a disposable local socket only in the test;
they do not prove actual public routing.

The earlier replay is preserved in commit `d733f7473` as a **historical pinned-source**
reproduction with four destination/path controls, not duplicated in the final tree.
Current denial regressions live in pytest. After CI-required Ruff formatting,
the final code/test delta is 488 lines (additions plus deletions), excluding Markdown.
PR: https://github.com/jacoby149/web10/pull/1299.

Initial CI passed all six Docker images, all four E2E shards and both security
checks, but API CI stopped at Ruff formatting. Applied formatting to the three
affected API files and removed the redundant standalone replay from the final
tree to retain the <=500-line budget; its full reproduction remains in Git.
Final CI confirmation is pending at this writing.

## Fresh Review

Separate same-model reviewer inspected urllib3's actual connection/TLS/decoded
read implementations and reran 70 controls. No exploitable SSRF bypass found.
Ephemeral real-TLS probes, outside tracked files, used actual handler/urllib3
with a disposable CA/server and a test-only socket handoff. Trusted matching DNS
and IP SAN certificates loaded manifests; wrong-host and untrusted certificates
failed before HTTP; HTTPS redirects were not followed. DNS SNI/Host and numeric
connections were checked. IPv6 SAN identity ran over IPv4 loopback, not an IPv6
socket. These reviewer-run probes are evidence, not retained CI regressions.

DESIGN-INTENT REVIEW: intent is anonymous approved-app identity discovery; delta
is a destination/transport restriction; no by-design conflict demonstrated;
all-answer rejection/no redirects/strict URL spellings follow S1 rather than
generic browser policy. Untested intent includes retained TLS integration,
actual IPv6 sockets, encoded-path identity behavior, real registry and deployment.
Same-model review cannot supply different-family convergence credit.

## Acceptance And Reopen Conditions

Accept locally on 01.11.2026: internal/private development apps and redirect-only
manifest URLs now fall back instead of proxying; non-ASCII URLs must use explicit
ASCII encoding. First validated address only (no fallback); OS DNS timing and
one-second connect/read timeouts are not a total deadline. This is intentionally
stricter than a browser, per S1. Reliability is not a new C+I finding.

Low review gaps remain explicit: TLS probes lack retained integration tests;
encoded dot/separator/malformed escapes can be transformed by urllib3 without
changing connection authority, but exact path identity behavior is not pinned.
No encoded-path SSRF was demonstrated. Add focused coverage when changing path
normalization. Reopen on urllib3/Python policy changes, DNS/address translation
changes, approved app fallback regression or TLS mismatch acceptance.

Actual registry/ClickHouse integration, CI, public-network/deployment behavior,
historical exposure and model-diverse sign-off remain OPEN. No production breach,
whole-file safety, L1 PASS or L2 advancement claimed.
