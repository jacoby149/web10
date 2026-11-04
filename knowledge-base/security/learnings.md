# Security Learnings — web10's security memory

The **knowledge** root of trust (the security record is the *coverage* root of trust). This
is the record the [orient phase](../../ai-pack/ai-security-theory/the-orient/README.md)
reads before every scan: what web10 has *figured out* about its own security — the
invariants as they've evolved, every finding→fix as a dated learning, the known
gaps, and what we've *decided not* to do.

> **The loop:** orient reads this → the scan is aimed → every fix **writes back**
> here. It is not a static doc; it is the accumulated memory of every security
> decision. A new agent (or you, six months later) reads this and knows the terrain
> without re-deriving it.

## The invariants (as they've evolved)

The model is I1–I6 in
[`web10-v3/security/overview.md`](../web10-v3/security/overview.md). The evolution
that matters for orient:

- **I1 (verify the issuer) is the known weak one.** It *assumes* a trusted key
  source. That assumption was **false** under single-node symmetric HS256 (anyone
  with the key mints any token) — the D7 gap. The fix (RS256/EdDSA + JWKS, per-node
  keypair) is the `BP-1` item. **Orient check:** is I1 still riding on an
  unverified assumption? (Until BP-1 lands, yes.)
- **I3 (no cross-user read) is the crown jewel and it holds** — but *only* because
  every read path goes through the gate. That is a **load-bearing assumption**: one
  read path that bypasses the gate is a total break, and there is **no
  defense-in-depth at the storage layer** (ClickHouse has no per-row ACL; the
  enforcement is entirely at the query boundary). **Orient check:** is there a read
  path that doesn't go through the gate?
 - **The invariants are C+I, not availability.** Unbounded query, unbounded fan-out,
   unbounded upload, ReDoS are *reliability / DoS* — a different discipline, **out of
   scope for the security invariants** (not a hole in them). If DoS ever becomes a
   real concern it is its own track + its own invariants, not an addition to I1–I6.

## Findings → fixes (the dated learnings)

### 2026-11-03: Expiry stops new upload work, not observation of an existing result

[R1 session evidence](scans/2026-11/upload-session-r1.md) uses private S3
create-only/CAS records rather than assuming ClickHouse transactions. A fresh
same-family review found that character bounds could produce an unreadable
encoded record, and that expiry could strand an already-successful completion.
Two local regressions fail before repair; encoded writes now share the reader's
byte ceiling and a separate observation seam records an independently verified
existing completion after expiry without authorizing new parts/completion work.
Actual MinIO record races/lost responses/restart are exercised, but the IDs and
completion ETags are synthetic. This unexposed store neither authenticates its
supplied owner nor verifies media provenance. Those R2 gates and model-diverse
review remain OPEN; this is not deployed-upload security assurance.

Follow-up reviews pin two related lifecycle rules: a reduced admission limit
must not hide an existing idempotent result, and capacity must be reserved for
the largest **future** result, not just the current serialized record. A
nonterminal record that cannot fit its completion result must be rejected before
mutation. Raw object keys also need encoded S3 byte bounds. Final local evidence:
24 focused cases, 2,001 API tests plus eight subtests, one opt-in skip, and one
fresh same-family dry review—not model-diverse convergence or production proof.

### 2026-11-03: A resumable-upload UI is not a saved upload or an auth boundary

The [upload lifecycle inventory](scans/2026-11/resumable-upload-lifecycle.md)
distinguishes local draft intent, server/storage-confirmed parts and durable
publication outcomes. The preview originally retained one in-memory queue across
synthetic accounts and stopped listening to connectivity on navigation away;
two regressions reproduce those UI defects before repair. Owner partitions and
session/task-attempt generations now model the intended behavior, but the harness
holds no credential and makes no API writes: this is not a deployed-auth finding
or server-security fix. Real recovery needs owner-scoped durable state and live
server gates; file metadata is not content identity, browser locks are not server
idempotence, and A→B→A must invalidate old callbacks despite matching names. Real
persistence, revocation, concurrency and automatic publication remain OPEN.

### 2026-11-04: An HTTPS Worker origin URL does not override Flexible zone SSL

Production edge diagnostics showed an origin 301 despite a literal HTTPS endpoint;
the same signed S3 adapter outside Cloudflare returned 200. A hostname-only SSL
Configuration Rule added by the operator resolved delivery without changing the
zone default or blindly risking other proxied services. Both available API
credentials lacked Configuration Rules access; actual delivery success is not an
independent read-back of the selected rule value. Keep redirect refusal intact.

The [production record](../../media-delivery/PRODUCTION-ACCEPTANCE.md) separates
live owner issuance, byte/range/cache/expiry and synthetic browser evidence from
full-player renewal and broad security coverage. Canary-scoped instrumentation
confirms cache hits without disabling a credential now used by live readers;
expired capabilities are denied before cache/origin access. Normal adapter
restored. Private env persistence is also distinct from normal release forwarding:
the pinned-image activation is live, but older main Compose can fall back to legacy
delivery on redeploy. No broad scan/PASS or immediate-revocation claim.

Follow-up: normal main promotion b4e3b4bd9a84 and its green deployment now preserve
all seven forwarded media fields on a new API image; active/backup env remain
identical and actual CDN read/range/expiry/browser checks pass again. This closes
the specific deployment-forwarding gap, not the broader review/renewal gates.

### 2026-11-03: Merged-source replay closes a receipt gate, not security coverage

After #1360 merged, the unchanged H scenario passes on clean HEAD exactly
matching origin/dev at `0acc771e2efc`, with an empty patch. Source/input hashes,
34 events, same-JWT read/query grant-removal-regrant, namesake/app/cache/forgery
controls and all cleanup receipts pass fresh bounded review. The merged-dev
archive is separate from the earlier patched/owner-branch successes and initial
import failure. This satisfies the local H-REPLAY receipt gate; normal PR CI
remains required. It does not reconcile historical duplicate rows or prove
production keys/public deployment, Phase A/C, browser foreign enrollment,
issuer revocation/expiry/restart/multiworker/media, capacity or full/diverse
L1–L4 assurance. All 1,929 API tests plus eight subtests pass, one opt-in skip.

### 2026-11-03: A local discovery read must not manufacture a second principal

Committed-source follow-up: `3be1f1ec10fd` merges current dev into the owner-fix
branch and passes the actual two-node scenario with an empty patch. The retained
34 events, source/input hashes, single positive/single negative issuer receipt
and cleanup flags pass fresh bounded review. This is not merged-origin/dev
replay while #1360 remains open, and it does not reconcile historical duplicates.

#1351 merged before its final e2e result: group lifecycle expected the creator's
single bare owner key but received a second qualified owner. Its list self-heal
was healing both names despite Phase A remaining open. The corrected focused
assertion fails before repair and passes after healing only the existing local
key; all 1,977 API tests plus eight subtests pass. A separately retained two-node
scenario also checks one owner after list. This prevents new duplicate creation;
it does not delete already-created canonical rows or complete migration. Fresh
bounded design-intent review agrees; CI and historical method disposition remain
separate. Merging #1351 did not retroactively pass its failed method check.

### 2026-11-03: Feature retirement is not permission to purge stored data

D95 removes the bulk importer, including its startup resubmission and trace
endpoint. Keep the old trace-isolation evidence as history, not a claim about
current code. Removing self-heal DDL does not drop existing ClickHouse tables;
removing the review UI does not delete or publish staged documents. Raw export
objects also remain untouched. A future cleanup must inventory retained data
and obtain explicit retention/deletion approval. Dropping future consent requests
does not revoke stored staging grants. Queued jobs stop resuming after rollout;
stale clients/bookmarks lose the retired URLs. Generic read/CRUD/media gates
are retained; removal is not a whole-protocol security repair or rollout proof.

### 2026-11-03: Deployment forwarding must preserve opt-in semantics and multiline keys

The API already understood the media settings, but the ecosystem Compose did not
forward them. Six real-Compose probes reproduce that missing integration; the
repair's seven regressions verify both omitted and explicit disabled defaults,
literal multiline synthetic PEM into fresh runtime settings validation, enabled
missing-key denial, rollback and no frontend/build-argument exposure. Private
`env.dev`/`env.prod` now have explicit Git ignores, pinned by a regression.
Keep media values in per-stack private files: the existing SSH workflow exports
shared `.env`, whose shell values take precedence over Compose `--env-file`.
These tests render fake configuration without deployment or host secrets; they
are not actual dev key provisioning, connected deployment or security sign-off.

### 2026-11-03: Connected foreign identity does not cache local authority

`research/federation-demo/RESULTS.md` records one actual isolated two-node
read/query grant→allow→removal→deny→regrant lifecycle under the same cached
home-issued JWT, distinct signing keys and real test-CA HTTPS. A's status-only
receipt has one positive certification and one rejected B-key forgery (second
forgery denied from negative cache). Local namesake membership/app grants do not
authorize the foreign reader; foreign app grant/revoke are explicitly service
fixtures, not browser enrollment. Exact base 04da544442c3 plus #1360 owner-list
repair, initial import failure, source/image receipts and verified cleanup are
retained. Current-branch clean-base replay depends on #1360; no Phase A/C,
public deployment, production key management, expiry/restart/multiworker/media,
capacity or broad/diverse assurance. Fresh bounded review supports this claim;
a later diagnostics-failure cleanup repair passes fault injection, not another
connected run. Merge does not waive #1351's historical method failure.

