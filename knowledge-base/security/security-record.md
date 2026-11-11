# The Security Record — web10 coverage recordd

The altitude. One row per **(unit, level)**. This is the coverage record — the
thing you point at to prove forward progress. Format, status, and staleness rules
live in the cartridge: [`ai-pack/ai-security-theory/the-security-record/`](../../ai-pack/ai-security-theory/the-security-record/README.md).

> **Status key:** `PASS` requires evidenced current-level disposition and required
> sign-off under the campaign strategy. A `BP-n` reference or completed read alone
> does not pass a blocked guarantee. `OPEN` = unresolved findings, coverage or
> sign-off. `STALE` = evidence invalidated or relatively old, re-scan owed.
>
> **Level key (the scope ladder):** `L1` = file-scan (the file itself) · `L2` =
> call-graph-scan (the file + its direct call graph, one hop) · `L3` = service-scan
> (the whole service, transitive closure) · `L4` = project-wide-scan (all services,
> the final boss). The order is L1 → L2 → L3 → L4, each to 100% before the next,
> backend-first. When all four are 100%, the surface has **passed the AI pentest**.

## Single-doc read tombstone safety (11.11.2026) — bounded local fix, broader raw-filter catalog OPEN

`read_document_by_id` (`api/app/v3/services/clickhouse.py`) filtered `documents`
with a raw `WHERE p.deleted = 0`: between a delete's tombstone insert and the
ReplacingMergeTree background merge, the live row kept serving — a deleted post
lingered on every single-doc read (collection items, post detail, permalinks)
while the deduped board/group reads hid it instantly. Discovered by the Music
social-library connected acceptance (journey g, real node: a media post deleted,
still readable via the single-doc path until a merge happened to run; the
cover self-heal only fired once the merge settled). Fix: the house
dedup-then-filter — latest version per `(doc_id, author_key)`, the deletion
winning timestamp ties (`row_number() … ORDER BY updated_at DESC, deleted DESC`,
`rn = 1`), then `deleted = 0` — identical shape to `read_documents` /
`_board_base_sql` / `list_media`.

Security properties: NO access widening. The fix is a narrowing only — a reader
can see LESS (a deleted doc, sooner), never more: the group-membership
LEFT SEMI JOIN, the user_blacklist LEFT ANTI JOIN and the app-contract gate
(`_check_app_permission` at the endpoint, above this function) are untouched.
L1 (the changed SQL + its two call paths, the `/v3/read` doc-id branch) scanned;
L2 bounded: the remaining raw-filter readers
(`get_document`, `get_document_any_author`, `get_document_version`,
`content_event_creator_rows`) are gate/control-plane helpers (delete
pre-checks, thumbnail access probes, durable-create reconciliation —
`get_document_version` deliberately includes tombstones), not user-content
reads; `can_read_carrier_post` / `resolve_pinned_ads` / `get_active_node_ads`
were verified already-deduped. L3/L4 of the documents-read surface is not
claimed. Evidence: `api/tests/test_tombstone.py` re-pinned (the legacy pin
asserted the old `ORDER BY … LIMIT 1` shape; now asserts the dedup + a
tombstoned-doc-reads-absent control), full API suite green (2,229), ruff
check + format clean, and the connected gauntlet's journey g on the real node
(the visitor's self-heal write 403s + the owner's persist, both reading the
immediately-tombstoned post). Shipped as 5.16.2.

## D107 visible-by-default replay (09.11.2026) — bounded review, OPEN

Operator-approved public/UI text and readable image pixels replace blanket
masking. Bounded L1/L2 checks cover SDK/wire policy and sensitive caller roots;
local wire/component controls and six intercepted desktop/375px reconstructions
retain private/input/credential denial. Review finds and repairs Music comments,
private playlist/share portals and profile/saved grid gaps; public variants stay
visible. Not a completed L3/L4 scan or model-diverse sign-off. Broad real-screen
coverage, CI and approved deployment/fresh hosted recordings remain OPEN.
[Record](scans/2026-11/posthog-capture.md).

## Q01 actual-host verification (09.11.2026) — strict acceptance FAILED

Merged #1448's exact source runs on approved isolated DB/API/generator hosts.
Small floor and frozen dispersed million-author restore/initial results pass;
two of four measured feeds fail with native code-159 SQL timeouts. Seven
before/after lifecycle controls, three paired checks and 18 HTTP/ASGI correlations
remain valid negative evidence, not security/capacity acceptance. All owned
droplets/firewalls/key/tags are independently verified absent. Temporary ops
admission-race repair has scoped offline review, not L1–L4 or diverse assurance.
K=1,000 is a stress case, not an observed user average; production and primary
study gates remain open. Receipt:
`research/experiments/costfn/evidence/Q01-PREFLIGHT-20261109.md`.

## Readable-join investigation (08.11.2026) — REJECTED, code removed

Sparse gains do not outweigh the demonstrated tradeoffs: unrestricted early
joining reproduces 8.3× duration/34.2× memory with overlapping histories, while
even the single-group restriction costs more on dense reads. Operator rejects
promotion and requests docs only; all unpublished runtime/test changes removed.
Structured local evidence and physical-history fixture learnings are retained.
Prototype parity/tests are historical, not shipped regression coverage or broad
security approval. Q01 remains intact; post-#1448 million-author acceptance is
unknown, with no fresh actual-host run. Existing L1–L4/churn/rollout gaps remain.
[Record](scans/2026-11/query-readable-join.md).

## Exact-ID canonical pruning (08.11.2026) — bounded compiler/wiring review, OPEN

Internal exact-ID restrictions retain complete document/attachment histories,
current input authority and ambiguous identity denial. Twenty-four local controls,
twelve native ClickHouse cases plus 3,000-UUID fallback and all 2,226 API tests
pass. The 100k-identity query diagnostic reduces bytes/window memory, not
full-feed concurrency proof.
Three fresh same-family scoped reviews are dry; broader L1–L4/diverse sign-off, merge/concurrent
mutation, million-author acceptance and PR/deployment gates remain OPEN.
[Record](scans/2026-11/query-exact-id-pruning.md).

## Attachment-history partition pruning (08.11.2026) — bounded compiler review, OPEN

Actual-host timeout evidence motivates trusted partition-key predicate placement,
not weaker deletion/access checks. Fifteen durable AST/SQLite controls and eight
actual ClickHouse constant-CTE comparisons retain expected rows. Three fresh
same-family reviews are dry; diverse review, equal-timestamp/merge/concurrent
history assurance, fresh study and PR/deployment gates remain OPEN. Source-specific
single-pass diagnostics are not capacity results. Fresh candidate strict
acceptance still fails three measured main requests; lifecycle controls pass,
and all test hosts/firewalls are removed. [Record](scans/2026-11/query-partition-pruning.md).

## Public frozen research inputs (08.11.2026) — bounded live acceptance, broader coverage OPEN

Operator-authorized exact fourteen-key anonymous GET publication; trusted receipt
and full-byte verification, private before-policy backup and preserved statements.
Independent anonymous HTTPS downloads verify all pinned bytes; listing, uploads,
conditional overwrite, neighbor and existing user-media reads remain 403. Ten
offline controls include a live-found MinIO Resource-order readback/idempotency
repair. Three fresh pre-apply scoped reviews found no operation blocker; they
are not model-diverse assurance. Record: `research/experiments/costfn/evidence/v2-public-access.json`.
Policy races and later key replacement remain procedural exclusions, not CAS or
storage-enforced immutability. No L3/L4, whole-bucket or whole-security PASS.

## Feed source integration candidate (08.11.2026) — bounded local, OPEN

Private catalog, separate credential-generation approval, source-query transport
and source-owned media paths. Fresh bounded L1/L2 review reproduced removed-consent
resurrection and normalized/encoded credential URLs; three retained regressions
fail before repair and pass afterward. [Candidate record](scans/2026-11/feed-source-integration.md).
Convergence/diverse review, split PR/CI, actual two-node/browser grants and broader
L3/L4 coverage remain OPEN. No released activation or whole-security PASS.

## Music live playlist pointers (08.11.2026) — bounded feature review, OPEN

GPT-6.1 Sol read the new `musicLibrary.ts`, Music browser/reaction controls and
their direct CRUD/group/auth-contract seams. The node read gate and role tables
are unchanged. New bookmark documents attach only to the human's own followers
group; canonical member/reader roles expose posts/profile, not this app service.
Client tests cover exact owner scope, personal author filtering, duplicate removal,
failed-read/no-create, pagination, denied metadata, unmount/account fencing and
reaction follow-on write denial. Consent and access-oracle service lists match.
These are local client controls, not an actual-node private-read denial receipt,
independent security review or L1–L4 campaign PASS. Connected consent upgrades,
two-account bookmark denial and target revocation remain OPEN in the Music lane.
Contract: [music-social-library.md](../strategy/music-social-library.md).

## API contact delivery (08.11.2026) — bounded local, OPEN

#1435 is merged; all functional CI passed but its method-size check failed.
This is not a general gate waiver. A bounded 5.4.1 read-only preflight follow-up
has seven offline controls and no live requests; it reports configuration only,
not independent storage/provider/reset acceptance.
Three fresh same-family scoped preflight reviews are dry; model-diverse sign-off
and actual transport/live acceptance remain separate OPEN gates.

Gmail/SendGrid/optional SMS provider setup, encrypted private conditional S3 state,
single-use email link/code exchange and configured-issuer recovery ownership.
Backend-first new-module inspection and targeted direct-seam tests; broader L2–L4,
diverse review, bounded PR splitting and live provider/account/deployment gates
remain OPEN. Fresh reviews found wrong-node recovery dispatch, post-reset routing
and stale-link attempt charging; bounded regressions and repairs are recorded in
[contact delivery](scans/2026-11/contact-delivery.md). Actual disposable MinIO
CAS/encryption/anonymous403 evidence is separate from synthetic provider/browser
controls. No whole-security PASS or live delivery claim.

## Isolated explicit-node transport (08.11.2026) — bounded local, OPEN

Credential ownership, exact-origin/action dispatch, owned cancellation, bounded
streams/queues and safe error/log controls. [Split record](scans/2026-11/explicit-node-transport.md).
Refreshed-base 317 SDK tests/typecheck and three fresh same-family scoped dry
reviews pass; diverse/connected assurance remains separate.
Not exported or wired into production. Real destination consent, browser grants,
connected two-node tests, global fan-out bounds and diverse L1–L4 sign-off remain
OPEN; no new server authorization or whole-security PASS.

## Foreign self-service foundations (08.11.2026) — bounded local, OPEN

Exact certified foreign self-membership and own app-grant routes, with local-key
compatibility, request-versus-invitation admission and delegated revoke-all key
retention controls. Two inherited admission/revocation failures are replayed and
repaired; refreshed-base 2,171 API tests plus eight subtests pass, one opt-in skip.
Three fresh same-family scoped dry reviews retain the broader diverse/connected
gates. Scope, repro and
fresh split-branch validation: [record](scans/2026-11/foreign-self-service.md).
No SDK/UI/DNS integration in this unit. Real issuer/storage/browser/concurrency
and model-diverse L1–L4 sign-off remain OPEN; no whole-security PASS or deployment.

## PostHog capture/configuration (08.11.2026) — bounded local, OPEN

