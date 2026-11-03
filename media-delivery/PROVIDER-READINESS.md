# Cloudflare production readiness — 03.11.2026

The goal is MinIO-backed media delivery without the node carrying every byte.
Connected acceptance supports the technical path; billing, provider controls and
client renewal still need their own approval. A green four-second clip is not a
production contract.

## Plan and terms

Read on 03.11.2026 from Cloudflare's current first-party sources:

- [Application-services terms](https://www.cloudflare.com/service-specific-terms-application-services/),
  last updated 28.09.2026: the Free/Pro/Business CDN section requires suitable
  **Paid Services**, naming Developer Platform, Images and Stream as examples,
  for video/large-file CDN delivery unless covered by Enterprise. Do not present
  this design as unrestricted video delivery on the free website CDN.
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
  last updated 02.10.2026: Workers Paid starts at **$5/month per account**, separately
  from website Free/Pro/Business. It includes 10 million requests and 30 million
  CPU milliseconds/month; excess is $0.30/million requests and $0.02/million CPU
  milliseconds. Workers pricing states no additional egress/bandwidth charges;
  MinIO hosting, origin egress, other products and taxes remain separate.
- Paid Developer Platform is a relevant route to confirm for this design; these
  terms do **not** say that R2 is mandatory. Keep the origin/storage decision
  separate. Confirm the account's applicable entitlement before production.

The read-only account audit could not read subscriptions (HTTP 403). A script
reporting `usage_model: standard` does not independently establish an active paid
subscription. No plan upgrade was made by the agent. Subsequently, after discussing
the absence of a verified hard monthly cap, the operator explicitly accepted the
Workers Paid minimum/usage-overage risk and requested continuation. This approval
does not establish that billing is activated, authorize unrelated paid products,
or waive the remaining security/playback gates.

## Initial CPU guardrail applied (22:43–22:45 UTC)

Persisted `limits.cpu_ms = 50` in the deployment example and private isolated
configuration. Redeployed only `web10-media-smoke-charlotte`; the Cloudflare script
settings API returned 200 and independently confirmed `cpu_ms: 50`, with logpush
false. Outer caching/observability fields remain absent in that response; no stronger
account-wide logging/cache claim is made from their absence. The configuration
explicitly keeps those features off.

A fresh 19-request IAD cache/denial experiment and 29-probe real-database HLS run,
including desktop/375px browser playback, pass after this deployment. Local API/
ClickHouse teardown is verified. The 50 ms value is a provisional **per-invocation
CPU ceiling**, not a monthly monetary/request limit or a measured CPU requirement.
The regression pins it so normal redeploys do not silently restore the much larger
default. No billing subscription or notification policy was changed by the agent;
budget alerts are still unverified/unconfigured by this workflow.

An aggregate-only GraphQL CPU query returned an error and no usable metrics. It
did not request raw invocation logs/URLs and must not be treated as a zero-CPU
measurement or cost forecast. Representative CPU/memory/usage observation remains
open; accepting overage risk does not manufacture that evidence.

## Limits and request accounting

[Workers limits](https://developers.cloudflare.com/workers/platform/limits/), last
updated 29.10.2026, list Free at 100,000 requests/day and 10 ms CPU/invocation;
memory is 128 MB/isolate on Free and Paid. HTTP response bodies can stream, but
background `waitUntil` work has a 30-second extension after the response/disconnect.

Every protected image/segment request still invokes authorization, including
internal-cache hits. Budget those requests and their verification CPU; the
Worker is not made free by its internal cache. The transcode worker targets
six-second HLS segments: a ten-minute play is roughly 100 segment requests before
images, retries, quality switches, ranges and other account traffic. This is
request arithmetic, not a measured capacity or CPU/cost estimate.

Our own limits are narrower than Cloudflare's maximum cached-object size:
full 200 responses require a canonical Content-Length of at most 32 MiB to be
cached; ranges, unknown lengths and larger responses bypass cache. Concurrent
streaming/cloning, real Worker CPU/memory and large-object behavior remain live
gates. Free-plan exhaustion must fail closed; do not configure a security Worker
route to fall through to unprotected origin bytes.

## Two different caches

The implementation's **Cache API** is called only after the verifier. That is
different from [Workers Cache](https://developers.cloudflare.com/workers/cache/),
whose documentation (30.10.2026) says it can serve responses before Worker code
runs. Keep that outer response cache disabled for the protected entrypoint.
Browser/edge-facing responses remain `private, no-store`, which the documentation
also specifies as cache bypass; do not replace those headers with public TTLs or
confuse internal cache TTL with authorization lifetime.

`wrangler.example.toml` now explicitly disables outer caching, logpush and Worker
observability/invocation logs, as well as issuance/workers.dev. Its configuration
regression passes and Wrangler 4.156.2 accepts a dry-run build. This is an example
guard, **not** proof of every deployed account setting and not a deployment.

## Read-only logging audit: incomplete

The isolated script settings endpoint returned 200 and `logpush: false`.
Observability fields were absent; no stronger inference is made from absence.
Account-level Logpush and zone-level Logpush reads each returned **403** with the
existing Wrangler OAuth scope. Raw responses, credentials and destination strings
were not retained; only projected statuses/settings are in private receipts.

An operator with appropriate read access must inspect those exports, Worker
request/invocation logs, zone logging rules, origin/NPM/MinIO audit sinks and any
client/error collectors before production. Ensure query capabilities, storage
authorization headers and private keys/object paths are not captured. Do not
enable raw invocation logging simply to measure CPU. Current credential permissions
are not evidence that export jobs do not exist. No logging policy was changed by
this audit.

## Remaining release decision

1. Confirm an appropriate paid Developer Platform/Enterprise entitlement and
   workload budget; no automatic billing changes.
2. Complete the logging/export and real CPU/memory/large-response checks.
3. Demonstrate initial authenticated document-read issuance and the full social
   player's long-playback renewal. The connected harness proves **explicit**
   fresh-token renewal and denial after revocation, not automatic player recovery.
4. Obtain independent, model-diverse security review and green publication gates.
5. Only then approve a limited production canary with rollback; ordinary revocation
   remains capability-expiry bounded and MEDIA-C urgent takedown remains separate.