### 2026-11-03: A real HLS permission recheck is separate from initial issuance and player renewal

The [real-database trial](../../media-delivery/CONNECTED-ACCEPTANCE.md) uses actual
ClickHouse owner/member/carrier and public/authenticated gates, not a permission
stub. Membership/grant removal denies subsequent manifests and renewal attempts;
already-issued segment capabilities remain usable until real expiry, matching
the documented bearer model. Eight-second parent/edge expiry and explicit fresh
authorization pass, but do not prove initial login/document certification or
seamless long-video recovery in the social player. Keep those release gates open.

Cloudflare's current **Workers Cache** can precede Worker execution; it is not our
post-verification Cache API. Keep outer caching off and private/no-store responses
intact. The example and regression now pin that configuration. Account/zone logging
and subscription API 403s are unknowns, not proof of absent exports or paid service.
The [provider record](../../media-delivery/PROVIDER-READINESS.md) retains those limits.

### 2026-11-03: Status-only MinIO service-account updates can remove an embedded policy

The credential finding below is repaired for the isolated account. Exact mc
2025-08-13 sends status without policy; MinIO 2025-09-07's IAM store interprets nil
session policy as removal and switches to inherited authority. This explains why
the cache experiment's toggles invalidated the intended restriction. Root-derived
inheritance is especially dangerous; never assume a status edit preserves scope.

The [connected record](../../media-delivery/CONNECTED-ACCEPTANCE.md) links exact
source commits. `media-delivery/minio_account.py` submits status+policy atomically
through the official SDK, checks name/bucket binding and re-reads the embedded
policy; ambiguous updates request restricted disable. Six offline regressions
model the exact removal semantics; actual list/write 200 becomes AccessDenied 403
while GET retains expected bytes. Repeating cache disable/restore, policy inspection
and Chromium synthetic HLS confirms the harness no longer loses the restriction.
Account is restored only for isolated delivery; no shared-password/bucket-policy
changes. Production, real-node permission/renewal, logging/limits and independent
model-diverse security review remain open; no whole-surface scan/PASS claim.

### 2026-11-03: A requested MinIO session policy is not proof of restricted authority

The [connected delivery trial](../../media-delivery/CONNECTED-ACCEPTANCE.md)
used a root-derived service account created with an intended GetObject-only
session policy. Real ListObjectsV2 and PutObject against the isolated synthetic
bucket both returned 200, not AccessDenied. The creation command and successful
GET were insufficient evidence. No broader production-object read/write was
attempted; authority outside the test bucket remains unknown. Disabled the exact
account, confirmed signed origin GET now returns 403/InvalidAccessKeyId and
quarantined harness reuse. Policy inspection failed twice; cause and repair remain
OPEN. Never re-enable it just to make playback green or rotate the shared root
password as a shortcut. Effective-policy inspection and independent negative
controls are required before granting a delivery adapter storage credentials.

Location-aware cache verification, Chromium synthetic HLS/range and deployed
test-key rotation now pass, but performance/playback success does not discharge
the separate storage-authority boundary. No security-completion claim.

### 2026-11-03: A warm-cache control must match the observed edge location

The [isolated delivery record](../../media-delivery/CONNECTED-ACCEPTANCE.md)
recovers one IAD run where a disabled origin credential still permits warmed
bytes but never expired capabilities. Fresh requests moved between EWR/IAD/ATL;
an origin-disabled request at a different location returned 502, which cannot
prove failure of the warmed location's cache. Keep location-matched evidence and
immutable per-run receipts, not just a repeated 200 or overwritten latest-result
file. The account restoration succeeded; live retries stopped at the ops limit.
Local option-regression/interoperability tests pass, but browser/HLS, rotation,
logging review and independent security sign-off still gate production issuance.

### 2026-11-02: Protected cache hits need their own authorization gate

The historical CDN research proposed path-keyed shared caching with origin-only
authorization. That design cannot enforce expiry on a hit. The new opt-in
[delivery boundary](../web10-v3/media-delivery.md) verifies a separate RS256
media-only exact-key capability before every cache access. Warm-cache probes
reject missing/expired/tampered/wrong-scope capabilities without touching cache
or origin. Public-key-only verification interops with actual Python issuance.
Local review also caught missing CORS, segment expiry earlier than parent stream
expiry, and awaited cache population blocking streaming; retained regressions
now cover each repaired path. Browser no-store differs from internal cache TTL;
neither makes bearer capabilities instantly revocable. Cache scheduling belongs
to each request's lifetime, and large/unknown objects bypass cloning. Local
synthetic storage/cache tests and same-model review do not certify Cloudflare,
private-origin enforcement, playback, production logs or full scan coverage.
Those gates and independent model-diverse review remain OPEN; production OFF.

### 2026-11-03: Route by issuer, retain the reader identity through every gate

Interrupted PR #1351's local-first decode rejected independently signed tokens;
three helpers instead accepted foreign-provider claims whenever the local key
verified them. Seven retained regressions fail before the bounded continuation
repair and pass afterward, including premature local reader/join key changes
and `/certify` recursively vouching for another issuer. The provider claim
selects the verifier, not authority; foreign credentials always need their home
node's answer. The issuer endpoint itself never forwards. Cache successes until
JWT expiry as the operator chose; this deliberately does not promise immediate
issuer-side revocation.

The verified foreign principal must also reach app-contract, prepare, ad, HLS
and delivery seams, not only the first membership filter. Two namesake app
denials pin the canonical foreign key instead of borrowing a local alice's
grant. Local readers and joins retain bare keys until Phase A migrates all
writers/readers together. Fresh review found the same namesake leak in the
directory: two actual-composition regressions fail before repair and now pass.

The newly activated legacy transport also admitted alternate loopback spellings,
private/mixed DNS answers and redirects, while rejecting deployed host-only
providers. Thirteen intercepted-transport regressions fail before repair; no
exploit requests were sent. HTTPS is derived without rewriting provider identity;
all DNS answers must be public, and the connection pins a validated numeric IP
with the issuer's SNI/certificate hostname. Redirects/retries are disabled; only
the token is sent, with response/pool closure. HTTP/private development peers
are deliberately not supported by this production transport. Full API: 1,977
passed plus eight subtests, one opt-in skip; Ruff passes. Fresh same-model bounded
re-review finds no further runtime defect, not model-diverse convergence. PR
remains unmerged; independent signing secrets/default-key provisioning, real
TLS/two-node grant/read/remove/deny, CI and method-size disposition remain OPEN.
The inherited agent-written `SECURITY-GATE-EXEMPT` is not an operator waiver.
This is not L1–L4 or federation assurance.

### 2026-11-03: Group media carriers retain human upload ownership

[Carrier repair](scans/2026-10/group-media-carrier-repair.md) aligns HLS with
`posted_by or author_key`, current carrier/link history, actual service grants and
the shared visibility boundary. Production public post reads succeeded while
fresh streams 403'd; isolated repaired handlers serve all four existing videos.
Eight carriers/eleven refs have intact metadata/namespaces; raw URLs all 206, so
no ownership/publicness backfill is justified. Serving deployment/browser playback,
cost and diverse review remain OPEN; not whole-media/L1 assurance.

### 2026-11-03: Filtering inventory eligibility before ranking revives older creatives

[Document history evidence](scans/2026-10/h01-node-document-proof.md) holds the
Discover link live while varying creative versions. Newer deletion or node_ad
removal disappears before node-loader ranking; actual ASGI enrichment returns old
content and independently verified synthetic SigV4. Three disclosures include a
group-author/Bob-uploader case. Pause denies correctly; restoration/reactivation/
retagging select the latest active content. Eight cases pass on SQLite and
ClickHouse-local; 1,894 API tests plus eight subtests, one lifecycle skip, Ruff and
fresh same-model review pass. Evidence only: document repair remains OPEN. Public
inventory is intentional, not an owner-only/membership gap. Real writer/merge/tie
behavior, provenance, broader authority/CI/rollout/diverse and L1 remain separate.

### 2026-11-02: Node inventory must rank its own Discover attachment history

[Local node attachment repair](scans/2026-10/repair-h01-node-attachment.md) ranks
document/group history before removal filtering, with deletion-winning ties.
Seven reproduced synthetic signing disclosures now deny before attachment/signing;
active/newer reattached public inventory and independent uploaders survive. Other
live groups cannot substitute for Discover, nor can unrelated rows resurrect a
removed link or suppress an active one. Twelve node cases pass on SQLite and
ClickHouse-local; 1,886 API tests plus eight subtests, one opt-in lifecycle test
skipped, full Ruff and fresh same-model intent review pass. Document delete/detag
prefilters, inventory provenance, real lifecycle/CI/rollout/diverse and broader
ad/L1 gates remain OPEN. Public inventory still needs no viewer membership.

### 2026-11-02: Public inventory still needs a current Discover attachment