09.11.2026, GPT-6.1 Sol: bounded shared-adapter/pinned-SDK follow-up reproduces
discarded Meta events and masked/inert CSS. Original-HEAD controls plus six
desktop/375px real-SDK/intercepted-wire playback fixtures pass after repair;
private sentinels remain absent. Public social/marketing bundles still contain
the old callback. No backend/auth change, production/vendor write, hosted-player
acceptance or independent review. Scope/results/limits in the linked scan;
L1–L4 and release status remain OPEN.

5.0.0 continuation adds canonical opaque identity, signed source metadata,
atomic account-row signup context, worker acks/health, vendor-report provisioning
and optional masked replay/heatmaps; removes legacy integrations by instruction.
Freshness/local issuer/current-account/delegated-client denials, stale-reply
fences, real ClickHouse lifecycle/ack floor and real SDK snapshot/heatmap sentinel
checks pass locally. Anonymous identities deliberately stay separate; public
vendor ingest remains forgeable. Connected P5 acceptance ran live on dev and
prod 08.11.2026 (5.0.5): journey-account 403 on the admin health seam verified
the I5 floor in production; uuid-oracle agreement and live HogQL passed on both
nodes. D106 (5.0.6, 08.11.2026): replay moved to layout-faithful/
content-blind — attribute blocklist instead of blanket strip; pinned wire test
and real-SDK class-survival/sentinel checks re-pass, live recording pending
operator playback inspection. Phone/restart/quota drills, replay playback
inspection, independent review and L1–L4/rollout remain OPEN. Details and historical
4.15.0 scope follow in the linked scan; no production or independent-audit claim.

GPT-6.1 Sol adds optional public project config and browser capture, not account
identity or new authority. Backend-first field/response inspection and local
negative tests cover personal-key redaction, arbitrary-host rejection, default-off
selection, allowlisted events/metadata and safe startup failure. Real Chromium/
SDK intercepted-batch verification covers all three adapters; private query/
conversation sentinels are absent and selected PostHog makes no legacy requests.
Replay/autocapture/person profiles remain off. Scope, failed probe explanations
and remaining gates: [posthog-capture.md](scans/2026-11/posthog-capture.md).
Independent review, full L1–L4, live vendor/account journey and rollout remain
OPEN; no whole-telemetry privacy/security or analytics-readiness claim.

## Production readable-resolution promotion (08.11.2026) — bounded local, OPEN

GPT-6.1 Sol checks the generic helper/query selection, validated production
setting, bounded batched candidate SQL and deployment/research wiring. The
[bounded record](scans/2026-11/readable-resolution-default.md) retains the
performance regression, independent expected permission sets, real ClickHouse
24.8.14.39 Memory-history differential results and command budgets. All 2,089 API
tests plus eight subtests pass with one opt-in skip. This is changed-hunk/direct
call-path coverage, not full-file L1–L4 closure. Real MergeTree lifecycle,
concurrent permission mutations, diverse review and approved deployment/load
verification remain OPEN; no authorization-policy tightening or production claim.

## Link-unfurl SSRF surface (07.11.2026) — bounded local, OPEN

