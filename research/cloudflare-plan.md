# Cloudflare + Media Delivery Plan

**Status: plan, not built.** This is the answer to "can we offload media to a
CDN under web10's security model, what does it cost, and what happens on
takedown?" It turns the three-part media fix (Parts A/B/C from the
digital-ocean thinking thread) into a concrete, staged, costed plan.

Grounded in the real code (read before writing this):
- `api/app/services/media.py` — presigned GET/POST minting; **signs the object
  KEY + expiry only, no reader identity** (`generate_presigned_url("get_object",
  Key=object_key, ExpiresIn=...)`). Already has a **public** signing endpoint
  (`S3_PUBLIC_ENDPOINT`) so the browser can reach MinIO directly.
- `api/app/v3/endpoints/media.py` — `hls_segment` (:243) does `verify_sig`
  (JWT, carries the reader username) **then proxies the bytes through the node**
  via `get_s3_client().get_object()`, `Cache-Control: no-store`. This is the
  node-in-the-byte-path problem.
- `api/app/services/hls.py` — the 10-min sig bound to (reader, doc, hls
  prefix); manifest re-check re-runs `can_view_doc` every sig TTL.
- `api/app/v3/services/clickhouse.py` — `delete_media` (:4307) +
  `delete_document` (:991) **tombstone the row only; they never delete the
  MinIO object.** The takedown fast-path does not exist yet.
- `docker-compose.yml` — MinIO publishes `9000:9000`; presigned URLs use
  `minio.localhost` (dev) / `S3_PUBLIC_ENDPOINT` (prod).

## The three costs, separated (so the money is honest)

| Cost | What it is | Scales with | Today | After plan |
|---|---|---|---|---|
| **Node compute** | API + ClickHouse CPU/RAM | active *queriers* (feed loads), NOT views | video segments proxy through it | drops to O(manifest re-checks/10min) per viewer |
| **CDN** | edge caching + (optional) edge JWT verify | requests | $0 (none) | $0 free tier; Workers metered only if edge-verify |
| **Egress bandwidth** | bytes out to viewers | *views* — the scary one | metered by host/MinIO egress | **$0 on R2**; metered on S3 |

The comfort: the speedup (Part B) is *negative* node cost. The only new line
item is egress, and **R2 makes that $0**. No cluster, no enterprise CDN contract.

## The stack (target)

```
Browser
  │  (1) feed read → node mints capabilities (presigned key-URLs / HLS sig)
  │  (2) media bytes → straight to Cloudflare edge
  ▼
Cloudflare (Free tier)
  │  TLS + DDoS + cache. Cache key = OBJECT PATH (signature stripped).
  │  [optional, metered] Worker verifies the HLS JWT at the edge.
  ▼
Origin
  ├─ R2 (preferred) / S3 / MinIO  — blobs. R2 egress = $0.
  └─ Node  — mints URLs + manifest re-checks ONLY. Out of the byte path.
```

Two auth models, pick per phase (this is the free-vs-paid decision):
- **Origin-check (FREE):** CDN is a dumb cache; the presigned S3 sig / the
  node's manifest endpoint still authorizes. Cache-hit serves from edge;
  cache-miss falls through to an origin that checks. $0. Start here.
- **Edge-check (METERED):** a Cloudflare Worker verifies the JWT/sig at the
  edge before serving. Removes the origin round-trip entirely. Workers free
  tier = 100k req/day, then ~$5/M. Add only when origin-check load shows it's
  worth it.

## Part A — Images / audio / docs (config, no `api/` code)

Already off the node: browser → public MinIO/S3 via a presigned **key** URL
(per-object, not per-user — so it's already cache-friendly; it fragments only
by expiry timestamp). Work:
1. Put the public blob host behind Cloudflare (Free). TLS + cache + DDoS.
2. **Cache policy keyed on the object path**, signature query stripped — so all
   readers of the same object share one edge copy across expiry windows.
3. (Preferred) Move blobs MinIO → **R2** (S3-compatible; the node's boto3
   client just points at the R2 endpoint + keys). Kills egress. MinIO stays
   for local dev/e2e.
- **Acceptance bar:** a feed image is served from the CF edge on 2nd+ view
  (cache HIT in CF analytics) with the node not in the request path; takedown
  of the doc stops *new* mints immediately (the read 404s → no new URL).

## Part B — Video HLS segments (the real fix; small `api/` change)

Today every `.ts` segment round-trips through the node (`media.py:243`). Fix:
make the segment token **edge-verifiable** so the CDN serves bytes without the node.
1. **Publish the node's JWT public key** — JWKS at a well-known URL (the sig is
   already asymmetric-signed, `hls.py:58-69`, `settings.PRIVATE_KEY`/`ALGORITHM`).
   A Worker/edge can verify signature + `exp` + the doc-bound `prefix`.