[Node attachment evidence](scans/2026-10/h01-node-attachment-proof.md) reproduces
delivery/signing after Discover detach: the actual compiler current-link fragment
excludes the link, but the actual node loader/read route still returns the creative
and independently verified synthetic SigV4. Six cases pass on SQLite/ClickHouse-local,
including intended active/reattached public delivery without explicit membership,
never-attached denial and independent group uploader controls. Public inventory is
intentional; adding viewer membership or owner-only restrictions would change intent.
This is evidence only: stale-link runtime repair remains OPEN. Node document
delete/detag prefilters and inventory provenance are separate source candidates,
not demonstrated exploits. 1,880 API tests plus eight subtests, one opt-in test
skipped, Ruff and fresh same-model evidence review pass. Real lifecycle/rollout/
diverse, broader attached-ad policy and protocol L1 remain OPEN.

### 2026-11-02: Rank creative attachments before granting inline delivery

[Local attachment repair](scans/2026-10/repair-h01-pinned-attachment.md) ranks
doc_groups per document/group before removal filtering, with deletion-winning
ties. Removed links now deny before creative attachment/signing; reattachment and
independent live alternate-group access survive. Crossed grants cannot combine a
live attachment in one group with live membership in another. Twelve attachment
and ten membership probes pass on SQLite and ClickHouse-local; 1,865 API tests plus
eight subtests and Ruff pass. Fresh same-model intent review found no blocker.
The compiler reference still orders ties by timestamp alone: do not generalize
this loader's tie guarantee to other readers. Real-schema writer/merge lifecycle,
broader ad authority, CI/rollout/diverse review and L1 remain OPEN.

### 2026-11-02: Mutate attachment keys, not filtered sets

The approved generic attachment seam changes only the named doc/group row. Live
human app updateOwn and group-author service updateOwn precede storage. External
true uses the group principal create grant, including retained external targets;
an initial retained-target shortcut returned 200 after revocation, reproduced red
then denied. False deliberately does not require destination create. Exact-self
retention/new-self creation follow the existing bounded rule. Hidden attachments,
original actor and content are never reconstructed. Sequential millisecond version
advancement passes real isolated ReplacingMergeTree add/remove/re-add/FINAL checks;
different targets are disjoint, not a transaction or same-target CAS. Existing
replacement/delete writers, check/write revocation races, connected acceptance and
independent review remain OPEN. No full L1-L4 or whole-media assurance.

### 2026-11-02: Contract metadata is not human membership or complete attachments

The group edit affordance expected my_role in groups/get, which returns only
the contract. Reading groups/list supplies the human's exact membership; resolve
its role against the contract and exact service/operation, never the navigation
selection or posted_by. Eight corrected-shape tests reproduced the false denial
before repair; denial controls still hold. This is a client affordance fix, not
a backend authorization change or security PASS. Effective principal-class
grants without an explicit membership remain outside these affordances.

Single-document read groups are filtered to readable carriers, not a complete
attachment list even for a manager of the authoring group. Never replace all
attachments from that projection: it can erase hidden destinations. The update
response is complete only after writing, not a read-only snapshot or a CAS token.
The approved per-target seam now avoids replacement entirely; connected acceptance
and independent review remain OPEN. No preliminary write workaround.

### 2026-11-02: Self-target authority is not inherited external membership

The group publish 403 reproduces when the group is not a member of itself.
The [bounded repair](group-author-self-target.md) allows exact-self create only
after live effective service create and human app gates. External targets still
use the group principal; unrelated human memberships never transfer. Explicit
updates retain stored self attachments with updateOwn, but a new self attachment
also needs create. Effective unions may retain principal-class authority after
explicit member removal; do not call that a revocation bypass. The canonical
Discover anyone role already grants create, confirmed read-only on production;
missing explicit group enrollment is not missing permission. Client defaults
must include self and public Discover even when group memberships are empty.
Remembered identity IDs are untrusted preferences, never persisted permissions.
Same-model review found and pinned the update lifecycle; connected persistence,
concurrent revocation, rollout and diverse review remain open.
That review also reproduced historical doc_groups rows authorizing a detached
self reattachment with updateOwn alone. `get_doc_groups` now ranks all versions
before filtering tombstones, with deletion winning timestamp ties. Six actual-SQL
signed-route cases pin detach denial, tie order, newer reattachment and unrelated
document isolation. Other direct attachment readers/writers remain separate scope.

### 2026-11-02: Current membership does not prove a current creative attachment

[Attachment evidence](scans/2026-10/h01-pinned-attachment-proof.md) holds membership
live while varying doc_groups history. The actual compiler's extracted attachment
boundary excludes a removed link; the actual pinned loader still finds its old
live row, returns the creative through ASGI and issues verified synthetic SigV4.
Four link histories reproduce on SQLite and ClickHouse-local Memory. This remains
an OPEN finding: positive-disclosure tests must become denial in a separate repair.
1,759 API tests plus eight subtests and same-model evidence review pass. No full
direct-read denial, executed detach lifecycle or real-object claim; role/app/node
policy, timestamp precision, real schema/rollout/diverse and L1 remain separate.

### 2026-11-02: Authorize pinned creatives from the current membership version

[Local membership repair](scans/2026-10/repair-h01-pinned-membership.md) ranks the
bound reader's rows per group/member before removal filtering. Deletion wins
timestamp ties; a newer rejoin restores access. Another live creative-group grant
still counts, while other members/unrelated groups grant nothing. Five reproduced
synthetic capabilities become denied-ad/no-signer on SQLite and ClickHouse-local;
group posted_by signing remains intact. Ten controls per backend, 1,755 API tests
plus eight subtests and same-model review pass. Attachment history and broader
role/app/visibility/node-ad policy remain OPEN, as do real-schema lifecycle,
old-capability TTL, CI/rollout/diverse review and L1. Not whole-ad closure.

### 2026-11-02: A historical membership row can still authorize an inline creative

[Pinned membership evidence](scans/2026-10/h01-pinned-membership-proof.md) executes
the actual loader and current membership SQL over synthetic history. The normal
group predicate denies a removed member, but the pinned loader's undeduplicated
JOIN finds the old live row; actual read enrichment returns the creative and mints
an independently verified real synthetic SigV4 capability. Four controls reproduce
on SQLite and isolated ClickHouse-local Memory tables. At that evidence pin the
revoked probe asserted disclosure; the local repair above converts it to denial.
No actual object retrieval, production merge timing or whole-ad assurance. Current
role/app/service/node-ad policy and attachment/visibility debt remain separate;
do not use this finding to silently change the membership-first read model.

### 2026-11-02: A projected face ref is a request, not a read grant

[Face repair](scans/2026-10/repair-h01-query-face.md) reproduces anonymous and
authenticated synthetic foreign SigV4 issuance from invented face aliases.
Exact author/media-field/ref tuples must exist in readable canonical bodies;
their canonical posted_by/author fallback supplies media ownership. No face ID
is needed, and a post's ID is not the joined profile's ID. Group in SQL before
limiting, combine uploader sets across services before resolving, and no-op for
missing/ambiguous/failed authority. Use opaque UTF-8 hex literals through repeated
parser passes. Reject output-field collisions rather than dropping result data
or returning supplied URL fallback. 1,745 API tests plus eight subtests, Ruff and
same-model re-review pass. Actual ClickHouse/driver/connected rendering, stored
reference provenance, ad-loader authority, rollout/diverse review and L1 stay OPEN.

### 2026-11-02: Re-read capability-bearing carriers, not just their IDs

[Canonical carrier repair](scans/2026-10/repair-h01-query-carrier.md) replaces
projected owner/body/ad preferences with a fresh safe-query read using the original
readable services/groups. Drop projected inline ads before actual attachment.
Keep the documented doc_id/author_key/body shape; broad reserved-alias detection
breaks aggregates. Preserve posted_by and independent ad uploaders. Baseline
synthetic SigV4 issuance fails the retained denial probe; final 1,694 API tests
plus eight subtests and same-model re-review pass. Face/attached-ad authority,
actual ClickHouse/playback, CI/rollout/diverse review and L1 remain OPEN.

### 2026-11-01: Gated SQL inputs do not establish output authority

[Prepared-owner evidence](scans/2026-10/h01-query-owner-proof.md) executes the
actual compiler's table-free constant SELECT in SQLite, then actual ASGI query
serialization/preparation and real synthetic signing. Anonymous and authenticated
callers fabricate Alice author/Bob uploader/Bob key; independently verified SigV4
URLs are issued. The same SQL without prepare never creates a signing client.
Namespace checks hold but the supplied owner is invented. This is a current
OPEN authority gap, not a source repair or actual ClickHouse/object retrieval.
Canonical gated rehydration is the repair direction; never authorize an ID then
sign caller-projected body/owner. Keep ordinary SQL and legitimate cross-user
media intact; face/ad capabilities need independent binding. Fresh same-model
review and 1,672 API tests plus eight subtests support the bounded evidence, not
denial, rollout or L1 closure. Existing positive-disclosure assertions must become
denial controls in the separate repair, not be treated as permanent desired policy.

### 2026-11-02: Tombstones must retain the original audit actor