A new browser-facing external-fetch seam: `GET /preview/unfurl?url=…` on the
social app's own preview server (D60 — the node never fetches external urls).
The endpoint is attacker-influenced, so it carries the full SSRF guard set:
scheme/shape refuses (no credentials, no single-label/docker/mDNS hosts),
resolve-then-judge (EVERY resolved address must be public — loopback,
RFC1918, CGNAT, the cloud-metadata link-local, TEST-NET, reserved, and the
IPv6 twins incl. the v4-mapped forms), `redirect: 'manual'` with a per-hop
re-validation + 5-hop cap (the redirect-to-127.0.0.1 escape is replayed and
denied — the fixture's own API port is the target and its request log stays
empty), 8s/6s per-hop timeouts, 750KB/256KB byte caps (a truncated body keeps
the head — the preview tags are the first bytes), a 7d/10m positive/negative
cache, and a 60/min per-client-IP damper (429). The oEmbed `html` is
parsed, never executed: the iframe src is entity-unescaped and
per-provider-allowlisted on BOTH sides (server `unfurl.mjs` + SPA
`unfurl.ts`); a wall ("Client Challenge" / `_fs-ch-`, the Bandcamp edge's
verified refusal of this fetcher) degrades to the plain link, never a
wall-shaped card. Coverage: `scans/2026-11/link-unfurl-ssrf.md` (L1/L2
bounded, replay-gated; 62 + 13 focused tests green). The DNS-rebinding
resolve-then-fetch window stays OPEN (documented, blast-radius contained:
the preview server holds no credentials, reads only anon-public docs);
the production-box live provider matrix (Bandcamp's TLS-fingerprint wall)
stays OPEN for the deploy acceptance. No node surface, no production write.

## People-tag notification feature (05.11.2026) — bounded local, OPEN

GPT-6.1 Sol adds app-owned local tags without changing API/SDK read authority.
L1/L2 bounded review covers new tag extraction/rendering, mutation indexes,
notification query/CRUD readers and their UI navigation. The index selects
candidates only; current readable text determines whether the tag exists. New
live nudges ignore the supplied actor/time and re-read canonical documents;
unreadable sources, self-tags, stale indexes and cross-post reply parents are
denied in local controls. Source-specific keys keep two replies independently
readable. Code/email/link exclusions and sanitized profile links are tested.
The real safe-query compiler accepts the indexed comments self-join and injects
the existing readable-service CTE. No actual ClickHouse execution, two-account
connected receipt, comprehensive L1–L4 PASS, diverse review or rollout claim.

Autocomplete continuation: both comment entry paths and the caption adapter use
the same picker. Directory paging stays on the existing readable directory;
optional avatars use one author-scoped profile prepare, never viewer-owned media.
Obsolete queries/IME/scope changes and code/email/link exclusions are controlled
locally. Off-page anchors use normal per-document reads, same-post validation,
cycle rejection and a 32-document bound. A source-mapper defect exposed by those
tests is repaired: reply `body.post_id` precedes its parent `ref_value`.

The disposable `screenshots/mentions-api.py` run now verifies actual source SQL
on real ClickHouse 24.8 through FastAPI ASGI: readable directory, exact post,
comment and two distinct reply rows, public non-member access, private denial,
grant/revocation and parent-tag removal. Seven checks pass and the owned
container is verified removed. The initial image-bootstrap restart race is
handled; the existing `updated_at` schema-ensure warning remains in the log.
This supersedes only the previous lack of actual-storage evidence. It is not
browser app-contract/consent, connected P2P, comprehensive L1–L4 PASS, diverse
review, production or rollout acceptance.

## Cross-site media recovery (05.11.2026) — bounded local, OPEN

GPT-6.1 Sol implements transport-injected original-read recovery across the
marketing/social media renderers, retaining node authorization, signing and
TTL semantics. See `../strategy/media-reliability.md`. In-memory exact-resource
bindings are fenced at dispatch, replay and delayed UI restoration by credential,
identity generation and pathname; matching a decoded resource/expiry is never
authority. Tests deny missing/foreign replacement, obsolete-account completion
and delayed native playback, and pin bounded single-flight/stalled demand.
One fresh same-family read-only review reproduces four lifecycle defects; its
follow-up reproduces two immersive continuation defects. All six have explicit
red→green regressions. These are bounded source/synthetic findings and repairs,
not actual-node authorization proof, L1–L4 PASS or model-diverse three-dry
sign-off. Review-sized splitting, independent convergence, actual connected
permission/device coverage and rollout remain OPEN; no production/configuration
change or expanded signing authority.

Final local verification: 2,034 social/299 marketing tests, both builds and
the default renderer ownership gate pass. Fifty-six real-browser synthetic
image/error/offline cases, eight actual Chromium full/immersive synthetic HLS
segment-403/renewal/position cases, the Music-context MP3/403/Retry receipt and
stalled-preview HTTP cancellations pass at desktop/375px. Last narrow
same-family follow-up reports no remaining concrete P1/P2 within its repaired
scope; it is not model-diverse convergence. Source-reset timeupdate(0) before
metadata and a deliberate zero seek are independently pinned. No production
write, actual-node private authorization, physical phone or deployment claim.

## Music artwork routing/selection (04.11.2026) — bounded local, OPEN

GPT-6.1 Sol extends the existing preview URL mapping to query-based Music shares
and repairs pure API/SDK audio-cover selection plus saved-cover presentation.
The same canonical uploader/read/signing gates remain unchanged. New audio cases
exercise the existing real route/resolver with query/signing doubles, including
foreign-thumbnail denial; HTTP 403 stops preview thumbnail/profile calls. Real
nginx smoke verifies crawler query preservation, browser SPA and denied/bare
fallbacks against a synthetic API. No new authorization finding, L1–L4 PASS,
independent/model-diverse review, actual account artwork or rollout/cache claim.

## Content-thumbnail uploader repair (03.11.2026) — bounded local, OPEN

GPT-6.1 Sol reproduces the public Nosferatu watch card's brand fallback: normal
read carries a working poster, generic thumbnail returns null. Repair the generic
lookup's missing `posted_by` projection and the endpoint's owner selection without
changing its read gate or namespace signer. Real getter/route/resolver tests use
query/signing doubles, including spoofed body actor, foreign poster denial,
private no-resolution, legacy/personal authors and a non-social service. Initial
API selection/owner/media-file cases fail eight times; stronger unmocked-getter
composition independently fails three times before projection repair. Three
social headline tests also reproduce red before repair. Direct media and SDK/API
selection now return only image/poster candidates, preserving legacy missing MIME.
Final verification: 29 thumbnail cases, all 2,045 API tests plus eight subtests
(one opt-in skip), 1,878 social and 288 SDK tests pass; social/SDK production builds,
Ruff and whitespace checks pass. Existing deprecation/media/bundling warnings remain.

One fresh same-family read-only design-intent review finds no new defect and
checks all four getter call sites; not three-dry/model-diverse convergence. Public
anonymous image GETs download the actual film poster and attached still; watch
desktop/375px and Video/Posts checks find the exact poster. Initial stale image
fetches and a group-page browser failure are retained as failed diagnostics, not
passes; a separate public group detail GET is 200 with `join_to_view`. Full
deployed endpoint/crawler-cache/signed-in/all-surface and actual ClickHouse proof
remain OPEN. Existing tombstone prefilter/provenance/lifecycle debt is not repaired;
no L1–L4 PASS, production write or deployment claim.

## Social HLS renewal (03.11.2026) — OPEN

[Bounded read/review/browser record](scans/2026-11/watch-hls-renewal.md): original
carrier/exact-media fresh reads, scheduling-only expiry metadata and delayed
session/user-intent preservation. Same-family review reproduces four continuation
defects; local regressions and synthetic signed-HTTP Chromium evidence support
the repairs, plus a carousel routing repair. Feed/group/repost/lightbox/watch are
wired. All 1,857 social and 284 marketing tests/builds pass. Actual node/full-film/
Safari, excluded surfaces, model-diverse review, CI and rollout remain OPEN; no
L1–L4 PASS. Separate worker-budget tests and a local MinIO expiry characterization
are reliability evidence, not additional authorization/security findings.

## Resumable R2–R5 continuation (03.11.2026) — OPEN

[Bounded implementation/review/integration record](scans/2026-11/resumable-r2-r5.md).
Two fresh same-family read-only reviews reproduce five backend defects: consumed
completion observation/checksum disposition was repaired earlier; the new reviews
pin cancellation-after-claim failure, naive timestamps, stale deletion reads,
lost preparation on restart and concurrent confirmation overwriting later state.
Deterministic regressions and real MinIO/ClickHouse/FFmpeg/provider-browser evidence
support bounded repairs, not a dry/diverse review or L1–L4 PASS. Private state,
verified live actors and credential-free immutable creates remain the intended
boundary. Orphan cleanup, cross-process HLS, full app/film/player and release
review stay OPEN; default-off and 500 MiB are unchanged.

## Upload-Session R1 Foundation (03.11.2026)

[Bounded local evidence](scans/2026-11/upload-session-r1.md): internal/unexposed
private S3 conditional record store. Same-family review reproduced an encoded
write/read size mismatch and expiry-versus-result-recovery gap; local repairs
pin 24 cases, including lowered-limit replay and future completion-result
capacity. Final fresh same-family review is one dry pass, not convergence.
All 2,001 API tests plus eight subtests pass, one opt-in skip; Ruff passes.
Disposable real MinIO proves conditional writes, both ordered
completion/abort claim winners, concurrent reservation/lost-response replay and
exact result recovery across process/container restart. Supplied owner context
is not authentication; multipart IDs/results are synthetic. R2 auth/private
policy/provenance/cleanup, model-diverse review, rollout and L1–L4 remain OPEN.

## Resumable Upload Lifecycle (03.11.2026)

[Design inventory and preview evidence](scans/2026-11/resumable-upload-lifecycle.md)
by OpenAI GPT-6.1 Sol: existing backend single-POST path and client/harness seams
inventoried; no multipart gate exists yet. Synthetic account-switch and
browse-connectivity regressions fail before preview-only repair. Session/attempt
guards and actual picker/composer snapshot tests do not prove authentication,
storage durability or write authorization. R1–R6, real races/revocation and
independent review remain OPEN; no L1–L4 advancement or security PASS claim.

## D95 bulk-import retirement (03.11.2026)

GPT-6.1 Sol removes the importer rather than changing its permissions: routes,
models, parser, durable worker/boot hook, DDL/settings and social staging surface.
The old trace-isolation records below remain historical evidence for removed
code, not assurance about a currently deployed importer. No storage deletion,
production change, general auth/read-gate repair or L1–L4 PASS claim.
Four retired-route probes fail before removal and return 404 afterward; generic
document/media routes remain. Full API: 1,922 passed plus eight subtests, one skip.
Operator explicitly approves a deletion-only exception to the 500-line method
gate for this removal; full tests and other CI remain required. All 1,749 social
tests pass; PR CI remains a release gate. Existing job
tables, raw objects and staged documents are not purged or made public.
Fresh same-model bounded design-intent review finds no runtime defect and flags
the stale e2e shard entry, now removed. This is not diverse-model convergence or
a complete security scan. Existing staging grants are not revoked, queued jobs
stop resuming after rollout, and old clients lose these URLs; ordinary authorized
CRUD remains the retained-data path.

## Protected Media Delivery (02.11.2026)

New opt-in boundary: `api/app/services/media_delivery.py`, its existing signing
callers/HLS manifest integration, and `media-delivery/{core,cloudflare}.mjs`.
Local evidence: 1,786 API tests; 35 edge/cross-runtime tests with real RSA and
Python issuance, warm-cache denial before I/O, independently recomputed synthetic
SigV4, range isolation, bounded background caching and streaming-before-EOF.
Same-model review repaired CORS, premature HLS expiry and blocking cache writes;
re-review reports no concrete remaining finding in reviewed paths. This is
bounded implementation review, not complete L1/L2/L3/L4 or diverse-model sign-off.
State OPEN at all levels pending complete coverage and connected Cloudflare,
private-origin denial, browser playback/renewal, key rotation and production log
verification. No deployment, instant revocation or existing authority-debt closure.
Contract/gates: [media delivery](../web10-v3/media-delivery.md).

03.11.2026 deployment-wiring bite (GPT-6.1 Sol): inspect canonical Compose media
environment and SSH-deploy env-file/precedence seam. Six pre-repair real-Compose
failures become seven passing configuration/runtime probes: disabled/omitted
behavior, exact multiline synthetic PEM, key only in API environment, no build-arg
exposure, missing-key validation denial, rollback and ignored private stack files.
No API permission or signing change, live secrets/deployment or independent review.
Deployed dev acceptance and the broader release/security gates remain OPEN.

03.11.2026 connected update (GPT-6.1 Sol): fresh isolated IAD cache/origin-denial,
Chromium desktop/375px image/range and synthetic HLS, deployed test-key rotation
evidence; 41 local edge/interoperability tests pass. Actual API HLS handlers use
synthetic document authority, not real membership. **OPEN finding:** the intended
read-only Worker credential returns 200 for list and write in the synthetic bucket.
Exact account disabled, origin denial independently confirmed, local reuse
quarantined. No root/shared-password or existing-policy changes; broader authority
and ineffective-policy cause unknown. Two account-inspection attempts failed;
live diagnosis stopped. [Evidence and remaining gates](../../media-delivery/CONNECTED-ACCEPTANCE.md).
This is containment, not a repaired finding or complete scan/sign-off.

03.11.2026 follow-up (GPT-6.1 Sol): isolated credential finding repaired and
connected negative controls rechecked. Exact-version mc status-only updates omit
policy; MinIO IAM store removes the embedded restriction and inherits parent
authority. Guarded atomic policy+status official-SDK updates now inspect exact
scope before restoring delivery. Real GET 200/hash, list/write AccessDenied 403;
repeat ATL cache disable/restore retains policy and browser synthetic HLS passes.
42 edge/interoperability tests include six Python policy regressions; Ruff passes.
Root credentials remain remote; existing bucket policies/passwords unchanged.
Source links and failure history in the [connected record](../../media-delivery/CONNECTED-ACCEPTANCE.md).
Finding-specific operational repair only; full scan, real-node permission/renewal,
provider logs/limits and independent/diverse sign-off remain OPEN.

03.11.2026 additional connected evidence (GPT-6.1 Sol): isolated ClickHouse
24.8.14.39 and live HTTP HLS endpoint functions exercise actual owner/member/carrier
public/authenticated checks without permission stubs. Revocation, real parent/edge
expiry and explicit renewal controls pass; final 29 probes plus desktop/375px
Chromium playback, source hashes and verified teardown retained in the
[connected record](../../media-delivery/CONNECTED-ACCEPTANCE.md). Current outer-cache
and logging-example guards pass; subscription/account/zone export reads are 403,
so billing/logging audit remains incomplete. Initial document auth certification,
full-player seamless renewal, load/large-response bounds and independent/diverse
security review remain OPEN; no full level/surface PASS or production claim.

## Group Media Carrier Playback (03.11.2026)

[Bounded repair/evidence](scans/2026-10/group-media-carrier-repair.md): human
uploader identity, current carrier/link tuples and actual service/visibility gates.
Synthetic signed-manifest/SQL red-green plus isolated real production handler
reads restore four existing videos without data changes. Same-model review only;
serving rollout/browser playback, cost, diverse review and broader L1 remain OPEN.

## Pinned-Ad Hidden-Creative Authority (07.11.2026) — evidence only, OPEN

Follow-up at `c420b6f4c68a6465179ef527cdf0412212c2aca1` plus test/docs diff:
the operator explicitly requires one current readable unhidden creative
attachment for pinned delivery, regardless of carrier group. The
[fourteen-case policy matrix](scans/2026-11/h01-pinned-hidden-policy.md) adds
same-group, visible alternate and revoked/removed/crossed-grant controls; synthetic
carriers are persisted and independently checked by the actual full boundary.
Seven approved-policy denials still deliver bodies/verified capabilities, while
seven allowed cases remain. All fourteen cases pass on both SQLite and isolated
ClickHouse-local Memory tables. All 2,072 API tests plus eight subtests pass with
one opt-in skip; full Ruff lint/format pass. Fresh same-family review independently
passes all fourteen SQLite cases and three direct probes without a blocker.
This confirms a group-curation bypass, not global
secrecy or a direct-by-ID restriction. Policy block resolved; runtime repair,
real lifecycle/connected/CI/diverse review and protocol L1 remain OPEN.

Historical #1416 evidence and its then-unresolved policy follow:

GPT-6.1 Sol reviews `clickhouse.py:3265-3329` at
`80a8a1f2285e6b9bd6feceb527fd93ae582a247f` against all six checklist classes.
[H01-AD-HIDDEN-PROOF](scans/2026-11/h01-pinned-hidden-proof.md) reproduces two
hidden creative body/capability delivery discrepancies: actual compiler boundary excludes
the creative while pinned loader/registered read/real synthetic SigV4 delivers it.
Six cases pass on SQLite and isolated ClickHouse-local Memory, including newer
unhide, unrelated hides and independent group-author/uploader controls. Full API:
2,064 passed plus eight subtests, one opt-in skip; full Ruff lint/format pass. Runtime
unchanged; fresh same-family review confirms evidence but requires explicit
pinned-hide policy and same/alternate-group controls before security classification
or repair. D59 group curation is not global secrecy or a proven I3 breach.
Actual moderation lifecycle/driver/object retrieval,
broader attached-ad authority, CI/rollout/diverse review and protocol L1 remain
OPEN. Delivery assertions are evidence, not denied-green security controls.

## Node-Ad Document Authority (05.11.2026) — bounded local, OPEN

H01-NODE-DOC [local repair](scans/2026-11/repair-h01-node-document.md): rank
complete document/author history before deletion/tag eligibility, with deletion
winning timestamp ties. Five real synthetic signing failures reproduce before
repair and deny afterward, including both tie insertion orders and group authors.
Thirteen document cases pass on SQLite and isolated ClickHouse-local Memory;
public active/restored/retagged/reactivated inventory, pause suppression, identity
isolation and independent uploaders remain. Full API: 2,058 plus eight subtests,
one opt-in skip; Ruff lint/format pass. Fresh review recorded in the receipt.
Real writer/merge lifecycle, provenance, broader policy, CI/rollout, diverse
convergence and protocol L1 remain OPEN; no L2 advancement or deployed claim.

Historical pre-repair evidence (03.11.2026):

H01-NODE-DOC [evidence](scans/2026-10/h01-node-document-proof.md): current
compiler document subquery excludes deletion and returns latest declassified
tags; reference tag/status evaluation marks inventory ineligible, while actual
node loader/ASGI returns older content and verified synthetic SigV4.
Three disclosures; eight SQLite/ClickHouse-local cases retain pause suppression
and latest reactivation/restoration/retagging/public/uploader controls. Full API:
1,894 plus eight subtests, one opt-in lifecycle skip; Ruff and fresh same-model
review pass. No runtime repair, actual writer lifecycle or real-object retrieval.
Provenance/broader policy/CI/rollout/diverse/L1 OPEN; no L2 advancement.

## Node-Ad Attachment Authority (02.11.2026)

H01-NODE-LINK [local repair](scans/2026-10/repair-h01-node-attachment.md): current
Discover pair history before removal filtering, deletion-winning ties. Seven
synthetic capability disclosures now deny before attachment/signing. Twelve node
cases pass on SQLite/ClickHouse-local; active/reattached public inventory, pair
isolation and independent uploaders retained. 1,886 API tests plus eight subtests,
one opt-in lifecycle test skipped, full Ruff and fresh same-model intent review
pass. Document delete/detag, provenance, real lifecycle/CI/rollout/diverse and L1
remain OPEN. Historical pre-repair evidence follows; not whole-node-ad assurance.

H01-NODE-LINK [evidence](scans/2026-10/h01-node-attachment-proof.md): current-link
compiler fragment excludes a removed Discover attachment while actual node loader,
ASGI enrichment and real synthetic SigV4 still deliver/sign its creative. Six
cases pass on SQLite/ClickHouse-local, retaining intended public active/reattached
delivery, never-attached denial and independent uploaders. 1,880 API tests plus
eight subtests, one opt-in lifecycle test skipped, full Ruff and fresh same-model
review pass. Evidence only; runtime repair, broader attached-ad authority,
real-schema lifecycle/CI/rollout/diverse and L1 remain OPEN. No L2 advancement.

## DNS Account-Alias Verification (02.11.2026)

New trust-boundary surface: `POST /v3/domains/verify` + `release` (certified
token; the node resolves `web10.<domain>` itself via dnspython — bounded
records/size, exactly one claim, exact `web10.v=1;provider=...;user=...`
format, provider + username must match the authenticated caller) and public
`GET /v3/users/{username}/domain`. L2 evidence: 81 tests in
`api/tests/test_domains.py` — auth denied before any DNS lookup (missing/bad/
expired/anon/foreign/inactive/revoked-client), forged-claim parsing
(wrong provider/user, duplicate keys, multiple claims, oversized/non-ASCII
records), domain normalization (IDNA, IP literals, URLs), release mismatch,
row-copy SQL preserving the domain, and tombstone-safe reads on SQLite.
1,806 API tests + 287 UI tests, Ruff clean. The domain is an alias, not a
principal: usernames, tokens, groups and the I3 read gate are unchanged.
DNS/transfer trust limits (compromised resolver, domain transfer, no
permanent ownership guarantee) remain OPEN per
`web10-v3/identity/domain-identity.md`; not a whole-L2 PASS.

## Group Author Self-Target (02.11.2026)

3.257.0 bounded attachment continuation (OpenAI GPT-6.1): inspected the new
single-target route/model, direct role/app/storage calls, SDK and composer.
Signed-route denial controls include retained external create revocation red/green,
wrong service/role/app, human membership isolation, self lifecycle and removal
after revocation. Real isolated ClickHouse-local 24.8 ReplacingMergeTree replay
checks target removal/re-add and FINAL compaction with unrelated targets retained.
Threaded signed requests test different-target survival over doubled storage;
not real concurrent-engine proof. No full-file L1, complete L2/L3/L4, independent
review or security PASS claim. Finalization has shell, file and GitHub tooling,
but no reviewer-task/subagent interface; independent review remains unperformed.
Connected browser/revocation, same-target/legacy writer races and rollout stay OPEN.

Client mutation-affordance continuation (3.256.1, OpenAI GPT-6.1): inspected
groups/get and groups/list handlers, mutationAuthority, shared card/lightbox
consumers and document read/update attachment behavior. Corrected API-shape tests
reproduce false-denied edit controls (eight failures); membership-role repair
passes 65 focused social tests including denied roles, unrelated selected author,
lightbox/feed controls and real composer-to-updatePost retry. No backend changes,
new authority or complete L1/L2 scan claim. Safe full-attachment audience editing,
connected revocation, independent review and full-suite green remain OPEN.

[Bounded authorization repair](group-author-self-target.md): actual ASGI/signed
synthetic auth and real effective-role/write helpers reproduce self-target 403
and dropped attachment. Exact-self exception follows live human service/app
gates, with external-target isolation and server-set audit preserved. Explicit
update lifecycle, principal-class/wildcard and attachment-history controls added
after fresh same-model review. Retained-self authority now ranks current
attachments before tombstone filtering; actual SQL synthetic replay denies stale
reattachment. 635 focused/1,796 API tests plus eight subtests and full Ruff pass;
fresh same-model design-intent re-review passes the bounded change. Storage/app lookup doubles,
not whole L1/L2 coverage or a security PASS. Connected persistence/revocation,
CI/rollout and independent diverse review remain OPEN.

## Pinned-Ad Attachment Authority (02.11.2026)

H01-AD-LINK [local repair](scans/2026-10/repair-h01-pinned-attachment.md): rank
current document/group attachments before removal filtering, deletion-winning
ties. Removed creative delivery/signing now denied; reattachment, alternate-group
access and uploader controls retained. Twelve attachment plus ten membership
cases pass on SQLite/ClickHouse-local; 1,865 API tests plus eight subtests and
Ruff pass. Fresh same-model intent review passes the bounded change. Production
lifecycle/merges, other readers' ties, broader ad policy, CI/rollout/diverse and L1
remain OPEN. Historical evidence below describes the pre-repair source.

H01-AD-LINK [local evidence](scans/2026-10/h01-pinned-attachment-proof.md):
compiler attachment boundary excludes removed link while actual loader/ASGI
returns/signs its creative. Membership stays live, isolating attachment history
from repaired membership history. Four cases/backend, 1,759 API tests plus eight
subtests, Ruff and fresh same-model review pass. Actual ClickHouse-local reduced
Memory fixtures, not production schema/driver/lifecycle. Finding OPEN; no runtime
repair, real object retrieval or L1 PASS. Broader ad/CI/rollout/diverse gates OPEN.

## Pinned-Ad Membership Repair (02.11.2026)

H01-AD-MEMBER [local repair](scans/2026-10/repair-h01-pinned-membership.md):
latest reader/group membership before tombstone filtering, deletion-winning ties.
Five synthetic capability disclosures denied before attachment/signing on SQLite
and actual ClickHouse-local Memory tables. Ten cases/backend, 365 focused/1,755
API tests plus eight subtests, Ruff and fresh same-model review pass. Attachment,
broader creative policies, real-schema lifecycle, old URL TTL, CI/rollout/diverse
and L1 remain OPEN. Not whole-pinned-ad PASS.

## Pinned-Ad Membership Authority (02.11.2026)

H01-AD-MEMBER [local evidence](scans/2026-10/h01-pinned-membership-proof.md):
normal group gate denies a removed member while pinned-ad SQL returns its creative
through the read route with independently verified synthetic SigV4. Four history
controls pass on SQLite and actual ClickHouse-local 24.8.14.39/reduced Memory
tables; 1,749 API tests plus eight subtests, Ruff and fresh same-model review pass.
Finding OPEN, no runtime repair. Production schema/storage/merges, real object
retrieval, broader creative policy, CI/rollout/diverse and protocol L1 remain OPEN.

## Canonical Query Faces (02.11.2026)

H01-PREPARE-FACE [local repair](scans/2026-10/repair-h01-query-face.md): two
actual compiler/ASGI/resolver/real synthetic SigV4 disclosures now denied.
Canonical exact author/ref reads supply uploaders without requiring face IDs;
missing/ambiguous/error authority no-ops, output-column collisions return 400.
180 focused/1,745 API tests plus eight subtests, full API Ruff and same-model
review pass. SQL execution/driver and positive rendering remain doubled/unverified;
ad-loader/connected/CI/rollout/diverse/L1 gates OPEN. No whole-prepare PASS.

## Canonical Query Carriers (02.11.2026)

H01-PREPARE carrier [local repair](scans/2026-10/repair-h01-query-carrier.md):
server-written safe reads replace projected capability fields before media/ad
minting. Retained foreign-signing probes denied; canonical ad/HLS composition
preserves three uploaders for anon/auth. 163 focused/1,694 API tests plus eight
subtests, focused Ruff and same-model review pass. Face and ad-loader authority,
actual ClickHouse/connected/CI/rollout/diverse gates remain OPEN. No L1 PASS.

## Prepared Query Owner Authority (01.11.2026)

H01-PREPARE [local evidence](scans/2026-10/h01-query-owner-proof.md): compiler,
ASGI query handler, serializer/resolver and actual synthetic signer issue
independently verified foreign SigV4 capabilities for caller-fabricated owner/body
columns. Anonymous/authenticated positives; unprepared no-sign control. SQLite
substitutes only for constant SQL execution; no actual ClickHouse or retrieval.
Three probes, 1,672 API tests plus eight subtests, Ruff and fresh same-model
review pass. Finding remains OPEN, no runtime repair or protocol L1 advancement.

## Acting Identity (02.11.2026)

Acting-identity feature boundary work is recorded separately in
[`acting-identity-review.md`](acting-identity-review.md). State OPEN: local
endpoint/SDK/social controls, not exhaustive scan coverage, connected storage
evidence or independent sign-off. No protocol-campaign gate is closed by it.
Continuation review repaired deletion tombstone audit loss (failing generated-SQL
regression before repair) and frontend identity/authority mismatches. Final local
verification: 1,583 API tests plus eight subtests, 285 SDK tests, 1,584 social
tests, typechecks/build and desktop/mobile switcher inspection. Connected
multi-operator/revocation/concurrency and independent review remain OPEN.

## Reference HLS Mint Provenance (01.11.2026)

Reference repair merged #1312 at `66330ed99`, all 13 checks passed first attempt.
Historical local results below do not certify caller-selected owner authority.

H01-HLS-REF-MINT [local repair](scans/2026-10/repair-h01-hls-ref-mint.md): three
helper-minted JWT/HTTP synthetic segment disclosures denied at issuance. Each
main/ad/node-ad reference uses its own uploader context; stale URLs suppressed.
46 new controls, actual resolver/mint composition, 1,669 API tests plus eight
subtests, Ruff and fresh same-model review pass. Supplied-owner/legacy URL,
persisted/live playback, CI/deployment/diverse gates and L1 remain OPEN.

## Direct HLS Mint Provenance (01.11.2026)

Direct mint merged #1311 at `3b37e66c4`. Last observed CI was 12/13 green with
repeat Discover engagement E2E failure; merged does not mean all-green/deployed.

H01-HLS-DIRECT-MINT [local repair](scans/2026-10/repair-h01-hls-direct-mint.md):
helper-minted real foreign-prefix JWT retrieves synthetic segment bytes through
HTTP on baseline; repair denies issuance and removes stored manifest URLs.
24 new controls; 1,623 API tests plus eight subtests, Ruff and fresh same-model
review pass. Ref/ad mint, supplied-owner provenance, existing capability TTL,
live integration/CI/deployment/diverse review and protocol L1 remain OPEN.

## HLS Variant Provenance (01.11.2026)

Variant repair merged #1309 at `1dda69ecf`, all 13 checks passed on first attempt.
Historical local results below do not establish deployment or whole-HLS closure.

H01-HLS-VARIANT [local repair](scans/2026-10/repair-h01-hls-variant.md): two
actual HTTP/JWT synthetic manifest disclosures denied before storage access.
Uploader-owned raw key, signed prefix and exact worker rendition key must agree.
28 new controls; 1,599 API tests plus eight subtests, Ruff and fresh same-model
review pass. HLS mint/segment provenance, services/CI/deployment/diverse sign-off
and L1 remain OPEN. This is not a whole-HLS repair.

## Raw MinIO Ownership (01.11.2026)

Raw repair merged #1307 (GitHub mergedAt `2026-11-02T02:09:20Z`); historical
local checkpoint below is not deployment evidence.

H01-RAW [local repair](scans/2026-10/repair-h01-raw-owner.md): real synthetic
SigV4 baseline foreign mint denied; explicit owner and independent document/ad
contexts, stale suppression and no client for invalid keys. Review identified
and repaired ad-loader posted_by propagation with two red/green compatibility
controls. Final 347 focused/1,570 API tests plus four subtests and lint/format
pass, fresh same-model recheck. Caller-owner authority, HLS/legacy URL provenance,
services/CI/deployment/history/diverse sign-off and L1 remain OPEN.

## Metadata Signing Ownership (01.11.2026)

Metadata repair merged #1306 at `f3cacbff42a15980969d920d12f9cc9652a4dfda`,
all 13 checks green on first CI attempt. Earlier local checkpoint wording below
is historical; the raw sink repair above is merged, not deployment-verified.

H01-META [local one-sink repair](scans/2026-10/repair-h01-metadata-owner.md):
original/thumbnail owner namespace enforced before signing; two real synthetic
SigV4 baseline mint failures denied, 335 focused/1,533 API tests plus four
subtests and lint/format pass, fresh same-model review. Valid companions,
posted_by and keyless legacy paths retained. Recursive minio/other provenance,
CI/services/deployment/history/diverse sign-off and protocol L1 remain OPEN.

## Direct Media Signing (01.11.2026)

Direct repair merged #1305 at `d5f06c6d07def9eb7cb78c4480e1d79209c239d0`, all
13 checks green on first CI attempt. The local wording below is historical;
other signing sinks, production/rollout and diverse gates remain OPEN.

H-01 [local route repair](scans/2026-10/repair-h01-direct-media.md): actual
JWT/HTTP plus independently verified real synthetic SigV4 capability on baseline;
foreign keys now denied before bucket/signing. Owner unconfirmed/derivative
and existing document/thumbnail paths retained; 503 focused/1,477 API tests plus
four subtests and lint/format pass, fresh same-model review. Stored-reference
provenance, real services/CI/deployment/history/diverse sign-off and L1 OPEN.

## Credential-Free CORS Pin (01.11.2026)

B-3 default and B-5 test work merged #1303 at
`e56d25304301b0eb4eb502506980dd68563635c6`. All 13 final checks green after
the documented setup/trending retries; no repaired transient-cause claim.
The local checkpoint text below is historical; broader gates remain OPEN.

B-5 [local route pin](scans/2026-10/b5-cors-credential-pinning.md) adds 13
actual-app controls beyond existing preflight coverage. Eighteen CORS/1,470 API
tests plus four subtests, lint/format and fresh same-model review pass; in-memory
CORS/principal mutations fail as expected. No runtime fix, browser/whole-API
assurance, integration/deployment/diverse sign-off or L1 PASS.

## Verified Decoder Default (01.11.2026)

B-3 [local default repair](scans/2026-10/repair-b3-default-decode.md): eight
default-decoder acceptance failures plus one signature assertion become green;
31 new/175 focused and 1,457 API tests plus four subtests and lint/format pass.
Fresh same-model review inventories 13 explicit production choices and preserves
unsigned metadata behavior. No demonstrated endpoint bypass or issuer migration;
class-wide authority audit, CI/deployment/diverse sign-off and L1 remain OPEN.

## Group-as-Author Write Gate (01.11.2026)

The `POST /v3/create` endpoint gains an optional `author_as` field (the
group-as-author delegation path). Two independent gates enforce the trust
boundary: (1) the caller must hold a role in the group that grants `create` on
the service (`effective_role_perms` + `_effective_allows` — the D58
per-service role map); (2) the group must be able to write in each target group
(`can_write_group`, principal = group_id — the existing D58 write gate, just
pointed at the group instead of the user). The app-contract gate runs on the
real author (the token holder), not the group. Moderation checks the real
author (`posted_by`), not the group. The `posted_by` column is server-set from
the JWT — the client cannot forge it. 1345 API tests green (including the
existing permission-matrix suite + two new update-path tests). L1 file-scan of
`documents.py` + `clickhouse.py`: no new trust-boundary surface beyond the two
existing gates; the `author_as` field is validated before any write; the
`posted_by` column is never read from client input. The `POST /v3/update`
endpoint gains a two-pass lookup for group-authored posts (first by author_key,
then by posted_by) with the same Gate 1 check — a moderator who posted as the
group can edit their post; a non-member gets a 403. **OPEN**: L2 call-graph
scan (the import worker + bugbot also call `insert_document` — they pass
`posted_by=""` which is correct for non-group posts but not explicitly tested);
L3 service-scan; L4 project-wide. No C+I exploit replay (no new exploit class —
the gates are existing primitives re-pointed at a new principal).

## Backup Publication (01.11.2026)

Source repair merged #1301 at `30f9d49fc15b0b3cca0d928b129216f67b21fa69`;
all 13 final checks passed after dev merge, with 1,426 local API tests plus four
subtests. Local wording below preserves the earlier checkpoint, not merge status.
Trusted storage, deployment/history and diverse sign-off remain OPEN.

L1-PKG-02 [local repair](scans/2026-10/repair-pkg02-backup-publication.md):
real filesystem permission/link/overwrite repro, private same-directory staging
and complete no-clobber publication. Initial 8 failures/1 pass distinguish actual
behaviors from absent-operation controls; final 45 focused/1,420 API tests plus
four subtests and lint/format pass, fresh same-model review. Operational storage,
CI/deployment/history/diverse sign-off and protocol L1 remain OPEN.

## Evaluation Environment Type Repair (01.11.2026)

Bounded local repair in settings.py: the legacy override loop turned parsed
QUERY_EVAL flags into truthy strings, including explicit "0". Four subprocess
environment repro cases fail before the exclusion and pass after; 45 focused
settings/query tests plus eight subtests and Ruff pass. Connected private smoke
completes ten cells after repair. No public deployment, whole-service PASS or
public-node startup guard claimed.

## Query-Engine Evaluation Seams (01.11.2026)

`api/app/settings.py` + `api/app/v3/endpoints/query.py` gain three **test-mode**
env flags for the paper's access-control cost function experiment (the
three-line ablation, `research/digital-ocean-thinking.md`):
`QUERY_EVAL_STUB_EXECUTE` (+`QUERY_EVAL_STUB_ROWS`, line C — return a fixed
synthetic result instead of running the compiled SQL), `QUERY_EVAL_NO_POLICY`
(line A — skip readable-set resolution + boundary-CTE scoping, run the caller's
SQL unscoped; also exempts the D42 explicit-group membership 403), and
`QUERY_EVAL_READABLE_MODE` (`per-group` default | `batched` — select the
resolution algorithm). **All default OFF: production behavior is unchanged
unless a flag is set.** The flags are referenced as `ch.<name>` (attribute
lookup at call time) so existing test patches apply.

