# Production CDN activation — 04.11.2026

The operator asked for the real hookup, retaining MinIO. Production now issues
protected `media.web10.app` URLs, and a synthetic video plays through them. This
is a bounded operational result, not a declaration that every release gate closed.

## Follow-up: normal deployment persistence verified (00:52–00:56 UTC)

The operator approved the normal dev→main release batch. Ancestry reconciliation
PR #1367 preserves the exact dev tree before its changelog addition; promotion
PR #1366 then passes every applicable check and is merged with a merge commit at
`b4e3b4bd9a84b5b8ae823221fd8e91f20c74e424`. Production deploy
[41749919820](https://github.com/jacoby149/web10/actions/runs/41749919820), image
publication [41749919850](https://github.com/jacoby149/web10/actions/runs/41749919850)
and all four main E2E shards
[41749919886](https://github.com/jacoby149/web10/actions/runs/41749919886) pass.

**The deployment-persistence gate is closed.** The normal workflow creates a new
API container/image with all seven forwarded media fields and enabled issuance.
Four runtime source-file hashes match the promoted revision. The new image is
`sha256:7c20538aad31e869c7e20b58b3e9f3adcb0bcdaea268b7535a2a8f83d7ae7c18`;
MinIO's container remains unchanged and active/authoritative private env copies
remain identical. Public status reports **4.0.7 / b4e3b4bd**. The canonical Compose
on main now forwards the settings; the temporary pinned-image activation is no
longer the live deployment mechanism.

After deployment, actual owner-issued CDN reads match bytes, ranges return 206,
missing/naturally expired capabilities return 403, and synthetic MP4 playback again
completes four seconds/96 frames at desktop/375px. A new synthetic production
account passes signup/login without uploading objects. Public marketing and
anonymous social pages render at desktop/375px; all six screenshots, including
the playback pair, are inspected. These are not full-player renewal tests.

Preserve the probe failures: API root GET is correctly 405 (POST-only); local
Chromium was missing before browser launch; marketing has an h1 but no main
element. Corrected acceptance tooling and installed matching Chromium; no live
application fix or TLS weakening was needed. API docs/auth/social/marketing/apex
health checks all return 200. Local API verification passes 1929 tests plus eight
subtests, one opt-in skip, and Ruff; frontend test/build coverage is from passing
promotion CI, not the local attempts that lacked vitest.

Successful follow-up receipt SHA-256 anchors (private immutable receipt directory
unchanged):

| Stage | Receipt digest |
|---|---|
| New runtime generation | `f8af1b630de12aa1fd87d7f0bcee644caa3927d9c24429c2bef30f89290cbb93` |
| Public release status | `aa6689a6c7ecdbdd3ed80a1f18ab5f632cac482e9264d14404e13db8bca7b2b3` |
| API-issued delivery | `a304383da914ebb3373d9cc04ac7d672473cf89ecabad971571287fa3f4b6138` |
| Natural expiry | `9196b716c377fbbafcdf769f82eb59f37608393844793344bbf394b063b390eb` |
| Browser playback | `800f1c019bc1428cc9ec1ceab79bed6aeebabb61713fd7d6c4da9472a90b3005` |
| Public surface captures | `f88cb9bed841e98a5d9e85c111feed4bf33c2f7d97fb54561d6b3608ebf88b34` |
| New signup/login | `2b09000bf1a3409f86cb919b257f2ce3eb392e50622b71e6472538c94c347609` |

The sections below retain the initial activation evidence. Original private
rollback snapshots restore that earlier API generation, not the new release.
Document/query issuance, full-player renewal, provider measurements/log audit,
model-diverse security review and capacity testing remain separate work.

## What is live

| Component | Verified state |
|---|---|
| Node | `api.web10.app`, media issuance enabled, direct capability TTL 60 seconds |
| Edge | `web10-media-prod`, custom domain `media.web10.app`, normal Cloudflare adapter |
| Storage | Existing private MinIO bucket `web10-media`; no storage migration |
| Origin credential | Dedicated direct IAM user, named GetObject-only policy; actual GET succeeds, list/write denied |
| Signing | Separate media-only RSA key in the node's private ops vault; matching public JWK at the Worker |
| Initial guardrails | Worker CPU 50 ms; outer response cache, invocation logging and Logpush disabled in deployment config |
| Recovery | Original disabled env and exact-image API-only enabled/rollback Compose snapshots retained privately |

The API was recreated with its exact existing image,
`sha256:0e1e38de41f63bea26bef6b8634b8d4c3021bc8b42dc0b420a3499556b86d379`.
Preflight compared non-media environment, command, networks and storage credentials
with the running generation. No newer API source was built; no other service was
recreated. Active `env.prod` and its new authoritative `~/web10-ops/env.prod` backup
hold the seven media settings privately. Authentication keys and shared MinIO
passwords were not rotated.

## The failure and the repair

Initial signed edge reads returned 502. Temporary metadata-only diagnostics showed
an origin 301 to the same HTTPS origin, while the identical adapter outside
Cloudflare returned 200. The zone was in Flexible SSL mode.

Both available credentials received 403 reading Configuration Rules. Other proxied
origins could not be validated for zone-wide Strict, so that change was not made.
The operator added the requested hostname-only SSL rule matching
`http.host in {"media.web10.app" "minio.web10.app"}`. Signed canary reads then
succeeded; unrelated zone settings and origins were left alone. The screenshot
shows the rule active; its selected SSL value is not independently API-readable
with the available credentials.

First fresh-runtime staging validation also stopped on an unsupported Compose
`run --pull` flag (installed version 2.23). Safe diagnosis identified the flag;
removing it allowed actual fresh runtime validation and matching public JWK
verification before active env changes. Existing staged files were checked for
exact content rather than overwritten blindly.

## Connected checks

| Probe | Observed result |
|---|---|
| Normal Worker canary before activation | Valid 200 with matching SHA-256; expired/missing 403 |
| Real production login and owner `media/read-url` | 200; returned URL host `media.web10.app`, capability TTL 60 |
| Actual API-issued full read and repeat | 200, matching 41-byte synthetic canary, private/no-store |
| Range `bytes=0-9` | 206, exact ten bytes and Content-Range |
| Missing capability | 403 |
| Same API-issued capability after natural expiry | 403; earlier premature probe stopped locally before a request |
| Canary-only edge cache observation | Two IAD hits with matching bytes and no origin fetch |
| Expired capability against that cached object | 403, neither cache lookup nor origin fetch reached |
| Chromium synthetic MP4, 1280px and 375px | Four seconds, 96 decoded frames, ended=true, CDN 206 |
| After restoring normal Worker | API health/login/issuance/full/range/missing-denial checks pass again |

Cache diagnostics were restricted to the owned synthetic text object's path.
Other requests used the normal adapter. The live storage credential was never
disabled to force a cache result. The normal Worker was restored afterward.
Final node metadata confirms enabled issuance, key/base present, seven media env
fields, authoritative backup present and diagnostics absent.
The public `/v3/media/jwks` returns 200 with one public key matching the Worker.
All 42 cases in `delivery.test.mjs` pass after the operations; this record changes
no tracked application or deployment source.

Only one synthetic production account and two synthetic objects (text and MP4)
were added. The video is 118128 bytes with SHA-256
`1d1e37e6e6b9668f37a5d79c39b36e9ad3d4f38434a8583c0b9d83c12564314a`.
No existing user's objects were read or modified for these probes. Screenshots
were read individually at `.context/cdn-live/production/browser-{1280,375}.png`.
Immutable redacted receipts remain in that directory's `receipts/`; credentials,
signed URLs and PEM are excluded from this record.

Receipt SHA-256 anchors:

| Successful stage | Receipt digest |
|---|---|
| Activation | `21bbabbe6b8828636b919a567a13e6795ad64abc991f33fbab4f2ad1afda694c` |
| Natural expiry | `1963af9dc9e2bae4cb6be1aaccbf6e84fe3c33e343010d293549298db83ddfeb` |
| Browser | `be2f97984000f33ba97d40ecbaf106250dc897696ae2622a2121c20184859d39` |
| Cache | `93f2b75bd5abdf48b70ea5c08dccb3f61a43ae9d0663d3e6c89984f7263b19a1` |
| Normal Worker restored | `eaffb30cf2acf17877f450b106fbd40aa2ba19c4d21dd3108af02107a9c16152` |
| Final API acceptance | `cc1962b2992dcfca3724e3b266f7cdce2640e96bcb590a80b2f891ce9df8f723` |
| Final node status | `128b13ba763783cd817c4f86d195d2b1f7fd70947b5ac57a4e9154fc1ce54f6d` |

## Recovery and the next deployment (initial activation history)

At initial activation, the pinned-image configuration survived API restarts but
main lacked the merged dev Compose forwarding. That older Compose could remove
the media env on deployment and fall back to legacy delivery. The normal-release
follow-up above closes this gap after explicit batch approval; no blind promotion
was performed.

The scope-owned private vault under `~/web10-ops/cdn-production-<recorded-scope>/`
contains `env.prod.before`, `env.prod.candidate`, `activation-manifest.json`,
`api-enabled.compose.json` and `api-rollback.compose.json`. The Compose snapshots
pin the exact existing image and networks and contain private environment values;
never print them. The local private helper's `rollback` stage checks env hashes,
atomically restores the disabled env to both active and authoritative copies,
then recreates only the API from its pinned rollback snapshot. Enabled recovery
can use the corresponding snapshot after revalidating current state. Neither
operation changes the origin credential or immediately revokes issued capabilities.

The initially required forwarding promotion and deployed-generation verification
are complete in the follow-up above. Initial authenticated document/query
issuance, the full social player's HLS/long-video automatic renewal, representative
provider resource measurements, logging/export completeness and independent
model-diverse security review remain open. Operator-directed activation occurred
before all those gates closed; this record does not waive them. See
[provider readiness](PROVIDER-READINESS.md) and the historical
[isolated acceptance](CONNECTED-ACCEPTANCE.md).