Acting-identity continuation review found `delete_document` omitted `posted_by`
from its tombstone INSERT/SELECT, dropping original attribution after replacement.
Copy the stored column through deletion as well as update. A generated-SQL
regression failed before repair and passed afterward; connected ClickHouse
persistence remains unverified. UI mutation controls now resolve service-specific
update/delete grants for the document author rather than treating navigation
selection as authority; the node remains the live write gate. See
`acting-identity-review.md` for bounded evidence and open release gates.

### 2026-11-01: Acting identity is not a credential or a human membership

The acting-identity feature reuses `author_as` rather than minting a group
session. Creation uses the existing service create grant; delegated mutations
check current `updateOwn`/`deleteOwn` grants independently and keep the
app-contract principal human. Membership discovery for the selected group must
not list or self-heal the human's groups. Reaction ownership must compare full
group keys, not a slug or `posted_by`: multiple operators share one identity's
state, while the original audit actor remains unchanged. Target denial must
happen before insertion. Local tests use signed synthetic JWTs and storage
doubles; they are not connected storage proof or independent security sign-off.
Feature review record: `acting-identity-review.md`. Protocol campaign gates
remain OPEN.

### 2026-11-01: Every reference mint needs its own uploader context

[Reference HLS mint repair](scans/2026-10/repair-h01-hls-ref-mint.md) reproduces
working foreign-prefix segment capabilities through main, ad and node-ad refs.
Bind each mint to the same `posted_by or author_key` context used by its metadata
resolver, never viewer/carrier identity. Drop stored manifest URLs before disabled
or invalid refs return. Preserve valid siblings without coercing/normalizing keys.
Actual resolver-to-mint composition checks three distinct uploaders in one output;
46 new cases and 1,669 API tests plus eight subtests pass with same-model review.
Owner/key consistency does not prove caller-selected owner provenance; legacy URL
fields, persisted inputs, live playback, old token TTL and diverse sign-off remain
open. Earlier direct-mint repair merged #1311; its last observed CI had a repeated
Discover engagement failure, not an all-green release gate.

### 2026-11-01: Deny the foreign tree before minting its stream token

[Direct-document HLS mint repair](scans/2026-10/repair-h01-hls-direct-mint.md)
replays a helper-minted, cryptographically verified foreign-prefix token against
the actual segment HTTP endpoint and a key-sensitive synthetic object store.
Variant denial alone was insufficient: a client can request the segment directly.
The direct mint now requires an uploader-owned MinIO video key and strips stored
manifest URLs, including disabled settings, without mutating inputs. Preserve
`posted_by or author_key`, reader claims and opaque object keys. 24 new controls,
1,623 API tests plus eight subtests and fresh same-model review support this
source repair only. Resolved-ref/ad minting is a separate open source of foreign
prefixes; namespace checks do not prove supplied-owner provenance or revoke old
capabilities before TTL. Live services/CI/deployment/diverse review remain OPEN.

### 2026-11-01: A readable rendition record is not an object-read grant

[HLS variant repair](scans/2026-10/repair-h01-hls-variant.md) reproduces foreign
and same-owner/different-tree manifest disclosure through actual HTTP/JWT with
a key-sensitive synthetic object store. Variant fetches now require an uploader-
owned raw video key, matching signed prefix and the worker's exact rendition key.
`posted_by or author_key` is the owner, never the viewer. 28 new controls and
1,599 API tests plus eight subtests pass, with fresh same-model review. This
blocks one fetch sink, not foreign-prefix minting or direct signed segment use;
those remain explicit follow-up work. Persisted injection, actual storage/player,
CI/deployment and diverse sign-off remain unverified.

### 2026-11-01: Every recursive signer needs an explicit owner

[H01 raw repair](scans/2026-10/repair-h01-raw-owner.md) reproduces a real
synthetic foreign SigV4 capability through the document wrapper. Raw MinIO
leaves now require explicit owner context, exact namespace and string keys;
foreign/malformed/missing leaves lose supplied URLs without breaking valid
siblings. Main docs and ads each use their own posted_by/author fallback. Review
found actual ad loaders omitted posted_by: synthetic wrapper fixtures alone
missed it, so projection/mapping and two actual-loader controls were added.
No access predicates changed. 347 focused/1,570 API tests plus four subtests and
fresh same-model review support source repair, not real storage integration.
Key namespace is not proof of owner-context provenance: caller-selected query
owners, HLS/legacy URL authority and service/CI/rollout/diverse gates remain OPEN.

### 2026-11-01: Parsed evaluation flags must survive the settings override pass

The legacy environment loop replaced parsed QUERY_EVAL booleans with strings:
explicit "0" became truthy, enabling the no-policy path and synthetic scan.
It also replaced the integer stub count, causing a connected smoke HTTP 500.
Exclude these already-parsed settings from that loop. Four fresh-process
false/true environment cases reproduce the type failure before the fix and
pass afterward. Settings/query controls pass; the connected smoke then finishes
all ten cells. Scope is this settings interaction, not public-node guard coverage.

### 2026-11-01: Owning metadata is not owning the key it names

[H01 metadata repair](scans/2026-10/repair-h01-metadata-owner.md) reproduces
real synthetic original/thumbnail SigV4 capabilities from Alice metadata naming
Bob keys. Bind both fields independently to the resolver's media-owner namespace
before signing, deduplication or dict lookup. A rejected supplied key gets no URL
and no stale fallback; valid siblings and genuinely keyless legacy metadata
remain. Validate types before hashing, and keep keys opaque. Media owner is the
authorized document's uploader context, not viewer; `posted_by` matters for
group-authored posts. 56 new cases, 335 focused/1,533 API tests plus four subtests
and fresh same-model review support one-sink repair only. Query/storage doubles
do not prove persisted injection or retrieval. Recursive minio, HLS/legacy URL/
caller-owner provenance and real services/CI/deployment/diverse gates stay OPEN.

### 2026-11-01: A signed-in caller is not an arbitrary-object reader

[H-01 direct signer repair](scans/2026-10/repair-h01-direct-media.md) upgrades
the fake-signer proof: actual JWT/HTTP on baseline mints an independently verified
real synthetic SigV4 capability for another user's key. No live object retrieval
or IAM authority tested. The operator approved exact owner namespace on direct
refresh; foreign viewers must re-read group-authorized carrier documents. Check
before all bucket/signing calls, preserve owned unconfirmed uploads/derivatives,
and keep S3 keys opaque. Metadata ownership alone cannot validate stored object
references. Five new pytest cases, 503 focused/1,477 API tests plus four subtests
and fresh same-model review support local route repair only. Stored foreign-key
metadata/minio references, service policy, TTL revocation and browser/service/
CI/deployment/diverse gates remain explicit, not repaired by this prefix gate.

### 2026-11-01: Open CORS and ambient authentication are different assertions

[B-5 route pin](scans/2026-10/b5-cors-credential-pinning.md) supplements existing
preflight tests: supplied Cookie/Authorization tokens do not replace profile body
credentials, mixed credentials select the body identity, and arbitrary-Origin
create still enforces its app-contract result. No runtime bug found or changed.
Starlette can echo Origin on cookie-bearing responses while credentials remain
disabled; assert absent allow-credentials, not universally wildcard origin.
18 CORS/1,470 API tests plus four subtests and same-model/mutation review support
the selected ASGI seam only. Browser delivery/readability, actual contract/SDK
integration and diverse sign-off remain OPEN. A passed TestClient response is
not proof of browser policy, and supplied Authorization is not automatic bearer
attachment by a browser.

### 2026-11-01: Make metadata decoding an explicit choice

[B-3 local default repair](scans/2026-10/repair-b3-default-decode.md) makes
`decode_token()` verify signature/freshness unless explicitly disabled. Existing
authority paths already passed True; only bug attribution and legacy remote
destination selection needed explicit False. Thirteen production callers are
now explicit. Wrong-key/unsigned/stale tokens accepted by the old default now
fail; this proves the default footgun, not an endpoint auth bypass. Decoding
still does not certify provider/client state or grant access. Preserve intentional
metadata and anonymous expiry behavior; remote destination trust remains L1-B-01.
31 new/175 focused and 1,457 API tests plus four subtests pass with same-model
review. Issuer policy, class-wide authority audit, CI/rollout/diverse gates OPEN.

### 2026-11-01: The only backup must not be a truncating write

[L1-PKG-02 local repair](scans/2026-10/repair-pkg02-backup-publication.md)
reproduces `0644` creation under umask `022` and existing-file/symlink writes on
disposable storage. A post-write chmod is too late, and a prior existence check
cannot prevent a competing destination. Stage privately with `mkstemp`, write/
flush/fsync/close, then publish via atomic no-clobber hard link. Failed output
must not destroy the previous backup or print raw exceptions. Full password
hashes intentionally remain in the protected manifest; stdout is unchanged.
45 focused/1,420 API tests plus four subtests and same-model review support local
source repair only. Trusted ancestors/encryption/ACLs/target filesystem and
deployment/diverse sign-off remain open, not repaired by mode bits. Initial
8-fail/1-pass baseline includes absent flush/fsync/link operations, not eight
demonstrated exploits.

### 2026-11-01: A manifest proxy can follow an internal redirect