**Trust-boundary note (honest scope):** `QUERY_EVAL_NO_POLICY` *bypasses the I3
boundary* and `QUERY_EVAL_STUB_EXECUTE` *returns synthetic rows* — both are
deliberately dangerous and gated behind env flags that **must never be enabled
on a public node**. They exist only so the experiment can measure the policy
layer in isolation (C) and the causal overhead against a no-policy baseline
(A). The production default path (per-group readable + real execute + full
boundary) is untouched. This is an L1 file-scan disposition for the two touched
files, not an L1 PASS or sign-off on the query service; the I3 conformance suite
(`api/tests/test_v3_conformance.py`) still passes with the flags unset.
`test_query_endpoint.py::TestEvaluationSeams` (+6) pins: inert when unset, each
flag active when set, A unscoped + no 403, batched vs. per-group routing. Full
API suite 1349 passed + 4 subtests. No new credential surface, no token/payload
logging, no auth-path change. Deeper (L2/L3) coverage of the query service
remains separate debt.

## Manifest Destination Follow-Up (01.11.2026)

Source repair and direct dependency follow-up merged in #1299 at
`0918a7409141e2b42b3ffa81e9ff585550c3c5ad`; all 13 PR checks passed. Historical
local wording below describes the repair-stage evidence, not current merge state.
Rollout, actual registry/retained TLS/path integration and diverse gates remain OPEN.

