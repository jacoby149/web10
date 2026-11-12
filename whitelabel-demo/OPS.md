# TorahAnytime demo — bring-up runbook

Goal: unlock `torah.web10.app`, see TorahAnytime branding and browse/play real
Torah content backed by `api.torah.web10.app`. Keep the public web10 deployment
and TorahAnytime's existing services untouched.

## 1. Preflight — record before changing anything

- [ ] Confirm server owner, approved public address, private access and
  resources available for an isolated demo. A server offer is not database access.
- [ ] Inspect existing DNS records for both requested names, including A,
  AAAA and CNAME; save exact before-state and IDs in a private ops receipt.
  Existing conflicting records require an explicit cutover decision.
- [ ] Pin a reviewed source revision and name the new stack `web10-torah-demo`
  (proposed identifier; verify it is unused). Separate database, media storage,
  volumes and credentials from prod/dev and the partner's existing data.
- [ ] Choose authenticator routing, media routing and RTC routing if used.
  Possible names are `auth.torah.web10.app`, `minio.torah.web10.app` and
  `rtc.torah.web10.app`; **these are proposals, not approved DNS additions**.
  Same-origin routing is another option only after checking actual app support.
- [ ] Choose an established password/access gate and verify its browser/API/
  media behavior before exposing or seeding the demo. Keep secrets outside git,
  frontend bundles, URLs, shell history and receipts.

For the existing web10 box, read
[deployment README](../ubuntu-deployment/README.md),
[agent field manual](../ubuntu-deployment/AGENT-OPS.md) and its current ops log
before SSH. Do not print its private env file into tool output. On a partner
host, obtain its actual operating procedure; do not assume the same topology.

## 2. DNS and TLS

Cloudflare zone: `web10.app`. Planned records, **after target approval**:

| Zone-relative name | Type | Destination | Initial mode |
|---|---|---|---|
| `torah` | A | Approved demo edge's public IPv4 | DNS-only, matching current deployment convention |
| `api.torah` | A | Approved demo edge's public IPv4 | DNS-only, matching current deployment convention |

An existing approved hostname may instead be a CNAME target; choose one record
strategy, not both at the same name. Publish AAAA only after IPv6 routing,
firewall and the gate are verified. Do not blindly copy prod's address or add
a wildcard record. Cloudflare proxying is a separate reviewed choice if the
selected gate requires it; do not change zone-wide settings.

Use a zone-scoped DNS credential through the existing private ops mechanism.
Reconcile only these approved names, preserve unrelated records and record
before/after state. Existing `sync-dns.py` / `sync-npm.py` manage broader dev/prod
tables: **do not run them as a demo shortcut**. A future helper must default
to dry-run and show the exact scoped diff before apply.

**TLS:** `*.web10.app` covers `torah.web10.app`, NOT
`api.torah.web10.app`. Obtain explicit SANs for every approved hostname or a
certificate covering both `torah.web10.app` and `*.torah.web10.app`.
DNS-01 fits the current NPM setup; a wildcard requires DNS-01. Use real verified
HTTPS, never insecure browser exceptions. Configure the gate before opening
public routing. DNS propagation alone is not a working demo.

Read-only checks (run after approved changes, not proof by themselves):

```sh
dig +short A torah.web10.app
dig +short AAAA torah.web10.app
dig +short CNAME torah.web10.app
dig +short A api.torah.web10.app
dig +short AAAA api.torah.web10.app
dig +short CNAME api.torah.web10.app
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://torah.web10.app/
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://api.torah.web10.app/docs
```

The unauthenticated request must be challenged/denied or sent to the intended
gate login, not return demo content. A 502 or TLS error is not a passing denial.

## 3. Stack and origin wiring

Reuse [canonical ecosystem Compose](../ubuntu-deployment/docker-compose.ecosystem.yml)
as the implementation reference, not a copy-paste production deployment.
Parameterize a separately reviewed demo stack/overlay; no compose is created
by this runbook. Do not use the root localhost development Compose on the internet.

Confirmed non-secret values for that future configuration:

```dotenv
STACK=web10-torah-demo
PROVIDER=api.torah.web10.app
API_HOST=api.torah.web10.app
API_ORIGIN=https://api.torah.web10.app
SOCIAL_ORIGIN=https://torah.web10.app
```

Resolve AUTH_ORIGIN, RTC_ORIGIN and the browser-facing media endpoint explicitly
before build. Social uses `VITE_API_ORIGIN`, `VITE_AUTH_ORIGIN`,
`VITE_RTC_ORIGIN`; authenticator uses `REACT_APP_API_ORIGIN`,
`REACT_APP_DEFAULT_API`, `REACT_APP_AUTH_ORIGIN`, `REACT_APP_RTC_ORIGIN`.
These are build-time values: rebuild, do not merely restart. Missing values
can fall back to public production hosts. Inspect actual browser network
destinations; no demo credentials or writes may reach prod.

Configure only the demo's authenticator hosts in `CORS_SERVICE_MANAGERS`
(not a general browser CORS list). Approve/register the exact demo app origin
through normal contracts; keep auth signing material and account grants isolated.
Check reset/consent/issuer settings as well as the social build.

If using NPM and the existing proxy network, planned forward targets are
`web10-torah-demo-social:80` and `web10-torah-demo-api:80`, not bare `social`/
`api` names. Choose supporting targets only after their routes are approved.
Keep database, admin panels and container ports private. Do not expose MinIO's
admin console; browser media uses its S3 API or a reviewed protected proxy.
External telemetry stays off for the demo unless separately approved.

## 4. Password gate — browser proof, not a painted door

Protect social routes/assets/previews, API reads/writes and demo media routes,
including thumbnails, HLS manifests/segments, range requests and raw downloads.
Block direct-origin/alternate-host access and public bucket/CDN bypasses.
Robots/noindex and hiding a compose button are not access control.

Do not assume HTTP Basic Auth on two hosts automatically works: cross-origin
fetch, CORS preflights, uploads, media players, consent popups and WebSockets can
behave differently. The gate must preserve normal API token bodies/headers.
Use an established proxy/access product and prove the complete journey. If a
cookie/session gate is chosen, test expiry and logout; if browser-managed Basic
Auth is chosen, document its lack of reliable application logout and confirm
that limitation is acceptable. Do not build a custom password protocol.

Reproduce denied access without credentials and with wrong credentials for
every enabled content path. If third-party media or a signed URL bypasses the
gate, the private-demo acceptance fails until routing is corrected. An HLS or
S3 signature alone is not proof that the password gate protects those bytes.

## 5. Brand, seed, verify

- [ ] DEMO1 logo feature is implemented and reviewed; both configured assets
  survive save/reload and appear on actual demo screens in matching themes.
- [ ] Gate passes denial controls before any sample is uploaded.
- [ ] Stock only the agreed sample using [CONTENT.md](CONTENT.md).
- [ ] In a fresh browser: unlock, complete actual demo auth/consent, browse
  feed/speaker pages, follow, save/share a shiur and play/pause/seek media.
- [ ] Check a copied deep link, refresh/back/forward, failed-media state and
  phone-width layout; no general-network content or production API calls.
- [ ] Capture and inspect desktop then 375px in both themes under `.context/`;
  keep credentials and signed URLs out of screenshots/logs.
- [ ] Record revision, exact hostnames/routes, DNS/TLS/gate receipts, content
  count/bytes and known limits in OPS-LOG.md. Normal CI/review must be green
  before claiming ready. No local test substitutes for deployed acceptance.

## 6. Rollback

First close demo ingress/deny access, including API/media routes; removing DNS
alone does not revoke cached DNS or existing URLs. Restore only the demo DNS/
proxy records changed in this session from the saved before-state. Stop only
owned demo services if necessary. Preserve volumes, sample ledger and rollback
receipts; no `down -v`, broad prune or changes to prod/dev/partner services.
Existing media capabilities can outlive configuration rollback until expiry;
verify direct bytes are denied. Log the result here and, if operating the
existing web10 box, in its authoritative `ubuntu-deployment/OPS-LOG.md` too.