The [local source repair](scans/2026-10/repair-a02-manifest.md) now checks
approved registration/all public DNS answers and connects only to a validated
numeric IP with canonical Host and verified TLS identity, never redirects.
Four exploit failures become denied-green; 70 focused controls and 1,407 API
tests plus four subtests pass. Validating DNS then connecting to the original
hostname would leave rebinding open; direct pools also avoid ambient proxies.
Fresh same-model review ran ephemeral actual-TLS success/mismatch/untrusted
controls. Retained TLS/path coverage, registry/CI/deployment and diverse review
remain open. Earlier proof below describes the vulnerable pin, not current code.

[L1-A-02 follow-up](scans/2026-10/l1-manifest-destination-followup.md)
replaces stub-only routing evidence with real Requests against disposable local
HTTP fixtures: direct loopback and relative-redirect internal JSON are returned.
No deployed access or real data tested. Restricting only the starting host would
not address redirects; approved registration alone does not establish public
connection authority. Eight controls include valid exact/over-cap JSON, because
oversized invalid JSON cannot isolate the cap. Same-model review supports this
bounded proof only. The local repair above does not close protocol L1.

Seeded from the October 2026 audit
([`scans/2026-10/`](./scans/2026-10/README.md)). **Honesty note:** the hardening
(PR 1157/1159) is **in flight, not merged** — so these are *learned* but not yet
*closed*; the repro gate is not yet green. Each closes when its fix lands + the
exploit is replayed and denied.

| ID | Date | Unit | Learning (vuln → fix) | Status |
|---|---|---|---|---|
| B-1 | 2026-10 | `auth.py`, federation | I1 symmetric HS256 — one shared key mints any token → RS256/EdDSA + JWKS (D7) | learned; fix in 1157 (unmerged) → `BP-1` |
| B-2 | 2026-10 | `settings.py` | signing key + Stripe/Twilio/CH creds in source → env-injected, no defaults | OPEN; repeatable defaults confirmed at `8704e9f5c`; [L1 receipt](scans/2026-10/l1-settings.md), no live credential validity claim |
| B-3 | 2026-10; 2026-11-01 | `auth.py :: decode_token` | unsigned default is a footgun; existing authority callers explicitly verify | [Default locally repaired](scans/2026-10/repair-b3-default-decode.md); broader authority/issuer/integration/diverse gates OPEN, not a demonstrated endpoint bypass |
| B-4 | 2026-10 | `middleware.py` | arbitrary HTTP content copied into logs -> metadata-only automatic logging; field-name redaction is insufficient | Source repair merged #1225; [repro evidence](scans/2026-10/repair-b4-middleware.md); deployment/exposure/sign-off not closed |
| B-5 | 2026-10; 2026-11-01 | `main.py` CORS | open transport is not ambient authentication; selected-route body tokens and contract enforcement pinned | [Local route tests](scans/2026-10/b5-cors-credential-pinning.md); existing preflight coverage retained, browser/integration/diverse gates OPEN |
| B-6 | 2026-10 | `clickhouse.py :: get_document_any_author` | reads without author scoping, bounded by a doc-bound sig → verify the sig is checked first | learned; verify |
| B-8 | 2026-10-18 | `settings.py:139-140` | executing the settings CLI prints globals containing environment-injected secrets → separate fix must suppress secrets while preserving nonsecret diagnostics | OPEN; five synthetic credentials recovered from captured stdout at `8704e9f5c`; [PoC + preconditions](scans/2026-10/l1-settings.md) |
| S-1 | 2026-10 | `sdk/browser.ts :: authListen` | `postMessage` token accepted with no origin check → sender binding required | OPEN; [current pinned A receipt](scans/2026-10/l1-sdk-a.md) reproduces synthetic acceptance, not valid credentials/API access |
| S-2 | 2026-10 | `sdk/v3.ts` (token-in-body) | token in JSON body composes with B-4 (body logged) → the body transport is by design; the log redaction (B-4) is the fix | learned; see B-4 |
| S-3 | 2026-10 | `sdk/http.ts :: authGet` | `byUserGroups` sends no token — functional gap, not a leak → decide: send the token or drop the comment | learned; open decision |
| S-4 | 2026-10 | `sdk/token.ts :: decodeJwt` | unsigned base64 decode — fine for reading claims, a footgun for authz → doc: never use for authorization | learned; documented |
| S-5 | 2026-10 | `sdk/token.ts` cookie | `SameSite=Lax`+`Secure`, no HttpOnly (impossible by design), 60-day → acceptable; note the 60-day window | learned; accepted |
| S-6 | 2026-10 | Browser/v3 consent senders | wildcard consent/close metadata target → bind the intended recipient while preserving consent lifecycle | OPEN; [A](scans/2026-10/l1-sdk-a.md)/[F](scans/2026-10/l1-sdk-f.md), metadata hygiene, not demonstrated token exfiltration or token-specific KB violation |

**The L2 lesson (why the call-graph rung exists):** B-4 + S-2 is a single
*relationship* — the token (source, `v3.ts`) flows to the log (sink, `middleware.py`)
with no redaction between. Neither file is vulnerable in isolation; only the **edge**
is. That is exactly what L2 (the direct call graph) catches and L1 (one file)
cannot. Keep this as the worked example when explaining the ladder.

### 2026-10-18: B-4 reproduced at a pinned commit (still open)

The [whole-file middleware L1 scan](scans/2026-10/l1-middleware.md) at
`d86658be6d9bb202bbab981a918a6b69c9bde966` demonstrated synthetic request and
response tokens reaching the real logger's ClickHouse insert arguments. Error
responses also duplicate the JSON into `meta` and `detail` into `message`;
truncation is not redaction. A future B-4 repair must cover those copies too.
No production exposure, live database persistence, or fix is claimed. The unsigned
JWT decode feeds log attribution only within this file; it does not demonstrate
an authorization bypass. Whether another consumer trusts that column is L2+ debt.

### 2026-10-18: settings defaults and diagnostic output (still open)

The [whole-file settings L1 scan](scans/2026-10/l1-settings.md), all 140 lines at
`8704e9f5c97968d9161c4f5f889c0d0fa0a8be6c`, confirms B-2's repeatable credential
defaults with an empty environment. Some source literals are abbreviated;
this does not establish live third-party credential validity. Environment injection
overrides the defaults, but the `__main__` diagnostic prints those injected values
(B-8), demonstrated with synthetic canaries and captured stdout. Ordinary import
does not invoke the dump. Production invocation/exposure and BP-4 rotation remain
unassessed; neither issue is fixed by this scan.

The final env loop also overwrites typed booleans with truthy strings, including
explicit `"false"` values. That local behavior is proven; consumers must be traced
at L2 before naming a security bypass or retention/TLS/recovery impact. Preserve
the intentional bootstrap-admin baseline and operator configuration (node-config
KB); the source comment's replace-vs-union mismatch is not proof of an auth bug.
B-7 already means token lifetime in the October backend audit; the new dump
finding deliberately uses B-8 instead.

### 2026-10-18: API L1 campaign, identity/system receipts

[Inventory](scans/2026-10/l1-api-index.md) separates full source accounting from
security sign-off. A/B/D record local manifest fetch routing, unused remote-helper
destination/status trust, expired signed-token principal production and weak
session-expiry classification. See their scoped IDs for exact proofs and limits.
No live private-network access or database mutation is claimed. Manufactured
secret-bearing errors only demonstrate an unredacted sink: until a reachable
protected-value source is shown, that disclosure remains UNVERIFIED. These
receipts do not close B-1/B-3 or imply the caller/storage gates are safe.

### 2026-10-18: media/reporting API L1 receipts

Scopes C/H/I add media services and media/import/preview/reporting endpoints.
L1-H-01 shows a source-level object-authorization concern: the read-URL handler
discards the authenticated identity and passes caller-selected keys to signing
without an intervening object check. Its dynamic proof uses fake auth/signing
sinks; actual authenticated HTTP access and private-object retrieval are not
demonstrated. Preserve authorized cross-user/group media and public thumbnails
when fixing it; arbitrary object-key forwarding is not the same as an authorized
document capability. C/I have no confirmed local findings, not a safety PASS.

### 2026-10-18: document/group/query endpoint L1 receipts

E/F/G distinguish generic authority delegation from proven local sinks. L1-E-01
records account-token URL transport: intentional body tokens and scoped HLS
capabilities do not exempt account credentials in query strings. Existing S7
already owns the related transport repair. L1-G-01 reproduces caller SQL literals
in INFO logging with separate request/stub-compiled assertions, not SQL injection
or demonstrated credential theft. Actual compiler preservation, log access and
retention remain unverified. F's unchecked helper boundaries remain L2 debt.

### 2026-10-27: agreed SQL diagnostic repair direction