L1-A-02 [local source repair](scans/2026-10/repair-a02-manifest.md): approved
public-only registration/DNS, numeric connection pinning, canonical Host/TLS
verification and redirect refusal. Four initial exploit failures denied; 70 focused
controls, 1,407 API tests plus four subtests/Ruff pass, fresh same-model review
and ephemeral actual-TLS probes. Retained TLS/path integration, actual registry,
CI/deployment/history and diverse sign-off remain OPEN; no L1 PASS.

01.11.2026 L1-A-02 [bounded follow-up](scans/2026-10/l1-manifest-destination-followup.md):
real Requests/loopback HTTP reproduces direct and redirected internal JSON reads
from the actual handler body; eight controls pass after same-model review.
That historical follow-up made no runtime fix or deployed/whole-file claim;
the local repair above supersedes its vulnerable behavior, not the L1 OPEN status.

## Docs RTC Producer (29.10.2026)

RTC-ICE [local repair](scans/2026-10/repair-rtc-ice.md) now passes selected ICE
through PeerJS's consumed `config.iceServers`. Nine baseline failures become
19 passing RTC controls; 284 SDK tests/typecheck and fresh same-model contract/
design review pass. RTC outputs regenerated with main SDK/legacy artifacts
untouched. Dependency-contract fixture only, not actual PeerJS/network proof;
connected/image/rollout/diverse gates remain **OPEN**, no C+I exploit or L1 closure.

L1 artifact disposition remains **OPEN**. [Provenance research](scans/2026-10/l1-artifact-provenance-followup.md)
traces retained declarations and the stale docs RTC consumer; the
[local producer repair](scans/2026-10/repair-docs-rtc-producer.md) adds a tracked
wrapper, pinned build and parity/CI controls without deleting legacy outputs.
Five stale-output failures become 14 passing controls; 279 SDK tests/typecheck
and fresh same-model review pass. Review identifies separate effective ICE debt:
PeerJS consumes `options.config.iceServers`, not the core's top-level option.
PR #1294 initial source `3f481eb2f` passed all production Docker builds and four
E2E shards; this is CI evidence, not deployed/cache or diverse-sign-off closure.
The initial method check correctly rejected the missing central record update;
this entry supplies it without changing the gate or claiming L1 PASS.

## Sol Resumption (28.10.2026)

CORRELATION/STALE-READS [local repair](scans/2026-10/repair-account-read-ownership.md):
five account display reads plus service/admin timers now use identity generation,
current principal/token and per-surface ordering. Initial 24 failing cases, final
52 account-read/268 total UI passes and build; fresh same-model retained-client/
ordering replays pass. Connected browser, mutation coverage, rollout/diverse
review and L1/class sign-off remain OPEN; no server auth bypass claimed.

Consent lifecycle [post-merge repair](scans/2026-10/repair-consent-postmerge.md):
explicit logout cancels untouched requests; popup close checks current-client
token, principal, batch and handoff generation. Seven initial failing controls
repaired, 216 UI tests/34 ownership cases and build pass locally. Fresh same-model
review; connected E2E and broader stale-read ownership remain OPEN, no class PASS.

L1-OAUTH-SOURCE-01: [local source certification repair](scans/2026-10/repair-oauth-source01.md)
denies uncertifiable sources before code minting; twelve new controls and 1,343
API tests plus four subtests pass. Fresh same-model review only. Real registry/
code-store behavior, broader delegation authority and rollout/diverse sign-off
remain OPEN; no full OAuth or protocol L1 PASS.

L1-VAL-01 has a [local source repair and red/green receipt](scans/2026-10/repair-val01-validation.md):
three actual-route disclosure cases denied, 1,331 API tests plus four subtests pass,
fresh same-model review. Deployment/history/model-diverse sign-off remain OPEN;
this updates the validation finding only, not the historical scan or L1 status.