2. **Mint segment URLs that target the CDN origin**, carrying the sig; the edge
   verifies, then fetches the `.ts` from R2/S3 by the key `segment_key` already
   computes (pure function of prefix+variant+seg).
3. **Keep the manifest on the node** (the only DB re-check, 1×/10min/viewer —
   trivial) or edge-cache it for the sig TTL.
4. Node per-viewer cost → O(manifest re-checks/10min). Revocation still
   propagates within one sig TTL via the manifest re-check.
- **D60 check:** passes — JWKS endpoint + segment-URL minting are generic
  media-capability plumbing, no app concept.
- **Acceptance bar:** a segment fetch is served by the edge (CF cache HIT or
  edge-verified origin pull) with **no node round-trip**; a revoked reader's
  next manifest re-fetch 403s within one sig TTL; `no-store` removed from
  segment responses so the edge can cache.

## Part C — Takedown fast-path (closes the gap you found)

**The gap (confirmed in code):** `delete_media`/`delete_document` tombstone the
ClickHouse row but **never delete the MinIO/R2 object**. So a taken-down post's
media stays hot at the origin for the full TTL (1 hr images / 10 min video) and
the object persists on disk. The TTL is the *policy* revocation (fine for
ordinary content — D41, "same as a shared YouTube link expiring"); but for
urgent takedowns (harmful content, paid/subscription churn) "up to 1 hour hot"
is not defensible.

Fix — make revocation **immediate** for the classes where the TTL isn't enough:
1. **Origin object purge on takedown:** `delete_media`/`delete_document` (and the
   block/revote paths) also `delete_object` the `object_key` (+ HLS tree prefix,
   + thumbnails) from R2/S3. A presigned/sig URL then **falls through to an
   origin that no longer has the object → immediate 404, TTL or not.** This is
   the kill switch.
2. **CDN purge:** Cloudflare cache purge (by object path / by tag) on takedown,
   so edge copies die too, not just on their own TTL.
3. **Keep the cheap model for ordinary content:** don't purge on every normal
   delete if it's not needed — the TTL bound is acceptable there. Purge is the
   *urgent* path (a `purge=true` flag / a moderation-triggered call), so ordinary
   deletes stay cheap and harmful/paid takedowns are instant.
- **Acceptance bar:** after an urgent takedown, (a) a *pre-minted* unexpired
  presigned image URL 404s (object gone from origin), (b) a *pre-minted* HLS sig
  stops at the next manifest re-fetch AND its segments 404 at the origin, (c) CF
  edge copies are purged, (d) the doc row is tombstoned so no *new* capability is
  minted. Ordinary (non-urgent) delete still relies on the TTL bound and is
  labeled as such.

## Staging (what to do in what order, by cost/risk)

1. **Now, $0, no code:** Part A on the Free tier (CF in front of the public blob
   host + path-keyed cache policy). Immediate win: images off the origin on
   cache-hit.
2. **Next, $0 storage change:** blobs → R2 (endpoint + keys in settings). Kills
   egress. MinIO stays for dev/e2e.
3. **Then, small `api/` PR:** Part B (JWKS + edge-verifiable segment URLs). The
   video speedup. Start with **origin-check** (free); add the **Worker edge-check**
   (metered) only if origin load justifies it.
4. **Then, small `api/` PR:** Part C (object purge + CF purge on urgent takedown).
   The safety fix.
5. **Later, under real load:** decide origin-check vs edge-check with numbers;
   right-size the node (it should shrink, not grow).

## The dollar answer (10k users, 10% online, video)

- **Node:** small box (the sweep sizes it for the *query* path; video no longer
  loads it). This is the box the scale-sweep buys.
- **Cloudflare:** **$0** (Free tier: TLS, DDoS, caching, delivery). Workers
  edge-verify: **$0 until 100k req/day**, then ~$5/M — deferred, optional.
- **Egress:** **$0 on R2** (the line item that would've scared you). Storage
  ~$0.015/GB-mo.
- **Total new spend to start: ~$0.** The first paid line (Workers) appears only
  at scale and only if edge-verification is chosen over origin-check.

## What this is NOT (scope honesty for the paper)

- Not a claim that web10 is private — it's data-policy (D41): a taken-down
  object is dead at the origin immediately (Part C) or within TTL (ordinary),
  and a shared link dies at expiry. That's the *designed* bound, stated as such.
- Not measured yet — this is the architecture + cost plan. The evaluation
  scopes video out of the query-path numbers *with this as the stated reason
  and the named changes (A/B/C) that offload it + close takedown.*
- Part B/C touch `api/` but stay generic (D60): capability minting + object
  lifecycle, no app-specific surface.