Operator direction, 27.10.2026, for L1-G-01: retain useful parser-derived query
shape and execution metadata, not automatic raw submitted/compiled SQL. Literals
help reproduce bugs, but routine logs must not become a second store of user
input. Comments and quoted identifiers can carry content too; masking literals
alone is insufficient. Exact-value debugging uses synthetic input or a deliberate
controlled operator session, not blanket raw-query retention. See the
[repair strategy and acceptance gates](../web10-v3/security/logging.md#query-diagnostics-strategy).
The [local repair](scans/2026-10/repair-g01-query-logging.md) now implements the
agreed direction. Review also caught raw rejected-command fallback warnings in
sqlglot: parser-derived diagnostics are not safe if the parser itself echoes
input first. Fixed warnings cover all validation/compiler parses; explicit
ClickHouse dialect configuration preserves null ordering and client error text.
Original LogRecord fields, aliases/error echoes and normalization-failure paths
are pinned alongside actual compiler/HTTP controls. Fresh same-model review and
1,216 API passes do not close rollout or required diverse sign-off. Dated risks
cover reduced diagnostic detail, external log consumers and the private parser
hook; query execution/permissions and client responses are unchanged.

### 2026-10-18: import traces and compiler L1 receipts

L1-J-01 reproduces cross-job log attribution using two synchronized synthetic
job contexts, actual handlers/event functions and an in-memory insert sink.
Shared logger handlers lack a job/thread filter, so A's message is inserted into
A and B traces. Concurrency/overlap is a precondition; production concurrency,
cross-owner endpoint disclosure and historical exposure remain untested. The
old worker PASS is withdrawn: an owner gate on reads cannot isolate already
misattributed stored events. Preserve detailed per-job diagnostics in a fix.

27.10.2026 [local repair](scans/2026-10/repair-j01-import-traces.md): bind trace
capture to a unique execution-context handler and explicitly propagate a fresh
copy into each thumbnail task. Reject foreign records before acquiring handler
locks, not just inside emit: review reproduced a concurrent insert-failure lock
cycle in that first candidate. Its isolated red/green regression now pins liveness;
temporarily suppress capture during event writing to avoid recursive inserts.
Nested scopes restore/detach, owned diagnostics/tracebacks and import semantics
remain. Nine new controls and 1,225 API passes support the bounded local repair,
not real-service/rollout/history/diverse-sign-off closure. Dated acceptance and
reopen conditions cover new child execution paths and handler changes.

K's parser still reads the whole remaining stream; that contradicts flat-RAM
durability prose but is reliability debt, not an added C+I finding. L's compiler
acceptance probes do not execute ClickHouse: qualified names, scalar functions
and settings are handoffs, not demonstrated raw-store access or injection.

### 2026-10-18: storage foundations L1 receipts

M/N/O account for ClickHouse lines 1-2412 without finding a demonstrated local
exploit. Legacy migration classification, member permission shortcuts, selected
tombstone reads, revocation ties and optional membership joins remain explicit
L2+ candidates, not blanket access-control failures. `read_documents` ranks
versions before filtering deleted rows; do not generalize prefilter behavior from
different getters. D80 social membership visibility and intentional public grants
must survive future fixes; no helper or migration is certified safe by this scan.

### 2026-10-18: storage reads/accounts/analytics L1 receipts

P/Q/R complete ClickHouse lines 2413-4944. Arbitrary-key forwarding to a fake
signer establishes local flow, not a reachable private-object read; relate it to
H's handler-level concern without double-counting a proven exploit. Recovery,
revocation, metadata, prepared-query and app/analytics authority still need real
caller/schema evidence. Analytics delivery candidates must honor the one-hour
same-type dedup and one-day preceding-delivery windows; merely passing a string
event type does not demonstrate counter inflation. No new confirmed finding or
whole-store PASS is claimed. All 59 API app files now have line-coverage receipts;
broader project L1, findings/fixes and required independent sign-off remain owed.

### 2026-10-18: broader backend inventory, RTC and bootstrap L1

[Backend inventory](scans/2026-10/l1-backend-inventory.md) accounts for 109
additional tracked runtime/configuration/dependency-manifest files, not scanned
or trusted by enumeration alone. It identifies the shipped Node share-preview
adapter as backend code rather than excluding it with the frontend.

RTC's 13 synthetic dependency cases support local routing/close behavior only;
unsigned provider selection, HTTP-status trust and asynchronous admission remain
**BP-3**, not new or closed findings. Actual PeerServer timing/traffic, verifier
trust and replay require L2+ evidence. B1's root/bootstrap credential fallbacks
expand **B-2**, values withheld; static port/socket declarations do not establish
deployed reachability or host compromise. Preserve legitimate local bootstrap,
operator overrides, HTTP development certify wiring and useful diagnostics.

### 2026-10-18: marketing API app L1 coverage

MA/MB/MC cover all 16 marketing API Python files/2,096 lines at `db325cd3c`.
The KB retires the HTTP/v2 importer; do not infer it is unmounted or active just
from either prose or retained source. MA adds B-2 default-credential evidence;
mapper URL/path/body propagation is not demonstrated SSRF/XSS/authority bypass.
Cleanup is attempted, not guaranteed; existence/source checks and errors affect it.

L1-MC-01 reproduces local ungated payout cancellation; L1-MC-02 reproduces repeated
caller-supplied commission arithmetic. Both are scaffold-state integrity findings
using synthetic records and inert persistence, not real provider money movement,
durable deployed corruption or proof of settlement authority. Stripe invocation
is commented out; the unsigned webhook stub reads no event and mutates no state.
No payment forgery follows from its acknowledgment. Preserve D57's deferred rails
and require proper authority/provenance before any future payment activation.

### 2026-10-18: shipped Node share-preview L1 receipt

The three preview adapter files/422 lines are shipped backend source, now covered
at `db325cd3c`; excluding them as frontend would have left a real inventory gap.
Pinned VM probes use inert fetch/HTTP sinks: specs retain synthetic markup/URLs
and fixed-origin anonymous calls, denied reads make generic cards, incoming auth
does not forward. These are local composition controls, not proof of renderer
escaping or actual public grants. Missing posts return generic cards/HTTP 200,
contrary to ghost-404 intent; this is correctness debt, not demonstrated private
content access. Preserve content-free private fallbacks while tracing real API,
renderer and routing boundaries at L2. No new confirmed vulnerability or PASS.

### 2026-10-18: D91 retires the unused marketing API

Caller tracing found no current frontend/SDK product operation using the service;
node imports, reporting and analytics already own those flows. D91 removes the
legacy service and its wiring, not the independent social preview server. The
old MA/MB/MC receipts remain historical at their pin. Removed source is not a
remediated deployed endpoint: live containers, historical data, external callers,
DNS/proxy records and credentials still require deliberate operational assessment.
L1-MC-01/02 are source-retired only, and shared B-2 remains OPEN elsewhere.

Refresh live inventory after the deletion/wiring edits; do not subtract removed
files and call them newly scanned. SDK exhaustive L1 is the next priority;
seed October SDK rows never established full current file coverage. See
`marketing-api-retirement.md` for preservation and cutover requirements.

### 2026-10-18: SDK L1 browser/token/RTC receipts

A/B/C at `caeed4427` cover browser, token/HTTP/export/type utilities and optional
RTC client. S-1 still permits synthetic hostile-origin token acceptance; different
username filtering is not sender verification. S-6 is wildcard consent/close
metadata hygiene, not token exfiltration or a breach of a token-specific rule.
A-01 and F-01 describe one consent-response integrity class in separate public
implementations; retain both locations under joint repair coverage, not duplicate
independent bugs. No forged server grant or valid credential demonstrated.

L1-SDK-B-01 proves __proto__ cookie parsing replaces the returned dictionary's
prototype and inherited token selection follows. Object.prototype is unchanged;
actual browser cookie planting and downstream authority remain unverified.
Unsigned UX decoding, JS-readable cookies/lifetime and JSON-body token transport
remain intentional. RTC fake-peer behavior is not a real impersonation/logout
exploit. Generated/copied bundles are explicitly mapped, not security-certified.

### 2026-10-18: SDK v3 source receipts complete

D/E/F finish all 1,683 logical lines of v3.ts, including unterminated EOF. No
method body is cut at the E/F boundary, although both belong to one factory.
F-01 and A-01 remain one response-integrity class in separate public consent
implementations; repairs must test both, preserving configured-origin legitimate
responses, unchanged return-run consent and gesture-driven group setup.
No callback result by itself establishes server permissions or authentication.

The merge helper mutates a shared permission array despite its purity description;
that is a proven local correctness defect, not a proven unintended server grant.
Cookie/state precedence differences are conditional helper-flow evidence, not
actual cross-account requests. Keep S-3 functional and S-6 metadata-only rather
than promoting them to disclosure. Published minimal replays are independent
from broader author-reported runs; neither covers shipped bundle correspondence.

### 2026-10-18: B-4 metadata-only source repair

Stop automatic request-body reads, response buffering/reconstruction, raw
path/header capture, unsigned JWT attribution and error/meta copies. Log only
allowlisted method, server route template, status, severity and response-availability
latency; preserve the table layout with content/attribution fields empty and return
the original response. Insert errors emit fixed diagnostics without traceback.
This retains useful signal without another credentials/content store; D41/D56 and
intentional JSON-body tokens remain unchanged. S-2's B-4 composition is addressed
for this middleware only, not all log producers or historical exposure.

Nine committed regressions fail on the pinned original and pass with repair;
the full API suite has 1,138 passes after syncing dev on 20.10.2026. Fresh same-model reviews do not constitute
the required model-diverse three-dry sign-off. Shutdown/disconnect, delayed/mounted routing and
real-storage integration remain untested here; the dated intent-risk acceptance
and re-open conditions are in the repair receipt. Deployment, retained logs,
backups, proxies and approved credential rotation remain separate obligations.

### 2026-10-20: SDK browser delivery prerequisite, not cookie closure

B-4 source repair is merged #1225; historical/operational exposure and sign-off
remain open. The next SDK repair cannot rely on source tests alone: a clean
pinned build found 16/17 outputs byte-equal but stale browser bundles/copies.
Aligning them also delivers existing-source analytics and older marketing-only
group/ICE/anonymous-read parity, so this is a separate prerequisite, not hidden
inside L1-SDK-B-01. Fresh-build tests compare all four browser files; the package
now produces its existing wapi alias explicitly. Public-copy refresh is documented.

L1-SDK-B-01 is still unfixed. Preserve the public cookie dictionary's ordinary
object behavior with safe own-property writes and explicit own-token selection;
do not import malformed-cookie, JWT-decoder, TTL or popup changes into that repair.
Six orphan declarations and docs RTC IIFE still need separate provenance work;
matching hashes are not security or deployed-version assurance.

Intent-risk acceptance, 21.10.2026: browser alignment could alter analytics
accounting, anonymous reads, group mutations, ICE and constructor registration;
real-browser/server flows and deployed/cached versions are not verified here.
Accepted for this bounded correspondence prerequisite because outputs reproduce
existing source and API/request controls are pinned, not because integration is
proven. Revisit on source, toolchain, producer/copy changes or integration failures;
release/deployment evidence and required security sign-off remain open.
CI's floating Bun 1.4.3 reproduced hash drift; SDK metadata/CI now pin producer 1.3.14. Compiler upgrades must deliberately rebuild artifacts, not weaken equality.

### 2026-10-21: SDK-B-01 own-property repair (local, not deployed)

Alignment #1248 is merged. [Cookie repair](scans/2026-10/repair-sdk-b01-cookie.md)
uses data-property definitions to prevent inherited setters and an own-token check
to reject ambient inherited credentials. Keep ordinary objects, existing parsing,
SSR and own-token coercion; a null-prototype/API change is unnecessary. Source and
five generated runtimes deny the synthetic exploit; actual cookie planting and
server authority remain unproven. Source repair merged #1255 (3.244.1); no deployment or security PASS.

Intent-risk acceptance, 21.10.2026: real browser/PWA restoration, supported-engine
integration and deployed/cached versions remain untested. Accepted for bounded local
repair because public signatures/own-token behavior and generated correspondence
are pinned; not acceptance of a deployment guarantee. Reopen on cookie-helper,
toolchain or browser/session changes/failures; rollout and model-diverse sign-off owed.

### 2026-10-27: B-8 fixed-output settings diagnostic (local)

[B-8 repair](scans/2026-10/repair-b8-settings.md) replaces the globals dump with
a fixed load-completion message. Script/module canary regressions are red before,
green after; normal imports/overrides/derived config unchanged. B-2 defaults,
issuer trust, environment type erasure and historical exposure remain OPEN.
This independently safe hygiene slice does not discharge higher-impact debt.

Accepted intent risk, 27.10.2026: external tooling parsing the old dump may break;
retaining credential-bearing output is unsafe and documented admin configuration
is unchanged. No repository invocation found by fresh review; external/deployed
consumers unverified. Reopen on an operational dependency with a separately
specified safe diagnostic, not a globals-dump restoration. Source repair local,
deployment/log retention/rotation and model-diverse sign-off still owed.

### 2026-10-27: Current L1 read pass and claim calibration

[Current ledger](scans/2026-10/l1-current-index.md) accounts for all selected
protocol paths, including post-scan OAuth and packaging/artifacts/deploy edges.
Signature verification again accepted expired custom claims at OAuth authorize
(D-01 root); fake storage limits issuance claims. A forced two-active-snapshot
code replay proves missing local atomic consumption, not real ClickHouse issuance.
Schema/version-column and delegated bulk-tombstone/key defects need real store
evidence. Operator URI userinfo reaches successful audit/export outputs; protected
account backup contents are intentional, redundant connection credentials are not.

Fresh same-model review corrected two overclaims: refresh invalidation alone is
availability/order, not demonstrated C+I; a documented exemption's deliberate skip
is not an accidental security bypass. Backup mode risk remains conditional absent
filesystem evidence. Exact copy hashes and lock syntax are not provenance or
external-code assurance. Keep read completion, finding repair, deployment and
model-diverse sign-off separate; pending receipts do not pass the L1 gate.

### 2026-10-27: O10 drift rescan

[O10 review](scans/2026-10/l1-o10-review.md) at `1332abc67` verifies new source/
artifact correspondence without assuming helper safety. Wrong-path/concurrent
popup acceptance is conditional callback-integrity debt; state is explicitly
caller-managed, not a mandatory new policy. Refresh material/client cache survives
signout; a denied-server control leaves access null, so real authority after logout
is unproved. First-use code exchange requires a prior delegated token: confirmed
correctness/design blocker, not a security exploit. Inherited refresh selection
needs separate ambient pollution; repaired cookie parsing did not regress.
Selected accounting is now 171 paths/31,537 lines, security gate still OPEN.

### 2026-10-27: Mongo connection metadata is not account backup data

[L1-PKG-01 local repair](scans/2026-10/repair-pkg01-mongo-output.md) omits the
entire URI from audit output and account manifest metadata. Userinfo is not the
only secret carrier: query options can contain credentials too. Twelve real-CLI
synthetic output cases fail before and pass after; account hashes, rows and
checksum behavior are preserved. The connection input is still forwarded intact.
Host identification and external output-parser compatibility are intentionally
not preserved; the dated repair records this bounded acceptance and reopen bar.
Source is local, not merged/deployed; file permissions, defaults, driver errors,
process arguments, history/rotation and required model-diverse review remain open.

### 2026-10-27: Frozen failures must not trigger unrestricted resolution

[L1-DEPLOY-01 local repair](scans/2026-10/repair-deploy01-frozen-installs.md)
removes three `frozen || unrestricted` installs. Executing the actual Docker RUN
commands with an inert Bun proves a locked failure now fails, rather than
continuing to a second install. Dockerfile paths also trigger the regression CI:
an exploit test that only runs when its own file changes is not a lasting gate.
Native frozen installs/builds with unchanged locks support local-package
compatibility, not Linux-image or dependency-authenticity assurance. Required
container CI and diverse review remain open; a failed build must be repaired via
approved inputs/toolchains, not an unrestricted fallback.
PR verification caught a second coverage gap: social E2E builds a dev Dockerfile,
not its production image. The latter now has its own Linux Docker matrix entry,
with source/workflow triggers and a red/green control. Eight controls/1,233 API
passes do not substitute for the new revision's actual production-image checks.

### 2026-10-27: A verified signature is not freshness

[D-01/D-02 local repair](scans/2026-10/repair-d01-token-freshness.md) enforces
custom ISO expiry at verified decoding, covering direct OAuth/account callers
as well as principal helpers and the session oracle. Missing/malformed user
expiry is invalid, equality is expired, naive timestamps mean UTC and offsets
are absolute instants. Anonymous exemption/unsigned metadata/standard-exp checks
stay distinct. Initial 48 failures turn green; 92 controls and 1,325 API passes
support local repair, not issuer/rollout/diverse sign-off. Dated acceptance covers
reauth for incompatible legacy tokens and no skew grace; reopen on supported
issuer-format, clock or browser-recovery failures without restoring fail-open.

### 2026-10-28: Sender trust is distinct from consent permission

[S-1 local repair](scans/2026-10/repair-s1-auth-sender.md) binds the current
credential window and configured origin, covering both SDK popup openers without
rewiring fallback lifecycle. Keep contractOnReady metadata; opener tokens require
explicit trusted-origin configuration. Consent-only windows do not replace login
trust; throws/blocked replacements clear it. User-granted operations may avoid
repeat consent, but never authentication checks. 246 SDK passes and same-model
review do not close real-browser, migration, delivery or diverse-sign-off gates.

### 2026-10-28: Consent sender checks do not prove request attribution

[Consent sender slice](scans/2026-10/repair-consent-senders.md) denies unrelated
readiness/replies across reused, standalone and configured legacy windows.
Modern replies require send completion; legacy callbacks require explicit origin
and fail immediately without it, while no-callback metadata remains. 265 SDK
passes/typecheck/parity support that slice. Independent replay still shows one
matching response settling two pending requests on the same window: correlation
is local L1 debt, not repaired or deferred by sender binding. Keep A-01/F-01 OPEN.

### 2026-10-28: Reply correlation starts before filtering or async application

[Local UI foundation](scans/2026-10/consent-ui-ownership-foundation.md) preserves
original row/batch identity and captures actual requester/origin. Replies echo
indices only for valid indexed envelopes; IDs grant no authority and never enter
API bodies. Duplicate/alias/stale outcomes must not remove newer work; even old
status timers need batch ownership. 13 real-hook controls/195 UI passes support
this preparation only. Legacy wire/retry remains, and SDK stays unversioned until
no-op/cancellation/account/full-batch and browser integration gates are met.

### 2026-10-28: Consent terminal paths must preserve the popup transaction

The local lifecycle candidate covers empty/no-op, skip, logout/account change,
replacement, approve-all failure and delayed handoff. Preserve the exact
requested-permission inclusion predicate; grants apply only to the same confirmed
principal and do not authenticate. The earlier candidate retained unstarted
requests across logout; the post-merge repair below supersedes that behavior:
explicit logout cancels them, while picker selection may retain untouched work.
A different principal must not inherit grants. A completed app-login batch also must not let its delayed close timer
terminate a subsequent lazy group-consent batch. Focused unit/browser evidence
must pin both transitions. The unit suite passes locally; Docker was unavailable
for local E2E, and the first two CI E2E attempts still failed these paths, so the
browser confirmation remains OPEN. Strict SDK/artifact integration and diverse
sign-off remain separate gates; no A-01/F-01 closure or L1 PASS.

### 2026-10-28: Sol resumption distinguishes identity from live authority

The [Sol API replay](scans/2026-10/sol-resumption-api.md) demonstrates two
residuals, independently repeated by a fresh Sol context: missing-field validation
can stringify the entire credential-bearing input into ERROR logs and a 422
response (**L1-VAL-01**); OAuth authorize accepts a signed, fresh delegation that
certify rejects for a missing/revoked source client (**L1-OAUTH-SOURCE-01**).
Metadata-only middleware does not protect other log producers, and signature plus
freshness is not live delegation authority. Response echo alone is not cross-user
disclosure; inert registry/storage does not prove durable code issuance or contract
escape. Both remain OPEN, assigned to S1/S3 respectively, not repaired by this scan.
SDK sender checks still do not correlate concurrent requests. Same-model replay
and local green controls do not replace deployment or different-family review.

## Known gaps (the "obvious gap" register)

### 2026-10-29: Historical origin is not a current artifact producer

[RTC-ICE source repair](scans/2026-10/repair-rtc-ice.md) uses nested
`config.iceServers`, matching independently checked PeerJS 1.5.5 constructor and
negotiator behavior. Nine baseline failures, final 19 RTC/284 SDK passes pin local
consumed-option behavior and artifact parity. This is compatibility evidence,
not real candidate gathering, relay use or security sign-off. Supplied servers
now override dependency defaults intentionally; reopen on version/configuration
or connected-demo failure. Network/image/rollout/diverse gates remain OPEN.

[Local producer repair](scans/2026-10/repair-docs-rtc-producer.md) makes the docs
RTC asset reproduce current source; 14 controls/279 SDK tests pass. Fresh review
found source parity is not dependency compatibility: PeerJS consumes ICE through
`options.config`, not the core's top-level `iceServers`. Keep effective ICE as a
separate repair. Accept producer-only scope with real signaling/image checks open;
reopen on helper stalls, browser failures or toolchain changes. No L1 closure.

[Artifact follow-up](scans/2026-10/l1-artifact-provenance-followup.md) traces six
legacy declarations/maps to source retired in #547. Non-clean builds retain them;
unexported package paths do not rule out external static/direct-file consumers.
Docs RTC is actively loaded by the messages demo but lacks a tracked current
producer. Six inert-peer controls establish ICE/outbound-reply drift, not a
network exploit. Repair its producer/parity separately; decide legacy retirement
explicitly rather than deleting by inference. Integration/diverse sign-off OPEN.

### 2026-10-28: A read belongs to both an identity and a request

[Account-read ownership repair](scans/2026-10/repair-account-read-ownership.md)
rejects old responses even after identical-token relogin; token equality alone
does not establish lifecycle ownership. A session fence also cannot order two
requests in the same session: use a per-surface latest-request sequence. Retained
methods must capture ownership and sent credentials from the same current client,
and signed-out branches must not clear a newly signed-in account's lists. Initial
24 failing controls and reviewer replays pin local state misattribution, not API
authority escalation. New reads hydrate the current account; connected browser
and asynchronous mutations outside these five display reads remain unverified.

### 2026-10-28: Explicit logout is not account selection

[Post-merge consent repair](scans/2026-10/repair-consent-postmerge.md) separates
terminal logout from choosing an account to review untouched requests. Cancelling
consent must leave credential login alive without implicitly granting cancelled
rows. A timer's token fence must read the current client, not an older render's
snapshot; equality alone misses identical-token logout/relogin, so identity resets
and newer handoffs invalidate its generation. Real-view and snapshot-client
controls support local repair, not connected E2E or complete stale-read fencing.

### 2026-10-28: OAuth code minting needs source certification

[L1-OAUTH-SOURCE-01 local repair](scans/2026-10/repair-oauth-source01.md)
uses existing certify before authorize's verified claims decode. A target-client
lookup does not establish a source delegation's live registry authority. Missing/
revoked source doubles and a between-request revocation replay now deny code
writes; browser and distinct active-source delegation preserve binding/state.
Certification also enforces local provider, not just signature/freshness. This
does not implement source-contract narrowing or prove real tombstone visibility.
Twelve new cases and 1,343 API tests plus four subtests pass; dated operational/
compatibility tradeoff and same-model review recorded, rollout/diverse review OPEN.

### 2026-10-28: Validation metadata must not serialize exceptions

[L1-VAL-01 local repair](scans/2026-10/repair-val01-validation.md) replaces
validation exception echoes with a fixed message, generated correlation ID and
error count. Missing-field errors can copy the whole credential-bearing body;
locations/messages/context are not safe merely because `input` is omitted.
Three actual-route disclosure regressions fail before and pass after; malformed
JSON, 401 and nonempty-result controls preserve bounded legitimate behavior.
Loss of field-level diagnostics/message parsing is a dated accepted tradeoff in
the receipt. Other exception handlers, deployment/history and diverse review
remain OPEN; this does not pass protocol L1.

Gaps the orient has surfaced. Each is either a `BP-n` or a standing note:

- **Supply chain is not in the invariants.** I1–I6 are C+I of the *node's own code
  and data*; they assume the **dependencies are trustworthy**. A compromised
  `react-markdown`, a malicious transitive dep, a poisoned lockfile is a C+I break
  the invariants don't name. *(Standing note — mitigate with frozen lockfiles +
  dependabot + a dependency-integrity check; decide whether it warrants an
  invariant.)*