At `49178a87dcd651337e7f17dea68b66f377ae2e05`, bounded Sol revalidation and
fresh same-model review confirm validation credential copies (L1-VAL-01), an
OAuth source-client authority inconsistency (L1-OAUTH-SOURCE-01), and remaining
consent correlation debt. [Ledger and scope receipts](scans/2026-10/l1-current-index.md)
record exact fresh reads, 167 focused API passes plus four subtests, SDK runner
limitations, artifact comparison and offline edge controls. Historical coverage
is not a fresh whole-project scan; all these units remain **OPEN**, with no L2
advancement, deployment assertion or model-diverse convergence credit.

## Current Protocol L1 Read Pass (27.10.2026)

[Current index/ledger](scans/2026-10/l1-current-index.md) records the exhaustive
selected manifest at `f7aabdb26346752141f46f19c393dbadfd25ddd2`: 171 paths/30,451
logical lines, 105 paths freshly read and 66 byte-equal historical paths. Exact
1,341-path exclusions, all six classes, runnable evidence and fresh same-model
reviews are linked there. This is read coverage, NOT L1 security PASS.

New local evidence includes OAuth expired-principal acceptance (same D-01 root),
conditional code single-use failure and operator Mongo URI credential output.
Real DB schema/merge/revocation effects and backup protection remain unverified.
Refresh-family invalidation is not a proven C+I exploit; deliberate gate exemption
is a policy/control limitation, not accidental auth bypass. All existing open
protocol findings, separate B-8 integration and required model-diverse review
remain blockers; no L2 advancement. Scan receipts pending publication. O10
follow-up at `1332abc678344d24dc6f85227549dda2b0bef9a9` rescans complete SDK v3/index
and changed artifacts: selected union now 171 paths/31,537 lines, other 160 selected
paths unchanged. [Fresh O10 review](scans/2026-10/l1-o10-review.md) keeps callback/
refresh observations conditional, first-use exchange as correctness, inherited
refresh selection distinct from repaired parsing. No new proven server C+I exploit.
Operator approved larger evidence PR; code/test CI limit unchanged, no exemption.

## Seed state — from the October 2026 audit

Source scan: [`scans/2026-10/`](./scans/2026-10/README.md) (invariant-driven,
`file:line` evidence). **Honesty note:** the hardening for most of these (PRs
1157 + 1159) is **in flight, not merged** as of this security record's date. Until they
land, the affected rows are **OPEN**, not PASS — a PASS would be a corrupted
measure. Re-scan after the hardening merges to flip them.