- **No defense-in-depth at the storage layer.** I3 is enforced only at the query
  boundary; ClickHouse has no per-row ACL. One boundary bug = total loss, no
  backstop. *(Standing note — it's a strength (boundary on the input) and a risk
  (no backstop); the query-engine gauntlet is the mitigation.)*
- **The query engine is a triple-threat** (I3 + injection + DoS) and is the natural
  home for a dedicated gauntlet (`scans/late-stage/`). *(Standing note.)*

*(Not a gap: **availability / DoS** is reliability, a different discipline — out of
scope for the security invariants, its own track if it ever becomes a concern.)*

## Considered and declined (decided — don't re-raise)

The orient checks this list so it doesn't re-raise a decided question:

- **No E2E encryption by default (D41).** web10 is a data-policy platform, not a
  privacy platform. The node is readable by design (discovery, search,
  auditability); access is terms-controlled (I3), not cryptographic. E2E is
  opt-in / third-party, never the default. The phone-as-keychain encryptor app was
  deleted. *(Do not re-raise "should we add e2e?" — it's decided.)*
- **Token in the request body, not a header (by design).** This is the CORS
  defense (a credentialed cookie path would break `allow_origins=["*"]`). The risk
  is the *log* (B-4), not the transport. *(Don't "fix" the transport; fix the log.)*
- **Cookie is not HttpOnly (impossible by design).** The SDK (JS) must read the
  token, so HttpOnly is off the table. The mitigations are `Secure` + `SameSite=Lax`
  + the 60-day cap. *(Don't re-raise HttpOnly.)*

## Considered and found-safe (negative learnings)

The other half of the map. A **failed exploit** — the scanner suspected a vuln,
built the exploit, and it **failed** — is a *confirmed non-vulnerability*, recorded
here so the orient doesn't re-investigate it. Each entry says **why it's safe**
(because of `<reason>`), because that reason is what a future change might remove —
and when it does, this entry goes stale and the orient's recession prompt catches
it. *(Empty until the first exploit-first scan runs; this is where the negative
results land.)*

| Date | Unit | Looked like | Exploit result | Why it's safe | As of commit |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

## How to update this file

- **A fix lands** → append a row to Findings→fixes (date, unit, vuln→fix, status),
  and flip the matching security record row to PASS (repro gate met).
- **An exploit is attempted and fails** → append a row to Considered-and-found-safe
  (date, unit, what it looked like, the failed result, *why it's safe*, commit). A
  negative result is a learning, not a discarded false positive.
- **A new assumption or threat class is found** → add it to the invariants / known
  gaps, and add the signature to the checklist.
- **A concern is decided against** → move it to Considered-and-declined with the
  decision + the D-number.
- **A recession is found** (orient prompt 2) → the pinning test goes red (code
  recession) or this file notes the eroded consideration (conceptual recession);
  either way it re-opens the finding. A found-safe entry whose "why it's safe"
  reason was just removed is a recession too.