| Unit | Level | Status | Model | Date | Last-pass | Sys | Finding / note |
|---|---|---|---|---|---|---|---|
| D97 public domain-follow prototype proof | L4 | **OPEN** | OpenCode / GPT-6.1 Sol + fresh same-model reviewer | 2026-11-03 | — | research-client | Committed integration0932d6643940, empty patch: actual local TXT claims, one persisted website follow, old API/TLS loss, new account/reload public posts; desktop/375px, old-private200/new-private403, five delayed-real-response lifecycle seams and credential-free reads pass. Exact sources/inputs/config history/10 captures/cleanup and same-commit default IAM regression retained; fresh bounded review passes. Three component merges/CI and merged-source replay remain gates. Not production/social integration, broad L4/L1–L4 or diverse assurance; lab TLS/DNS/grant and DNS-control/availability limits disclosed. |
| D97 local DNS/runner fixture | L1 | **OPEN** | OpenCode / GPT-6.1 Sol + fresh same-model reviewer | 2026-11-03 | — | research-fixture | Synthetic secret-gated fixed-zone control, real UDP TXT/JSON parity, no private file/env serving; four loopback controls pass. Frontend-only loopback publishing/browser bridge, internal API/DB/storage, default IAM assertions and project-scoped teardown retained. Prototype port/publication failures diagnosed; final connected component proof is recorded separately. No host/public DNS or production credentials; no complete scan/diverse assurance. |
| D97 research domain-follow client/UI | L1 | **OPEN** | OpenCode / GPT-6.1 Sol + fresh same-model reviewer | 2026-11-03 | — | research-client | Fixed home authority, lab provider allowlist, anonymous public target reads, verified alias, bounded response/rendering and captured UI generation. Two continuation races fail before checks and pass afterward; 22 offline client controls pass. Separate connected fixture/proof records do not establish complete coverage/diverse review or production social integration. Domain control is public destination choice, not private-principal continuity. |
| Local group-list owner healing follow-up | L1 | **OPEN** | OpenCode / GPT-6.1 Sol + fresh same-model reviewer | 2026-11-03 | — | groups | #1360 merged with all checks passing after retained red→green bare-only repair. Later actual two-node run passes on merged dev 0acc771e2efc with zero-byte patch, one owner after list and verified lifecycle/cache/cleanup receipts; fresh bounded review passes. Existing-row reconciliation and diverse/full-file assurance remain OPEN. Historical #1351 method failure is not waived. |
| H isolated cross-node correctness | L4 | **OPEN** | OpenCode / GPT-6.1 Sol + fresh same-model reviewer | 2026-11-03 | — | federation | Local H-REPLAY receipt gate satisfied on clean merged dev 0acc771e2efc after #1360, zero-byte patch and no overlay. Full unchanged TLS/two-node/cache/read/query/namesake/app/grant-removal controls and cleanup pass fresh bounded review; all 1,929 API tests plus eight subtests pass, one opt-in skip. Three source-specific success archives and initial failure remain separate: research/federation-demo/RESULTS.md. Normal PR CI, complete L4/L1–L4 coverage/model diversity, A/C, production keys/public deployment, browser consent, issuer expiry/revocation, multiworker/restart/media remain separate OPEN gates. |
| `api/app/services/auth.py :: decode_token` | L1 | **OPEN** | (audit) | 2026-10 | — | auth | B-3 unsigned decode path; B-1 I1 symmetric HS256. Hardening in 1157 (unmerged) |
| `api/app/settings.py` | L1 | **OPEN** | (audit) | 2026-10 | — | config | B-2 secrets in source (signing key + Stripe/Twilio/CH creds). Hardening in 1157 (unmerged) |
| `api/app/middleware.py` | L1 | **OPEN** | `gpt-6.1 sol` | 2026-10-18 | — | logging | B-4 source repair merged #1225 with passing repro gate. [Evidence](scans/2026-10/repair-b4-middleware.md). Deployment, historical exposure and required security sign-off remain unclosed; no whole-file PASS. |
| `api/app/main.py :: CORS` | L1 | **OPEN** | OpenCode / GPT-6.1 Sol | 2026-11-01 | — | boundary | B-5 [selected-route pin](scans/2026-10/b5-cors-credential-pinning.md); existing preflight retained, browser/integration/diverse gates OPEN |
| `api/app/v3/services/clickhouse.py :: read path` | L1 | PASS | (audit) | 2026-10 | — | query-engine | I3 read gate on lock (the crown jewel holds) — `can_read_group` / `effective_role_perms` |
| `api/app/v3/services/safe_query.py` | L1 | PASS | (audit) | 2026-10 | — | query-engine | I3 wall for caller SQL on lock — boundary on input CTEs, not output filter |
| `api/app/v3/services/clickhouse.py :: get_document_any_author` | L1 | **OPEN** | (audit) | 2026-10 | — | media | B-6 reads without author scoping; bounded by doc-bound sig — verify sig checked first |
| `api/app/v3/services/clickhouse.py :: node_ad_performance` | L1 | PASS | `qwen3.8-27b` (OpenCode) | 2026-10-18 | — | analytics | Read-only aggregate over `content_events` for node-ad docs (D57); admin-gated at `POST /admin/analytics` (`check_admin`); no new I3 surface (no author-scoped read — the operator reads the node's own ad inventory); per-ad rows carry doc_id + counts only (no content, no PII); CH failure degrades to `null`. Repro: `api/tests/test_node_config.py` (live node ads incl. per-ad rows; `node_ads: null` with no inventory; non-admin 403). |
| `api/app/v3/services/import_worker.py` | L1 | **OPEN** | `gpt-6.1 sol` | 2026-10-18 | — | import | Historical D90 review is superseded by [J](scans/2026-10/l1-api-j.md)/[K](scans/2026-10/l1-api-k.md) at `8af7e0fce`: L1-J-01 copies A's logs into overlapping B trace insert arguments. Owner-gated reads do not fix stored misattribution. No live cross-owner disclosure or fix claimed. |
| `sdk/src/browser.ts :: authListen` | L1 | **OPEN** | (audit) | 2026-10 | — | sdk-auth | S-1 `postMessage` token accepted with no origin check. Hardening in 1159 (unmerged) |
| `sdk/src/v3.ts` (token-in-body) | L1 | **OPEN** | (audit) | 2026-10 | — | sdk-auth | S-2 token in JSON body — composes with B-4 (body logged). By design; the log is the risk |
| `sdk/src/http.ts :: authGet` | L1 | **OPEN** | (audit) | 2026-10 | — | sdk-auth | S-3 `byUserGroups` sends no token — functional gap, not a leak |
| `sdk/src/token.ts :: decodeJwt` | L1 | PASS | (audit) | 2026-10 | — | sdk-auth | S-4 unsigned base64 decode — acceptable for reading claims; doc: never for authz |
| `sdk/src/token.ts :: cookie` | L1 | PASS | (audit) | 2026-10 | — | sdk-auth | S-5 `SameSite=Lax`+`Secure`, no HttpOnly (impossible by design), 60-day — acceptable, noted |
| `api/app/v3/endpoints/groups.py :: POST /v3/groups/list` | L1 | PASS | `qwen3.8-27b` (OpenCode) | 2026-10-19 | — | groups | Owner-row self-heal on the /list read (the dead-group ratchet breaker, 3.237.1): for every user-created group (`{provider}/groups/users/{creator}/…`) in the caller's list, the creator's member row is re-pointed to `owner` when missing or non-owner. Gated on `creator == caller` (the creator is parsed from the group_id; another user's group is never touched — a follower's read of a followed group is read-only). The write is the same `add_group_member` the /join endpoint uses (a current `owner` row; latest-row dedup makes it win). No new read surface (the /list response shape is unchanged), no I3 change (the healed row only restores the creator's own access to their own group), no admin path. Repro: `api/tests/test_v3_endpoints.py::TestListGroups` (heals the caller's own followers group; never another user's) + `api/tests/test_v3_clickhouse.py::TestHealFollowersGroupOwner` (missing row → owner, already owner → no-op, drifted member → re-pointed, missing group → no-op, no owner role → no-op). |
| `api/app/v3/endpoints/oauth.py` (client registry, D92 O1) | L1 | PASS | `qwen3.8-27b` (OpenCode) | 2026-10-22 | — | oauth | OAuth 2.0 client registry (the delegated-access foundation): `oauth_clients` ClickHouse table (ReplacingMergeTree + tombstone) + admin-only register/list/lookup/revoke under `/v3/oauth/clients/`. `register` + `list` + `revoke` are `check_admin`-gated (non-admin → 403); `lookup` is unauthenticated but returns only public fields (`client_id`/`client_name`/`redirect_uris`) — the `client_secret` is minted via `secrets.token_urlsafe(32)`, returned exactly once at register, and never returned by list/lookup. Redirect URIs are https-only + exact-match (validated at register). No token claim, no `certify`/`has_permission` change yet (the Origin→client_id re-keying is O2/O3), so no new I3/I5 surface. Repro: `api/tests/test_oauth_clients.py` (15: admin register mints secret, non-admin 403 on register/list/revoke, non-https redirect rejected, list omits secret, lookup 404 on missing/tombstoned, revoke tombstones). |
| `api/app/services/auth.py :: certify` (delegation gate, D92 O2) | L1 | PASS | `qwen3.8-27b` (OpenCode) | 2026-10-22 | — | auth | OAuth 2.0 delegation gate at the verification seam: `TokenData` gains an optional `client_id` claim; `certify()` verifies — when `client_id` is present — that the client exists and is active (not tombstoned) via `ch.get_oauth_client()`, else `TOKEN` (401). Tokens without a `client_id` (the popup flow) skip the check entirely — today's behavior, byte-for-byte (I1 signature/provider/expiry checks unchanged and run first). Strictly *tightens* the gate for delegated tokens (a revoked/unknown client can no longer certify); no new read surface, no I3 change, no weakening of any existing invariant. The Origin→client_id `has_permission` re-keying is O3 (not yet landed). Repro: `api/tests/test_auth_services.py::TestCertify` (5: normal token passes, active client passes, missing client → TOKEN, tombstoned client → TOKEN, expired token still rejected). |
| `api/rtc/` (admission) | L4 | **OPEN** | — | — | — | rtc | RTC socket admission / certify gate (cross-service RTC↔API) — see `BP-3`. Hardening in 1159 (unmerged) |
| `ui/src/components/CredentialPage/` (auth forms) | L1 | PASS | `qwen3.8-27b` (OpenCode) | 2026-10-26 | — | auth-ui | Autofill-hostile formless login repaired (3.242.0): the credential forms (login / signup / recovery / change-password) were divs + a button whose click handler scraped the DOM by id — no `<form>` for a password manager to key off (the 1Password grant landed an empty `web10.app` entry with nothing to fill). Now real `<form>` elements with a `type="submit"` button (`onSubmit` + `preventDefault` keeps the SPA flow) + `name` attrs on the inputs. **No invariant change** — no token/credential handling altered, no new read surface, no I1–I6 surface touched (the values still come from the same DOM the click handler used to scrape). Repro: `ui/src/__tests__/authFormsAutofill.test.tsx` (8: the `<form>` element + `type="submit"` + `name` attrs across all four surfaces; submitting the form drives `login`/`signup`/`recoverRequest`/`recoverVerify`/`recoverComplete`). |
| `sdk/src/v3.ts :: oauth` (w.oauth(), D92 O10) | L1 | OPEN | Initial `qwen3.8-27b`; fresh `openai/gpt-6.1-sol` (OpenCode) | 2026-10-27 | — | sdk-auth | Shipped in 3.245.0 with 17 mocked helper tests; implementation completion is preserved, but the initial PASS is superseded by the [pinned source/artifact rescan and fresh review](scans/2026-10/l1-o10-review.md). Callback-result binding and refresh/client ownership remain conditional concerns; first-use exchange has a confirmed correctness gap, and inherited refresh selection requires additional ambient pollution. Original tests do not establish initial connection, browser callback integrity, real server authority or model-diverse sign-off. Confidential-client secrets remain caller-supplied; deliberate JS-cookie storage, caller-managed state and restoration semantics are not reversed. No new proven server C+I exploit or protocol PASS. |
| federation signing (I1) | L4 | **OPEN** | — | — | — | federation | B-1 / D7. PR #1351 implements live home-node certification, not merged or connected-verified. This does NOT close B-1: independent per-node secrets are required; the shared HS256 default still permits cross-node forgery. JWKS is optional for the operator-selected live-call model; issuer certification does not repair signing-secret provisioning. |
| Phase B certification continuation | L2 | **OPEN** | OpenCode / GPT-6.1 Sol + fresh same-model reviewer | 2026-11-03 | — | federation | Bounded helper/issuer/read/directory/transport repairs; seven initial, two directory and thirteen intercepted-transport repro cases fail before repair. 1,977 API tests plus eight subtests pass, one opt-in skip; Ruff and bounded re-review pass. See learnings 2026-11-03 and test_cross_node_continuation.py/test_certify_transport.py. Not whole-L2/L1–L4 coverage or diverse convergence. Actual TLS/two-node lifecycle, signing secrets, CI and oversized-PR method disposition OPEN; inherited agent exemption is not operator approval. |
| delegation model (I5) | L3 | **OPEN** | — | — | — | auth | scoped app-management delegation (within the API service). See `BP-2`. Hardening in 1157 (unmerged) |

## Commit-pinned L1 scans

These receipts supplement the seed audit; they do not upgrade unrelated seed
PASS rows to complete file coverage. `Scan commit` pins the source even for OPEN
rows; no successful fix/last-pass is implied.

| Unit | Level | Status | Model | Date | Scan commit | Sys | Evidence |
|---|---|---|---|---|---|---|---|
| `api/app/middleware.py`, lines 1-143 (whole file) | L1 | **OPEN** | `gpt-6.1 sol` (OpenCode) | 2026-10-18 | `d86658be6d9bb202bbab981a918a6b69c9bde966` | logging | [Receipt + synthetic PoC](scans/2026-10/l1-middleware.md). Existing B-4 reproduced: request/response tokens reach insert arguments; error JSON also reaches meta and detail reaches message. No fix, live DB proof, or independent convergence sign-off. |
| `api/app/settings.py`, lines 1-140 (whole file) | L1 | **OPEN** | `gpt-6.1 sol` (OpenCode) | 2026-10-18 | `8704e9f5c97968d9161c4f5f889c0d0fa0a8be6c` | config | [Receipt + redacted PoC](scans/2026-10/l1-settings.md). Existing B-2 defaults confirmed; new B-8 CLI secret dump reproduced. Boolean type erasure handed to L2, not claimed as a bypass. No fix, live credential validation, or convergence sign-off. |

## API L1 Campaign Receipts

[Coverage inventory](scans/2026-10/l1-api-index.md) pins the 59-file API app
denominator. Scope coverage is separate from vulnerability disposition and
three-dry sign-off. No campaign PASS is claimed.

| Scope | Source/date/model | Coverage | Disposition / evidence |
|---|---|---|---|
| A | `8af7e0fce`; 2026-10-18; `gpt-6.1 sol` | 794 lines | OPEN: [receipt](scans/2026-10/l1-api-a.md), L1-A-02 local manifest destination/JSON proxy primitive; sensitive-error sink remains unverified disclosure, not a confirmed protected-data leak. |
| B | Same pin/date/model | 622 lines | OPEN: [receipt](scans/2026-10/l1-api-b.md), L1-B-01 unsigned destination/status trust in remote helper; no production reference found. Existing B-1/B-3 bounded evidence, not a live bypass. |
| D | Same pin/date/model | 695 lines | OPEN: [receipt](scans/2026-10/l1-api-d.md), L1-D-01 expired-token principal production; L1-D-02 malformed/None expiry classified valid. No actual store mutation or CRUD grant demonstrated. |
| C | Same pin/date/model | 675 lines | [Receipt](scans/2026-10/l1-api-c.md): no confirmed local finding; caller/media provenance handoffs and sign-off pending, not PASS. |
| H | Same pin/date/model | 614 lines | OPEN: historical [receipt](scans/2026-10/l1-api-h.md); [local direct-signer repair](scans/2026-10/repair-h01-direct-media.md) adds actual JWT/HTTP/real synthetic SigV4 red -> denied green. Adjacent provenance, live retrieval/rollout/diverse gates remain OPEN; no whole-file refresh/PASS. |
| I | Same pin/date/model | 705 lines | [Receipt](scans/2026-10/l1-api-i.md): no confirmed local finding; delegated authority/log provenance handoffs and sign-off pending, not PASS. |
| E | Same pin/date/model | 826 lines | OPEN: [receipt](scans/2026-10/l1-api-e.md), L1-E-01 account bearer accepted in group-detail query parameter; static transport hygiene, not a demonstrated theft/auth exploit; related S7 remains open. |
| F | Same pin/date/model | 614 lines | [Receipt](scans/2026-10/l1-api-f.md): no confirmed local finding; delegated document authority/preparation handoffs and sign-off pending, not PASS. |
| G | Same pin/date/model | 530 lines | OPEN: [receipt](scans/2026-10/l1-api-g.md), L1-G-01 caller SQL literals reach INFO logger; request/stub-compiled fields tested separately, not a live compiler/retention/data theft proof. |
| J | Same pin/date/model | 532 lines | OPEN: [receipt](scans/2026-10/l1-api-j.md), L1-J-01 real trace handlers copy one synthetic job's message into both overlapping jobs' event insert arguments; live endpoint disclosure untested. |
| K | Same pin/date/model | 867 lines | [Receipt](scans/2026-10/l1-api-k.md): no confirmed C+I finding; parser whole-remainder read is reliability debt; persisted-authority/redirect/storage handoffs and sign-off pending. |
| L | Same pin/date/model | 535 lines | [Receipt](scans/2026-10/l1-api-l.md): no confirmed local finding; compiler accepts qualified/scalar/settings candidates but no SQL executed; execution-boundary handoffs and sign-off pending. |
| M | Same pin/date/model | 790 lines | [Receipt](scans/2026-10/l1-api-m.md): no confirmed local finding; migration visibility/policy concurrency candidates require actual upgrade/consumer evidence; review/sign-off pending. |
| N | Same pin/date/model | 825 lines | [Receipt](scans/2026-10/l1-api-n.md): no confirmed local finding; permissions/tombstone/caller-authority handoffs; `read_documents` correctly ranks before deleted filtering in the inspected query, no blanket resurrection claim. |
| O | Same pin/date/model | 797 lines | [Receipt](scans/2026-10/l1-api-o.md): no confirmed local finding; contract revocation, moderation scope and optional membership-join handoffs; generated SQL alone is not a bypass. |
| P | Same pin/date/model | 806 lines | [Receipt](scans/2026-10/l1-api-p.md): no confirmed local finding; membership/metadata/media/preparation handoffs, including existing B-6; review/sign-off pending. |
| Q | Same pin/date/model | 875 lines | [Receipt](scans/2026-10/l1-api-q.md): no confirmed local finding; mocked signer forwarding is not an authorized HTTP/private-object exploit; recovery/config/visit handoffs and sign-off pending. |
| R | Same pin/date/model | 851 lines | [Receipt](scans/2026-10/l1-api-r.md): no confirmed local finding; app/analytics/reporting handoffs, with dedup-window preconditions explicit; review/sign-off pending. |

## Remaining Backend L1 Receipts

[Inventory](scans/2026-10/l1-backend-inventory.md) and
[coverage index](scans/2026-10/l1-backend-index.md) pin the additional backend/
runtime denominator at `db325cd3c`, date 2026-10-18, scanner `gpt-6.1 sol`.
Inventory and line coverage do not establish service PASS or deployment security.

| Scope | Coverage | Disposition / evidence |
|---|---|---|
| RTC | 5 files / 492 newlines | OPEN, existing BP-3. [Receipt](scans/2026-10/l1-rtc.md): 13 fake-dependency close/routing cases, no real PeerServer admission/identity exploit or dependency audit. |
| B1 root orchestration/schema | 9 files / 729 newlines, 732 logical lines | OPEN, existing B-2. [Receipt](scans/2026-10/l1-backend-b1.md): static defaults, values withheld; ports/socket/build/schema handoffs are unverified integration questions, not deployed compromise. |
| MA | Historical 3 files / 657 lines | D91 removes this service from current source; [pinned receipt](scans/2026-10/l1-marketing-a.md) retained. Source retirement is not live shutdown/rotation; shared B-2 remains OPEN. |
| MB | Historical 4 files / 727 lines | D91 removes these mappers; [pinned receipt](scans/2026-10/l1-marketing-b.md) retained, not a current runtime PASS. |
| MC | Historical 9 files / 712 lines | D91 removes the scaffold from current source; [pinned L1-MC-01/02 evidence](scans/2026-10/l1-marketing-c.md) retained. Production retirement remains unverified, not closed by declaring the files gone. |
| PREVIEW | 3 files / 422 lines | [Receipt](scans/2026-10/l1-preview-backend.md): no confirmed local finding; fixed-origin anonymous composition and safe fallback probes do not establish renderer/public-grant security. Ghost-post 200-vs-404 is correctness debt; review/sign-off pending, not PASS. |

## Protocol L1 Repair Progress

28.10.2026: **UI correlation preparation** [verified locally](scans/2026-10/consent-ui-ownership-foundation.md):
owned indexed replies, exact removal, replay/duplicate guards and superseded-batch
completion/timer fences. Seven corrected baseline cases and a timer regression
red -> green; 13 real-hook controls, 195 UI tests/typecheck/build, unchanged SDK
265 tests/typecheck and fresh same-model review. SDK remains unversioned; no-op,
cancellation/account/batch lifecycle and actual browser integration remain gates.
No complete correlation, A-01/F-01, deployment or L1 PASS.

28.10.2026: **Consent lifecycle disposition** [local receipt](scans/2026-10/consent-lifecycle.md):
27 focused real-hook/ConsentView tests and 209 UI tests pass; TypeScript and
production build pass. Empty/no-op, exact same-principal grants, skip,
logout/account change, replacement, in-flight failure and delayed handoff are
covered. The responder remains a preparation for strict SDK correlation: SDK,
artifact, real-browser cohort and deployment gates are not included. A-01/F-01
and protocol L1 remain OPEN; Luna is weaker than Sol and this is not equivalent
assurance or model-diverse sign-off.

28.10.2026: **A-01/F-01 sender slice** [source merged #1275](scans/2026-10/repair-consent-senders.md) at 40a515fcc:
bound readiness/replies, pre-send guard, configured legacy callback migration;
19 new runtime cases red -> green, 265 SDK passes/typecheck and five-runtime parity.
Request correlation remains demonstrated local debt (one matching reply invokes
two callbacks); class and L1 OPEN. Applicable browser/package/build/security CI
passed on identical db5703900 inputs; rollout/diverse review remain pending.

28.10.2026: **S-1** [source repair merged #1273](scans/2026-10/repair-s1-auth-sender.md) at c258ce048
binds token handoff to configured window/origin, preserving standalone and
explicit-login lifecycle plus configured legacy opener support. 246 SDK tests,
typecheck and five-runtime correspondence pass; fresh same-model review. Browser
CI passed on identical a2262c620 inputs; migration/delivery/diverse sign-off remain OPEN; A-01/F-01 and S-6 separate.

27.10.2026: **L1-D-01/D-02 and OAuth occurrence L1-OAUTH-01** share the
[source repair merged #1271](scans/2026-10/repair-d01-token-freshness.md) at b828736b4. Verified
user decoding/certification enforce parseable ISO expiry at the absolute deadline;
the oracle classifies invalid/expired before stores. Initial 48 regressions red
-> green, 92 controls/1,325 API passes plus four subtests, fresh same-model review.
Anonymous and unsigned metadata contracts preserved. Integration/rollout/diverse
review remain OPEN; no HS256/issuer, purpose, provider or revocation assurance.

27.10.2026: **L1-DEPLOY-01** [source repair merged #1268](scans/2026-10/repair-deploy01-frozen-installs.md)
removes three fail-open install fallbacks and pins Dockerfile-only CI triggering.
Eight controls and 1,233 API tests plus four subtests pass; native frozen installs/
builds retain manifests/locks and local dependencies, fresh same-model review.
Merged at c6f9cc85d. Actual production Linux builds for marketing and social passed
on 8a420f767, with all applicable PR checks green; source build/CI inputs are
byte-identical in the squash merge. E2E's dev image is not credited as production
evidence. Deployment, dependency authenticity and diverse sign-off remain open.

27.10.2026: **L1-J-01** [source repair merged #1267](scans/2026-10/repair-j01-import-traces.md)
denies cross-context trace copying while preserving owned diagnostics/tracebacks
and thumbnail work. Pre-lock filtering plus reentry suppression resolves the
reviewed concurrent store-failure deadlock. Nine controls, 1,225 API passes plus
four subtests and fresh same-model review; merged at e0c271da1, deployment/history/diverse
sign-off remain OPEN, not whole-worker or L1 PASS.

27.10.2026: **L1-G-01** [source repair merged #1266](scans/2026-10/repair-g01-query-logging.md)
denies SQL/name/error and parser-fallback log echoes, retaining topology,
literal metadata, correlation IDs, counts and duration. Original eight cases
and two later parser-fallback cases red -> green; 24 focused cases, 1,216 API
tests plus four subtests pass, fresh same-model review. Merged at b5ebcd7e7;
deployment/diverse review remain open; no whole-query/whole-file or L1 PASS.

27.10.2026: **L1-PKG-01** [local repair](scans/2026-10/repair-pkg01-mongo-output.md)
omits raw Mongo URI input from audit stdout and both extractor output modes.
Twelve output regressions red -> green; independent replay and migration controls
preserve account rows/count/checksum. Fresh same-model design-intent review
records the deliberate host-diagnostic/external-parser compatibility tradeoff.
Source repair merged #1265 at b5d128a52; not deployed or L1 PASS.
Backup protection/defaults/operational exposure and diverse sign-off remain open.

27.10.2026: SDK-B-01 source repair merged #1255 (3.244.1); rollout/sign-off remain
open. **B-8** [local source repair](scans/2026-10/repair-b8-settings.md) replaces
the settings globals dump with fixed safe output. Four CLI subcases red -> green,
import compatibility preserved, 1,180 API tests pass; fresh same-model review.
Source repair merged #1265 at b5d128a52; deployment/sign-off pending, not whole-settings PASS; B-2 remains OPEN.
OAuth additions/changed authority paths after the original API pin require delta
L1 coverage and disposition before advancement; old receipts do not cover them.

**B-4:** [source repair evidence](scans/2026-10/repair-b4-middleware.md) records
all nine regressions red on the pinned original and green on the candidate fix;
full API suite 1,138 green after syncing dev on 20.10.2026. This repairs the middleware capture/insert-failure
boundary in source only, not main exceptions, explicit log intake, SQL logs,
import traces, historical data or operational credential exposure. Other protocol
findings and L1 advancement gates remain open. No model-diverse/three-dry claim.

## SDK L1 Source Campaign

21.10.2026 repair, merged #1255: SDK-B-01 source/artifact repair verified; [repro and fresh
review](scans/2026-10/repair-sdk-b01-cookie.md). Own data-property parsing and
own-token selection deny synthetic inherited tokens in source/five runtimes.
208 SDK tests and typecheck pass at repair pin. Deployment/sign-off pending; scope B
remains OPEN for other handoffs, not whole-file PASS. Alignment #1248 merged.

[Source/artifact inventory](scans/2026-10/l1-sdk-index.md), source pin
`caeed4427`, date 2026-10-18, scanner `gpt-6.1 sol`. Seven non-test source files/
2,496 logical lines; tests and distributions separately accounted, not assumed safe.

| Scope | Logical coverage | Disposition / evidence |
|---|---:|---|
| A browser adapter | 315 | OPEN: [receipt](scans/2026-10/l1-sdk-a.md), existing S-1 sender-unbound token acceptance and S-6 wildcard metadata; A-01 consent-response integrity alias grouped with F-01, not independent grants. |
| B HTTP/token/exports/types | 271 | OPEN: [receipt](scans/2026-10/l1-sdk-b.md), L1-SDK-B-01 inherited token selection via a synthetic __proto__ cookie, not global prototype mutation or demonstrated browser cookie planting/API access. |
| C RTC client | 227 | [Receipt](scans/2026-10/l1-sdk-c.md): no new confirmed C+I issue; existing BP-3 and real handshake/lifecycle/consumer authority remain unverified, not PASS. |
| D v3 foundations | 633 | [Receipt](scans/2026-10/l1-sdk-d.md): no confirmed local C+I issue; shared permission-array mutation is correctness evidence, not a server grant; helper-consumer review pending. |
| E v3 data/request methods | 459 | [Receipt](scans/2026-10/l1-sdk-e.md): no confirmed local C+I issue; cookie/state precedence and fake-helper flow do not establish authenticated cross-account requests; server/transport handoffs pending. |
| F v3 groups/consent/types | 591 | OPEN: [receipt](scans/2026-10/l1-sdk-f.md), L1-SDK-F-01 alias with A-01 for unbound consent responses in different implementations; existing S-6 metadata wildcard and S-3 functional omission, no actual grant or token leak demonstrated. |

### SDK Artifact Follow-Up (20.10.2026)

[Clean-build/copy evidence](scans/2026-10/sdk-artifact-correspondence.md) at
`89323cd93` proves 16/17 original clean outputs matched; four browser files lagged
source. Candidate alignment regenerates those files and explicitly produces the
wapi alias; five fresh-build/API-parity tests pass, SDK total 171 plus typecheck.
The source-existing analytics/group/ICE/anonymous-read delta is documented, not
silently called a cookie fix. L1-SDK-B-01, six orphan declaration/maps, docs RTC
IIFE provenance and deployment/full artifact/security sign-off remain open.

## Remaining L1 Boundaries

The API app inventory above now has full file-local line coverage, not security
PASS or three-dry sign-off. Prior seed PASS labels are historical narrow reviews,
not complete contemporary file assurance. The worker's disproven PASS is withdrawn.
The broader project L1 pass remains incomplete; excluded/unscanned surfaces include:

- **SDK** — current source receipts A-F merged #1219/#1220, completing line
  accounting only (L1-008). Seed October rows never established this coverage;
  open findings, artifact correspondence and required independent security
  sign-off remain separate debt, not a campaign PASS.
- **Frontend / render surface** — the XSS surface, the `rehype-sanitize` choke
  point, every `dangerouslySetInnerHTML`, the markdown render. (The audit's
  "pass 2," never started.)
- **Remaining backend/runtime** — the historical pin had 33 files/3,739 newlines
  covered and 76 selected files/12,623 newlines unscanned. D91 removes marketing
  source/packaging/workflow and changes wiring, so refresh the inventory before
  using those counts for current code; removed files are not scan successes.
  API packaging, migrations, Ubuntu/CI/scripts, edge/operator tooling and actual
  dependency/artifact/deployment assurance remain open. Do not call all runtime done.
- **`marketing/web10-social/src/data/`** — the social app's data layer (token
  handling, the permission requests).
- **`ui/`** — the authenticator (consent, session restore, the token vault).

These are the next scan scopes. See
[`ai-pack/ai-security-theory/running-it/`](../../ai-pack/ai-security-theory/running-it/README.md)
for how to slice + run them in parallel.
